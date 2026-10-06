import { MEAL_LABELS, MEAL_SLOTS, type Meals } from '@platform/contracts';
import type { IconName } from '@/components/ui';
import { tints, type Tint } from '@/theme/tokens';

/** Service type icon keys (stored on the service type) to Ionicons. */
const ICONS: Readonly<Record<string, IconName>> = {
  food: 'fast-food-outline',
  printer: 'print-outline',
  laundry: 'shirt-outline',
  appointment: 'calendar-outline',
  room: 'bed-outline',
  study: 'library-outline',
  repair: 'construct-outline',
  offer: 'pricetag-outline',
  menu: 'restaurant-outline',
  bell: 'notifications-outline',
};

export const serviceIcon = (key: string | null): IconName => (key && ICONS[key]) || 'sparkles-outline';

const TILE_TINTS: readonly Tint[] = ['amber', 'blue', 'teal', 'violet', 'green', 'rose'];
export const tileTint = (index: number) => tints[TILE_TINTS[index % TILE_TINTS.length] ?? 'blue'];

/** Only meals that have dishes, in order. */
export function mealLines(meals: Meals): { label: string; dishes: string }[] {
  return MEAL_SLOTS.filter((meal) => meals[meal].length > 0).map((meal) => ({
    label: MEAL_LABELS[meal],
    dishes: meals[meal].join(' • '),
  }));
}

/** "300 m" or "1.4 km". */
export function distanceLabel(meters: number | null): string | null {
  if (meters === null) return null;
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** The India calendar date as `YYYY-MM-DD`, `offset` days from today. */
export function indiaDate(offset = 0, now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** "Mon, 28 Sep" for a `YYYY-MM-DD` date. */
export function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
