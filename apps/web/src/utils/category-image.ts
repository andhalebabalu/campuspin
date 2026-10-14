/**
 * A stock photo for a place category (see `public/images/CREDITS.md`), for a place with no photo of
 * its own. Always shown with an "illustrative" label: it is not a photo of that place.
 */
const IMAGE_BY_CATEGORY: Readonly<Record<string, string>> = {
  hostels: 'hostels',
  pg: 'pg',
  rooms: 'pg',
  mess: 'mess',
  tiffin: 'tiffin',
  restaurants: 'restaurants',
  cafes: 'cafes',
  libraries: 'libraries',
  'reading-rooms': 'reading',
  xerox: 'xerox',
  printing: 'stationery',
  stationery: 'stationery',
  laundry: 'laundry',
  gyms: 'gyms',
  grocery: 'grocery',
  medical: 'medical',
  bus: 'bus',
  auto: 'auto',
};

/** Extra photos for the most common kinds, so a page of restaurants is not one picture repeated. */
const VARIANTS: Readonly<Record<string, number>> = { restaurants: 4, medical: 4, cafes: 4 };

/**
 * `seed` (a place id) picks one of a category's photos, the same one every time for that place.
 */
export function categoryImage(categorySlug: string | null | undefined, seed = ''): string | null {
  const file = categorySlug ? IMAGE_BY_CATEGORY[categorySlug] : undefined;
  if (!file) return null;
  const count = VARIANTS[file] ?? 1;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const variant = hash % count;
  return `/images/amenities/${file}${variant === 0 ? '' : `-${variant + 1}`}.jpg`;
}
