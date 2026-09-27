import { Injectable, Logger } from '@nestjs/common';
import {
  ONLINE_WINDOW_MINUTES,
  type ActivityDay,
  type ActivityOverview,
  type ActivityPeriod,
  type RecordVisitRequest,
} from '@platform/contracts';
import { PrismaService } from '../../infra/database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  ActivityThrottle,
  audienceOf,
  dayKey,
  daysBefore,
  istDay,
  ratio,
} from './activity-rules.js';

const SERIES_DAYS = 30;

/** Members are students and business owners; staff accounts are left out of every figure. */
const MEMBER_ROLES = ['STUDENT', 'BUSINESS_OWNER'];

interface VisitCounts {
  visitors: bigint;
  guests: bigint;
  web: bigint;
  mobile: bigint;
  activeUsers: bigint;
  students: bigint;
  businesses: bigint;
}

interface DayCounts {
  day: Date;
  visitors: bigint;
  activeUsers: bigint;
  web: bigint;
  mobile: bigint;
}

const n = (value: bigint | number | null | undefined) => Number(value ?? 0);

/**
 * Who uses CampusPin: each account's last activity, one visit row per device per day, and the
 * overview staff see (visitors, active members, ratios, a 30-day series).
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  private readonly throttle = new ActivityThrottle();

  constructor(private readonly prisma: PrismaService) {}

  /** Marks an account active now (at most once a minute; never fails the request). */
  touch(userId: string): void {
    const now = new Date();
    if (!this.throttle.shouldWrite(userId, now.getTime())) return;
    this.prisma.user
      .updateMany({ where: { id: userId }, data: { lastActiveAt: now } })
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not record activity: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  /** One row per device per day. A later signed-in visit the same day attaches the account. */
  async recordVisit(dto: RecordVisitRequest, viewer: AuthenticatedUser | null): Promise<void> {
    const now = new Date();
    const day = istDay(now);
    const visitorKey = `v:${dto.visitorId}`;
    const who = viewer ? { userId: viewer.id, audience: audienceOf(viewer.roles) } : {};
    await this.prisma.dailyVisit.upsert({
      where: { day_visitorKey: { day, visitorKey } },
      create: { day, visitorKey, client: dto.client, ...who },
      update: { lastSeenAt: now, client: dto.client, ...who },
    });
    if (viewer) this.touch(viewer.id);
  }

  async overview(): Promise<ActivityOverview> {
    const now = new Date();
    const today = istDay(now);
    const from = daysBefore(today, SERIES_DAYS - 1);
    const memberWhere = {
      status: 'ACTIVE' as const,
      userRoles: { some: { role: { key: { in: MEMBER_ROLES } } } },
    };
    const byRole = (key: string) => ({
      status: 'ACTIVE' as const,
      userRoles: { some: { role: { key } } },
    });

    const [members, students, businesses, onlineNow, todayCounts, weekCounts, monthCounts, days] =
      await Promise.all([
        this.prisma.user.count({ where: memberWhere }),
        this.prisma.user.count({ where: byRole('STUDENT') }),
        this.prisma.user.count({ where: byRole('BUSINESS_OWNER') }),
        this.prisma.user.count({
          where: {
            ...memberWhere,
            lastActiveAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60_000) },
          },
        }),
        this.periodCounts(today),
        this.periodCounts(daysBefore(today, 6)),
        this.periodCounts(from),
        this.prisma.$queryRaw<DayCounts[]>`
        SELECT day,
          COUNT(DISTINCT visitorKey) AS visitors,
          COUNT(DISTINCT CASE WHEN audience IN ('STUDENT', 'BUSINESS') THEN userId END) AS activeUsers,
          COUNT(DISTINCT CASE WHEN client = 'web' THEN visitorKey END) AS web,
          COUNT(DISTINCT CASE WHEN client = 'mobile' THEN visitorKey END) AS mobile
        FROM daily_visits
        WHERE day >= ${from}
        GROUP BY day`,
      ]);

    const byDay = new Map(days.map((row) => [dayKey(new Date(row.day)), row]));
    const daily: ActivityDay[] = Array.from({ length: SERIES_DAYS }, (_, index) => {
      const key = dayKey(daysBefore(today, SERIES_DAYS - 1 - index));
      const row = byDay.get(key);
      return {
        day: key,
        visitors: n(row?.visitors),
        activeUsers: n(row?.activeUsers),
        webVisitors: n(row?.web),
        mobileVisitors: n(row?.mobile),
      };
    });

    const period = (
      key: ActivityPeriod['key'],
      label: string,
      counts: VisitCounts,
    ): ActivityPeriod => ({
      key,
      label,
      visitors: n(counts.visitors),
      guestVisitors: n(counts.guests),
      webVisitors: n(counts.web),
      mobileVisitors: n(counts.mobile),
      activeUsers: n(counts.activeUsers),
      activeStudents: n(counts.students),
      activeBusinesses: n(counts.businesses),
    });
    const month = period('30d', 'Last 30 days', monthCounts);
    const averageDaily = daily.reduce((sum, day) => sum + day.activeUsers, 0) / SERIES_DAYS;

    return {
      generatedAt: now.toISOString(),
      onlineNow,
      totals: { members, students, businesses },
      periods: [
        period('today', 'Today', todayCounts),
        period('7d', 'Last 7 days', weekCounts),
        month,
      ],
      ratios: {
        activeRate30d: ratio(month.activeUsers, members),
        stickiness: ratio(averageDaily, month.activeUsers),
        signedInShare30d: ratio(month.visitors - month.guestVisitors, month.visitors),
      },
      daily,
    };
  }

  private async periodCounts(from: Date): Promise<VisitCounts> {
    const [row] = await this.prisma.$queryRaw<VisitCounts[]>`
      SELECT
        COUNT(DISTINCT visitorKey) AS visitors,
        COUNT(DISTINCT CASE WHEN userId IS NULL THEN visitorKey END) AS guests,
        COUNT(DISTINCT CASE WHEN client = 'web' THEN visitorKey END) AS web,
        COUNT(DISTINCT CASE WHEN client = 'mobile' THEN visitorKey END) AS mobile,
        COUNT(DISTINCT CASE WHEN audience IN ('STUDENT', 'BUSINESS') THEN userId END) AS activeUsers,
        COUNT(DISTINCT CASE WHEN audience = 'STUDENT' THEN userId END) AS students,
        COUNT(DISTINCT CASE WHEN audience = 'BUSINESS' THEN userId END) AS businesses
      FROM daily_visits
      WHERE day >= ${from}`;
    return (
      row ?? {
        visitors: 0n,
        guests: 0n,
        web: 0n,
        mobile: 0n,
        activeUsers: 0n,
        students: 0n,
        businesses: 0n,
      }
    );
  }
}
