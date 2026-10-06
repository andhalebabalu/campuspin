import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LISTING_LIMIT_SETTINGS,
  adjustCreditsSchema,
  listingLimitSettingsSchema,
  updateListingLimitSettingsSchema,
} from './listing-credits.js';

describe('listing credits', () => {
  it('starts switched off, so every listing is free', () => {
    expect(listingLimitSettingsSchema.parse(DEFAULT_LISTING_LIMIT_SETTINGS).enabled).toBe(false);
  });

  it('accepts a partial settings change but not an empty one', () => {
    expect(updateListingLimitSettingsSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(updateListingLimitSettingsSchema.safeParse({}).success).toBe(false);
    expect(updateListingLimitSettingsSchema.safeParse({ creditsPerListing: 0 }).success).toBe(
      false,
    );
  });

  it('adjusts credits up or down, never by 0', () => {
    expect(adjustCreditsSchema.safeParse({ amount: 5 }).success).toBe(true);
    expect(adjustCreditsSchema.safeParse({ amount: -2, note: 'Refund reversed' }).success).toBe(
      true,
    );
    expect(adjustCreditsSchema.safeParse({ amount: 0 }).success).toBe(false);
  });
});
