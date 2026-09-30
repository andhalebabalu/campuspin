import { Injectable } from '@nestjs/common';
import type {
  AdminBusiness,
  AdminBusinessDetail,
  AdminListBusinessesQuery,
  AdminUpdateBusinessRequest,
  AssignSubscriptionRequest,
  AuditEntry,
  BulkBusinessActionRequest,
  BulkBusinessResult,
  BusinessActionRequest,
  OwnershipIssue,
  RoleKey,
  TransferBusinessRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { ClientContext } from '../../common/http/request-client.decorator.js';
import { diffFields } from '../../common/utils/diff-fields.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { daysBefore, istDay } from '../analytics/activity-rules.js';
import type { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { LISTING_SELECT, toBusinessListing } from '../business/business-mappers.js';
import { SubscriptionsService, liveSubscriptionWhere } from '../business/subscriptions.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { escapeLike } from '../places/place-queries.js';

const BUSINESS_SELECT = {
  id: true,
  businessName: true,
  slug: true,
  phone: true,
  email: true,
  website: true,
  logoUrl: true,
  city: true,
  status: true,
  verificationStatus: true,
  statusReason: true,
  createdAt: true,
  category: { select: { id: true, slug: true, name: true } },
  owner: { select: { id: true, name: true, email: true, lastActiveAt: true } },
} satisfies Prisma.BusinessProfileSelect;

type BusinessRow = Prisma.BusinessProfileGetPayload<{ select: typeof BUSINESS_SELECT }>;
type Tx = Prisma.TransactionClient;
type Status = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
type Verification = 'PENDING' | 'VERIFIED' | 'REJECTED';

const notFound = () => AppException.notFound('Business not found');
const changedMeanwhile = () =>
  AppException.conflict(
    'CONFLICT',
    'This business was changed by someone else. Reload and try again.',
  );
const STAFF_ROLES: readonly RoleKey[] = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'];
const IST_MS = 330 * 60 * 1000;

/** A business's places are hidden from students while it is not active or staff rejected it. */
const hidesPlaces = (status: Status, verification: Verification) =>
  status !== 'ACTIVE' || verification === 'REJECTED';

/** Start of an India calendar day (YYYY-MM-DD) as an instant; `end` = start of the next day. */
const istStart = (day: string, end = false) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS + (end ? 24 * 60 * 60 * 1000 : 0));

/**
 * Staff decisions about businesses. Every change is one transaction with its audit row; suspending
 * or rejecting switches the business's live places off (remembering which), reinstating switches
 * exactly those back on. The owner is told in-app, with the reason.
 */
@Injectable()
export class AdminBusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────────────────────────

  async list(query: AdminListBusinessesQuery): Promise<Paginated<AdminBusiness>> {
    const like = query.q ? escapeLike(query.q) : undefined;
    const where: Prisma.BusinessProfileWhereInput = {
      ...(like
        ? {
            OR: [
              { businessName: { contains: like } },
              { slug: { contains: like } },
              { owner: { email: { contains: like } } },
              { owner: { name: { contains: like } } },
            ],
          }
        : {}),
      ...(query.verification ? { verificationStatus: query.verification } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.city ? { city: { contains: escapeLike(query.city) } } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: istStart(query.from) } : {}),
              ...(query.to ? { lt: istStart(query.to, true) } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.BusinessProfileOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ businessName: 'asc' }, { id: 'asc' }]
        : query.sort === 'oldest'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [rows, total] = await Promise.all([
      this.prisma.businessProfile.findMany({
        where,
        select: BUSINESS_SELECT,
        orderBy,
        ...pageWindow(query),
      }),
      this.prisma.businessProfile.count({ where }),
    ]);
    return Paginated.of(await this.withCounts(rows), { ...query, total });
  }

  async detail(id: string): Promise<AdminBusinessDetail> {
    const row = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: {
        ...BUSINESS_SELECT,
        description: true,
        whatsapp: true,
        instagramUrl: true,
        facebookUrl: true,
        coverUrl: true,
        verifiedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            lastActiveAt: true,
            status: true,
            createdAt: true,
            userRoles: { select: { role: { select: { key: true } } } },
          },
        },
      },
    });
    if (!row) throw notFound();

    const since = daysBefore(istDay(new Date()), 29);
    const [
      [base],
      places,
      leadCounts,
      openReports,
      subscription,
      history,
      subscriptionRows,
      events,
      blockers,
    ] = await Promise.all([
      this.withCounts([row]),
      this.prisma.place.findMany({
        where: { businessProfileId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: LISTING_SELECT,
      }),
      this.prisma.lead.groupBy({
        by: ['placeId', 'status'],
        where: { businessProfileId: id },
        _count: { _all: true },
      }),
      this.openReportsFor(id),
      this.subscriptions.currentFor(id),
      this.historyOf(id),
      this.prisma.businessSubscription.findMany({
        where: { businessProfileId: id },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          status: true,
          startedAt: true,
          endsAt: true,
          endedAt: true,
          note: true,
          plan: { select: { key: true, name: true } },
        },
      }),
      this.prisma.businessEvent.groupBy({
        by: ['type'],
        where: { businessProfileId: id, day: { gte: since } },
        _count: { _all: true },
      }),
      this.deleteBlockers(id),
    ]);

    const listings = places.map((place) =>
      toBusinessListing(place, {
        total: leadCounts
          .filter((group) => group.placeId === place.id)
          .reduce((sum, group) => sum + group._count._all, 0),
        new: leadCounts
          .filter((group) => group.placeId === place.id && group.status === 'NEW')
          .reduce((sum, group) => sum + group._count._all, 0),
      }),
    );
    const live = places.filter((place) => place.status === 'ACTIVE');
    const reviewCount = live.reduce((sum, place) => sum + place.ratingCount, 0);
    const ratingSum = live.reduce((sum, place) => sum + place.ratingAverage * place.ratingCount, 0);
    const pageViews = events.find((group) => group.type === 'PAGE_VIEW')?._count._all ?? 0;
    const actions = events
      .filter((group) => group.type !== 'PAGE_VIEW')
      .reduce((sum, group) => sum + group._count._all, 0);

    return {
      ...(base as AdminBusiness),
      description: row.description,
      whatsapp: row.whatsapp,
      instagramUrl: row.instagramUrl,
      facebookUrl: row.facebookUrl,
      coverUrl: row.coverUrl,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      owner: {
        id: row.owner.id,
        name: row.owner.name,
        email: row.owner.email,
        lastActiveAt: row.owner.lastActiveAt?.toISOString() ?? null,
        roles: row.owner.userRoles.map((link) => link.role.key as RoleKey),
        status: row.owner.status,
        createdAt: row.owner.createdAt.toISOString(),
      },
      listings,
      reviews: {
        count: reviewCount,
        averageRating: reviewCount > 0 ? Math.round((ratingSum / reviewCount) * 10) / 10 : 0,
      },
      openReports,
      subscription,
      subscriptionHistory: subscriptionRows.map((sub) => ({
        plan: sub.plan,
        status: sub.status,
        startedAt: sub.startedAt.toISOString(),
        endsAt: sub.endsAt?.toISOString() ?? null,
        endedAt: sub.endedAt?.toISOString() ?? null,
        note: sub.note,
      })),
      analytics: { pageViews, actions },
      history,
      deletable: blockers === null,
      deleteBlockedBecause: blockers,
    };
  }

  /** Businesses owned by an account that is not a plain business account. */
  async ownershipCheck(): Promise<OwnershipIssue[]> {
    const rows = await this.prisma.businessProfile.findMany({
      where: {
        owner: {
          OR: [
            { userRoles: { none: { role: { key: 'BUSINESS_OWNER' } } } },
            { userRoles: { some: { role: { key: { in: ['STUDENT', ...STAFF_ROLES] } } } } },
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        businessName: true,
        slug: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            userRoles: { select: { role: { select: { key: true } } } },
          },
        },
      },
    });
    return rows.map((row) => {
      const roles = row.owner.userRoles.map((link) => link.role.key as RoleKey);
      const problem = roles.includes('STUDENT')
        ? 'OWNER_IS_STUDENT'
        : roles.some((role) => STAFF_ROLES.includes(role))
          ? 'OWNER_IS_STAFF'
          : 'OWNER_NOT_BUSINESS';
      return {
        business: { id: row.id, name: row.businessName, slug: row.slug },
        owner: { id: row.owner.id, name: row.owner.name, email: row.owner.email, roles },
        problem,
      };
    });
  }

  // ── Decisions ──────────────────────────────────────────────────────────────────────────────────

  verify(id: string, dto: BusinessActionRequest, actor: AuthenticatedUser, client: ClientContext) {
    return this.decide(id, actor, client, 'BUSINESS_VERIFIED', dto?.reason, (current) => {
      if (current.verificationStatus === 'VERIFIED') {
        throw AppException.conflict('CONFLICT', 'This business is already verified.');
      }
      return {
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        statusReason: current.status === 'ACTIVE' ? null : current.statusReason,
      };
    });
  }

  unverify(
    id: string,
    dto: BusinessActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ) {
    return this.decide(id, actor, client, 'BUSINESS_UNVERIFIED', dto?.reason, (current) => {
      if (current.verificationStatus !== 'VERIFIED') {
        throw AppException.conflict('CONFLICT', 'This business is not verified.');
      }
      return { verificationStatus: 'PENDING', verifiedAt: null };
    });
  }

  reject(id: string, reason: string, actor: AuthenticatedUser, client: ClientContext) {
    return this.decide(id, actor, client, 'BUSINESS_REJECTED', reason, (current) => {
      if (current.verificationStatus === 'REJECTED') {
        throw AppException.conflict('CONFLICT', 'This business is already rejected.');
      }
      return { verificationStatus: 'REJECTED', verifiedAt: null, statusReason: reason };
    });
  }

  suspend(id: string, reason: string, actor: AuthenticatedUser, client: ClientContext) {
    return this.decide(id, actor, client, 'BUSINESS_SUSPENDED', reason, (current) => {
      if (current.status === 'SUSPENDED') {
        throw AppException.conflict('CONFLICT', 'This business is already suspended.');
      }
      return { status: 'SUSPENDED', statusReason: reason };
    });
  }

  /** Lifts a suspension, or sends a rejected business back to "pending review". */
  reinstate(
    id: string,
    dto: BusinessActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ) {
    return this.decide(id, actor, client, 'BUSINESS_REINSTATED', dto?.reason, (current) => {
      if (current.status === 'SUSPENDED') return { status: 'ACTIVE', statusReason: null };
      if (current.verificationStatus === 'REJECTED') {
        return { verificationStatus: 'PENDING', statusReason: null };
      }
      throw AppException.conflict('CONFLICT', 'This business is neither suspended nor rejected.');
    });
  }

  async bulk(
    dto: BulkBusinessActionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<BulkBusinessResult> {
    const result: BulkBusinessResult = { done: [], skipped: [] };
    for (const id of dto.ids) {
      try {
        if (dto.action === 'verify') await this.verify(id, undefined, actor, client);
        else if (dto.action === 'suspend') await this.suspend(id, dto.reason ?? '', actor, client);
        else await this.reinstate(id, undefined, actor, client);
        result.done.push(id);
      } catch (error) {
        if (!(error instanceof AppException)) throw error;
        result.skipped.push({ id, reason: error.message });
      }
    }
    return result;
  }

  async update(
    id: string,
    dto: AdminUpdateBusinessRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminBusinessDetail> {
    const current = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: {
        businessName: true,
        description: true,
        categoryId: true,
        city: true,
        phone: true,
        whatsapp: true,
        email: true,
        website: true,
        instagramUrl: true,
        facebookUrl: true,
        logoUrl: true,
        coverUrl: true,
      },
    });
    if (!current) throw notFound();
    const changed = diffFields(current, dto);
    if (changed.length > 0) {
      if (dto.categoryId && changed.includes('categoryId')) {
        const found = await this.prisma.category.count({
          where: { id: dto.categoryId, status: 'ACTIVE' },
        });
        if (found === 0)
          throw AppException.validation({ categoryId: ['Choose a category from the list'] });
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.businessProfile.update({ where: { id }, data: dto });
        await this.record(tx, 'BUSINESS_EDITED_BY_STAFF', id, actor, client, { fields: changed });
      });
    }
    return this.detail(id);
  }

  /** Only while nothing depends on the business; otherwise suspend it instead. */
  async remove(id: string, actor: AuthenticatedUser, client: ClientContext): Promise<void> {
    const row = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: { businessName: true, slug: true, ownerId: true },
    });
    if (!row) throw notFound();
    const blockers = await this.deleteBlockers(id);
    if (blockers) throw AppException.conflict('CONFLICT', blockers);
    await this.prisma.$transaction(async (tx) => {
      await tx.businessProfile.delete({ where: { id } });
      await this.record(tx, 'BUSINESS_DELETED', id, actor, client, {
        businessName: row.businessName,
        slug: row.slug,
        ownerId: row.ownerId,
      });
    });
  }

  async assignPlan(
    id: string,
    dto: AssignSubscriptionRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminBusinessDetail> {
    const [business, plan] = await Promise.all([
      this.prisma.businessProfile.findUnique({ where: { id }, select: { id: true } }),
      this.prisma.businessPlan.findUnique({
        where: { key: dto.planKey },
        select: { id: true, key: true, isDefault: true },
      }),
    ]);
    if (!business) throw notFound();
    if (!plan) throw AppException.validation({ planKey: ['Choose a plan from the list'] });
    const endsAt = dto.endsAt ? istStart(dto.endsAt, true) : null;
    if (endsAt && endsAt <= new Date()) {
      throw AppException.validation({ endsAt: ['Pick a day in the future'] });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // End whatever is running (at most one row: activeKey is unique).
      await tx.businessSubscription.updateMany({
        where: { businessProfileId: id, status: 'ACTIVE' },
        data: { status: 'CANCELLED', endedAt: now, activeKey: null },
      });
      if (!plan.isDefault) {
        await tx.businessSubscription.create({
          data: {
            businessProfileId: id,
            planId: plan.id,
            startedAt: now,
            endsAt,
            assignedById: actor.id,
            note: dto.note ?? null,
            activeKey: id,
          },
        });
      }
      await this.record(tx, 'BUSINESS_PLAN_ASSIGNED', id, actor, client, {
        plan: plan.key,
        ...(dto.endsAt ? { endsAt: dto.endsAt } : {}),
        ...(dto.note ? { note: dto.note } : {}),
      });
    });
    return this.detail(id);
  }

  /**
   * Hands the business to another account. The new owner must be an active business account (not
   * a student, not staff) that does not already run a business: the admin-assisted way to move a
   * business off a student account without losing its places, reviews or history.
   */
  async transfer(
    id: string,
    dto: TransferBusinessRequest,
    actor: AuthenticatedUser,
    client: ClientContext,
  ): Promise<AdminBusinessDetail> {
    const business = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!business) throw notFound();
    const target = await this.prisma.user.findUnique({
      where: { email: dto.ownerEmail },
      select: {
        id: true,
        status: true,
        userRoles: { select: { role: { select: { key: true } } } },
        _count: { select: { ownedBusinesses: true } },
      },
    });
    const invalid = (message: string) => AppException.validation({ ownerEmail: [message] });
    if (!target)
      throw invalid('No account uses this email. The new owner signs up as a business first.');
    const roles = target.userRoles.map((link) => link.role.key as RoleKey);
    if (target.id === business.ownerId) throw invalid('This account already owns the business.');
    if (target.status !== 'ACTIVE') throw invalid('This account is not active.');
    if (!roles.includes('BUSINESS_OWNER')) throw invalid('This is not a business account.');
    if (roles.includes('STUDENT') || roles.some((role) => STAFF_ROLES.includes(role))) {
      throw invalid('A student or staff account cannot own a business.');
    }
    if (target._count.ownedBusinesses > 0) throw invalid('This account already runs a business.');

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.businessProfile.updateMany({
        where: { id, ownerId: business.ownerId },
        data: { ownerId: target.id },
      });
      if (moved.count !== 1) throw changedMeanwhile();
      await tx.businessMember.deleteMany({ where: { businessProfileId: id, userId: target.id } });
      await this.record(tx, 'BUSINESS_OWNER_TRANSFERRED', id, actor, client, {
        fromOwnerId: business.ownerId,
        toOwnerId: target.id,
        reason: dto.reason,
      });
    });
    return this.detail(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────────

  /**
   * One status/verification change: compare-and-set against what was read, hide or restore the
   * places if visibility flips, audit, and tell the owner.
   */
  private async decide(
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    action: AuditAction,
    reason: string | undefined,
    plan: (current: {
      status: Status;
      verificationStatus: Verification;
      statusReason: string | null;
    }) => Prisma.BusinessProfileUpdateManyMutationInput & {
      status?: Status;
      verificationStatus?: Verification;
    },
  ): Promise<AdminBusiness> {
    const current = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: {
        status: true,
        verificationStatus: true,
        statusReason: true,
        hiddenPlaceIds: true,
        ownerId: true,
        businessName: true,
      },
    });
    if (!current) throw notFound();
    const change = plan(current);
    const next = {
      status: change.status ?? current.status,
      verificationStatus: change.verificationStatus ?? current.verificationStatus,
    };

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.businessProfile.updateMany({
        where: { id, status: current.status, verificationStatus: current.verificationStatus },
        data: change,
      });
      if (claimed.count !== 1) throw changedMeanwhile();
      const places = await this.applyVisibility(tx, id, current, next);
      await this.record(tx, action, id, actor, client, {
        from: { status: current.status, verification: current.verificationStatus },
        to: next,
        ...(reason ? { reason } : {}),
        ...places,
      });
      await this.notifyOwner(tx, current.ownerId, current.businessName, action, reason);
    });
    const row = await this.prisma.businessProfile.findUniqueOrThrow({
      where: { id },
      select: BUSINESS_SELECT,
    });
    const [business] = await this.withCounts([row]);
    return business as AdminBusiness;
  }

  private async applyVisibility(
    tx: Tx,
    id: string,
    before: { status: Status; verificationStatus: Verification; hiddenPlaceIds: Prisma.JsonValue },
    after: { status: Status; verificationStatus: Verification },
  ): Promise<{ hiddenPlaceIds?: string[]; restoredPlaceIds?: string[] }> {
    const wasHidden = hidesPlaces(before.status, before.verificationStatus);
    const willHide = hidesPlaces(after.status, after.verificationStatus);
    if (!wasHidden && willHide) {
      const live = await tx.place.findMany({
        where: { businessProfileId: id, status: 'ACTIVE' },
        select: { id: true },
      });
      const ids = live.map((place) => place.id);
      if (ids.length > 0) {
        await tx.place.updateMany({ where: { id: { in: ids } }, data: { status: 'INACTIVE' } });
      }
      await tx.businessProfile.update({ where: { id }, data: { hiddenPlaceIds: ids } });
      return { hiddenPlaceIds: ids };
    }
    if (wasHidden && !willHide) {
      const stored = Array.isArray(before.hiddenPlaceIds)
        ? before.hiddenPlaceIds.filter((value): value is string => typeof value === 'string')
        : [];
      if (stored.length > 0) {
        // Only places still switched off and still this business's: staff may have changed one since.
        await tx.place.updateMany({
          where: { id: { in: stored }, businessProfileId: id, status: 'INACTIVE' },
          data: { status: 'ACTIVE' },
        });
      }
      await tx.businessProfile.update({ where: { id }, data: { hiddenPlaceIds: [] } });
      return { restoredPlaceIds: stored };
    }
    return {};
  }

  private async notifyOwner(
    tx: Tx,
    ownerId: string,
    name: string,
    action: AuditAction,
    reason: string | undefined,
  ): Promise<void> {
    const messages: Partial<Record<AuditAction, string>> = {
      BUSINESS_VERIFIED: `${name} is now a verified business on CampusPin.`,
      BUSINESS_REJECTED: `${name} was not approved.`,
      BUSINESS_SUSPENDED: `${name} is suspended and hidden from students.`,
      BUSINESS_REINSTATED: `${name} is active again.`,
    };
    const title = messages[action];
    if (!title) return;
    await this.notifications.notify(
      {
        userId: ownerId,
        category: 'ACCOUNT',
        type: `business.${action.toLowerCase()}`,
        title,
        message: reason ? `Reason: ${reason}` : 'See your business dashboard for details.',
        link: '/business/dashboard',
      },
      tx,
    );
  }

  private async deleteBlockers(id: string): Promise<string | null> {
    const counts = await this.prisma.businessProfile.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            places: true,
            leads: true,
            claims: true,
            serviceOrders: true,
            serviceRequests: true,
            offers: true,
            bookings: true,
            subscriptions: true,
          },
        },
      },
    });
    if (!counts) return null;
    const c = counts._count;
    const parts = [
      c.places && `${c.places} listing(s)`,
      c.leads && `${c.leads} enquiry(ies)`,
      c.claims && `${c.claims} claim(s)`,
      c.serviceOrders && `${c.serviceOrders} order(s)`,
      c.serviceRequests && `${c.serviceRequests} request(s)`,
      c.offers && `${c.offers} offer(s)`,
      c.bookings && `${c.bookings} booking(s)`,
      c.subscriptions && `${c.subscriptions} subscription record(s)`,
    ].filter(Boolean);
    return parts.length > 0
      ? `It has ${parts.join(', ')}. Suspend it instead so its history is kept.`
      : null;
  }

  private async openReportsFor(id: string): Promise<number> {
    const places = await this.prisma.place.findMany({
      where: { businessProfileId: id },
      select: { id: true },
    });
    if (places.length === 0) return 0;
    const placeIds = places.map((place) => place.id);
    const reviews = await this.prisma.review.findMany({
      where: { placeId: { in: placeIds } },
      select: { id: true },
    });
    return this.prisma.report.count({
      where: {
        status: { in: ['PENDING', 'IN_REVIEW'] },
        OR: [
          { targetType: 'PLACE', targetId: { in: placeIds } },
          ...(reviews.length
            ? [{ targetType: 'REVIEW' as const, targetId: { in: reviews.map((r) => r.id) } }]
            : []),
        ],
      },
    });
  }

  private async historyOf(id: string): Promise<AuditEntry[]> {
    const placeIds = (
      await this.prisma.place.findMany({ where: { businessProfileId: id }, select: { id: true } })
    ).map((place) => place.id);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'BusinessProfile', entityId: id },
          ...(placeIds.length ? [{ entityType: 'Place', entityId: { in: placeIds } }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: AUDIT_SELECT,
    });
    return rows.map(toAuditEntry);
  }

  private record(
    tx: Tx,
    action: AuditAction,
    id: string,
    actor: AuthenticatedUser,
    client: ClientContext,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record(
      { action, actorId: actor.id, entityType: 'BusinessProfile', entityId: id, metadata, client },
      tx,
    );
  }

  /** Listing counts (all and live) in one grouped query, plus each business's current plan. */
  private async withCounts(rows: BusinessRow[]): Promise<AdminBusiness[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [groups, subscriptions, defaultPlan] = await Promise.all([
      this.prisma.place.groupBy({
        by: ['businessProfileId', 'status'],
        where: { businessProfileId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.businessSubscription.findMany({
        where: { businessProfileId: { in: ids }, ...liveSubscriptionWhere(new Date()) },
        select: { businessProfileId: true, plan: { select: { key: true, name: true } } },
      }),
      this.prisma.businessPlan.findFirst({
        where: { isDefault: true },
        select: { key: true, name: true },
      }),
    ]);
    return rows.map((row) => {
      const mine = groups.filter((group) => group.businessProfileId === row.id);
      const live = mine
        .filter((group) => group.status === 'ACTIVE')
        .reduce((sum, group) => sum + group._count._all, 0);
      const plan = subscriptions.find((sub) => sub.businessProfileId === row.id)?.plan ??
        defaultPlan ?? { key: 'FREE', name: 'Free' };
      return {
        id: row.id,
        businessName: row.businessName,
        slug: row.slug,
        owner: {
          id: row.owner.id,
          name: row.owner.name,
          email: row.owner.email,
          lastActiveAt: row.owner.lastActiveAt?.toISOString() ?? null,
        },
        phone: row.phone,
        email: row.email,
        website: row.website,
        logoUrl: row.logoUrl,
        category: row.category,
        city: row.city,
        status: row.status,
        verificationStatus: row.verificationStatus,
        statusReason: row.statusReason,
        isPublic: row.status === 'ACTIVE' && row.verificationStatus !== 'REJECTED' && live > 0,
        plan,
        listingCount: mine.reduce((sum, group) => sum + group._count._all, 0),
        liveListingCount: live,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}

export const AUDIT_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_SELECT }>;

export function toAuditEntry(row: AuditRow): AuditEntry {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actor: row.actor,
    metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
