import { ApiClientError } from '@platform/api-client';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PlaceDetailView } from '@/features/places/components/place-detail-view';
import { placesService } from '@/services/places.service';

interface PageParams {
  placeSlug: string;
}

// Memoized per request: generateMetadata and the page component both need the same place, and both
// must call notFound() themselves, or the response never gets a real HTTP 404 (see the equivalent
// college detail page for why: a parent loading.tsx or an unmemoized fetch can commit the shell
// before the not-found decision is made).
const loadPlace = cache(async (placeSlug: string) => {
  try {
    return await placesService.getBySlug(placeSlug);
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
  const { placeSlug } = await params;
  const result = await loadPlace(placeSlug);
  if (!result) notFound();

  return {
    title: result.data.name,
    description: result.data.description ?? `${result.data.name} on LINK.`,
  };
}

export default async function PlaceDetailPage({ params }: { params: Promise<PageParams> }) {
  const { placeSlug } = await params;
  const result = await loadPlace(placeSlug);
  if (!result) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <PlaceDetailView place={result.data} />
    </main>
  );
}
