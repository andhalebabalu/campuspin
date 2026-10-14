import { ApiClientError } from '@platform/api-client';
import type { Metadata } from 'next';
import { SearchPageClient } from '@/features/search/components/search-page-client';
import { SearchHero } from '@/features/search/components/search-hero';
import { toPlaceListParams, type Applied } from '@/features/search/lib/search-filters';
import { BRAND } from '@/constants/brand';
import { categoriesService } from '@/services/categories.service';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

export const metadata: Metadata = {
  title: 'Discover places',
  description: `Find rooms, PGs, messes, libraries, gyms, cafes and services around your college on ${BRAND.name}.`,
  robots: { index: false, follow: true },
};

const SORTS: ReadonlyArray<Applied['sort']> = [
  'relevance',
  'nearest',
  'rating',
  'cheapest',
  'newest',
  'name',
];
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
  const [categoryGroups, colleges, selectedCollege] = await Promise.all([
    categoriesService.list().then(
      (result) => result.data,
      () => [],
    ),
    // Suggestions before typing; the box itself searches every college.
    collegesService.list({ sort: 'popular', limit: 8 }).then(
      (result) => result.data,
      () => [],
    ),
    applied.college
      ? collegesService.getBySlug(applied.college).then(
          (result) => result.data,
          () => null,
        )
      : null,
  ]);

  let initialPlaces: Awaited<ReturnType<typeof placesService.list>>['data'] = [];
  let initialMeta = empty;
  let initialError: string | null = null;

  // Always a first page: with no filters it is simply the top places.
  {
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
    <main className="flex-1 pb-16">
      <SearchHero
        area={selectedCollege ? { name: selectedCollege.name, city: selectedCollege.city } : null}
      />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <SearchPageClient
          initialApplied={applied}
          initialPlaces={initialPlaces}
          initialMeta={initialMeta}
          initialError={initialError}
          categoryGroups={categoryGroups}
          colleges={colleges}
          selectedCollege={selectedCollege}
        />
      </div>
    </main>
  );
}
