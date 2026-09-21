import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AuthUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { hashPassword, verifyPassword } from '../../common/security/password-hasher.js';
import { fingerprint } from '../../common/security/token-hash.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { isUniqueConstraintError } from '../../infra/database/prisma-errors.js';
import { AuditService } from '../audit/audit.service.js';
import { ACCOUNT_SELECT, accountBlockedError, roleKeysOf, toAuthUser } from './account.js';
import type { AuthenticatedUser } from './auth.types.js';
import { EmailVerificationService } from './services/email-verification.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { RbacService } from './services/rbac.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';

/** The role every self-registered account gets. Seeded by `db:seed:reference`. */
const DEFAULT_ROLE_KEY = 'STUDENT';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** A real Argon2id hash of a random string, made once; see `login` for why it exists. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly emailVerification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async register(dto: RegisterRequest, client: ClientContext): Promise<RegisterResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) throw this.emailTaken();

    const role = await this.prisma.role.findUnique({
      where: { key: DEFAULT_ROLE_KEY },
      select: { id: true },
    });
    if (!role) {
      this.logger.error(
        `The default role ${DEFAULT_ROLE_KEY} does not exist. Run "npm run db:seed:reference".`,
      );
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        'Registration is temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const passwordHash = await hashPassword(dto.password);
    let user;
    try {
      // One nested create: the user and the STUDENT role are written together or not at all.
      user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          userRoles: { create: { roleId: role.id } },
        },
        select: ACCOUNT_SELECT,
      });
    } catch (error) {
      // Two simultaneous registrations can both pass the check above; the unique index decides.
      if (isUniqueConstraintError(error)) throw this.emailTaken();
      throw error;
    }

    await this.audit.record({
      action: 'REGISTER',
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      client,
    });
    await this.emailVerification.issueAndSend(user);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: false,
        roles: roleKeysOf(user),
      },
    };
  }

  async login(dto: LoginRequest, client: ClientContext): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...ACCOUNT_SELECT, passwordHash: true },
    });

    // Verify a password even when the email is unknown, so the response time does not reveal
    // which emails have accounts.
    const passwordOk = await verifyPassword(
      user?.passwordHash ?? (await this.getDummyHash()),
      dto.password,
    );
    if (!user || !passwordOk) {
      await this.audit.record({
        action: 'LOGIN_FAILED',
        actorId: user?.id ?? null,
        entityType: 'User',
        entityId: user?.id ?? null,
        // The address itself is not stored: people sometimes type a password into the email box.
        metadata: {
          reason: user ? 'WRONG_PASSWORD' : 'UNKNOWN_EMAIL',
          emailFingerprint: fingerprint(dto.email),
        },
        client,
      });
      throw AppException.unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // From here the password is proven, so it is safe to say why the account cannot sign in.
    const blocked = accountBlockedError(user);
    if (blocked) {
      await this.audit.record({
        action: 'ACCOUNT_SUSPENDED',
        actorId: user.id,
        entityType: 'User',
        entityId: user.id,
        metadata: { status: user.status, via: 'login' },
        client,
      });
      throw blocked;
    }
    if (!user.emailVerifiedAt) {
      await this.audit.record({
        action: 'LOGIN_FAILED',
        actorId: user.id,
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'EMAIL_NOT_VERIFIED' },
        client,
      });
      throw AppException.forbidden(
        'EMAIL_NOT_VERIFIED',
        'Please verify your email before signing in.',
      );
    }

    const roles = roleKeysOf(user);
    const permissions = await this.rbac.permissionsForRoles(roles);
    const session = await this.sessions.start(user.id, client);
    const accessToken = await this.tokens.signAccessToken({
      id: user.id,
      email: user.email,
      roles,
      sessionId: session.familyId,
    });
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({
      action: 'LOGIN_SUCCESS',
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      metadata: { sessionId: session.familyId },
      client,
    });

    return {
      accessToken,
      refreshToken: session.refreshToken,
      user: toAuthUser(user, permissions),
    };
  }

  async refresh(dto: RefreshRequest, client: ClientContext): Promise<RefreshResponse> {
    const { account, familyId, refreshToken } = await this.sessions.rotate(
      dto.refreshToken,
      client,
    );
    // Roles are read fresh in `rotate`, so a role change reaches the next access token.
    const accessToken = await this.tokens.signAccessToken({
      id: account.id,
      email: account.email,
      roles: roleKeysOf(account),
      sessionId: familyId,
    });
    return { accessToken, refreshToken };
  }

  /** Ends the caller's current session (this device). */
  async logout(user: AuthenticatedUser, client: ClientContext): Promise<void> {
    await this.sessions.revokeSession(user.sessionId, user.id, 'LOGOUT');
    await this.audit.record({
      action: 'LOGOUT',
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      metadata: { sessionId: user.sessionId },
      client,
    });
  }

  /** Ends every session of the caller (all devices). */
  async logoutAll(user: AuthenticatedUser, client: ClientContext): Promise<void> {
    const revoked = await this.sessions.revokeAllForUser(user.id, 'LOGOUT_ALL');
    await this.audit.record({
      action: 'LOGOUT_ALL',
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      metadata: { sessionsRevoked: revoked },
      client,
    });
  }

  /** The caller as stored NOW (fresh roles and permissions), not as the access token remembers them. */
  async me(caller: AuthenticatedUser): Promise<AuthUser> {
    const account = await this.prisma.user.findUnique({
      where: { id: caller.id },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw AppException.unauthorized();
    const blocked = accountBlockedError(account);
    if (blocked) throw blocked;

    return toAuthUser(account, await this.rbac.permissionsForRoles(roleKeysOf(account)));
  }

  verifyEmail(dto: VerifyEmailRequest, client: ClientContext): Promise<void> {
    return this.emailVerification.verify(dto.token, client);
  }

  resendVerification(dto: ResendVerificationRequest, client: ClientContext): Promise<void> {
    return this.emailVerification.resend(dto.email, client);
  }

  forgotPassword(dto: ForgotPasswordRequest, client: ClientContext): Promise<void> {
    return this.passwordReset.request(dto.email, client);
  }

  resetPassword(dto: ResetPasswordRequest, client: ClientContext): Promise<void> {
    return this.passwordReset.reset(dto.token, dto.newPassword, client);
  }

  private emailTaken(): AppException {
    return AppException.conflict(
      'EMAIL_ALREADY_REGISTERED',
      'An account with this email already exists.',
    );
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomUUID());
    return this.dummyHash;
  }
}
