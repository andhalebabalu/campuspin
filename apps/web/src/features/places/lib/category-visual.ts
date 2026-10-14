import type { IconName } from '@/components/ui/icon';

/**
 * Icon-chip colour pairs. Written out as literal class strings (not built from the tone name) so
 * Tailwind's scanner sees every class.
 */
export const CATEGORY_TONES = {
  blue: 'bg-primary-50 text-primary-600',
  green: 'bg-accent-50 text-accent-400',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  teal: 'bg-teal-50 text-teal-600',
} as const;
export type CategoryTone = keyof typeof CATEGORY_TONES;

const VISUALS: Readonly<Record<string, { icon: IconName; tone: CategoryTone }>> = {
  accommodation: { icon: 'building', tone: 'blue' },
  rooms: { icon: 'bed', tone: 'violet' },
  pg: { icon: 'bed', tone: 'violet' },
  hostels: { icon: 'building', tone: 'blue' },
  food: { icon: 'utensils', tone: 'amber' },
  mess: { icon: 'utensils', tone: 'amber' },
  tiffin: { icon: 'utensils', tone: 'amber' },
  restaurants: { icon: 'utensils', tone: 'rose' },
  cafes: { icon: 'coffee', tone: 'rose' },
  study: { icon: 'book', tone: 'teal' },
  libraries: { icon: 'book', tone: 'teal' },
  'reading-rooms': { icon: 'book', tone: 'teal' },
  xerox: { icon: 'printer', tone: 'violet' },
  printing: { icon: 'printer', tone: 'violet' },
  stationery: { icon: 'file', tone: 'green' },
  'daily-needs': { icon: 'wrench', tone: 'blue' },
  laundry: { icon: 'shirt', tone: 'blue' },
  gyms: { icon: 'dumbbell', tone: 'rose' },
  grocery: { icon: 'cart', tone: 'amber' },
  medical: { icon: 'medical', tone: 'rose' },
  csc: { icon: 'globe', tone: 'teal' },
  transport: { icon: 'bus', tone: 'blue' },
  'bike-rentals': { icon: 'bike', tone: 'green' },
  'car-rentals': { icon: 'auto', tone: 'blue' },
  auto: { icon: 'auto', tone: 'amber' },
  bus: { icon: 'bus', tone: 'blue' },
};

/** The icon and colour a category is drawn with across the site. */
export function categoryVisual(slug: string | null | undefined): {
  icon: IconName;
  tone: CategoryTone;
} {
  return (slug && VISUALS[slug]) || { icon: 'pin', tone: 'blue' };
}
