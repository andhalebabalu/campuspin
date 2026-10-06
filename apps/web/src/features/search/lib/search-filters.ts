import type { PLACE_SORTS } from '@platform/contracts';
import { ROUTES } from '@/constants/routes';
import type { PlaceListParams } from '@/services/places.service';

export interface Applied {
  q: string;
  /** A leaf category slug, or '' for any category. */
  category: string;
  /** A college slug, or '' for any college. */
  college: string;
  minPrice: string;
  maxPrice: string;
  /** '' for any rating, otherwise a whole number of stars (1-5) as text. */
  minRating: string;
  sort: (typeof PLACE_SORTS)[number];
  verified: boolean;
  page: number;
}

/** Nothing to search for: no keyword and no filter narrows anything. */
export function hasFilters(
  applied: Pick<
    Applied,
    'q' | 'category' | 'college' | 'minPrice' | 'maxPrice' | 'minRating' | 'verified'
  >,
): boolean {
  return Boolean(
    applied.q ||
    applied.category ||
    applied.college ||
    applied.minPrice ||
    applied.maxPrice ||
    applied.minRating ||
    applied.verified,
  );
}

/** `relevance` only ever reaches the API alongside a query; otherwise it falls back to `name`. */
export function effectiveSort(applied: Pick<Applied, 'q' | 'sort'>): Applied['sort'] {
  return applied.q ? applied.sort : applied.sort === 'relevance' ? 'name' : applied.sort;
}

/** The `GET /places` params for a set of applied filters (the server page and the client share it). */
export function toPlaceListParams(applied: Applied): PlaceListParams {
  const params: PlaceListParams = { sort: effectiveSort(applied), page: applied.page };
  if (applied.q) params.q = applied.q;
  if (applied.category) params.categorySlug = applied.category;
  if (applied.college) params.collegeSlug = applied.college;
  if (applied.minPrice) params.minPrice = Number(applied.minPrice);
  if (applied.maxPrice) params.maxPrice = Number(applied.maxPrice);
  if (applied.minRating) params.minRating = Number(applied.minRating);
  if (applied.verified) params.verified = true;
  return params;
}

/**
 * The `/search` URL for a set of filters, leaving defaults out so links stay short. Used by the
 * search page to sync its URL and by every link *into* search (landing page, category tiles).
 */
export function searchHref(applied: Partial<Applied>): string {
  const search = new URLSearchParams();
  if (applied.q) search.set('q', applied.q);
  if (applied.category) search.set('category', applied.category);
  if (applied.college) search.set('college', applied.college);
  if (applied.minPrice) search.set('minPrice', applied.minPrice);
  if (applied.maxPrice) search.set('maxPrice', applied.maxPrice);
  if (applied.minRating) search.set('minRating', applied.minRating);
  if (applied.verified) search.set('verified', 'true');
  if (applied.sort && applied.sort !== 'relevance') search.set('sort', applied.sort);
  if (applied.page && applied.page !== 1) search.set('page', String(applied.page));
  const suffix = search.toString();
  return suffix ? `${ROUTES.search}?${suffix}` : ROUTES.search;
}
