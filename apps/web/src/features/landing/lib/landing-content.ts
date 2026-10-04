import type { IconName } from '@/components/ui/icon';

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

export interface CategoryTile {
  label: string;
  blurb: string;
  icon: IconName;
  tone: Tone;
  /**
   * A leaf category slug from the reference seed. Places only link to leaf categories, so a group
   * slug (e.g. `accommodation`) would match nothing. `null` opens search with the category picker.
   */
  slug: string | null;
}

/** The twelve "Explore everything around you" tiles. */
export const CATEGORY_TILES: CategoryTile[] = [
  {
    label: 'Rooms & PG',
    blurb: 'Rooms and PGs near your campus',
    icon: 'bed',
    tone: 'blue',
    slug: 'rooms',
  },
  {
    label: 'Hostels',
    blurb: 'Safe and affordable hostels',
    icon: 'building',
    tone: 'blue',
    slug: 'hostels',
  },
  {
    label: 'Mess & Tiffin',
    blurb: 'Home-style meals, every day',
    icon: 'utensils',
    tone: 'amber',
    slug: 'mess',
  },
  {
    label: 'Libraries',
    blurb: 'Quiet spaces for better learning',
    icon: 'book',
    tone: 'teal',
    slug: 'libraries',
  },
  {
    label: 'Food & Cafes',
    blurb: 'Great food, great vibes',
    icon: 'coffee',
    tone: 'rose',
    slug: 'cafes',
  },
  {
    label: 'Gyms',
    blurb: 'Stay fit, stay healthy',
    icon: 'dumbbell',
    tone: 'violet',
    slug: 'gyms',
  },
  {
    label: 'Medical',
    blurb: 'Pharmacies and healthcare',
    icon: 'medical',
    tone: 'rose',
    slug: 'medical',
  },
  {
    label: 'Laundry',
    blurb: 'Clean clothes, less worries',
    icon: 'shirt',
    tone: 'blue',
    slug: 'laundry',
  },
  {
    label: 'Xerox & Printing',
    blurb: 'Copies, prints and binding',
    icon: 'printer',
    tone: 'blue',
    slug: 'xerox',
  },
  {
    label: 'Stationery',
    blurb: 'Books, files and drawing kits',
    icon: 'file',
    tone: 'green',
    slug: 'stationery',
  },
  {
    label: 'Grocery',
    blurb: 'Daily essentials nearby',
    icon: 'cart',
    tone: 'amber',
    slug: 'grocery',
  },
  {
    label: 'More Categories',
    blurb: 'Transport, CSC centres, rentals',
    icon: 'grid',
    tone: 'violet',
    slug: null,
  },
];

/** The quick-pick chips under the hero search. */
export const QUICK_CATEGORIES: Array<Pick<CategoryTile, 'label' | 'icon' | 'tone' | 'slug'>> = [
  { label: 'Rooms', icon: 'bed', tone: 'blue', slug: 'rooms' },
  { label: 'PG', icon: 'building', tone: 'violet', slug: 'pg' },
  { label: 'Mess', icon: 'utensils', tone: 'amber', slug: 'mess' },
  { label: 'Library', icon: 'book', tone: 'teal', slug: 'libraries' },
  { label: 'Xerox', icon: 'printer', tone: 'blue', slug: 'xerox' },
  { label: 'Stationery', icon: 'file', tone: 'green', slug: 'stationery' },
  { label: 'Medical', icon: 'medical', tone: 'rose', slug: 'medical' },
  { label: 'Food', icon: 'coffee', tone: 'rose', slug: 'restaurants' },
  { label: 'More', icon: 'more', tone: 'blue', slug: null },
];

export const HOW_IT_WORKS: Array<{ title: string; body: string; icon: IconName; tone: Tone }> = [
  {
    title: 'Select your campus',
    body: 'Choose your college and explore everything around it.',
    icon: 'pin',
    tone: 'green',
  },
  {
    title: 'Discover',
    body: 'Find places, services and businesses based on your needs.',
    icon: 'search',
    tone: 'blue',
  },
  {
    title: 'Order & connect',
    body: 'Order food, send prints, enquire or book, right from the listing.',
    icon: 'users',
    tone: 'violet',
  },
  {
    title: 'Experience',
    body: 'Visit, suggest missing places and grow your campus community.',
    icon: 'star',
    tone: 'amber',
  },
];

/** What the student community has today: the post categories of the community feed. */
export const COMMUNITY_FEATURES: Array<{
  label: string;
  hint: string;
  icon: IconName;
  tone: Tone;
}> = [
  { label: 'Discussions', hint: 'Ask your campus anything', icon: 'chat', tone: 'blue' },
  { label: 'Study & notes', hint: 'Share notes and doubts', icon: 'book', tone: 'teal' },
  { label: 'Events', hint: 'Fests, clubs and meet-ups', icon: 'calendar', tone: 'violet' },
  { label: 'Jobs & internships', hint: 'Openings near campus', icon: 'target', tone: 'amber' },
  { label: 'Lost & found', hint: 'Lost it? Found it? Post it', icon: 'pin', tone: 'rose' },
  { label: 'Announcements', hint: 'From your college community', icon: 'bell', tone: 'green' },
];

/** Marketplace categories students trade in most (a subset of the real listing categories). */
export const MARKETPLACE_KINDS: Array<{ label: string; icon: IconName; tone: Tone }> = [
  { label: 'Books & notes', icon: 'book', tone: 'amber' },
  { label: 'Cycles', icon: 'bike', tone: 'green' },
  { label: 'Electronics', icon: 'laptop', tone: 'violet' },
  { label: 'Hostel essentials', icon: 'bed', tone: 'rose' },
  { label: 'Stationery', icon: 'calculator', tone: 'blue' },
];

/** The everyday things a student can do on a listing, each a real flow in the app. */
export const DAILY_SERVICES: Array<{
  title: string;
  body: string;
  icon: IconName;
  tone: Tone;
  slug: string;
}> = [
  {
    title: 'Order from the mess',
    body: "See today's menu, order a meal or tiffin and pick it up when it is ready.",
    icon: 'utensils',
    tone: 'amber',
    slug: 'mess',
  },
  {
    title: 'Send a print',
    body: 'Upload a PDF to a xerox shop, choose copies and binding, collect it on the way.',
    icon: 'printer',
    tone: 'blue',
    slug: 'xerox',
  },
  {
    title: 'Order from your table',
    body: 'Scan the QR code on a restaurant table, order and call the waiter from your phone.',
    icon: 'qr',
    tone: 'rose',
    slug: 'restaurants',
  },
  {
    title: 'Enquire and book',
    body: 'Ask a PG about rent, book a library seat or a laundry pickup without a phone call.',
    icon: 'calendar',
    tone: 'violet',
    slug: 'pg',
  },
];

export const BUSINESS_BENEFITS = [
  'Your own business page and QR codes',
  'Take orders and table orders online',
  'Invoices and payment tracking built in',
  'Enquiries and bookings in one inbox',
  'Daily menu, offers and reviews',
  'Free to start, verified badge on approval',
];

export const WHY_US: Array<{ title: string; body: string; icon: IconName; tone: Tone }> = [
  {
    title: 'Location-based discovery',
    body: 'Find what you need, sorted by distance from your campus.',
    icon: 'pin',
    tone: 'blue',
  },
  {
    title: 'Honest listings',
    body: 'Verified businesses carry a badge; places from open map data are marked unverified.',
    icon: 'shield',
    tone: 'green',
  },
  {
    title: 'Student-friendly',
    body: 'Built for students, with prices in plain rupees per month, meal or hour.',
    icon: 'users',
    tone: 'violet',
  },
  {
    title: 'Community powered',
    body: 'Students suggest the places they know. Real people, real places.',
    icon: 'heart',
    tone: 'rose',
  },
];
