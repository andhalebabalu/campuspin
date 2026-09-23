import { looksLikeUuid } from '@platform/contracts';
import type { Prisma } from '../../generated/prisma/client.js';

const CATEGORIES_SELECT = {
  select: {
    isPrimary: true,
    category: { select: { id: true, slug: true, name: true, icon: true } },
  },
  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
} satisfies Prisma.Place$categoriesArgs;

const AMENITIES_SELECT = {
  select: { amenity: { select: { id: true, key: true, name: true, icon: true } } },
  orderBy: { amenity: { sortOrder: 'asc' } },
} satisfies Prisma.Place$amenitiesArgs;

const HOURS_SELECT = {
  select: {
    id: true,
    dayOfWeek: true,
    openTime: true,
    closeTime: true,
    isClosed: true,
    is24Hours: true,
    slotLabel: true,
    sortOrder: true,
  },
  orderBy: [{ dayOfWeek: 'asc' }, { sortOrder: 'asc' }],
} satisfies Prisma.Place$hoursArgs;

const PRICE_OPTIONS_SELECT = {
  select: { id: true, label: true, amount: true, unit: true, note: true, sortOrder: true },
  orderBy: { sortOrder: 'asc' },
} satisfies Prisma.Place$priceOptionsArgs;

const IMAGES_SELECT = {
  select: { id: true, imageUrl: true, altText: true, isCover: true, sortOrder: true },
  orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
} satisfies Prisma.Place$imagesArgs;

/** What a public card needs. Nothing staff-only is ever selected for a public response. */
export const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  city: true,
  state: true,
  verificationStatus: true,
  ratingAverage: true,
  ratingCount: true,
  priceMin: true,
  priceMax: true,
  priceUnit: true,
  categories: CATEGORIES_SELECT,
  images: IMAGES_SELECT,
} satisfies Prisma.PlaceSelect;

export const DETAIL_SELECT = {
  ...CARD_SELECT,
  description: true,
  address: true,
  country: true,
  phone: true,
  email: true,
  website: true,
  googleMapsUrl: true,
  latitude: true,
  longitude: true,
  amenities: AMENITIES_SELECT,
  hours: HOURS_SELECT,
  priceOptions: PRICE_OPTIONS_SELECT,
} satisfies Prisma.PlaceSelect;

export const ADMIN_SELECT = {
  ...DETAIL_SELECT,
  status: true,
  lastVerifiedAt: true,
  isDemo: true,
  createdById: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PlaceSelect;

/** Explicitly typed and mutable: a Prisma `orderBy` array must never be an `as const` tuple. */
export const CARD_ORDER_BY: Prisma.PlaceOrderByWithRelationInput[] = [
  { name: 'asc' },
  { id: 'asc' },
];
export const NEWEST_ORDER_BY: Prisma.PlaceOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];
export const ADMIN_ORDER_BY: Record<
  'name' | 'newest' | 'updated',
  Prisma.PlaceOrderByWithRelationInput[]
> = {
  name: CARD_ORDER_BY,
  newest: NEWEST_ORDER_BY,
  updated: [{ updatedAt: 'desc' }, { id: 'desc' }],
};

/**
 * Makes a percent sign, an underscore and a backslash in user text match themselves. Prisma's
 * `contains` builds a `LIKE` pattern and does not escape these, so without this a search for `%`
 * would match every row and `_` any single character. MySQL and MariaDB use the backslash as the
 * default `LIKE` escape character.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** `q` matches the name or address as plain text; `city` is an exact match. */
export function searchFilter(filter: {
  q?: string | undefined;
  city?: string | undefined;
}): Prisma.PlaceWhereInput {
  const term = filter.q?.trim();
  const like = term ? escapeLike(term) : undefined;
  const city = filter.city?.trim();
  return {
    ...(like ? { OR: [{ name: { contains: like } }, { address: { contains: like } }] } : {}),
    ...(city ? { city: { equals: city } } : {}),
  };
}

/** A UUID-shaped value is an id; anything else is a slug. (A slug can never look like an id.) */
export function idOrSlugFilter(value: string): { id: string } | { slug: string } {
  const trimmed = value.trim();
  return looksLikeUuid(trimmed) ? { id: trimmed.toLowerCase() } : { slug: trimmed.toLowerCase() };
}
