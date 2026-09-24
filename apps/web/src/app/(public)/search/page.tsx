import { ApiClientError } from '@platform/api-client';
import type { Metadata } from 'next';
import { SearchPageClient } from '@/features/search/components/search-page-client';
import {
  hasFilters,
  toPlaceListParams,
  type Applied,
} from '@/features/search/lib/search-filters';
import { BRAND } from '@/constants/brand';
import { categoriesService } from '@/services/categories.service';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

export const metadata: Metadata = {
  title: 'Search',
  description: `Search places across ${BRAND.name}.`,
  robots: { index: false, follow: true },
};

const SORTS: ReadonlyArray<Applied['sort']> = ['relevance', 'rating', 'cheapest', 'newest', 'name'];
const MIN_RATINGS = ['1', '2', '3', '4', '5'];

interface RawSearchParams {
  q?: string;
  category?: string;
  college?: string;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
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
    category: raw.category?.trim().toLowerCase() ?? '',
    college: raw.college?.trim().toLowerCase() ?? '',
    minPrice: raw.minPrice?.trim() ?? '',
    maxPrice: raw.maxPrice?.trim() ?? '',
    minRating: MIN_RATINGS.find((value) => value === raw.minRating?.trim()) ?? '',
    verified: raw.verified === 'true',
    sort: SORTS.find((value) => value === raw.sort) ?? 'relevance',
    page: Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1),
  };

  const empty = { page: 1, limit: 20, total: 0, totalPages: 0 };

  // The pickers are a convenience: if either list fails to load, search still works without it.
  const [categoryGroups, colleges] = await Promise.all([
    categoriesService.list().then(
      (result) => result.data,
      () => [],
    ),
    collegesService.list({ sort: 'name', limit: 50 }).then(
      (result) => result.data,
      () => [],
    ),
  ]);

  let initialPlaces: Awaited<ReturnType<typeof placesService.list>>['data'] = [];
  let initialMeta = empty;
  let initialError: string | null = null;

  if (hasFilters(applied)) {
    try {
      const result = await placesService.list(toPlaceListParams(applied));
      initialPlaces = result.data;
      initialMeta = result.meta ?? { ...empty, total: result.data.length, totalPages: 1 };
    } catch (error) {
      // An unknown category or college slug (an old or hand-typed link) is a 404 from the API:
      // show it on the page instead of failing the whole route.
      if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
      initialError = error.message;
    }
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
        initialError={initialError}
        categoryGroups={categoryGroups}
        colleges={colleges}
      />
    </main>
  );
}
