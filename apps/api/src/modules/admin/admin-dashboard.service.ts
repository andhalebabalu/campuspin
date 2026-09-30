import { Injectable } from '@nestjs/common';
import type { AdminDashboard } from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { dayKey, daysBefore, istDay } from '../analytics/activity-rules.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SERIES_DAYS = 30;

type Series = AdminDashboard['series'][number];
type SeriesKey = Exclude<keyof Series, 'day'>;
interface DayCount {
  day: Date | string;
  n: bigint | number;
}

/** The admin home: queue counts (what needs a decision) and a few platform totals. */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminDashboard> {
    const weekAgo = new Date(Date.now() - WEEK_MS);
    const [
      pendingSubmissions,
      hiddenReviews,
      unverifiedBusinesses,
      suspendedUsers,
      pendingStudentVerifications,
      openReports,
      users,
      students,
      verifiedStudents,
      activeListings,
      communityPostsLast7Days,
      businesses,
      livePlaces,
      activeColleges,
      reviewsLast7Days,
      enquiriesLast7Days,
    ] = await Promise.all([
      this.prisma.placeSubmission.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      this.prisma.review.count({ where: { status: 'HIDDEN' } }),
      this.prisma.businessProfile.count({
        where: { status: 'ACTIVE', verificationStatus: { not: 'VERIFIED' } },
      }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.studentVerification.count({ where: { status: 'PENDING', method: 'DOCUMENT' } }),
      this.prisma.report.count({
        where: {
          status: { in: ['PENDING', 'IN_REVIEW'] },
          targetType: {
            in: ['COMMUNITY_POST', 'COMMUNITY_COMMENT', 'MARKETPLACE_LISTING', 'USER'],
          },
        },
      }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { userRoles: { some: { role: { key: 'STUDENT' } } } } }),
      this.prisma.user.count({
        where: { verifiedCollegeId: { not: null }, studentVerifiedUntil: { gt: new Date() } },
      }),
      this.prisma.marketplaceListing.count({
        where: { status: { in: ['ACTIVE', 'RESERVED'] }, expiresAt: { gt: new Date() } },
      }),
      this.prisma.communityPost.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.businessProfile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.place.count({ where: { status: 'ACTIVE' } }),
      this.prisma.college.count({ where: { status: 'ACTIVE' } }),
      this.prisma.review.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);
    const [businessCounts, communityPosts, marketplaceListings, reviews, series] =
      await Promise.all([
        this.prisma.businessProfile.groupBy({
          by: ['status', 'verificationStatus'],
          _count: { _all: true },
        }),
        this.prisma.communityPost.count(),
        this.prisma.marketplaceListing.count(),
        this.prisma.review.count({ where: { status: 'PUBLISHED' } }),
        this.series(),
      ]);
    const countWhere = (test: (g: (typeof businessCounts)[number]) => boolean) =>
      businessCounts.filter(test).reduce((sum, g) => sum + g._count._all, 0);
    return {
      queues: {
        pendingSubmissions,
        hiddenReviews,
        unverifiedBusinesses,
        suspendedUsers,
        pendingStudentVerifications,
        openReports,
      },
      totals: {
        users,
        students,
        verifiedStudents,
        activeListings,
        communityPostsLast7Days,
        businesses,
        livePlaces,
        activeColleges,
        reviewsLast7Days,
        enquiriesLast7Days,
        verifiedBusinesses: countWhere((g) => g.verificationStatus === 'VERIFIED'),
        pendingBusinesses: countWhere(
          (g) => g.verificationStatus === 'PENDING' && g.status === 'ACTIVE',
        ),
        rejectedBusinesses: countWhere((g) => g.verificationStatus === 'REJECTED'),
        suspendedBusinesses: countWhere((g) => g.status === 'SUSPENDED'),
        communityPosts,
        marketplaceListings,
        reviews,
      },
      series,
    };
  }

  /** Real rows per India day for the last 30 days, zero-filled, oldest first. */
  private async series(): Promise<Series[]> {
    const today = istDay(new Date());
    const from = daysBefore(today, SERIES_DAYS - 1);
    // IST midnight of the first day, as the UTC instant the DATETIME columns hold.
    const since = new Date(from.getTime() - 330 * 60 * 1000);
    // Each day is the India calendar day: shift the UTC timestamp by +5:30, then take its date.
    const [students, businesses, verifications, places, listings, posts] = await Promise.all([
      this.prisma.$queryRaw<DayCount[]>`
        SELECT DATE(DATE_ADD(u.createdAt, INTERVAL 330 MINUTE)) AS day, COUNT(*) AS n
        FROM users u
        WHERE u.createdAt >= ${since} AND EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.roleId
          WHERE ur.userId = u.id AND r.\`key\` = 'STUDENT')
        GROUP BY day`,
      this.prisma.$queryRaw<DayCount[]>`
        SELECT DATE(DATE_ADD(createdAt, INTERVAL 330 MINUTE)) AS day, COUNT(*) AS n
        FROM business_profiles WHERE createdAt >= ${since} GROUP BY day`,
      this.prisma.$queryRaw<DayCount[]>`
        SELECT DATE(DATE_ADD(verifiedAt, INTERVAL 330 MINUTE)) AS day, COUNT(*) AS n
        FROM business_profiles WHERE verifiedAt >= ${since} GROUP BY day`,
      this.prisma.$queryRaw<DayCount[]>`
        SELECT DATE(DATE_ADD(publishedAt, INTERVAL 330 MINUTE)) AS day, COUNT(*) AS n
        FROM places WHERE publishedAt >= ${since} GROUP BY day`,
      this.prisma.$queryRaw<DayCount[]>`
        SELECT DATE(DATE_ADD(createdAt, INTERVAL 330 MINUTE)) AS day, COUNT(*) AS n
        FROM marketplace_listings WHERE createdAt >= ${since} GROUP BY day`,
      this.prisma.$queryRaw<DayCount[]>`
        SELECT DATE(DATE_ADD(createdAt, INTERVAL 330 MINUTE)) AS day, COUNT(*) AS n
        FROM community_posts WHERE createdAt >= ${since} GROUP BY day`,
    ]);
    const days = new Map<string, Series>();
    for (let offset = SERIES_DAYS - 1; offset >= 0; offset -= 1) {
      const day = dayKey(daysBefore(today, offset));
      days.set(day, {
        day,
        studentSignups: 0,
        businessSignups: 0,
        businessVerifications: 0,
        placesPublished: 0,
        marketplaceListings: 0,
        communityPosts: 0,
      });
    }
    const fill = (rows: DayCount[], key: SeriesKey) => {
      for (const row of rows) {
        const day = row.day instanceof Date ? dayKey(row.day) : String(row.day).slice(0, 10);
        const entry = days.get(day);
        if (entry) entry[key] = Number(row.n);
      }
    };
    fill(students, 'studentSignups');
    fill(businesses, 'businessSignups');
    fill(verifications, 'businessVerifications');
    fill(places, 'placesPublished');
    fill(listings, 'marketplaceListings');
    fill(posts, 'communityPosts');
    return [...days.values()];
  }
}
