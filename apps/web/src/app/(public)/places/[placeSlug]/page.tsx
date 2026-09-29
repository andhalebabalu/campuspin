import { ApiClientError } from '@platform/api-client';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { ROUTES } from '@/constants/routes';
import { BusinessPageView } from '@/features/business-page/components/business-page-view';
import {
  absoluteUrl,
  describe,
  localBusinessJsonLd,
  pageMetadata,
} from '@/features/business-page/lib/seo';
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

/** A business with one place has one page: its business page. Several branches keep their own. */
function businessHome(place: { business: { slug: string; placeCount: number } | null }) {
  return place.business && place.business.placeCount === 1
    ? ROUTES.businessPage(place.business.slug)
    : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { placeSlug } = await params;
  const result = await loadPlace(placeSlug);
  if (!result) notFound();
  const place = result.data;
  const home = businessHome(place);
  if (home) redirect(home);

  const category = place.primaryCategory?.name ?? null;
  return pageMetadata({
    name: place.name,
    category,
    description: describe(place.name, category, place, place.description),
    path: ROUTES.placeDetail(place.slug),
    image: place.coverImageUrl,
  });
}

export default async function PlaceDetailPage({ params }: { params: Promise<PageParams> }) {
  const { placeSlug } = await params;
  const result = await loadPlace(placeSlug);
  if (!result) notFound();
  const place = result.data;
  const home = businessHome(place);
  if (home) redirect(home);
  const url = absoluteUrl(ROUTES.placeDetail(place.slug));

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: localBusinessJsonLd(place, null, url) }}
      />
      <BusinessPageView place={place} business={null} pageUrl={url} />
    </main>
  );
}
