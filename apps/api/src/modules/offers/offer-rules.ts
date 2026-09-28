import type { DiscountType, LimitPeriod } from '@platform/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { dayKey } from '../analytics/activity-rules.js';
import { SERVICE_PLACE_WHERE } from '../services/service-rules.js';

export interface OfferTerms {
  status: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minOrderAmount: number | null;
  validFrom: Date;
  validUntil: Date | null;
  daysOfWeek: number;
  limitPeriod: LimitPeriod;
  totalLimit: number | null;
  redeemedCount: number;
}

/** Bit for a DATE value's weekday: Monday = 1 << 0 … Sunday = 1 << 6. */
export function weekdayBit(day: Date): number {
  const sundayFirst = day.getUTCDay();
  return 1 << ((sundayFirst + 6) % 7);
}

/** Usable on this India day: active, in date, on this weekday, and not used up. */
export function isAvailableOn(offer: OfferTerms, today: Date): boolean {
  return (
    offer.status === 'ACTIVE' &&
    offer.validFrom <= today &&
    (offer.validUntil === null || offer.validUntil >= today) &&
    (offer.daysOfWeek & weekdayBit(today)) !== 0 &&
    (offer.totalLimit === null || offer.redeemedCount < offer.totalLimit)
  );
}

/** Past its last day: shown to the owner as expired whatever the stored status. */
export const isExpired = (offer: Pick<OfferTerms, 'validUntil'>, today: Date): boolean =>
  offer.validUntil !== null && offer.validUntil < today;

/**
 * Rupees an offer takes off an order, worked out here only. Below the minimum order it takes off
 * nothing (the caller refuses it); a freebie is given in person, so it takes off nothing either.
 */
export function discountFor(offer: OfferTerms, subtotal: number): number {
  if (offer.minOrderAmount !== null && subtotal < offer.minOrderAmount) return 0;
  if (offer.discountType === 'PERCENT') {
    const raw = Math.floor((subtotal * offer.discountValue) / 100);
    return Math.min(raw, offer.maxDiscount ?? raw, subtotal);
  }
  if (offer.discountType === 'FLAT') return Math.min(offer.discountValue, subtotal);
  return 0;
}

/** The period a use counts against: the whole offer, or the India day for daily offers. */
export const periodKeyOf = (period: LimitPeriod, today: Date): string =>
  period === 'DAILY' ? dayKey(today) : 'ONCE';

/** Offers students may see: live place and business, active, in date. (Weekday and use limits are checked per offer.) */
export const visibleOfferWhere = (today: Date): Prisma.StudentOfferWhereInput => ({
  status: 'ACTIVE',
  validFrom: { lte: today },
  OR: [{ validUntil: null }, { validUntil: { gte: today } }],
  place: SERVICE_PLACE_WHERE,
});
