import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_LISTING_LIMIT_SETTINGS,
  listingLimitSettingsSchema,
  type AdjustCreditsRequest,
  type AdminMemberCredits,
  type ListingLimitSettings,
  type ListingQuota,
  type UpdateListingLimitSettings,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { limitMessage, monthWindow, nextCharge } from './listing-credit-rules.js';

const SETTINGS_KEY = 'marketplace.listingLimits';
const HISTORY_LIMIT = 50;

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Marketplace listing limits and credits. Off by default (every listing free). When a super admin
 * switches them on, a student's free listings are used first, then credits; the credit balance is
 * the starting credits in the settings plus the student's ledger entries.
 */
@Injectable()
export class ListingCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Settings ─────────────────────────────────────────────────────────────────────────────────

  async settings(db: Db = this.prisma): Promise<ListingLimitSettings> {
    const row = await db.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
    // Anything missing or no longer valid falls back to the default, field by field.
    const parsed = listingLimitSettingsSchema.partial().safeParse(row?.value ?? {});
    return { ...DEFAULT_LISTING_LIMIT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
  }

  async updateSettings(
    dto: UpdateListingLimitSettings,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<ListingLimitSettings> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.settings(tx);
      const next = listingLimitSettingsSchema.parse({ ...current, ...dto });
      await tx.platformSetting.upsert({
        where: { key: SETTINGS_KEY },
        create: { key: SETTINGS_KEY, value: next, updatedById: actor.id },
        update: { value: next, updatedById: actor.id },
      });
      await this.audit.record(
        {
          action: 'LISTING_LIMITS_UPDATED',
          actorId: actor.id,
          entityType: 'PlatformSetting',
          entityId: null,
          metadata: { key: SETTINGS_KEY, from: current, to: next },
          client,
        },
        tx,
      );
      return next;
    });
  }

  // ── A student's quota ────────────────────────────────────────────────────────────────────────

  async quota(userId: string): Promise<ListingQuota> {
    const settings = await this.settings();
    const now = new Date();
    const [freeUsed, credits] = await Promise.all([
      this.freeUsed(this.prisma, userId, settings, now),
      this.balance(this.prisma, userId, settings),
    ]);
    return {
      enabled: settings.enabled,
      mode: settings.mode,
      freeListings: settings.freeListings,
      freeUsed,
      credits,
      creditsPerListing: settings.creditsPerListing,
      next: nextCharge(settings, freeUsed, credits),
      resetsAt:
        settings.enabled && settings.mode === 'MONTHLY' ? monthWindow(now).end.toISOString() : null,
    };
  }

  /**
   * Inside the transaction that creates (or renews) a listing: decides what it costs and refuses if
   * nothing is left. The student's row is locked first, so two listings sent at once cannot both
   * take the last free slot or the last credits. Returns the credits to spend (0 = free).
   */
  async chargeFor(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<number> {
    const settings = await this.settings(tx);
    if (!settings.enabled) return 0;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const [freeUsed, credits] = await Promise.all([
      this.freeUsed(tx, userId, settings, now),
      this.balance(tx, userId, settings),
    ]);
    const charge = nextCharge(settings, freeUsed, credits);
    if (charge === 'FREE') return 0;
    if (charge === 'CREDITS') return settings.creditsPerListing;
    throw new AppException(
      'LISTING_LIMIT_REACHED',
      limitMessage(settings, credits),
      HttpStatus.PAYMENT_REQUIRED,
      {
        credits,
        creditsPerListing: settings.creditsPerListing,
      },
    );
  }

  /** Renewing an expired free listing: charged only when limits count live listings. */
  async renewalCharge(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<number> {
    const settings = await this.settings(tx);
    if (!settings.enabled || settings.mode !== 'ACTIVE') return 0;
    return this.chargeFor(tx, userId, now);
  }

  /** Records credits spent on a listing (after `chargeFor` said so). */
  async spend(
    tx: Prisma.TransactionClient,
    userId: string,
    listingId: string,
    credits: number,
  ): Promise<void> {
    if (credits <= 0) return;
    await tx.listingCreditEntry.create({
      data: { userId, amount: -credits, reason: 'LISTING', listingId },
    });
  }

  /**
   * Free listings already used. ACTIVE: free listings live right now (a sold, expired or deleted
   * one frees its slot). MONTHLY: free listings created this calendar month.
   */
  private freeUsed(
    db: Db,
    userId: string,
    settings: ListingLimitSettings,
    now: Date,
  ): Promise<number> {
    if (settings.mode === 'MONTHLY') {
      return db.marketplaceListing.count({
        where: { sellerId: userId, creditsSpent: 0, createdAt: { gte: monthWindow(now).start } },
      });
    }
    return db.marketplaceListing.count({
      where: {
        sellerId: userId,
        creditsSpent: 0,
        status: { in: ['ACTIVE', 'RESERVED'] },
        expiresAt: { gt: now },
      },
    });
  }

  private async balance(db: Db, userId: string, settings: ListingLimitSettings): Promise<number> {
    const sum = await db.listingCreditEntry.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return settings.startingCredits + (sum._sum.amount ?? 0);
  }

  // ── Staff ─────────────────────────────────────────────────────────────────────────────────────

  async memberCredits(userId: string): Promise<AdminMemberCredits> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw AppException.notFound('User not found');
    const settings = await this.settings();
    const [credits, history] = await Promise.all([
      this.balance(this.prisma, userId, settings),
      this.prisma.listingCreditEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        include: {
          listing: { select: { id: true, title: true } },
          actor: { select: { name: true } },
        },
      }),
    ]);
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      credits,
      startingCredits: settings.startingCredits,
      history: history.map((entry) => ({
        id: entry.id,
        amount: entry.amount,
        reason: entry.reason,
        note: entry.note,
        listing: entry.listing,
        actorName: entry.actor?.name ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  async adjust(
    userId: string,
    dto: AdjustCreditsRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminMemberCredits> {
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw AppException.notFound('User not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.listingCreditEntry.create({
        data: {
          userId,
          amount: dto.amount,
          reason: dto.amount > 0 ? 'ADMIN_GRANT' : 'ADMIN_DEDUCT',
          note: dto.note ?? null,
          actorId: actor.id,
        },
      });
      await this.audit.record(
        {
          action: 'LISTING_CREDITS_ADJUSTED',
          actorId: actor.id,
          entityType: 'User',
          entityId: userId,
          metadata: { amount: dto.amount, ...(dto.note ? { note: dto.note } : {}) },
          client,
        },
        tx,
      );
    });
    return this.memberCredits(userId);
  }
}
