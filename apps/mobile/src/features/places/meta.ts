import type { PriceUnit } from '@platform/contracts';
import type { IconName } from '@/components/ui';

/** Stock photos for a place category (see assets/images/categories/CREDITS.md), shown as "illustrative". */
const PHOTOS: Readonly<Record<string, number>> = {
  auto: require('@/assets/images/categories/auto.jpg'),
  bus: require('@/assets/images/categories/bus.jpg'),
  cafes: require('@/assets/images/categories/cafes.jpg'),
  grocery: require('@/assets/images/categories/grocery.jpg'),
  gyms: require('@/assets/images/categories/gyms.jpg'),
  hostels: require('@/assets/images/categories/hostels.jpg'),
  laundry: require('@/assets/images/categories/laundry.jpg'),
  libraries: require('@/assets/images/categories/libraries.jpg'),
  medical: require('@/assets/images/categories/medical.jpg'),
  mess: require('@/assets/images/categories/mess.jpg'),
  pg: require('@/assets/images/categories/pg.jpg'),
  reading: require('@/assets/images/categories/reading.jpg'),
  restaurants: require('@/assets/images/categories/restaurants.jpg'),
  stationery: require('@/assets/images/categories/stationery.jpg'),
  tiffin: require('@/assets/images/categories/tiffin.jpg'),
  xerox: require('@/assets/images/categories/xerox.jpg'),
};

const PHOTO_BY_CATEGORY: Readonly<Record<string, string>> = {
  hostels: 'hostels',
  pg: 'pg',
  rooms: 'pg',
  mess: 'mess',
  tiffin: 'tiffin',
  restaurants: 'restaurants',
  cafes: 'cafes',
  libraries: 'libraries',
  'reading-rooms': 'reading',
  xerox: 'xerox',
  printing: 'stationery',
  stationery: 'stationery',
  laundry: 'laundry',
  gyms: 'gyms',
  grocery: 'grocery',
  medical: 'medical',
  bus: 'bus',
  auto: 'auto',
};

export function categoryPhoto(categorySlug: string | null | undefined): number | undefined {
  const key = categorySlug ? PHOTO_BY_CATEGORY[categorySlug] : undefined;
  return key ? PHOTOS[key] : undefined;
}

/** Category and amenity icons come from the API as Lucide names; these are their Ionicons twins. */
const ICONS: Readonly<Record<string, IconName>> = {
  utensils: 'restaurant',
  'cooking-pot': 'restaurant',
  coffee: 'cafe',
  wifi: 'wifi',
  bus: 'bus',
  'shopping-basket': 'basket',
  'book-open': 'book',
  library: 'library',
  zap: 'flash',
  'washing-machine': 'water',
  store: 'storefront',
  'square-parking': 'car',
  sparkles: 'sparkles',
  snowflake: 'snow',
  smartphone: 'phone-portrait',
  shirt: 'shirt',
  'shield-check': 'shield-checkmark',
  refrigerator: 'cube',
  printer: 'print',
  pencil: 'pencil',
  landmark: 'business',
  copy: 'copy',
  plug: 'flash-outline',
  pill: 'medkit',
  lock: 'lock-closed',
  house: 'home',
  flame: 'flame',
  dumbbell: 'barbell',
  droplets: 'water',
  'credit-card': 'card',
  cctv: 'videocam',
  'car-taxi-front': 'car',
  car: 'car',
  bike: 'bicycle',
  'bed-double': 'bed',
  bath: 'water-outline',
  'arrow-up-down': 'swap-vertical',
};

export function iconFor(name: string | null | undefined, fallback: IconName = 'location'): IconName {
  return (name ? ICONS[name] : undefined) ?? fallback;
}

export const UNIT_LABELS: Record<PriceUnit, string> = {
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

/** "₹3,000 / month", a range, or "Price on request". */
export function formatPlacePrice(min: number | null, max: number | null, unit: PriceUnit | null): string {
  if (min === null || unit === null) return 'Price on request';
  const label = UNIT_LABELS[unit];
  if (max === null || max === min) return `${rupees(min)} / ${label}`;
  return `${rupees(min)}–${rupees(max)} / ${label}`;
}

/** "350 m" or "2.4 km". */
export function formatDistance(meters: number | null): string | null {
  if (meters === null) return null;
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}
