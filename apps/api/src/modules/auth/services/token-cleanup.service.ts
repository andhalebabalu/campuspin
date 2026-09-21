import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/database/prisma.service.js';

export interface PurgeResult {
  refreshTokens: number;
  emailVerificationTokens: number;
  passwordResetTokens: number;
}

/**
 * The cleanup strategy for the three token tables. A token past its expiry can never be used again
 * (the JWT itself is expired, and email links are checked against `expiresAt`), so deleting it loses
 * nothing: reuse detection only matters while a refresh token could still be presented.
 *
 * Run it from a scheduler (`npm run auth:purge-tokens`, for example daily). Issuing a new email link
 * also removes that one user's stale rows, so nothing accumulates unboundedly between runs.
 */
@Injectable()
export class TokenCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  async purgeExpired(now: Date = new Date()): Promise<PurgeResult> {
    const expired = { expiresAt: { lt: now } };
    const [refreshTokens, emailVerificationTokens, passwordResetTokens] = await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: expired }),
      this.prisma.emailVerificationToken.deleteMany({ where: expired }),
      this.prisma.passwordResetToken.deleteMany({ where: expired }),
    ]);
    return {
      refreshTokens: refreshTokens.count,
      emailVerificationTokens: emailVerificationTokens.count,
      passwordResetTokens: passwordResetTokens.count,
    };
  }
}
