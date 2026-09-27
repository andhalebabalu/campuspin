import { z } from 'zod';

/**
 * Activity analytics: who uses CampusPin and how often. Each device (a browser or a phone) keeps a
 * random visitor id and reports one visit per day; nothing personal (no IP address) is stored.
 * A signed-in visit also records who it was, which gives "active users".
 */

export const ANALYTICS_CLIENTS = ['web', 'mobile'] as const;
export type AnalyticsClient = (typeof ANALYTICS_CLIENTS)[number];

export const recordVisitSchema = z.strictObject({
  visitorId: z.uuid(),
  client: z.enum(ANALYTICS_CLIENTS),
});
export type RecordVisitRequest = z.output<typeof recordVisitSchema>;

/** A member counts as online when they used an app in the last this-many minutes. */
export const ONLINE_WINDOW_MINUTES = 5;

export const activityPeriodSchema = z.object({
  key: z.enum(['today', '7d', '30d']),
  label: z.string(),
  /** Distinct devices (signed in or not). */
  visitors: z.number().int(),
  /** Devices that never signed in on the days they visited. */
  guestVisitors: z.number().int(),
  webVisitors: z.number().int(),
  mobileVisitors: z.number().int(),
  /** Distinct signed-in accounts. */
  activeUsers: z.number().int(),
  activeStudents: z.number().int(),
  activeBusinesses: z.number().int(),
});
export type ActivityPeriod = z.infer<typeof activityPeriodSchema>;

export const activityDaySchema = z.object({
  /** YYYY-MM-DD, India time. */
  day: z.string(),
  visitors: z.number().int(),
  activeUsers: z.number().int(),
  webVisitors: z.number().int(),
  mobileVisitors: z.number().int(),
});
export type ActivityDay = z.infer<typeof activityDaySchema>;

export const activityOverviewSchema = z.object({
  generatedAt: z.string(),
  onlineNow: z.number().int(),
  totals: z.object({
    /** Active (not suspended) accounts, staff excluded. */
    members: z.number().int(),
    students: z.number().int(),
    businesses: z.number().int(),
  }),
  periods: z.array(activityPeriodSchema),
  ratios: z.object({
    /** Members active in the last 30 days / all members. */
    activeRate30d: z.number(),
    /** Average daily active users / monthly active users (how often people come back). */
    stickiness: z.number(),
    /** Visitors in the last 30 days who were signed in / all visitors. */
    signedInShare30d: z.number(),
  }),
  daily: z.array(activityDaySchema),
});
export type ActivityOverview = z.infer<typeof activityOverviewSchema>;
