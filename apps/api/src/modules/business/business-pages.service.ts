import { Injectable } from '@nestjs/common';
import {
  BUSINESS_EVENT_TYPES,
  type BusinessAnalytics,
  type BusinessAnalyticsQuery,
  type BusinessEventType,
  type PublicBusiness,
  type TrackBusinessEventRequest,
} from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { dayKey, daysBefore, istDay } from '../analytics/activity-rules.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { coverImageUrl, primaryCategoryOf } from '../places/place-mappers.js';
import { BusinessAccessService } from './business-access.service.js';
import { PUBLIC_BUSINESS_WHERE } from './business-mappers.js';

const notFound = () => AppException.notFound('Business not found');

type Counts = Record<BusinessEventType, number>;
const zeroCounts = (): Counts =>
  Object.fromEntries(BUSINESS_EVENT_TYPES.map((type) => [type, 0])) as Counts;

/**
 * The public business page (`/business/<slug>`) and its anonymous visit/tap counter, plus the
 * owner's analytics built from those counts. Nothing here is ever invented: an empty table reads
 * as zeros, and the dashboard shows an empty state for that.
 */
@Injectable()
export class BusinessPagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BusinessAccessService,
  ) {}

  async getPublic(slug: string): Promise<PublicBusiness> {
    const row = await this.prisma.businessProfile.findFirst({
      where: { slug: slug.trim().toLowerCase(), ...PUBLIC_BUSINESS_WHERE },
      select: {
        slug: true,
        businessName: true,
        description: true,
        category: { select: { id: true, slug: true, name: true } },
        city: true,
        logoUrl: true,
        coverUrl: true,
        phone: true,
        whatsapp: true,
        email: true,
        website: true,
        instagramUrl: true,
        facebookUrl: true,
        verificationStatus: true,
        places: {
          where: { status: 'ACTIVE' },
          orderBy: [{ ratingCount: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            slug: true,
            name: true,
            address: true,
            city: true,
            latitude: true,
            longitude: true,
            ratingAverage: true,
            ratingCount: true,
            categories: {
              select: {
                isPrimary: true,
                category: { select: { id: true, slug: true, name: true, icon: true } },
              },
            },
            images: {
              select: {
                id: true,
                imageUrl: true,
                altText: true,
                isCover: true,
                sortOrder: true,
              },
              orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });
    if (!row) throw notFound();

    const ratingCount = row.places.reduce((sum, place) => sum + place.ratingCount, 0);
    const ratingSum = row.places.reduce(
      (sum, place) => sum + place.ratingAverage * place.ratingCount,
      0,
    );
    return {
      slug: row.slug,
      name: row.businessName,
      description: row.description,
      category: row.category,
      city: row.city,
      logoUrl: row.logoUrl,
      coverUrl: row.coverUrl,
      phone: row.phone,
      whatsapp: row.whatsapp,
      email: row.email,
      website: row.website,
      instagramUrl: row.instagramUrl,
      facebookUrl: row.facebookUrl,
      verified: row.verificationStatus === 'VERIFIED',
      ratingAverage: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0,
      ratingCount,
      branches: row.places.map((place) => {
        const primary = primaryCategoryOf(place.categories);
        return {
          id: place.id,
          slug: place.slug,
          name: place.name,
          address: place.address,
          city: place.city,
          latitude: place.latitude,
          longitude: place.longitude,
          coverImageUrl: coverImageUrl(place.images),
          primaryCategory: primary ? { id: primary.id, slug: primary.slug, name: primary.name } : null,
          ratingAverage: place.ratingAverage,
          ratingCount: place.ratingCount,
        };
      }),
    };
  }

  /** Counts one visit or tap. A place id must be one of this business's live places. */
  async track(slug: string, dto: TrackBusinessEventRequest): Promise<void> {
    const business = await this.prisma.businessProfile.findFirst({
      where: { slug: slug.trim().toLowerCase(), ...PUBLIC_BUSINESS_WHERE },
      select: { id: true },
    });
    if (!business) throw notFound();
    if (dto.placeId) {
      const owned = await this.prisma.place.count({
        where: { id: dto.placeId, businessProfileId: business.id, status: 'ACTIVE' },
      });
      if (owned === 0) throw AppException.notFound('Place not found');
    }
    const now = new Date();
    await this.prisma.businessEvent.create({
      data: {
        businessProfileId: business.id,
        placeId: dto.placeId ?? null,
        type: dto.type,
        day: istDay(now),
        createdAt: now,
      },
    });
  }

  /** The owner's numbers for the last `days` IST days (today included) and the period before. */
  async analytics(
    query: BusinessAnalyticsQuery,
    actor: AuthenticatedUser,
  ): Promise<BusinessAnalytics> {
    const [businessId] = await this.access.businessIdsOf(actor);
    if (!businessId) throw AppException.notFound('No business profile is linked to this account yet.');
    const today = istDay(new Date());
    const from = daysBefore(today, query.days - 1);
    const previousFrom = daysBefore(from, query.days);
    const since = new Date(from.getTime() - 330 * 60 * 1000); // IST midnight of `from`, as an instant

    const [groups, previous, reviewCount, reviewsInPeriod, enquiriesInPeriod] = await Promise.all([
      this.prisma.businessEvent.groupBy({
        by: ['day', 'type'],
        where: { businessProfileId: businessId, day: { gte: from, lte: today } },
        _count: { _all: true },
      }),
      this.prisma.businessEvent.groupBy({
        by: ['type'],
        where: { businessProfileId: businessId, day: { gte: previousFrom, lt: from } },
        _count: { _all: true },
      }),
      this.prisma.review.count({
        where: { status: 'PUBLISHED', place: { businessProfileId: businessId } },
      }),
      this.prisma.review.count({
        where: {
          status: 'PUBLISHED',
          place: { businessProfileId: businessId },
          createdAt: { gte: since },
        },
      }),
      this.prisma.lead.count({ where: { businessProfileId: businessId, createdAt: { gte: since } } }),
    ]);

    const daily = new Map<string, Counts>();
    for (let offset = query.days - 1; offset >= 0; offset -= 1) {
      daily.set(dayKey(daysBefore(today, offset)), zeroCounts());
    }
    const totals = zeroCounts();
    for (const group of groups) {
      const counts = daily.get(dayKey(group.day));
      if (counts) counts[group.type] += group._count._all;
      totals[group.type] += group._count._all;
    }
    const previousTotals = zeroCounts();
    for (const group of previous) previousTotals[group.type] = group._count._all;

    return {
      days: query.days,
      totals,
      previousTotals,
      daily: [...daily.entries()].map(([day, counts]) => ({ day, ...counts })),
      reviews: { count: reviewCount, inPeriod: reviewsInPeriod },
      enquiries: { inPeriod: enquiriesInPeriod },
    };
  }
}
