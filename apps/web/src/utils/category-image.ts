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

export function categoryImage(categorySlug: string | null | undefined): string | null {
  const file = categorySlug ? IMAGE_BY_CATEGORY[categorySlug] : undefined;
  return file ? `/images/amenities/${file}.jpg` : null;
}
