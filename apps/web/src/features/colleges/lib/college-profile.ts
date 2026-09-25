import type { CollegeDetail, CollegeNearbyCategory } from '@platform/contracts';
import type { IconName } from '@/components/ui/icon';

/**
 * Everything the college page derives from what the API returns: facts written into the
 * description by the data import, the college's own photo (if it has one), and
 * the student amenities around it grouped the way students think about them.
 */

// ── Facts ────────────────────────────────────────────────────────────────────────────────────────

export interface CollegeFacts {
  courses: string | null;
  university: string | null;
  kind: string | null;
  source: string | null;
  sourceUrl: string | null;
  locationApproximate: boolean;
  locationNote: string | null;
  /** Description lines that are not one of the facts above (free text staff wrote). */
  about: string[];
}

/**
 * The import writes one fact per line ("Affiliated to X.", "Type: Aided.", "Courses: ...",
 * "Listed from the official ... (url)."). Staff-written descriptions have none of these prefixes,
 * so they come through untouched as `about`.
 */
export function collegeFacts(description: string | null): CollegeFacts {
  const facts: CollegeFacts = {
    courses: null,
    university: null,
    kind: null,
    source: null,
    sourceUrl: null,
    locationApproximate: false,
    locationNote: null,
    about: [],
  };
  for (const raw of (description ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let match: RegExpExecArray | null;
    if ((match = /^Courses: (.+?)\.?$/.exec(line))) facts.courses = match[1] ?? null;
    else if ((match = /^Affiliated to (.+?)\.?$/.exec(line))) facts.university = match[1] ?? null;
    else if ((match = /^Type: (.+?)\.?$/.exec(line))) facts.kind = match[1] ?? null;
    else if ((match = /^Listed from the official (.+) \((https?:\/\/[^)]+)\)\.?$/.exec(line))) {
      facts.source = match[1] ?? null;
      facts.sourceUrl = match[2] ?? null;
    } else if ((match = /^Map location is APPROXIMATE \((.+?)\)/.exec(line))) {
      facts.locationApproximate = true;
      facts.locationNote = match[1] ?? null;
    } else if (
      /^Map location from OpenStreetMap\.?$|^Not yet verified by CampusPin staff\.?$/.test(line)
    ) {
      continue;
    } else facts.about.push(line);
  }
  return facts;
}

/** "Non-Aided" / "Un-Aided" / "Aided" / "Government" as a short badge label. */
export function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  const k = kind.toLowerCase().replace(/[^a-z]/g, '');
  if (k.startsWith('government')) return 'Government';
  if (k === 'aided' || k === 'granted') return 'Government aided';
  if (k.includes('unaided') || k.includes('nonaided')) return 'Private (unaided)';
  return kind;
}

// ── Photos ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The college's own cover or first photo, or null. Never a stand-in photo of some other campus:
 * without a real photo the page shows `CollegePlaceholder`, which says plainly that none exists yet.
 */
export function collegePhoto(college: {
  coverImageUrl: string | null;
  images?: CollegeDetail['images'];
}): string | null {
  return college.coverImageUrl ?? college.images?.[0]?.imageUrl ?? null;
}

// ── Student amenities ────────────────────────────────────────────────────────────────────────────

export interface AmenityGroup {
  key: string;
  label: string;
  hint: string;
  icon: IconName;
  /** Tailwind classes for the round icon badge. */
  tone: string;
  image: string;
  categories: readonly string[];
}

/** In the order a student looks for them: where to live, eat and study first. */
export const AMENITY_GROUPS: readonly AmenityGroup[] = [
  {
    key: 'stay',
    label: 'Hostel / PG',
    hint: 'Hostels, PGs and rooms',
    icon: 'bed',
    tone: 'bg-violet-50 text-violet-600',
    image: '/images/amenities/hostels.jpg',
    categories: ['hostels', 'pg', 'rooms'],
  },
  {
    key: 'mess',
    label: 'Mess / Tiffin',
    hint: 'Messes and tiffin services',
    icon: 'utensils',
    tone: 'bg-amber-50 text-amber-600',
    image: '/images/amenities/mess.jpg',
    categories: ['mess', 'tiffin'],
  },
  {
    key: 'study',
    label: 'Library / Reading room',
    hint: 'Public and private libraries',
    icon: 'book',
    tone: 'bg-primary-50 text-primary-600',
    image: '/images/amenities/libraries.jpg',
    categories: ['libraries', 'reading-rooms'],
  },
  {
    key: 'food',
    label: 'Restaurant / Cafe',
    hint: 'Restaurants, hotels and cafes',
    icon: 'coffee',
    tone: 'bg-rose-50 text-rose-600',
    image: '/images/amenities/restaurants.jpg',
    categories: ['restaurants', 'cafes'],
  },
  {
    key: 'bus',
    label: 'Bus stop / stand',
    hint: 'ST and city bus stops',
    icon: 'bus',
    tone: 'bg-teal-50 text-teal-600',
    image: '/images/amenities/bus.jpg',
    categories: ['bus'],
  },
  {
    key: 'auto',
    label: 'Auto rickshaw',
    hint: 'Auto and rickshaw stands',
    icon: 'auto',
    tone: 'bg-amber-50 text-amber-600',
    image: '/images/amenities/auto.jpg',
    categories: ['auto', 'bike-rentals', 'car-rentals'],
  },
  {
    key: 'print',
    label: 'Xerox / Printing',
    hint: 'Xerox, printing and stationery',
    icon: 'printer',
    tone: 'bg-success-50 text-success-700',
    image: '/images/amenities/xerox.jpg',
    categories: ['xerox', 'printing'],
  },
  {
    key: 'grocery',
    label: 'Grocery',
    hint: 'General stores and supermarkets',
    icon: 'cart',
    tone: 'bg-accent-50 text-accent-700',
    image: '/images/amenities/grocery.jpg',
    categories: ['grocery'],
  },
  {
    key: 'medical',
    label: 'Medical',
    hint: 'Medical stores, clinics, hospitals',
    icon: 'medical',
    tone: 'bg-danger-50 text-danger-600',
    image: '/images/amenities/medical.jpg',
    categories: ['medical'],
  },
  {
    key: 'gym',
    label: 'Gym',
    hint: 'Gyms and fitness centres',
    icon: 'dumbbell',
    tone: 'bg-violet-50 text-violet-600',
    image: '/images/amenities/gyms.jpg',
    categories: ['gyms'],
  },
  {
    key: 'laundry',
    label: 'Laundry',
    hint: 'Laundry and dry cleaning',
    icon: 'shirt',
    tone: 'bg-teal-50 text-teal-600',
    image: '/images/amenities/laundry.jpg',
    categories: ['laundry'],
  },
];

export interface AmenitySummary extends AmenityGroup {
  count: number;
  nearestMeters: number | null;
  farthestMeters: number | null;
  /** The category to filter the place list by when this amenity is chosen. */
  filterSlug: string | null;
}

export function summarizeAmenities(nearby: readonly CollegeNearbyCategory[]): AmenitySummary[] {
  return AMENITY_GROUPS.map((group) => {
    const hits = nearby.filter((category) => group.categories.includes(category.slug));
    const nearest = hits.reduce<CollegeNearbyCategory | null>(
      (best, hit) => (!best || hit.nearestMeters < best.nearestMeters ? hit : best),
      null,
    );
    return {
      ...group,
      count: hits.reduce((sum, hit) => sum + hit.count, 0),
      nearestMeters: nearest?.nearestMeters ?? null,
      farthestMeters: hits.length ? Math.max(...hits.map((hit) => hit.farthestMeters)) : null,
      filterSlug: nearest?.slug ?? null,
    };
  });
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function distanceRange(nearest: number, farthest: number): string {
  if (farthest - nearest < 50) return formatDistance(nearest);
  const km = farthest >= 1000;
  const a = km ? (nearest / 1000).toFixed(1) : String(Math.round(nearest / 10) * 10);
  const b = km ? (farthest / 1000).toFixed(1) : String(Math.round(farthest / 10) * 10);
  return `${a} – ${b} ${km ? 'km' : 'm'}`;
}
