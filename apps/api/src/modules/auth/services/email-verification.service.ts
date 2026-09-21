import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../common/http/app-exception.js';
import type { ClientContext } from '../../../common/http/request-client.decorator.js';
import { generateOpaqueToken, hashToken } from '../../../common/security/token-hash.js';
import { AppConfig } from '../../../infra/config/app-config.js';
import { PrismaService } from '../../../infra/database/prisma.service.js';
import { EmailService } from '../../../infra/email/email.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { dispatchEmail } from './email-dispatch.js';

const invalidLink = () =>
  AppException.badRequest(
    'TOKEN_INVALID',
    'This verification link is invalid or has already been used.',
  );
const expiredLink = () =>
  AppException.badRequest(
    'TOKEN_EXPIRED',
    'This verification link has expired. Please request a new one.',
  );

interface Recipient {
  id: string;
  name: string;
  email: string;
}

/**
 * Proves a user owns their email address. The link contains a random single-use token; the database
 * keeps only its hash, an expiry and a `usedAt` marker. At most one unused link exists per user:
 * issuing a new one discards the older ones.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  /** Creates a fresh link for the user (discarding older unused ones) and emails it. */
  async issueAndSend(user: Recipient): Promise<void> {
    const rawToken = generateOpaqueToken();
    const now = new Date();
    await this.prisma.$transaction([
      // Housekeeping: superseded links, and anything of this user's that has already expired.
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id, OR: [{ usedAt: null }, { expiresAt: { lt: now } }] },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(now.getTime() + this.config.auth.emailVerificationTtlSeconds * 1000),
        },
      }),
    ]);
    dispatchEmail(this.logger, 'verification email', () =>
      this.email.sendVerificationEmail({ to: user.email, name: user.name, token: rawToken }),
    );
  }

  /**
   * Consumes a link: the token must exist, be unused and unexpired. Marks the email verified,
   * spends the token and discards any other outstanding link, atomically.
   */
  async verify(rawToken: string, client: ClientContext): Promise<void> {
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!token || token.usedAt) throw invalidLink();
    if (token.expiresAt.getTime() <= Date.now()) throw expiredLink();

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Compare-and-set, so two simultaneous clicks cannot both succeed.
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw invalidLink();

      await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      await tx.emailVerificationToken.deleteMany({
        where: { userId: token.userId, usedAt: null },
      });
      await this.audit.record(
        {
          action: 'EMAIL_VERIFIED',
          actorId: token.userId,
          entityType: 'User',
          entityId: token.userId,
          client,
        },
        tx,
      );
    });
  }

  /**
   * Sends a new link if (and only if) the address belongs to an active, still-unverified account.
   * Returns nothing and behaves identically otherwise, so callers cannot tell which emails exist.
   */
  async resend(email: string, client: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, status: true, emailVerifiedAt: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt) return;

    await this.issueAndSend(user);
    await this.audit.record({
      action: 'VERIFICATION_EMAIL_RESENT',
      actorId: user.id,
      entityType: 'User',
      entityId: user.id,
      client,
    });
  }
}
