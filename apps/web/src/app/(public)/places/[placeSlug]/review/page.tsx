import { ApiClientError } from '@platform/api-client';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { VerifiedBadge } from '@/components/ui/badge';
import { QuickReview } from '@/features/reviews/components/quick-review';
import { placesService } from '@/services/places.service';

interface PageParams {
  placeSlug: string;
}

// Memoized per request, like the place page: both generateMetadata and the page need the place and
// must call notFound() themselves for the response to be a real 404.
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
    title: `Review ${result.data.name}`,
    description: `Share how ${result.data.name} was, so the next student can decide.`,
    // A landing page for the printed QR code; the place page is the one to index.
    robots: { index: false },
  };
}

/**
 * Where a listing's QR code leads: the place in one line, then the review form. The QR code carries
 * the place id, not the slug (the API accepts either), so a printed code keeps working after a rename.
 */
export default async function PlaceReviewPage({ params }: { params: Promise<PageParams> }) {
  const { placeSlug } = await params;
  const result = await loadPlace(placeSlug);
  if (!result) notFound();
  const place = result.data;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-subtle">
          {place.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
            <img src={place.coverImageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-muted">How was your visit?</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{place.name}</h1>
            {place.verified && <VerifiedBadge />}
          </div>
          <p className="text-sm text-body">
            {[place.primaryCategory?.name, place.city].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <QuickReview placeId={place.id} placeSlug={place.slug} />
    </main>
  );
}
