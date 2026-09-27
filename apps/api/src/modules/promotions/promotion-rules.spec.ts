import { describe, expect, it } from 'vitest';
import { audiencesFor, promotionState, skipAfter } from './promotion-rules.js';

describe('audiencesFor', () => {
  it('gives signed-out visitors and staff only ALL', () => {
    expect(audiencesFor(null)).toEqual(['ALL']);
    expect(audiencesFor(['SUPER_ADMIN'])).toEqual(['ALL']);
  });

  it('adds STUDENTS and BUSINESSES by role', () => {
    expect(audiencesFor(['STUDENT'])).toEqual(['ALL', 'STUDENTS']);
    expect(audiencesFor(['BUSINESS_OWNER'])).toEqual(['ALL', 'BUSINESSES']);
  });
});

describe('promotionState', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('is PAUSED when switched off, whatever the dates', () => {
    expect(promotionState({ active: false, startsAt: null, endsAt: null }, now)).toBe('PAUSED');
  });

  it('is SCHEDULED before the start, ENDED from the end on, LIVE in between', () => {
    expect(promotionState({ active: true, startsAt: at('2026-10-02T00:00:00Z'), endsAt: null }, now)).toBe('SCHEDULED');
    expect(promotionState({ active: true, startsAt: null, endsAt: at('2026-10-01T12:00:00Z') }, now)).toBe('ENDED');
    expect(
      promotionState({ active: true, startsAt: at('2026-09-30T00:00:00Z'), endsAt: at('2026-10-05T00:00:00Z') }, now),
    ).toBe('LIVE');
    expect(promotionState({ active: true, startsAt: null, endsAt: null }, now)).toBe('LIVE');
  });
});

describe('skipAfter', () => {
  it('never lets the close button come after the ad ends', () => {
    expect(skipAfter(10, 5)).toBe(5);
    expect(skipAfter(4, 9)).toBe(4);
    expect(skipAfter(10, -1)).toBe(0);
  });
});
