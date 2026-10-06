import { describe, expect, it } from 'vitest';
import { createPromotionSchema, promotionLinkSchema, updatePromotionSchema } from './promotions.js';

describe('promotions', () => {
  it('fills the splash defaults: 10 s on screen, close after 5 s', () => {
    const parsed = createPromotionSchema.parse({ placement: 'SPLASH', title: 'Hello' });
    expect(parsed).toMatchObject({
      displaySeconds: 10,
      skipAfterSeconds: 5,
      audience: 'ALL',
      active: true,
    });
  });

  it('refuses a close button that comes after the ad ends', () => {
    const result = createPromotionSchema.safeParse({
      placement: 'SPLASH',
      title: 'Hello',
      displaySeconds: 5,
      skipAfterSeconds: 8,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['skipAfterSeconds']);
  });

  it('refuses an end before the start, and a button without a link', () => {
    expect(
      createPromotionSchema.safeParse({
        placement: 'FEED',
        title: 'Hello',
        startsAt: '2026-10-02T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      createPromotionSchema.safeParse({ placement: 'FEED', title: 'Hello', ctaLabel: 'Open' })
        .success,
    ).toBe(false);
  });

  it('accepts app paths and https links, nothing else', () => {
    expect(promotionLinkSchema.safeParse('/places/sai-mess').success).toBe(true);
    expect(promotionLinkSchema.safeParse('https://campuspin.in/new').success).toBe(true);
    expect(promotionLinkSchema.safeParse('//evil.example.com').success).toBe(false);
    expect(promotionLinkSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('needs at least one field to update', () => {
    expect(updatePromotionSchema.safeParse({}).success).toBe(false);
    expect(updatePromotionSchema.safeParse({ active: false }).success).toBe(true);
  });
});
