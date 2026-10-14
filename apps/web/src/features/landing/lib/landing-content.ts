import type { IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { searchHref } from '@/features/search/lib/search-filters';

/**
 * Icon-chip colour pairs. Written out as literal class strings (not built from the tone name) so
 * Tailwind's scanner sees every class.
 */
export const TONES = {
  blue: 'bg-primary-50 text-primary-600',
  green: 'bg-accent-50 text-accent-400',
  amber: 'bg-amber-50 text-amber-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  teal: 'bg-teal-50 text-teal-600',
} as const;
export type Tone = keyof typeof TONES;

interface Linked {
  label: string;
  icon: IconName;
  tone: Tone;
  href: string;
}

/**
 * The quick-pick chips under the hero search. `slug` is a leaf category from the reference seed
 * (places only link to leaf categories); `null` opens search with the category picker.
 */
export const QUICK_CATEGORIES: Array<Omit<Linked, 'href'> & { slug: string | null }> = [
  { label: 'Mess', icon: 'utensils', tone: 'blue', slug: 'mess' },
  { label: 'Rooms', icon: 'bed', tone: 'violet', slug: 'rooms' },
  { label: 'Hostel', icon: 'building', tone: 'blue', slug: 'hostels' },
  { label: 'Libraries', icon: 'book', tone: 'amber', slug: 'libraries' },
  { label: 'Xerox', icon: 'printer', tone: 'violet', slug: 'xerox' },
  { label: 'Food', icon: 'coffee', tone: 'rose', slug: 'restaurants' },
  { label: 'Transport', icon: 'bus', tone: 'blue', slug: 'auto' },
  { label: 'More', icon: 'more', tone: 'blue', slug: null },
];

/** "Your campus. One platform.": the four things CampusPin is. */
export const PLATFORM_FEATURES: Array<Linked & { body: string }> = [
  {
    label: 'Nearby Amenities',
    body: 'Find mess, rooms, hostel, libraries and more, with distance & location.',
    icon: 'pin',
    tone: 'green',
    href: ROUTES.search,
  },
  {
    label: 'Student Marketplace',
    body: 'Buy & sell notes, books and other essentials across colleges.',
    icon: 'tag',
    tone: 'violet',
    href: ROUTES.marketplace,
  },
  {
    label: 'Community Platform',
    body: 'Connect with students, share ideas, and grow together.',
    icon: 'chats',
    tone: 'amber',
    href: ROUTES.community,
  },
  {
    label: 'Business Growth',
    body: 'List your business, get more customers from campus community.',
    icon: 'store',
    tone: 'blue',
    href: ROUTES.registerBusiness,
  },
];

/** "Explore everything around you": the ten tiles, each a working search or page. */
export const EXPLORE_TILES: Array<Linked & { blurb: string }> = [
  {
    label: 'Order Food',
    blurb: 'From nearby cafés & mess',
    icon: 'utensils',
    tone: 'blue',
    href: searchHref({ category: 'mess' }),
  },
  {
    label: 'Print',
    blurb: 'Xerox, printing & scanning',
    icon: 'printer',
    tone: 'blue',
    href: searchHref({ category: 'xerox' }),
  },
  {
    label: 'Laundry',
    blurb: 'Clean clothes, happy you',
    icon: 'shirt',
    tone: 'green',
    href: searchHref({ category: 'laundry' }),
  },
  {
    label: 'Book Appointment',
    blurb: 'Haircut, doctor, services',
    icon: 'calendar',
    tone: 'rose',
    href: searchHref({ category: 'medical' }),
  },
  {
    label: 'Find Room',
    blurb: 'PG, rental & hostel',
    icon: 'bed',
    tone: 'violet',
    href: searchHref({ category: 'rooms' }),
  },
  {
    label: 'Study Space',
    blurb: 'Quiet places to study',
    icon: 'laptop',
    tone: 'violet',
    href: searchHref({ category: 'reading-rooms' }),
  },
  {
    label: 'Repair',
    blurb: 'Mobile, laptop & more',
    icon: 'wrench',
    tone: 'rose',
    href: searchHref({ q: 'repair' }),
  },
  {
    label: 'Offers',
    blurb: 'Exclusive deals & discounts',
    icon: 'receipt',
    tone: 'amber',
    href: ROUTES.offers,
  },
  {
    label: 'Notes & Books',
    blurb: 'Buy / Sell / Exchange',
    icon: 'book',
    tone: 'green',
    href: ROUTES.marketplace,
  },
  {
    label: 'Community',
    blurb: 'Connect with fellow students',
    icon: 'heart',
    tone: 'teal',
    href: ROUTES.community,
  },
];

/** The floating labels around the hero map: what a student finds near their gate. */
export const HERO_MAP_LABELS: Array<{
  label: string;
  distance: string;
  icon: IconName;
  tone: Tone;
  slug: string;
  /** Position over the map, in percent of the hero visual. */
  x: number;
  y: number;
}> = [
  { label: 'Mess', distance: '300 m', icon: 'utensils', tone: 'blue', slug: 'mess', x: 50, y: 20 },
  { label: 'Rooms', distance: '400 m', icon: 'bed', tone: 'green', slug: 'rooms', x: 79, y: 28 },
  {
    label: 'Library',
    distance: '400 m',
    icon: 'book',
    tone: 'blue',
    slug: 'libraries',
    x: 85,
    y: 50,
  },
  {
    label: 'Library',
    distance: '300 m',
    icon: 'book',
    tone: 'blue',
    slug: 'reading-rooms',
    x: 56,
    y: 84,
  },
  {
    label: 'Hostel',
    distance: '700 m',
    icon: 'building',
    tone: 'violet',
    slug: 'hostels',
    x: 76,
    y: 72,
  },
];

/**
 * Sample reviews in the shape real ones will take. Shown under a heading that says they are
 * examples: swap in real student quotes (with their permission) before calling them real.
 */
export const SAMPLE_TESTIMONIALS: Array<{ name: string; course: string; quote: string }> = [
  {
    name: 'Aditya Patil',
    course: 'S.Y. B.Tech',
    quote: 'CampusPin helped me find the best mess near my college. Super useful!',
  },
  {
    name: 'Sneha Kulkarni',
    course: 'F.Y. B.Sc',
    quote: 'I found a great room through CampusPin. It’s so easy to use!',
  },
  {
    name: 'Rahul Deshmukh',
    course: 'T.Y. B.Com',
    quote: 'The student marketplace is amazing, I sold my old books here.',
  },
  {
    name: 'Priya More',
    course: 'M.Sc',
    quote: 'All my daily needs are in one place. Love this app!',
  },
];
