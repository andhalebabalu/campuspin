import type { PLACE_SORTS } from '@platform/contracts';

export interface Applied {
  q: string;
  minPrice: string;
  maxPrice: string;
  sort: (typeof PLACE_SORTS)[number];
  verified: boolean;
  page: number;
}

/** Nothing to search for: no keyword and no filter narrows anything. */
export function hasFilters(
  applied: Pick<Applied, 'q' | 'minPrice' | 'maxPrice' | 'verified'>,
): boolean {
  return Boolean(applied.q || applied.minPrice || applied.maxPrice || applied.verified);
}

/** `relevance` only ever reaches the API alongside a query; otherwise it falls back to `name`. */
export function effectiveSort(applied: Pick<Applied, 'q' | 'sort'>): Applied['sort'] {
  return applied.q ? applied.sort : applied.sort === 'relevance' ? 'name' : applied.sort;
}
