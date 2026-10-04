import { Injectable } from '@nestjs/common';
import type { CollegeRef, MemberSummary, StudentBadge } from '@platform/contracts';
import { AppException } from '../../common/http/app-exception.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { displayName } from '../reviews/review-rules.js';
import { studentBadge } from './student-rules.js';

export interface VerifiedStudent {
  userId: string;
  college: CollegeRef;
  collegeLatitude: number;
  collegeLongitude: number;
}

const BADGE_SELECT = {
  status: true,
  studentVerifiedUntil: true,
  verifiedCollege: {
    select: { id: true, slug: true, name: true, latitude: true, longitude: true },
  },
} as const;

/**
 * The one place that answers "is this member a verified student, and of which college?". Always
 * read fresh from the database — never from the access token (its roles can be 15 minutes old) and
 * never from anything the client sends. Community and marketplace take the college from here, so a
 * request body can never claim another college.
 */
@Injectable()
export class StudentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async badge(userId: string): Promise<StudentBadge> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: BADGE_SELECT });
    if (!user) return { verified: false, college: null, verifiedUntil: null };
    return studentBadge(user);
  }

  /** The verified student behind this request, or a 403 saying how to become one. */
  async requireVerified(userId: string): Promise<VerifiedStudent> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: BADGE_SELECT });
    if (!user || user.status !== 'ACTIVE') {
      throw AppException.forbidden('ACCOUNT_SUSPENDED', 'This account cannot do that right now.');
    }
    const badge = studentBadge(user);
    if (!badge.verified || !user.verifiedCollege) {
      throw AppException.forbidden(
        'STUDENT_VERIFICATION_REQUIRED',
        'Only verified students can do this. Verify your college to continue.',
      );
    }
    const { latitude, longitude, ...college } = user.verifiedCollege;
    return { userId, college, collegeLatitude: latitude, collegeLongitude: longitude };
  }

  /** How members appear to each other, for many at once. Unknown ids are simply absent. */
  async summaries(userIds: readonly string[]): Promise<Map<string, MemberSummary>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, avatarUrl: true, ...BADGE_SELECT },
    });
    return new Map(users.map((user) => [user.id, toMemberSummary(user)]));
  }
}

export function toMemberSummary(user: {
  id: string;
  name: string;
  avatarUrl?: string | null;
  studentVerifiedUntil: Date | null;
  verifiedCollege: { id: string; slug: string; name: string } | null;
}): MemberSummary {
  const badge = studentBadge(user);
  return {
    id: user.id,
    displayName: displayName(user.name),
    avatarUrl: user.avatarUrl ?? null,
    verifiedStudent: badge.verified,
    college: badge.college,
  };
}
