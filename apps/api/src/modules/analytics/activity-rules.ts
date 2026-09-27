/** India Standard Time, UTC+5:30: a "day" of activity is a calendar day in India. */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The India calendar day of an instant, as the UTC-midnight Date a DATE column stores. */
export function istDay(now: Date): Date {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** `days` days before a DATE value (0 = the same day). */
export function daysBefore(day: Date, days: number): Date {
  return new Date(day.getTime() - days * DAY_MS);
}

/** YYYY-MM-DD of a DATE value. */
export const dayKey = (day: Date): string => day.toISOString().slice(0, 10);

/** How a signed-in account is counted. Business owners count as businesses even if also students. */
export function audienceOf(roles: readonly string[]): 'STUDENT' | 'BUSINESS' | 'STAFF' {
  if (roles.includes('BUSINESS_OWNER')) return 'BUSINESS';
  if (roles.includes('STUDENT')) return 'STUDENT';
  return 'STAFF';
}

/** A share between 0 and 1, rounded to 3 places; 0 when there is nothing to divide by. */
export function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((Math.min(part, whole) / whole) * 1000) / 1000;
}

/**
 * Remembers when each account's `lastActiveAt` was last written, so a burst of requests writes it
 * at most once per interval. Bounded: past `maxEntries` it simply starts over.
 */
export class ActivityThrottle {
  private readonly lastWrite = new Map<string, number>();

  constructor(
    private readonly intervalMs = 60_000,
    private readonly maxEntries = 10_000,
  ) {}

  /** True when the caller should write now (and records that it did). */
  shouldWrite(userId: string, now: number): boolean {
    const last = this.lastWrite.get(userId);
    if (last !== undefined && now - last < this.intervalMs) return false;
    if (this.lastWrite.size >= this.maxEntries) this.lastWrite.clear();
    this.lastWrite.set(userId, now);
    return true;
  }
}
