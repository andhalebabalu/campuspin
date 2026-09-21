import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../../common/http/app-exception.js';
import { AppConfig } from '../../../infra/config/app-config.js';
import type { AuthenticatedUser } from '../auth.types.js';

/** The only signing algorithm accepted, on both sign and verify (blocks `none` / algorithm swaps). */
const ALGORITHM = 'HS256';

interface AccessClaims {
  sub?: unknown;
  email?: unknown;
  roles?: unknown;
  sid?: unknown;
  typ?: unknown;
}

interface RefreshClaims {
  sub?: unknown;
  sid?: unknown;
  typ?: unknown;
}

export interface IssuedRefreshToken {
  /** The signed JWT handed to the client. Only its SHA-256 hash is ever stored. */
  token: string;
  expiresAt: Date;
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Signs and verifies the two JWTs. They use DIFFERENT secrets and carry a `typ` claim, so an access
 * token can never be replayed as a refresh token or the other way round.
 *
 *  - access token: `sub` (user id), `email`, `roles`, `sid` (session id), 15 min by default.
 *    Deliberately minimal: no permissions, no name, nothing sensitive.
 *  - refresh token: `sub`, `sid`, random `jti`, 30 days by default; valid only while its hash is in
 *    `refresh_tokens` and not revoked.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  signAccessToken(user: AuthenticatedUser): Promise<string> {
    const issuedAt = nowSeconds();
    return this.jwt.signAsync(
      {
        email: user.email,
        roles: [...user.roles],
        sid: user.sessionId,
        typ: 'access',
        iat: issuedAt,
        exp: issuedAt + this.config.auth.accessTtlSeconds,
      },
      { secret: this.config.auth.accessSecret, algorithm: ALGORITHM, subject: user.id },
    );
  }

  /** 401 `TOKEN_EXPIRED` when the token is genuine but old (the client should refresh), else 401 `UNAUTHORIZED`. */
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.auth.accessSecret,
        algorithms: [ALGORITHM],
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw AppException.unauthorized(
          'TOKEN_EXPIRED',
          'Your session has expired. Please refresh.',
        );
      }
      throw AppException.unauthorized('UNAUTHORIZED', 'Invalid access token');
    }

    const { sub, email, roles, sid, typ } = claims;
    if (
      typ !== 'access' ||
      typeof sub !== 'string' ||
      typeof email !== 'string' ||
      typeof sid !== 'string' ||
      !Array.isArray(roles) ||
      !roles.every((role): role is string => typeof role === 'string')
    ) {
      throw AppException.unauthorized('UNAUTHORIZED', 'Invalid access token');
    }
    return { id: sub, email, roles, sessionId: sid };
  }

  async signRefreshToken(input: { userId: string; familyId: string }): Promise<IssuedRefreshToken> {
    const issuedAt = nowSeconds();
    const expiresAtSeconds = issuedAt + this.config.auth.refreshTtlSeconds;
    const token = await this.jwt.signAsync(
      { sid: input.familyId, typ: 'refresh', iat: issuedAt, exp: expiresAtSeconds },
      {
        secret: this.config.auth.refreshSecret,
        algorithm: ALGORITHM,
        subject: input.userId,
        // Unique per token, so two rotations within the same second still hash differently.
        jwtid: randomUUID(),
      },
    );
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  /**
   * Checks signature, algorithm, expiry and type. Any failure is the same 401 `TOKEN_INVALID`, so
   * a caller learns nothing about why a refresh token was refused.
   */
  async verifyRefreshToken(token: string): Promise<{ userId: string; familyId: string }> {
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(token, {
        secret: this.config.auth.refreshSecret,
        algorithms: [ALGORITHM],
      });
      if (
        claims.typ === 'refresh' &&
        typeof claims.sub === 'string' &&
        typeof claims.sid === 'string'
      ) {
        return { userId: claims.sub, familyId: claims.sid };
      }
    } catch {
      // fall through to the single generic error below
    }
    throw AppException.unauthorized('TOKEN_INVALID', 'Invalid or expired refresh token');
  }
}
