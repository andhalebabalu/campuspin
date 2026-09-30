import { Injectable } from '@nestjs/common';
import type {
  AdminBusinessAnalytics,
  AdminBusinessAnalyticsQuery,
  AdminListAuditQuery,
  AdminListSubscriptionsQuery,
  AdminPlan,
  AdminSubscription,
  AuditEntry,
} from '@platform/contracts';
import { Paginated, pageWindow } from '../../common/http/paginated.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { dayKey, daysBefore, istDay } from '../analytics/activity-rules.js';
import { PLAN_SELECT, liveSubscriptionWhere, toPlan } from '../business/subscriptions.service.js';
import { escapeLike } from '../places/place-queries.js';
import { AUDIT_SELECT, toAuditEntry } from './admin-businesses.service.js';

const IST_MS = 330 * 60 * 1000;
const istStart = (day: string, end = false) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS + (end ? 24 * 60 * 60 * 1000 : 0));

/** Read-only staff views: plans, subscriptions, the audit log and business page analytics. */
@Injectable()
export class AdminCrmService {
  constructor(private readonly prisma: PrismaService) {}

  async plans(): Promise<AdminPlan[]> {
    const [plans, counts] = await Promise.all([
      this.prisma.businessPlan.findMany({
        orderBy: { sortOrder: 'asc' },
        select: { id: true, ...PLAN_SELECT },
      }),
      this.prisma.businessSubscription.groupBy({
        by: ['planId'],
        where: liveSubscriptionWhere(new Date()),
        _count: { _all: true },
      }),
    ]);
    return plans.map((plan) => ({
      ...toPlan(plan),
      activeSubscriptions: counts.find((count) => count.planId === plan.id)?._count._all ?? 0,
    }));
  }

  async subscriptions(query: AdminListSubscriptionsQuery): Promise<Paginated<AdminSubscription>> {
    const where: Prisma.BusinessSubscriptionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.planKey ? { plan: { key: query.planKey } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.businessSubscription.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
        select: {
          id: true,
          status: true,
          startedAt: true,
          endsAt: true,
          endedAt: true,
          note: true,
          plan: { select: { key: true, name: true } },
          businessProfile: { select: { id: true, businessName: true, slug: true } },
          assignedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.businessSubscription.count({ where }),
    ]);
    return Paginated.of(
      rows.map((row) => ({
        id: row.id,
        business: {
          id: row.businessProfile.id,
          name: row.businessProfile.businessName,
          slug: row.businessProfile.slug,
        },
        plan: row.plan,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        note: row.note,
        assignedBy: row.assignedBy,
      })),
      { ...query, total },
    );
  }

  async auditLog(query: AdminListAuditQuery): Promise<Paginated<AuditEntry>> {
    const actor = query.actor ? escapeLike(query.actor) : undefined;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(actor
        ? { actor: { OR: [{ email: { contains: actor } }, { name: { contains: actor } }] } }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: istStart(query.from) } : {}),
              ...(query.to ? { lt: istStart(query.to, true) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageWindow(query),
        select: AUDIT_SELECT,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return Paginated.of(rows.map(toAuditEntry), { ...query, total });
  }

  /** Platform-wide page events for business pages, from the anonymous event table. */
  async businessAnalytics(query: AdminBusinessAnalyticsQuery): Promise<AdminBusinessAnalytics> {
    const today = istDay(new Date());
    const from = daysBefore(today, query.days - 1);
    const range = { day: { gte: from, lte: today } };
    const [byDayType, byBusiness, byCategory] = await Promise.all([
      this.prisma.businessEvent.groupBy({
        by: ['day', 'type'],
        where: range,
        _count: { _all: true },
      }),
      this.prisma.businessEvent.groupBy({
        by: ['businessProfileId', 'type'],
        where: range,
        _count: { _all: true },
      }),
      this.prisma.businessProfile.groupBy({
        by: ['categoryId'],
        _count: { _all: true },
      }),
    ]);

    const totals = { pageViews: 0, calls: 0, whatsapp: 0, directions: 0, shares: 0 };
    const key = {
      PAGE_VIEW: 'pageViews',
      PHONE_CLICK: 'calls',
      WHATSAPP_CLICK: 'whatsapp',
      DIRECTION_CLICK: 'directions',
      SHARE_CLICK: 'shares',
    } as const;
    const daily = new Map<string, { day: string; pageViews: number; actions: number }>();
    for (let offset = query.days - 1; offset >= 0; offset -= 1) {
      const day = dayKey(daysBefore(today, offset));
      daily.set(day, { day, pageViews: 0, actions: 0 });
    }
    for (const group of byDayType) {
      totals[key[group.type]] += group._count._all;
      const entry = daily.get(dayKey(group.day));
      if (!entry) continue;
      if (group.type === 'PAGE_VIEW') entry.pageViews += group._count._all;
      else entry.actions += group._count._all;
    }

    const perBusiness = new Map<string, { pageViews: number; actions: number }>();
    for (const group of byBusiness) {
      const entry = perBusiness.get(group.businessProfileId) ?? { pageViews: 0, actions: 0 };
      if (group.type === 'PAGE_VIEW') entry.pageViews += group._count._all;
      else entry.actions += group._count._all;
      perBusiness.set(group.businessProfileId, entry);
    }
    const topIds = [...perBusiness.entries()]
      .sort((a, b) => b[1].pageViews - a[1].pageViews || b[1].actions - a[1].actions)
      .slice(0, 10)
      .map(([id]) => id);
    const [names, categories] = await Promise.all([
      this.prisma.businessProfile.findMany({
        where: { id: { in: topIds } },
        select: { id: true, businessName: true, slug: true },
      }),
      this.prisma.category.findMany({
        where: {
          id: { in: byCategory.map((g) => g.categoryId).filter((id): id is string => !!id) },
        },
        select: { id: true, name: true },
      }),
    ]);

    return {
      days: query.days,
      totals,
      daily: [...daily.values()],
      top: topIds.flatMap((id) => {
        const business = names.find((row) => row.id === id);
        const counts = perBusiness.get(id);
        return business && counts
          ? [{ id, name: business.businessName, slug: business.slug, ...counts }]
          : [];
      }),
      byCategory: byCategory
        .map((group) => ({
          name: categories.find((c) => c.id === group.categoryId)?.name ?? 'No category',
          count: group._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
