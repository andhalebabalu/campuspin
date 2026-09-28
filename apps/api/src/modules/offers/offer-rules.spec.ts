import {
  type OfferTerms,
  discountFor,
  isAvailableOn,
  isExpired,
  periodKeyOf,
  weekdayBit,
} from './offer-rules.js';

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

const base: OfferTerms = {
  status: 'ACTIVE',
  discountType: 'PERCENT',
  discountValue: 10,
  maxDiscount: null,
  minOrderAmount: null,
  validFrom: day('2026-09-01'),
  validUntil: day('2026-10-31'),
  daysOfWeek: 127,
  limitPeriod: 'ONCE',
  totalLimit: null,
  redeemedCount: 0,
};

describe('offer rules', () => {
  it('maps weekdays Monday-first', () => {
    expect(weekdayBit(day('2026-09-28'))).toBe(1); // Monday
    expect(weekdayBit(day('2026-10-04'))).toBe(64); // Sunday
  });

  it('is available only when active, in date, on the day and not used up', () => {
    const monday = day('2026-09-28');
    expect(isAvailableOn(base, monday)).toBe(true);
    expect(isAvailableOn({ ...base, status: 'PAUSED' }, monday)).toBe(false);
    expect(isAvailableOn({ ...base, validFrom: day('2026-09-29') }, monday)).toBe(false);
    expect(isAvailableOn({ ...base, validUntil: day('2026-09-27') }, monday)).toBe(false);
    expect(isAvailableOn({ ...base, daysOfWeek: 0b1111110 }, monday)).toBe(false);
    expect(isAvailableOn({ ...base, totalLimit: 5, redeemedCount: 5 }, monday)).toBe(false);
    expect(isExpired(base, day('2026-11-01'))).toBe(true);
  });

  it('works out discounts on the server, with caps and minimums', () => {
    expect(discountFor(base, 455)).toBe(45);
    expect(discountFor({ ...base, maxDiscount: 30 }, 455)).toBe(30);
    expect(discountFor({ ...base, minOrderAmount: 500 }, 455)).toBe(0);
    expect(discountFor({ ...base, discountType: 'FLAT', discountValue: 50 }, 40)).toBe(40);
    expect(discountFor({ ...base, discountType: 'FREEBIE', discountValue: 0 }, 400)).toBe(0);
  });

  it('counts daily offers per India day and one-off offers once', () => {
    expect(periodKeyOf('DAILY', day('2026-09-28'))).toBe('2026-09-28');
    expect(periodKeyOf('ONCE', day('2026-09-28'))).toBe('ONCE');
  });
});
