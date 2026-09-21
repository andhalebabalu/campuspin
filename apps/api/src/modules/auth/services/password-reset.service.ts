import { Injectable, Logger } from '@nestjs/common';
import { passwordContainsEmailName } from '@platform/contracts';
import { AppException } from '../../../common/http/app-exception.js';
import type { ClientContext } from '../../../common/http/request-client.decorator.js';
import { hashPassword } from '../../../common/security/password-hasher.js';
import { generateOpaqueToken, hashToken } from '../../../common/security/token-hash.js';
import { AppConfig } from '../../../infra/config/app-config.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { EmailService } from '../../../infra/email/email.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { dispatchEmail } from './email-dispatch.js';
import { SessionService } from './session.service.js';

const invalidLink = () =>
  AppException.badRequest('TOKEN_INVALID', 'This reset link is invalid or has already been used.');
const expiredLink = () =>
  AppException.badRequest(
    'TOKEN_EXPIRED',
    'This reset link has expired. Please request a new one.',
  );

/**
 * "Forgot password". A reset link holds a random single-use token (only its hash is stored) that
 * expires quickly. Completing a reset also signs the user out everywhere, because whoever held the
 * old password (or a stolen session) must lose access.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Emails a reset link if the address belongs to an active account, invalidating any earlier link.
   * Returns nothing and behaves identically otherwise, so callers cannot tell which emails exist.
   */
  async request(email: string, client: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const rawToken = generateOpaqueToken();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, OR: [{ usedAt: null }, { expiresAt: { lt: now } }] },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(now.getTime() + this.config.auth.passwordResetTtlSeconds * 1000),
        },
      }),
    ]);
    dispatchEmail(this.logger, 'password reset email', () =>
      this.email.sendPasswordResetEmail({ to: user.email, name: user.name, token: rawToken }),
    );
    await this.audit.record({
      action: 'PASSWORD_RESET_REQUESTED',
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      client,
    });
  }

  /** Sets a new password from a valid link, spends the link, and revokes every session. */
  async reset(rawToken: string, newPassword: string, client: ClientContext): Promise<void> {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { select: { id: true, email: true } } },
    });
    if (!token || token.usedAt) throw invalidLink();
    if (token.expiresAt.getTime() <= Date.now()) throw expiredLink();

    // The email is not in the request, so this identity rule (also applied at registration) runs here.
    if (passwordContainsEmailName(newPassword, token.user.email)) {
      throw AppException.validation({
        newPassword: ['The password must not contain the name part of your email'],
      });
    }

    // Hash first: it is deliberately slow and must not hold a database transaction open.
    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw invalidLink();

      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, usedAt: null } });
      const revoked = await this.sessions.revokeAllForUser(token.userId, 'PASSWORD_RESET', tx);
      await this.audit.record(
        {
          action: 'PASSWORD_RESET_COMPLETED',
          actorId: token.userId,
          entityType: 'User',
          entityId: token.userId,
          metadata: { sessionsRevoked: revoked },
          client,
        },
        tx,
      );
    });
  }
}
