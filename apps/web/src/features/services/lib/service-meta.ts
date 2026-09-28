import { MEAL_LABELS, MEAL_SLOTS, type Meals } from '@platform/contracts';
import type { IconName } from '@/components/ui/icon';

/** Service type icon keys (stored on the service type) to glyphs in the web icon set. */
const ICONS: Readonly<Record<string, IconName>> = {
  food: 'utensils',
  printer: 'printer',
  laundry: 'shirt',
  appointment: 'calendar',
  room: 'bed',
  study: 'book',
  repair: 'wrench',
  offer: 'tag',
  menu: 'utensils',
  bell: 'bell',
};

export const serviceIcon = (key: string | null): IconName => (key && ICONS[key]) || 'sparkles';

/** Soft background + ink for each quick action tile, cycling through the brand's secondary hues. */
export const TILE_TONES = [
  'bg-amber-50 text-amber-600',
  'bg-primary-50 text-primary-700',
  'bg-teal-50 text-teal-600',
  'bg-violet-50 text-violet-600',
  'bg-accent-50 text-accent-700',
  'bg-rose-50 text-rose-600',
] as const;

/** Only meals that have dishes, in order, as "Breakfast: Poha • Tea". */
export function mealLines(meals: Meals): Array<{ label: string; dishes: string }> {
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
  const india = new Date(now.getTime() + 330 * 60_000 + offset * 86_400_000);
  return india.toISOString().slice(0, 10);
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
