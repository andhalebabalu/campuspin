import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { BusinessPlan, BusinessSubscription, MySubscription } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

export const PLAN_SELECT = {
  key: true,
  name: true,
  description: true,
  priceMonthly: true,
  features: true,
  isAvailable: true,
  isDefault: true,
} satisfies Prisma.BusinessPlanSelect;

type PlanRow = Prisma.BusinessPlanGetPayload<{ select: typeof PLAN_SELECT }>;

export function toPlan(row: PlanRow): BusinessPlan {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    priceMonthly: row.priceMonthly,
    features: Array.isArray(row.features)
      ? row.features.filter((item): item is string => typeof item === 'string')
      : [],
    isAvailable: row.isAvailable,
    isDefault: row.isDefault,
  };
}

/** A subscription counts while ACTIVE and not past its end date. */
export const liveSubscriptionWhere = (now: Date): Prisma.BusinessSubscriptionWhereInput => ({
  status: 'ACTIVE',
  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
});

/**
 * Which plan a business is on. No payments exist yet: a business without an assigned subscription
 * is on the default plan (FREE), and only staff assign another one.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async plans(): Promise<BusinessPlan[]> {
    const rows = await this.prisma.businessPlan.findMany({
      orderBy: { sortOrder: 'asc' },
      select: PLAN_SELECT,
    });
    return rows.map(toPlan);
  }

  async currentFor(businessProfileId: string): Promise<BusinessSubscription> {
    const live = await this.prisma.businessSubscription.findFirst({
      where: { businessProfileId, ...liveSubscriptionWhere(new Date()) },
      orderBy: { startedAt: 'desc' },
      select: { status: true, startedAt: true, endsAt: true, plan: { select: PLAN_SELECT } },
    });
    if (live) {
      return {
        plan: toPlan(live.plan),
        status: live.status,
        startedAt: live.startedAt.toISOString(),
        endsAt: live.endsAt?.toISOString() ?? null,
        isDefault: false,
      };
    }
    return {
      plan: await this.defaultPlan(),
      status: 'ACTIVE',
      startedAt: null,
      endsAt: null,
      isDefault: true,
    };
  }

  async mine(actor: AuthenticatedUser): Promise<MySubscription> {
    const business = await this.prisma.businessProfile.findFirst({
      where: { OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }] },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!business)
      throw AppException.notFound('No business profile is linked to this account yet.');
    const [current, plans] = await Promise.all([this.currentFor(business.id), this.plans()]);
    return { current, plans };
  }

  private async defaultPlan(): Promise<BusinessPlan> {
    const row = await this.prisma.businessPlan.findFirst({
      where: { isDefault: true },
      orderBy: { sortOrder: 'asc' },
      select: PLAN_SELECT,
    });
    if (!row) {
      this.logger.error('No default business plan. Run "npm run db:seed:reference".');
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        'Plans are temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return toPlan(row);
  }
}
