import type { CollegeCard, CollegeStatus, VerificationStatus } from '@platform/contracts';
import { distanceMeters } from '../../common/geo/haversine.js';

/**
 * The college directory's business rules, as pure functions with no database and no framework, so
 * every one of them is unit-tested directly. The services only fetch data, call these, and save.
 */

// ── Publishing state ─────────────────────────────────────────────────────────────────────────────

export type StatusPlan =
  { kind: 'change'; to: CollegeStatus } | { kind: 'noop' } | { kind: 'invalid'; message: string };

/**
 * DRAFT -> ACTIVE <-> INACTIVE. Activating an active college and deactivating an inactive one are
 * harmless no-ops (a retried request must not fail). A DRAFT was never published, so there is
 * nothing to deactivate. Colleges are never deleted: history and student links must survive.
 */
export function planStatusChange(
  action: 'activate' | 'deactivate',
  current: CollegeStatus,
): StatusPlan {
  if (action === 'activate') {
    return current === 'ACTIVE' ? { kind: 'noop' } : { kind: 'change', to: 'ACTIVE' };
  }
  if (current === 'INACTIVE') return { kind: 'noop' };
  if (current === 'DRAFT') {
    return {
      kind: 'invalid',
      message:
        'A draft college has never been published, so there is nothing to deactivate. ' +
        'Activate it, or leave it as a draft.',
    };
  }
  return { kind: 'change', to: 'INACTIVE' };
}

export type VerificationPlan = { kind: 'change'; to: VerificationStatus } | { kind: 'noop' };

/** `verify` -> VERIFIED, `unverify` -> back to PENDING. Repeating either is a no-op. */
export function planVerificationChange(
  action: 'verify' | 'unverify',
  current: VerificationStatus,
): VerificationPlan {
  const target: VerificationStatus = action === 'verify' ? 'VERIFIED' : 'PENDING';
  return current === target ? { kind: 'noop' } : { kind: 'change', to: target };
}

// ── Editing ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The names of the fields in `patch` whose value differs from `current`. A patch that changes
 * nothing produces no write and no audit row, which keeps repeated saves from cluttering the trail.
 */
export function diffFields<T extends object>(
  current: T,
  patch: Partial<T>,
): Array<keyof T & string> {
  return (Object.keys(patch) as Array<keyof T & string>).filter(
    (key) => patch[key] !== undefined && patch[key] !== current[key],
  );
}

/** Fields that decide which places belong to a college. Changing one means recomputing the links. */
export const PROXIMITY_FIELDS = ['latitude', 'longitude', 'serviceRadiusMeters'] as const;

export function affectsProximity(changed: readonly string[]): boolean {
  return changed.some((field) => (PROXIMITY_FIELDS as readonly string[]).includes(field));
}

// ── Public listing ───────────────────────────────────────────────────────────────────────────────

const byName = (a: CollegeCard, b: CollegeCard): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/**
 * Orders cards for the two sorts a database `ORDER BY` cannot express (distance from a point, and a
 * count of active places). Ties fall back to name then id, so a page never repeats or skips a row.
 * Cards without a distance sort last.
 */
export function sortCards(
  cards: readonly CollegeCard[],
  sort: 'nearest' | 'popular',
): CollegeCard[] {
  const compare =
    sort === 'nearest'
      ? (a: CollegeCard, b: CollegeCard) =>
          (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
            (b.distanceMeters ?? Number.POSITIVE_INFINITY) || byName(a, b)
      : (a: CollegeCard, b: CollegeCard) => b.placeCount - a.placeCount || byName(a, b);
  return [...cards].sort(compare);
}

/** Straight-line metres from a point, rounded the same way as the stored college-place distances. */
export function metersFrom(
  point: { latitude: number; longitude: number } | undefined,
  target: { latitude: number; longitude: number },
): number | null {
  return point ? Math.round(distanceMeters(point, target)) : null;
}

// ── College <-> place links ──────────────────────────────────────────────────────────────────────

export interface PlacePoint {
  id: string;
  latitude: number;
  longitude: number;
}

export type LinkMode = 'AUTO' | 'PINNED' | 'EXCLUDED';

export interface ExistingLink {
  placeId: string;
  mode: LinkMode;
  distanceMeters: number;
  /** Where the linked place is, so its distance can be refreshed even outside the search box. */
  latitude: number;
  longitude: number;
}

export interface LinkPlan {
  /** In range and not linked yet: new AUTO links. */
  create: Array<{ placeId: string; distanceMeters: number }>;
  /** AUTO links still in range whose distance changed: rewritten. */
  replaceAuto: Array<{ placeId: string; distanceMeters: number }>;
  /** PINNED / EXCLUDED links (staff decisions) whose distance changed: only the distance is updated. */
  refreshOverrides: Array<{ placeId: string; distanceMeters: number }>;
  /** AUTO links that left the radius. */
  remove: string[];
  unchanged: number;
}

/**
 * Decides how a college's row set in `college_places` must change. The rule is the seed's, exactly:
 * a place is linked when its rounded straight-line distance is within `serviceRadiusMeters`. Places
 * a staff member PINNED (force-included) or EXCLUDED (hidden) keep that decision however the
 * college moves; only their distance is kept fresh.
 */
export function planLinks(
  college: { latitude: number; longitude: number; serviceRadiusMeters: number },
  candidates: readonly PlacePoint[],
  existing: readonly ExistingLink[],
): LinkPlan {
  const plan: LinkPlan = {
    create: [],
    replaceAuto: [],
    refreshOverrides: [],
    remove: [],
    unchanged: 0,
  };
  const round = (place: { latitude: number; longitude: number }) =>
    Math.round(distanceMeters(college, place));

  const linked = new Set<string>();
  for (const link of existing) {
    linked.add(link.placeId);
    const meters = round(link);
    if (link.mode === 'AUTO') {
      if (meters > college.serviceRadiusMeters) plan.remove.push(link.placeId);
      else if (meters !== link.distanceMeters)
        plan.replaceAuto.push({ placeId: link.placeId, distanceMeters: meters });
      else plan.unchanged += 1;
    } else if (meters !== link.distanceMeters) {
      plan.refreshOverrides.push({ placeId: link.placeId, distanceMeters: meters });
    } else {
      plan.unchanged += 1;
    }
  }

  for (const place of candidates) {
    if (linked.has(place.id)) continue;
    const meters = round(place);
    if (meters <= college.serviceRadiusMeters)
      plan.create.push({ placeId: place.id, distanceMeters: meters });
  }
  return plan;
}
