import type { PlaceCard, PlaceStatus, PriceUnit } from '@platform/contracts';
import { distanceMeters } from '../../common/geo/haversine.js';

/**
 * The place directory's business rules, as pure functions with no database and no framework, so
 * every one of them is unit-tested directly. The services only fetch data, call these, and save.
 */

// ── Publishing state ─────────────────────────────────────────────────────────────────────────────

export type StatusPlan =
  { kind: 'change'; to: PlaceStatus } | { kind: 'noop' } | { kind: 'invalid'; message: string };

/**
 * This phase only ever puts a place in DRAFT, ACTIVE or INACTIVE (PENDING and REJECTED belong to
 * the student-submission moderation workflow, a later phase). `activate` publishes from any
 * not-yet-ACTIVE status, so a place stuck in PENDING or REJECTED before that phase exists can still
 * be approved by hand. Activating an already-active place and deactivating an already-inactive one
 * are harmless no-ops. A place that was never published (DRAFT, PENDING or REJECTED) has nothing to
 * deactivate. Places are never deleted: history and reviews must survive.
 */
export function planStatusChange(
  action: 'activate' | 'deactivate',
  current: PlaceStatus,
): StatusPlan {
  if (action === 'activate') {
    return current === 'ACTIVE' ? { kind: 'noop' } : { kind: 'change', to: 'ACTIVE' };
  }
  if (current === 'INACTIVE') return { kind: 'noop' };
  if (current !== 'ACTIVE') {
    return {
      kind: 'invalid',
      message:
        'This place has never been published, so there is nothing to deactivate. Activate it, or leave it as is.',
    };
  }
  return { kind: 'change', to: 'INACTIVE' };
}

// ── Editing ──────────────────────────────────────────────────────────────────────────────────────

export { diffFields } from '../../common/utils/diff-fields.js';

/** Fields that decide which colleges a place shows up under. Changing one means recomputing links. */
export const PROXIMITY_FIELDS = ['latitude', 'longitude'] as const;

export function affectsProximity(changed: readonly string[]): boolean {
  return changed.some((field) => (PROXIMITY_FIELDS as readonly string[]).includes(field));
}

// ── Prices ───────────────────────────────────────────────────────────────────────────────────────

export interface PriceSummary {
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: PriceUnit | null;
}

/**
 * The denormalised `priceMin`/`priceMax`/`priceUnit` on a place, kept in sync whenever its price
 * options change so "cheapest first" is a plain read instead of joining and aggregating on every
 * list request. Only options in ONE unit are compared ("like with like"): the category's own
 * `defaultPriceUnit` when at least one option uses it, otherwise the first option's unit. The exact
 * rule the seed uses for demo data.
 */
export function summarizePrices(
  prices: ReadonlyArray<{ amount: number; unit: PriceUnit }>,
  categoryDefaultUnit: PriceUnit | null,
): PriceSummary {
  const unit =
    prices.find((price) => price.unit === categoryDefaultUnit)?.unit ?? prices[0]?.unit ?? null;
  if (unit === null) return { priceMin: null, priceMax: null, priceUnit: null };
  const amounts = prices.filter((price) => price.unit === unit).map((price) => price.amount);
  return { priceMin: Math.min(...amounts), priceMax: Math.max(...amounts), priceUnit: unit };
}

// ── Public listing ───────────────────────────────────────────────────────────────────────────────

const byName = (a: PlaceCard, b: PlaceCard): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** A place with no price in the comparison unit sorts last, never first (never "cheapest: free"). */
const priceRank = (card: PlaceCard): number => card.priceMin ?? Number.POSITIVE_INFINITY;

/**
 * Orders cards for the two sorts a database `ORDER BY` cannot portably express (distance from a
 * point, and comparing prices across rows that may be null). Ties fall back to name then id, so a
 * page never repeats or skips a row.
 */
export function sortCards(cards: readonly PlaceCard[], sort: 'nearest' | 'cheapest'): PlaceCard[] {
  const compare =
    sort === 'nearest'
      ? (a: PlaceCard, b: PlaceCard) =>
          (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
            (b.distanceMeters ?? Number.POSITIVE_INFINITY) || byName(a, b)
      : (a: PlaceCard, b: PlaceCard) => priceRank(a) - priceRank(b) || byName(a, b);
  return [...cards].sort(compare);
}

/** Straight-line metres from a point, rounded the same way as the stored college-place distances. */
export function metersFrom(
  point: { latitude: number; longitude: number } | undefined,
  target: { latitude: number; longitude: number },
): number | null {
  return point ? Math.round(distanceMeters(point, target)) : null;
}
