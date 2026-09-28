import { Injectable } from '@nestjs/common';
import {
  REDEMPTION_CODE_MINUTES,
  offerHeadline,
  type AdminListOffersQuery,
  type AdminOffer,
  type BusinessRedemption,
  type CreateOfferRequest,
  type ModerationRemoveRequest,
  type NearbyOffersQuery,
  type OwnerOffer,
  type PaginationQuery,
  type Redemption,
  type StudentOffer,
  type UpdateOfferRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { dayKey, istDay } from '../analytics/activity-rules.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { shortCode } from '../orders/order-rules.js';
import { metersFrom } from '../places/place-rules.js';
import { dateFromKey } from '../services/service-rules.js';
import {
  type OfferTerms,
  discountFor,
  isAvailableOn,
  isExpired,
  periodKeyOf,
  visibleOfferWhere,
} from './offer-rules.js';

export const OFFER_SELECT = {
  id: true,
  placeId: true,
  businessProfileId: true,
  title: true,
  description: true,
  discountType: true,
  discountValue: true,
  maxDiscount: true,
  minOrderAmount: true,
  validFrom: true,
  validUntil: true,
  daysOfWeek: true,
  limitPerStudent: true,
  limitPeriod: true,
  totalLimit: true,
  redeemedCount: true,
  terms: true,
  status: true,
  removedReason: true,
  createdAt: true,
  place: { select: { id: true, slug: true, name: true, latitude: true, longitude: true } },
  businessProfile: { select: { id: true, businessName: true } },
} satisfies Prisma.StudentOfferSelect;
export type OfferRow = Prisma.StudentOfferGetPayload<{ select: typeof OFFER_SELECT }>;

const REDEMPTION_SELECT = {
  id: true,
  code: true,
  status: true,
  expiresAt: true,
  redeemedAt: true,
  discountAmount: true,
  orderId: true,
  createdAt: true,
  offer: { select: { id: true, title: true, discountType: true, discountValue: true } },
  place: { select: { id: true, slug: true, name: true } },
  user: { select: { name: true } },
} satisfies Prisma.OfferRedemptionSelect;
type RedemptionRow = Prisma.OfferRedemptionGetPayload<{ select: typeof REDEMPTION_SELECT }>;

type Point = { latitude: number; longitude: number } | undefined;

export function toStudentOffer(row: OfferRow, today: Date, point?: Point): StudentOffer {
  return {
    id: row.id,
    place: { id: row.place.id, slug: row.place.slug, name: row.place.name },
    title: row.title,
    description: row.description,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxDiscount: row.maxDiscount,
    minOrderAmount: row.minOrderAmount,
    validFrom: dayKey(row.validFrom),
    validUntil: row.validUntil ? dayKey(row.validUntil) : null,
    daysOfWeek: row.daysOfWeek,
    limitPerStudent: row.limitPerStudent,
    limitPeriod: row.limitPeriod,
    terms: row.terms,
    availableToday: isAvailableOn(row, today),
    distanceMeters: metersFrom(point, row.place),
  };
}

function toOwnerOffer(row: OfferRow, today: Date): OwnerOffer {
  return {
    ...toStudentOffer(row, today),
    status: row.status === 'ACTIVE' && isExpired(row, today) ? 'EXPIRED' : row.status,
    totalLimit: row.totalLimit,
    redeemedCount: row.redeemedCount,
    removedReason: row.removedReason,
    createdAt: row.createdAt.toISOString(),
  };
}

const toRedemption = (row: RedemptionRow): Redemption => ({
  id: row.id,
  code: row.code,
  status: row.status === 'ISSUED' && row.expiresAt <= new Date() ? 'EXPIRED' : row.status,
  offer: { id: row.offer.id, title: row.offer.title, headline: offerHeadline(row.offer) },
  place: row.place,
  expiresAt: row.expiresAt.toISOString(),
  redeemedAt: row.redeemedAt?.toISOString() ?? null,
  discountAmount: row.discountAmount,
  orderId: row.orderId,
  createdAt: row.createdAt.toISOString(),
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** A redemption slot checked for an order, before the order is written. */
export interface OrderOfferQuote {
  offerId: string;
  userId: string;
  placeId: string;
  businessProfileId: string;
  periodKey: string;
  slot: number;
  discount: number;
}

const notAvailable = () =>
  AppException.conflict('OFFER_NOT_AVAILABLE', 'This offer is not available right now.');
const limitReached = () =>
  AppException.conflict(
    'OFFER_LIMIT_REACHED',
    'You have already used this offer as often as it allows.',
  );

/**
 * Student offers. Owners create, pause and edit them; students see live ones and get a short code
 * to show at the counter (or apply an offer to an order). Every use is a row whose
 * (offer, student, period, slot) is unique, so the limit holds even for simultaneous taps.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Owner ──────────────────────────────────────────────────────────────────────────────────────

  async ownerList(actor: AuthenticatedUser): Promise<OwnerOffer[]> {
    const businessIds = await this.access.businessIdsOf(actor);
    const rows = await this.prisma.studentOffer.findMany({
      where: { businessProfileId: { in: businessIds } },
      select: OFFER_SELECT,
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    const today = istDay(new Date());
    return rows.map((row) => toOwnerOffer(row, today));
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateOfferRequest,
    client: ClientContext,
  ): Promise<OwnerOffer> {
    const place = await this.access.placeOf(actor, dto.placeId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.studentOffer.create({
        data: {
          placeId: place.id,
          businessProfileId: place.businessProfileId,
          title: dto.title,
          description: dto.description ?? null,
          discountType: dto.discountType,
          discountValue: dto.discountType === 'FREEBIE' ? 0 : dto.discountValue,
          maxDiscount: dto.discountType === 'PERCENT' ? (dto.maxDiscount ?? null) : null,
          minOrderAmount: dto.minOrderAmount ?? null,
          validFrom: dateFromKey(dto.validFrom),
          validUntil: dto.validUntil ? dateFromKey(dto.validUntil) : null,
          daysOfWeek: dto.daysOfWeek,
          limitPerStudent: dto.limitPerStudent,
          limitPeriod: dto.limitPeriod,
          totalLimit: dto.totalLimit ?? null,
          terms: dto.terms ?? null,
          createdById: actor.id,
        },
        select: OFFER_SELECT,
      });
      await this.audit.record(
        {
          action: 'OFFER_CREATED',
          actorId: actor.id,
          entityType: 'StudentOffer',
          entityId: created.id,
          metadata: { placeId: place.id, title: created.title, headline: offerHeadline(created) },
          client,
        },
        tx,
      );
      return created;
    });
    await this.announce(row);
    return toOwnerOffer(row, istDay(new Date()));
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateOfferRequest,
    client: ClientContext,
  ): Promise<OwnerOffer> {
    const current = await this.owned(actor, id);
    if (current.status === 'REMOVED') {
      throw AppException.conflict(
        'CONFLICT',
        'The CampusPin team took this offer down. Create a new one.',
      );
    }
    const validFrom = dto.validFrom ?? dayKey(current.validFrom);
    const validUntil =
      dto.validUntil !== undefined
        ? dto.validUntil
        : current.validUntil
          ? dayKey(current.validUntil)
          : null;
    if (validUntil && validUntil < validFrom)
      throw AppException.validation({ validUntil: ['Ends before it starts'] });
    if (current.discountType === 'PERCENT' && (dto.discountValue ?? 1) > 100) {
      throw AppException.validation({ discountValue: ['A percentage is at most 100'] });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentOffer.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.discountValue !== undefined && current.discountType !== 'FREEBIE'
            ? { discountValue: dto.discountValue }
            : {}),
          ...(dto.maxDiscount !== undefined ? { maxDiscount: dto.maxDiscount } : {}),
          ...(dto.minOrderAmount !== undefined ? { minOrderAmount: dto.minOrderAmount } : {}),
          ...(dto.validFrom !== undefined ? { validFrom: dateFromKey(dto.validFrom) } : {}),
          ...(dto.validUntil !== undefined
            ? { validUntil: dto.validUntil ? dateFromKey(dto.validUntil) : null }
            : {}),
          ...(dto.daysOfWeek !== undefined ? { daysOfWeek: dto.daysOfWeek } : {}),
          ...(dto.limitPerStudent !== undefined ? { limitPerStudent: dto.limitPerStudent } : {}),
          ...(dto.limitPeriod !== undefined ? { limitPeriod: dto.limitPeriod } : {}),
          ...(dto.totalLimit !== undefined ? { totalLimit: dto.totalLimit } : {}),
          ...(dto.terms !== undefined ? { terms: dto.terms } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        select: OFFER_SELECT,
      });
      await this.audit.record(
        {
          action:
            dto.status && dto.status !== current.status
              ? dto.status === 'PAUSED'
                ? 'OFFER_PAUSED'
                : 'OFFER_RESUMED'
              : 'OFFER_UPDATED',
          actorId: actor.id,
          entityType: 'StudentOffer',
          entityId: id,
          metadata: { fields: Object.keys(dto) },
          client,
        },
        tx,
      );
      return updated;
    });
    return toOwnerOffer(row, istDay(new Date()));
  }

  async businessRedemptions(
    actor: AuthenticatedUser,
    query: PaginationQuery,
  ): Promise<Paginated<BusinessRedemption>> {
    const businessIds = await this.access.businessIdsOf(actor);
    const where: Prisma.OfferRedemptionWhereInput = {
      businessProfileId: { in: businessIds },
      status: 'REDEEMED',
    };
    const [rows, total] = await Promise.all([
      this.prisma.offerRedemption.findMany({
        where,
        select: REDEMPTION_SELECT,
        orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.offerRedemption.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({ ...toRedemption(row), student: { name: row.user.name } })),
      { ...query, total },
    );
  }

  /** Staff at the counter type the student's code: it is used once, if still valid. */
  async verify(
    actor: AuthenticatedUser,
    code: string,
    client: ClientContext,
  ): Promise<BusinessRedemption> {
    const businessIds = await this.access.businessIdsOf(actor);
    const found = await this.prisma.offerRedemption.findFirst({
      where: { code, businessProfileId: { in: businessIds } },
      select: { ...REDEMPTION_SELECT, offerId: true, userId: true, status: true, expiresAt: true },
    });
    if (!found) throw AppException.notFound('No offer code like that for your business');
    if (found.status === 'REDEEMED')
      throw AppException.conflict('OFFER_LIMIT_REACHED', 'This code was already used.');
    if (found.status === 'EXPIRED' || found.expiresAt <= new Date()) {
      await this.prisma.offerRedemption.update({
        where: { id: found.id },
        data: { status: 'EXPIRED' },
      });
      throw AppException.conflict(
        'OFFER_NOT_AVAILABLE',
        'This code has expired. The student can get a new one.',
      );
    }
    // The offer may have been paused, taken down or ended since the code was issued.
    const offer = await this.prisma.studentOffer.findUniqueOrThrow({
      where: { id: found.offerId },
      select: OFFER_SELECT,
    });
    if (!isAvailableOn(offer, istDay(new Date()))) throw notAvailable();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.countUse(tx, found.offerId);
      const updated = await tx.offerRedemption.updateMany({
        where: { id: found.id, status: 'ISSUED' },
        data: { status: 'REDEEMED', redeemedAt: new Date(), verifiedById: actor.id },
      });
      if (updated.count === 0)
        throw AppException.conflict('OFFER_LIMIT_REACHED', 'This code was already used.');
      await this.audit.record(
        {
          action: 'OFFER_REDEEMED',
          actorId: actor.id,
          entityType: 'OfferRedemption',
          entityId: found.id,
          metadata: { offerId: found.offerId, code },
          client,
        },
        tx,
      );
      return tx.offerRedemption.findUniqueOrThrow({
        where: { id: found.id },
        select: REDEMPTION_SELECT,
      });
    });
    await this.notifications.notify({
      userId: found.userId,
      category: 'ORDERS',
      type: 'offer.redeemed',
      title: `Offer used at ${row.place.name}`,
      message: `${row.offer.title} was applied. Enjoy!`,
      link: '/orders',
    });
    return { ...toRedemption(row), student: { name: row.user.name } };
  }

  // ── Students ───────────────────────────────────────────────────────────────────────────────────

  async placeOffers(placeId: string): Promise<StudentOffer[]> {
    const today = istDay(new Date());
    const rows = await this.prisma.studentOffer.findMany({
      where: { ...visibleOfferWhere(today), placeId },
      select: OFFER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => toStudentOffer(row, today)).filter((offer) => offer.availableToday);
  }

  /** Live offers usable today, nearest first when a point is given. */
  async nearby(query: NearbyOffersQuery): Promise<StudentOffer[]> {
    const today = istDay(new Date());
    const point =
      query.lat !== undefined && query.lng !== undefined
        ? { latitude: query.lat, longitude: query.lng }
        : undefined;
    const rows = await this.prisma.studentOffer.findMany({
      where: visibleOfferWhere(today),
      select: OFFER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows
      .map((row) => toStudentOffer(row, today, point))
      .filter((offer) => offer.availableToday)
      .sort((a, b) =>
        a.distanceMeters !== null && b.distanceMeters !== null
          ? a.distanceMeters - b.distanceMeters
          : 0,
      )
      .slice(0, query.limit);
  }

  /**
   * A counter code for the offer, valid for a short while. Asking again returns the same live code;
   * an unused expired code frees its use again.
   */
  async redeem(
    actor: AuthenticatedUser,
    offerId: string,
    client: ClientContext,
  ): Promise<Redemption> {
    const today = istDay(new Date());
    const offer = await this.prisma.studentOffer.findFirst({
      where: { id: offerId, ...visibleOfferWhere(today) },
      select: OFFER_SELECT,
    });
    if (!offer) throw AppException.notFound('Offer not found');
    const periodKey = periodKeyOf(offer.limitPeriod, today);
    const now = new Date();
    const uses = await this.prisma.offerRedemption.findMany({
      where: { offerId, userId: actor.id, periodKey },
      select: { id: true, slot: true, status: true, expiresAt: true },
      orderBy: { slot: 'asc' },
    });
    const live = uses.find((use) => use.status === 'ISSUED' && use.expiresAt > now);
    if (live) {
      return toRedemption(
        await this.prisma.offerRedemption.findUniqueOrThrow({
          where: { id: live.id },
          select: REDEMPTION_SELECT,
        }),
      );
    }
    const used = uses.filter((use) => use.status === 'REDEEMED').length;
    // The student's own limit first: "you already used it" says more than "used up".
    if (used >= offer.limitPerStudent) throw limitReached();
    if (!isAvailableOn(offer, today)) throw notAvailable();
    const reusable = uses.find((use) => use.status !== 'REDEEMED');
    const expiresAt = new Date(now.getTime() + REDEMPTION_CODE_MINUTES * 60_000);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const row = await this.prisma.$transaction(async (tx) => {
          const saved = reusable
            ? await tx.offerRedemption.update({
                where: { id: reusable.id },
                data: { code: shortCode(6), status: 'ISSUED', expiresAt },
                select: REDEMPTION_SELECT,
              })
            : await tx.offerRedemption.create({
                data: {
                  offerId,
                  userId: actor.id,
                  placeId: offer.placeId,
                  businessProfileId: offer.businessProfileId,
                  code: shortCode(6),
                  periodKey,
                  slot: used + 1,
                  expiresAt,
                },
                select: REDEMPTION_SELECT,
              });
          await this.audit.record(
            {
              action: 'OFFER_CODE_ISSUED',
              actorId: actor.id,
              entityType: 'OfferRedemption',
              entityId: saved.id,
              metadata: { offerId, periodKey },
              client,
            },
            tx,
          );
          return saved;
        });
        return toRedemption(row);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Same slot taken by a simultaneous tap: that code is the answer. Otherwise the code collided.
        const again = await this.prisma.offerRedemption.findFirst({
          where: {
            offerId,
            userId: actor.id,
            periodKey,
            status: 'ISSUED',
            expiresAt: { gt: new Date() },
          },
          select: REDEMPTION_SELECT,
        });
        if (again) return toRedemption(again);
      }
    }
    throw limitReached();
  }

  async myRedemptions(
    actor: AuthenticatedUser,
    query: PaginationQuery,
  ): Promise<Paginated<Redemption>> {
    const where = { userId: actor.id };
    const [rows, total] = await Promise.all([
      this.prisma.offerRedemption.findMany({
        where,
        select: REDEMPTION_SELECT,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.offerRedemption.count({ where }),
    ]);
    return Paginated.of(rows.map(toRedemption), { ...query, total });
  }

  // ── Orders ─────────────────────────────────────────────────────────────────────────────────────

  /** Checks an offer applies to this order and works out the discount (server-side). */
  async quoteForOrder(
    offerId: string,
    userId: string,
    placeId: string,
    subtotal: number,
  ): Promise<OrderOfferQuote> {
    const today = istDay(new Date());
    const offer = await this.prisma.studentOffer.findFirst({
      where: { id: offerId, placeId, ...visibleOfferWhere(today) },
      select: OFFER_SELECT,
    });
    if (!offer || !isAvailableOn(offer as OfferTerms, today)) throw notAvailable();
    if (offer.discountType === 'FREEBIE') {
      throw AppException.validation({
        offerId: ['Show this offer at the counter instead: it is a free item'],
      });
    }
    if (offer.minOrderAmount !== null && subtotal < offer.minOrderAmount) {
      throw AppException.validation({
        offerId: [`This offer needs an order of at least ₹${offer.minOrderAmount}`],
      });
    }
    const periodKey = periodKeyOf(offer.limitPeriod, today);
    const used = await this.prisma.offerRedemption.count({
      where: { offerId, userId, periodKey, status: 'REDEEMED' },
    });
    if (used >= offer.limitPerStudent) throw limitReached();
    return {
      offerId,
      userId,
      placeId,
      businessProfileId: offer.businessProfileId,
      periodKey,
      slot: used + 1,
      discount: discountFor(offer, subtotal),
    };
  }

  /** Records the use inside the order's transaction; a race for the same slot fails the order. */
  async recordOrderRedemption(
    tx: Prisma.TransactionClient,
    quote: OrderOfferQuote,
    orderId: string,
  ): Promise<void> {
    await this.countUse(tx, quote.offerId);
    // An unused counter code in the same slot is replaced by this order's use.
    await tx.offerRedemption.deleteMany({
      where: {
        offerId: quote.offerId,
        userId: quote.userId,
        periodKey: quote.periodKey,
        slot: quote.slot,
        status: { not: 'REDEEMED' },
      },
    });
    try {
      await tx.offerRedemption.create({
        data: {
          offerId: quote.offerId,
          userId: quote.userId,
          placeId: quote.placeId,
          businessProfileId: quote.businessProfileId,
          code: shortCode(6),
          status: 'REDEEMED',
          periodKey: quote.periodKey,
          slot: quote.slot,
          expiresAt: new Date(),
          redeemedAt: new Date(),
          orderId,
          discountAmount: quote.discount,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw limitReached();
      throw error;
    }
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────────────────────

  async adminList(query: AdminListOffersQuery): Promise<Paginated<AdminOffer>> {
    const where: Prisma.StudentOfferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ title: { contains: query.q } }, { place: { name: { contains: query.q } } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.studentOffer.findMany({
        where,
        select: OFFER_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        ...pageWindow(query),
      }),
      this.prisma.studentOffer.count({ where }),
    ]);
    const today = istDay(new Date());
    return Paginated.of(
      rows.map((row) => ({
        ...toOwnerOffer(row, today),
        business: { id: row.businessProfile.id, name: row.businessProfile.businessName },
      })),
      { ...query, total },
    );
  }

  async adminRemove(
    id: string,
    dto: ModerationRemoveRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminOffer> {
    return this.adminSet(id, 'REMOVED', dto.reason, actor, client);
  }

  async adminRestore(
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminOffer> {
    return this.adminSet(id, 'PAUSED', null, actor, client);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  private async adminSet(
    id: string,
    status: 'REMOVED' | 'PAUSED',
    reason: string | null,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminOffer> {
    const current = await this.prisma.studentOffer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw AppException.notFound('Offer not found');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentOffer.update({
        where: { id },
        data: { status, removedReason: reason },
        select: OFFER_SELECT,
      });
      await this.audit.record(
        {
          action: status === 'REMOVED' ? 'OFFER_REMOVED_BY_ADMIN' : 'OFFER_RESTORED_BY_ADMIN',
          actorId: actor.id,
          entityType: 'StudentOffer',
          entityId: id,
          metadata: { reason },
          client,
        },
        tx,
      );
      return updated;
    });
    return {
      ...toOwnerOffer(row, istDay(new Date())),
      business: { id: row.businessProfile.id, name: row.businessProfile.businessName },
    };
  }

  /** +1 use, refused when the offer's total limit is reached (checked and counted in one statement). */
  private async countUse(tx: Prisma.TransactionClient, offerId: string): Promise<void> {
    const counted =
      await tx.$executeRaw`UPDATE student_offers SET redeemedCount = redeemedCount + 1 WHERE id = ${offerId} AND (totalLimit IS NULL OR redeemedCount < totalLimit)`;
    if (counted === 0)
      throw AppException.conflict('OFFER_NOT_AVAILABLE', 'This offer has been used up.');
  }

  private async owned(actor: AuthenticatedUser, id: string): Promise<OfferRow> {
    const businessIds = await this.access.businessIdsOf(actor);
    const row = await this.prisma.studentOffer.findFirst({
      where: { id, businessProfileId: { in: businessIds } },
      select: OFFER_SELECT,
    });
    if (!row) throw AppException.notFound('Offer not found');
    return row;
  }

  /** Tells students who saved the place about a new offer that is live today. */
  private async announce(row: OfferRow): Promise<void> {
    if (!isAvailableOn(row, istDay(new Date()))) return;
    const [savers, staff] = await Promise.all([
      this.prisma.savedPlace.findMany({
        where: { placeId: row.placeId, place: { status: 'ACTIVE' } },
        select: { userId: true },
        take: 1000,
      }),
      this.access.staffUserIds(row.businessProfileId),
    ]);
    const skip = new Set(staff);
    await this.notifications.notifyMany(
      savers.map((saver) => saver.userId).filter((id) => !skip.has(id)),
      {
        category: 'PLACE_UPDATES',
        type: 'offer.new',
        title: `${offerHeadline(row)} at ${row.place.name}`,
        message: row.title,
        link: `/places/${row.place.slug}`,
      },
    );
  }
}
