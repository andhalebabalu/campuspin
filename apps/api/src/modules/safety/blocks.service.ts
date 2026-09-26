import { Injectable } from '@nestjs/common';
import type { BlockedMember } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { displayName } from '../reviews/review-rules.js';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Member blocks. A block works both ways: neither member sees the other's posts, comments or
 * listings, and neither can message the other. The blocked member is not told.
 */
@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everyone hidden from `userId`: members they blocked and members who blocked them. */
  async hiddenFrom(userId: string | null | undefined, db: Db = this.prisma): Promise<string[]> {
    if (!userId) return [];
    const rows = await db.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [
      ...new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId))),
    ];
  }

  /** Whether either member blocked the other. */
  async eitherBlocked(a: string, b: string, db: Db = this.prisma): Promise<boolean> {
    const row = await db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    return row !== null;
  }

  async blockedByMe(userId: string, otherId: string): Promise<boolean> {
    const row = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      select: { blockerId: true },
    });
    return row !== null;
  }

  async list(userId: string): Promise<BlockedMember[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, blocked: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      id: row.blocked.id,
      displayName: displayName(row.blocked.name),
      blockedAt: row.createdAt.toISOString(),
    }));
  }

  /** Idempotent: blocking twice is fine. */
  async block(userId: string, otherId: string): Promise<BlockedMember[]> {
    if (userId === otherId) {
      throw AppException.badRequest('BAD_REQUEST', 'You cannot block yourself.');
    }
    const other = await this.prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) throw AppException.notFound('Member not found');
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      create: { blockerId: userId, blockedId: otherId },
      update: {},
    });
    return this.list(userId);
  }

  async unblock(userId: string, otherId: string): Promise<BlockedMember[]> {
    await this.prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: otherId } });
    return this.list(userId);
  }
}
