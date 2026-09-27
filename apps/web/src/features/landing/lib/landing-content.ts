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
    label: 'Printing & Xerox',
    blurb: 'Documents and more',
    icon: 'printer',
    tone: 'blue',
    slug: 'printing',
  },
  {
    label: 'Rentals',
    blurb: 'Bikes, cars and more',
    icon: 'bike',
    tone: 'green',
    slug: 'bike-rentals',
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
    blurb: 'Transport, reading rooms and more',
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
  { label: 'Gym', icon: 'dumbbell', tone: 'violet', slug: 'gyms' },
  { label: 'Medical', icon: 'medical', tone: 'rose', slug: 'medical' },
  { label: 'Printing', icon: 'printer', tone: 'blue', slug: 'printing' },
  { label: 'Rentals', icon: 'bike', tone: 'green', slug: 'bike-rentals' },
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
    title: 'Connect',
    body: 'View details, prices, hours and contact businesses directly.',
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

/** Community features on the roadmap. Shown with a "Coming soon" badge until they ship. */
export const COMMUNITY_FEATURES: Array<{ label: string; icon: IconName; tone: Tone }> = [
  { label: 'Student Marketplace', icon: 'cart', tone: 'green' },
  { label: 'Roommate Finder', icon: 'users', tone: 'blue' },
  { label: 'Campus Groups', icon: 'chats', tone: 'teal' },
  { label: 'Events', icon: 'calendar', tone: 'violet' },
  { label: 'Lost & Found', icon: 'pin', tone: 'rose' },
  { label: 'Student Discussions', icon: 'chat', tone: 'blue' },
];

/** Item kinds the marketplace will carry. No listings exist yet, so no prices are shown. */
export const MARKETPLACE_KINDS: Array<{ label: string; icon: IconName; tone: Tone }> = [
  { label: 'Books & notes', icon: 'book', tone: 'amber' },
  { label: 'Bicycles', icon: 'bike', tone: 'green' },
  { label: 'Calculators', icon: 'calculator', tone: 'blue' },
  { label: 'Laptops', icon: 'laptop', tone: 'violet' },
  { label: 'Hostel furniture', icon: 'bed', tone: 'rose' },
];

export const BUSINESS_BENEFITS = [
  'Get your place listed',
  'Reach nearby students',
  'Show prices, hours and amenities',
  'Get the verified badge',
  'Be found in campus search',
  'Build trust with students',
];

export const WHY_US: Array<{ title: string; body: string; icon: IconName; tone: Tone }> = [
  {
    title: 'Location-based discovery',
    body: 'Find what you need, sorted by distance from your campus.',
    icon: 'pin',
    tone: 'blue',
  },
  {
    title: 'Trusted listings',
    body: 'Verified businesses, reviewed by our team before they go live.',
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
