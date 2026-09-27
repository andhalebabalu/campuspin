import { DEFAULT_LISTING_LIMIT_SETTINGS, type ListingLimitSettings } from '@platform/contracts';
import { describe, expect, it } from 'vitest';
import { limitMessage, monthWindow, nextCharge } from './listing-credit-rules.js';

const on: ListingLimitSettings = {
  ...DEFAULT_LISTING_LIMIT_SETTINGS,
  enabled: true,
  freeListings: 2,
  creditsPerListing: 3,
};

describe('nextCharge', () => {
  it('is always FREE while limits are off', () => {
    expect(nextCharge(DEFAULT_LISTING_LIMIT_SETTINGS, 99, 0)).toBe('FREE');
  });

  it('uses free slots first, then credits, then blocks', () => {
    expect(nextCharge(on, 1, 0)).toBe('FREE');
    expect(nextCharge(on, 2, 3)).toBe('CREDITS');
    expect(nextCharge(on, 2, 2)).toBe('BLOCKED');
  });

  it('with no free listings at all, goes straight to credits', () => {
    expect(nextCharge({ ...on, freeListings: 0 }, 0, 5)).toBe('CREDITS');
  });
});

describe('monthWindow', () => {
  it('uses the calendar month in India, not UTC', () => {
    // 31 Oct 20:00 UTC is already 1 Nov 01:30 in India.
    const { start, end } = monthWindow(new Date('2026-10-31T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-30T18:30:00.000Z');
  });

  it('rolls over the year', () => {
    expect(monthWindow(new Date('2026-12-15T00:00:00Z')).end.toISOString()).toBe(
      '2026-12-31T18:30:00.000Z',
    );
  });
});

describe('limitMessage', () => {
  it('says what was used, what a listing costs and what is left', () => {
    expect(limitMessage(on, 2)).toBe(
      'You have used your 2 free listings (sell or delete one to free a slot). Each extra listing costs 3 credits; you have 2.',
    );
    expect(limitMessage({ ...on, mode: 'MONTHLY', creditsPerListing: 1 }, -1)).toContain(
      'this month',
    );
  });
});
