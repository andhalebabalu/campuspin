import { ApiClientError } from '@platform/api-client';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { BRAND } from '@/constants/brand';
import { CollegeDetailView } from '@/features/colleges/components/college-detail-view';
import { collegesService } from '@/services/colleges.service';
import { placesService } from '@/services/places.service';

interface PageParams {
  collegeSlug: string;
}

// Memoized per request: generateMetadata and the page component both need the same college, and
// both must call notFound() themselves — Next.js only turns the response into a real HTTP 404 when
// the not-found decision is made before the page shell is committed, which means generateMetadata
// has to know too, not just the page body.
const loadCollege = cache(async (collegeSlug: string) => {
  try {
    return await collegesService.getBySlug(collegeSlug);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { collegeSlug } = await params;
  const result = await loadCollege(collegeSlug);
  if (!result) notFound();

  return {
    title: result.data.name,
    description:
      result.data.description ??
      `Everything discovered around ${result.data.name} on ${BRAND.name}.`,
  };
}

export default async function CollegeDetailPage({ params }: { params: Promise<PageParams> }) {
  const { collegeSlug } = await params;
  const result = await loadCollege(collegeSlug);
  if (!result) notFound();

  const [places, nearby] = await Promise.all([
    placesService.list({ collegeSlug, sort: 'nearest' }),
    // A convenience for the amenity summary: the page still works if it fails.
    collegesService.nearby(collegeSlug).then(
      (response) => response.data.categories,
      () => [],
    ),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <CollegeDetailView
        college={result.data}
        nearby={nearby}
        initialPlaces={places.data}
        initialMeta={
          places.meta ?? { page: 1, limit: 20, total: places.data.length, totalPages: 1 }
        }
      />
    </main>
  );
}
