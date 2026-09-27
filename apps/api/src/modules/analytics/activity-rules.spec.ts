import { describe, expect, it } from 'vitest';
import {
  ActivityThrottle,
  audienceOf,
  dayKey,
  daysBefore,
  istDay,
  ratio,
} from './activity-rules.js';

describe('istDay', () => {
  it('uses the calendar day in India', () => {
    // 20:00 UTC on the 26th is 01:30 on the 27th in India.
    expect(dayKey(istDay(new Date('2026-09-26T20:00:00Z')))).toBe('2026-09-27');
    expect(dayKey(istDay(new Date('2026-09-26T18:00:00Z')))).toBe('2026-09-26');
  });

  it('counts back whole days', () => {
    expect(dayKey(daysBefore(istDay(new Date('2026-10-01T06:00:00Z')), 29))).toBe('2026-09-02');
  });
});

describe('audienceOf', () => {
  it('prefers business, then student, else staff', () => {
    expect(audienceOf(['STUDENT', 'BUSINESS_OWNER'])).toBe('BUSINESS');
    expect(audienceOf(['STUDENT'])).toBe('STUDENT');
    expect(audienceOf(['ADMIN'])).toBe('STAFF');
  });
});

describe('ratio', () => {
  it('is 0 with nothing to divide by and never above 1', () => {
    expect(ratio(3, 0)).toBe(0);
    expect(ratio(1, 3)).toBe(0.333);
    expect(ratio(5, 4)).toBe(1);
  });
});

describe('ActivityThrottle', () => {
  it('lets one write through per interval per account', () => {
    const throttle = new ActivityThrottle(60_000, 10);
    expect(throttle.shouldWrite('a', 0)).toBe(true);
    expect(throttle.shouldWrite('a', 30_000)).toBe(false);
    expect(throttle.shouldWrite('b', 30_000)).toBe(true);
    expect(throttle.shouldWrite('a', 61_000)).toBe(true);
  });

  it('stays bounded', () => {
    const throttle = new ActivityThrottle(60_000, 2);
    throttle.shouldWrite('a', 0);
    throttle.shouldWrite('b', 0);
    expect(throttle.shouldWrite('c', 0)).toBe(true);
    expect(throttle.shouldWrite('a', 1)).toBe(true); // forgotten after the reset
  });
});
