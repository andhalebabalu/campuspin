import { Injectable } from '@nestjs/common';
import {
  FINAL_ORDER_STATUSES,
  type BusinessInsights,
  type InsightRange,
  type InsightsQuery,
} from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { daysBefore, istDay } from '../analytics/activity-rules.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { BusinessAccessService } from '../business/business-access.service.js';

const RANGE_DAYS: Readonly<Record<InsightRange, number>> = { today: 1, '7d': 7, '30d': 30 };

/**
 * The business dashboard's numbers over today / 7 / 30 India days. Every figure is a count of real
 * rows; views and scans are counted from when tracking started, never estimated.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
  ) {}

  async insights(actor: AuthenticatedUser, query: InsightsQuery): Promise<BusinessInsights> {
    const businessIds = await this.access.businessIdsOf(actor);
    const placeIds = query.placeId
      ? [(await this.access.placeOf(actor, query.placeId)).id]
      : (
          await this.prisma.place.findMany({
            where: { businessProfileId: { in: businessIds } },
            select: { id: true },
          })
        ).map((place) => place.id);

    const today = istDay(new Date());
    const fromDay = daysBefore(today, RANGE_DAYS[query.range] - 1);
    // The instant the first day of the range began in India.
    const from = new Date(fromDay.getTime() - 330 * 60_000);
    const inPlaces = { placeId: { in: placeIds } };

    const [
      orders,
      activeOrders,
      stats,
      reviews,
      savedBy,
      menu,
      requests,
      pendingRequests,
      offerRedemptions,
      activeOffers,
      bookings,
      upcomingBookings,
    ] = await Promise.all([
      this.prisma.serviceOrder.count({ where: { ...inPlaces, createdAt: { gte: from } } }),
      this.prisma.serviceOrder.count({
        where: { ...inPlaces, status: { notIn: [...FINAL_ORDER_STATUSES] } },
      }),
      this.prisma.placeDailyStat.aggregate({
        where: { ...inPlaces, day: { gte: fromDay } },
        _sum: { views: true, qrScans: true },
      }),
      this.prisma.review.count({ where: { ...inPlaces, createdAt: { gte: from } } }),
      this.prisma.savedPlace.count({ where: inPlaces }),
      this.prisma.dailyMenu.findFirst({
        where: { ...inPlaces, date: today },
        select: { status: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.serviceRequest.count({ where: { ...inPlaces, createdAt: { gte: from } } }),
      this.prisma.serviceRequest.count({
        where: { ...inPlaces, status: { in: ['NEW', 'ACKNOWLEDGED', 'APPROVED'] } },
      }),
      this.prisma.offerRedemption.count({
        where: { ...inPlaces, status: 'REDEEMED', redeemedAt: { gte: from } },
      }),
      this.prisma.studentOffer.count({
        where: {
          ...inPlaces,
          status: 'ACTIVE',
          OR: [{ validUntil: null }, { validUntil: { gte: today } }],
        },
      }),
      this.prisma.booking.count({ where: { ...inPlaces, createdAt: { gte: from } } }),
      this.prisma.booking.count({
        where: {
          ...inPlaces,
          status: { in: ['PENDING', 'CONFIRMED'] },
          endAt: { gte: new Date() },
        },
      }),
    ]);

    return {
      range: query.range,
      orders,
      activeOrders,
      pendingRequests,
      requests,
      bookings,
      upcomingBookings,
      offerRedemptions,
      activeOffers,
      profileViews: stats._sum.views ?? 0,
      qrScans: stats._sum.qrScans ?? 0,
      reviews,
      savedBy,
      todaysMenu: menu?.status ?? 'NONE',
    };
  }
}
