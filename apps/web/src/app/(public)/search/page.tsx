import type { Metadata } from 'next';
import { SearchPageClient } from '@/features/search/components/search-page-client';
import { effectiveSort, hasFilters, type Applied } from '@/features/search/lib/search-filters';
import { BRAND } from '@/constants/brand';
import { placesService, type PlaceListParams } from '@/services/places.service';

export const metadata: Metadata = {
  title: 'Search',
  description: `Search places across ${BRAND.name}.`,
  robots: { index: false, follow: true },
};

const SORTS: ReadonlyArray<Applied['sort']> = ['relevance', 'cheapest', 'newest', 'name'];

interface RawSearchParams {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  verified?: string;
  sort?: string;
  page?: string;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const applied: Applied = {
    q: raw.q?.trim() ?? '',
    minPrice: raw.minPrice?.trim() ?? '',
    maxPrice: raw.maxPrice?.trim() ?? '',
    verified: raw.verified === 'true',
    sort: SORTS.find((value) => value === raw.sort) ?? 'relevance',
    page: Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1),
  };

  const empty = { page: 1, limit: 20, total: 0, totalPages: 0 };

  let initialPlaces: Awaited<ReturnType<typeof placesService.list>>['data'] = [];
  let initialMeta = empty;

  if (hasFilters(applied)) {
    const params: PlaceListParams = { sort: effectiveSort(applied), page: applied.page };
    if (applied.q) params.q = applied.q;
    if (applied.minPrice) params.minPrice = Number(applied.minPrice);
    if (applied.maxPrice) params.maxPrice = Number(applied.maxPrice);
    if (applied.verified) params.verified = true;

    const result = await placesService.list(params);
    initialPlaces = result.data;
    initialMeta = result.meta ?? { ...empty, total: result.data.length, totalPages: 1 };
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink">Search</h1>
        <p className="text-body">Find rooms, PGs, messes, libraries and more.</p>
      </div>

      <SearchPageClient
        initialApplied={applied}
        initialPlaces={initialPlaces}
        initialMeta={initialMeta}
      />
    </main>
  );
}
