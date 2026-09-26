import { Injectable } from '@nestjs/common';
import type { AdminDashboard } from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
      users,
      students,
      verifiedStudents,
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
      this.prisma.user.count(),
      this.prisma.user.count({ where: { userRoles: { some: { role: { key: 'STUDENT' } } } } }),
      this.prisma.user.count({
        where: { verifiedCollegeId: { not: null }, studentVerifiedUntil: { gt: new Date() } },
      }),
      this.prisma.businessProfile.count({ where: { status: 'ACTIVE' } }),
      this.prisma.place.count({ where: { status: 'ACTIVE' } }),
      this.prisma.college.count({ where: { status: 'ACTIVE' } }),
      this.prisma.review.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);
    return {
      queues: {
        pendingSubmissions,
        hiddenReviews,
        unverifiedBusinesses,
        suspendedUsers,
        pendingStudentVerifications,
      },
      totals: {
        users,
        students,
        verifiedStudents,
        businesses,
        livePlaces,
        activeColleges,
        reviewsLast7Days,
        enquiriesLast7Days,
      },
    };
  }
}
