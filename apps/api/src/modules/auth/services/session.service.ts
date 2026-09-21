import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/http/app-exception.js';
import type { ClientContext } from '../../../common/http/request-client.decorator.js';
import { hashToken } from '../../../common/security/token-hash.js';
import type {
  Prisma,
  RefreshToken,
  TokenRevocationReason,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { ACCOUNT_SELECT, type Account, accountBlockedError } from '../account.js';
import { TokenService } from './token.service.js';

export interface StartedSession {
  /** Identifies the session everywhere: the `sid` claim and `refresh_tokens.familyId`. */
  familyId: string;
  refreshToken: string;
}

export interface RotatedSession extends StartedSession {
  /** The user, read fresh from the database, so the new access token carries current roles. */
  account: Account;
}

const invalidRefreshToken = () =>
  AppException.unauthorized('TOKEN_INVALID', 'Invalid or expired refresh token');

/**
 * The lifecycle of refresh tokens (= login sessions). One login starts a FAMILY; every refresh
 * replaces the token with a new one in the same family ("rotation"), so a family is one device and a
 * user can have many. Only SHA-256 hashes are stored.
 *
 * Reuse detection: a rotated token is dead. If it is presented again, either the legitimate client
 * or a thief holds a stale copy, and there is no way to know which, so the whole family is revoked
 * and the user must sign in again. Clients must therefore send one refresh request at a time.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /** Starts a session for a user whose credentials were just verified (login). */
  async start(userId: string, client: ClientContext): Promise<StartedSession> {
    const familyId = randomUUID();
    const issued = await this.tokens.signRefreshToken({ userId, familyId });
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(issued.token),
        expiresAt: issued.expiresAt,
        userAgent: client.userAgent ?? null,
        ipAddress: client.ipAddress ?? null,
      },
    });
    return { familyId, refreshToken: issued.token };
  }

  /**
   * Exchanges a valid refresh token for its successor. Every failure is the same 401 `TOKEN_INVALID`
   * (a caller learns nothing about why), except a suspended/deactivated account, which is a 403.
   */
  async rotate(rawToken: string, client: ClientContext): Promise<RotatedSession> {
    const { userId, familyId } = await this.tokens.verifyRefreshToken(rawToken);

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!row || row.userId !== userId || row.familyId !== familyId) throw invalidRefreshToken();

    if (row.revokedAt) {
      // A token that was rotated away, shown again: possible theft.
      if (row.revokedReason === 'ROTATED') await this.handleReuse(row, client);
      throw invalidRefreshToken();
    }
    if (row.expiresAt.getTime() <= Date.now()) throw invalidRefreshToken();

    const account = await this.prisma.user.findUnique({
      where: { id: row.userId },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw invalidRefreshToken();

    const blocked = accountBlockedError(account);
    if (blocked) {
      await this.revokeSession(row.familyId, row.userId, 'ADMIN');
      await this.audit.record({
        action: 'ACCOUNT_SUSPENDED',
        actorId: account.id,
        entityType: 'User',
        entityId: account.id,
        metadata: { status: account.status, via: 'refresh', sessionId: row.familyId },
        client,
      });
      throw blocked;
    }

    const next = await this.tokens.signRefreshToken({ userId, familyId });
    const now = new Date();
    const rotated = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: only one of two simultaneous refreshes can flip `revokedAt` from null.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'ROTATED', lastUsedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.refreshToken.create({
        data: {
          userId,
          familyId,
          tokenHash: hashToken(next.token),
          expiresAt: next.expiresAt,
          userAgent: client.userAgent ?? null,
          ipAddress: client.ipAddress ?? null,
        },
      });
      return true;
    });
    if (!rotated) {
      // Lost the race: another request already spent this token, which is reuse.
      await this.handleReuse(row, client);
      throw invalidRefreshToken();
    }

    await this.audit.record({
      action: 'REFRESH_TOKEN_ROTATED',
      actorId: account.id,
      entityType: 'User',
      entityId: account.id,
      metadata: { sessionId: familyId },
      client,
    });
    return { account, familyId, refreshToken: next.token };
  }

  /** Revokes one session (logout). Returns how many live tokens were revoked (0 if already gone). */
  async revokeSession(
    familyId: string,
    userId: string,
    reason: TokenRevocationReason,
  ): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { familyId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  /**
   * Revokes every live session of a user (logout-all, password reset). Pass `tx` to make it part
   * of a larger transaction.
   */
  async revokeAllForUser(
    userId: string,
    reason: TokenRevocationReason,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await (tx ?? this.prisma).refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  private async handleReuse(row: RefreshToken, client: ClientContext): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
    });
    await this.audit.record({
      action: 'REFRESH_TOKEN_REUSE_DETECTED',
      actorId: row.userId,
      entityType: 'User',
      entityId: row.userId,
      metadata: { sessionId: row.familyId },
      client,
    });
  }
}
