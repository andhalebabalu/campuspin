import type { PriceUnit } from '@platform/contracts';

const UNIT_LABELS: Record<PriceUnit, string> = {
  ONE_TIME: 'one-time',
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  SEMESTER: 'semester',
  YEAR: 'year',
  MEAL: 'meal',
  PAGE: 'page',
  KG: 'kg',
  TRIP: 'trip',
};

const rupees = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

/** "from ₹3,000 / month", a range, or "Price on request" when nothing is known yet. */
export function formatPrice(
  priceMin: number | null,
  priceMax: number | null,
  priceUnit: PriceUnit | null,
): string {
  if (priceMin === null || priceUnit === null) return 'Price on request';
  const unit = UNIT_LABELS[priceUnit];
  if (priceMax === null || priceMax === priceMin) return `${rupees(priceMin)} / ${unit}`;
  return `${rupees(priceMin)}–${rupees(priceMax)} / ${unit}`;
}
