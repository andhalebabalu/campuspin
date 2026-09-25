import type {
  CollegeCard,
  CollegeManagement,
  CollegeNearbyCategory,
  CollegeStatus,
  CollegeStream,
  VerificationStatus,
} from '@platform/contracts';
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

export { diffFields } from '../../common/utils/diff-fields.js';

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

// ── What is around a college ─────────────────────────────────────────────────────────────────────

export interface NearbyLink {
  distanceMeters: number;
  place: {
    slug: string;
    name: string;
    category: { slug: string; name: string; icon: string | null; parentSlug: string | null } | null;
  };
}

/**
 * Groups a college's place links by the place's primary category: how many, the nearest and the
 * farthest, nearest category first (ties by name). A place with no primary category is skipped.
 */
export function summarizeNearby(links: readonly NearbyLink[]): CollegeNearbyCategory[] {
  const groups = new Map<string, CollegeNearbyCategory>();
  for (const link of [...links].sort((a, b) => a.distanceMeters - b.distanceMeters)) {
    const category = link.place.category;
    if (!category) continue;
    const existing = groups.get(category.slug);
    if (existing) {
      existing.count += 1;
      existing.farthestMeters = Math.max(existing.farthestMeters, link.distanceMeters);
      continue;
    }
    groups.set(category.slug, {
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      groupSlug: category.parentSlug,
      count: 1,
      nearestMeters: link.distanceMeters,
      farthestMeters: link.distanceMeters,
      nearest: { slug: link.place.slug, name: link.place.name },
    });
  }
  return [...groups.values()].sort(
    (a, b) => a.nearestMeters - b.nearestMeters || a.name.localeCompare(b.name),
  );
}

// ── Streams and management (derived: there are no such columns) ─────────────────────────────────

export interface CollegeProfile {
  streams: CollegeStream[];
  management: CollegeManagement | null;
  courses: string | null;
}

const STREAM_RULES: ReadonlyArray<[CollegeStream, RegExp]> = [
  ['pharmacy', /pharmac|\bpharm\b|d\.? ?pharm|b\.? ?pharm/],
  [
    'engineering',
    /engineering|polytechnic|\bb\.? ?tech\b|technical campus|institute of technology/,
  ],
  ['law', /\blaw\b/],
  ['education', /education|b\.? ?ed\b|shikshan ?shastra|d\.? ?el\.? ?ed|physical education/],
  ['computer', /computer|\bbca\b|information technology/],
  ['management', /management|hotel|hospitality|catering|\bbba\b|\bbms\b|\bmba\b|business/],
  [
    'arts-science-commerce',
    /\barts?\b|science|commerce|\bcom\b|\bsci\b|mahavidyala|senior college|home science/,
  ],
];

/**
 * A college's streams, how it is run and its listed courses, from its name and the facts the data
 * import writes into the description ("Courses: ...", "Type: Aided."). A staff-written description
 * without those lines still yields streams from the name; nothing matching at all is "other".
 */
export function collegeProfile(name: string, description: string | null): CollegeProfile {
  const text = (description ?? '').split('\n');
  const courses =
    text.map((line) => /^Courses: (.+?)\.?$/.exec(line.trim())?.[1]).find(Boolean) ?? null;
  const type = text.map((line) => /^Type: (.+?)\.?$/.exec(line.trim())?.[1]).find(Boolean) ?? null;

  const haystack = `${name} ${courses ?? ''}`.toLowerCase();
  const streams = STREAM_RULES.filter(([, pattern]) => pattern.test(haystack)).map(
    ([stream]) => stream,
  );
  // "Institute of Hotel Management And Catering Technology" is a hotel school, not engineering.
  const hotelOnly =
    /hotel|catering|hospitality/.test(haystack) && !/engineering|polytechnic/.test(haystack);
  const cleaned = hotelOnly ? streams.filter((stream) => stream !== 'engineering') : streams;

  const kind = type?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  const management: CollegeManagement | null = kind.startsWith('government')
    ? 'government'
    : kind === 'aided' || kind === 'granted'
      ? 'aided'
      : kind.includes('unaided') || kind.includes('nonaided')
        ? 'unaided'
        : null;

  return { streams: cleaned.length > 0 ? cleaned : ['other'], management, courses };
}
