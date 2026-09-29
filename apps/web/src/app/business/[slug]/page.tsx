import { ApiClientError } from '@platform/api-client';
import { RESERVED_BUSINESS_SLUGS } from '@platform/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ROUTES } from '@/constants/routes';
import { BusinessPageView } from '@/features/business-page/components/business-page-view';
import {
  absoluteUrl,
  describe,
  localBusinessJsonLd,
  pageMetadata,
} from '@/features/business-page/lib/seo';
import { businessPagesService } from '@/services/business.service';
import { placesService } from '@/services/places.service';

interface PageParams {
  slug: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The business and its main (most reviewed) place, memoized per request so metadata and the page
 * share one fetch and both can answer a real 404. Anything not public (pending, suspended,
 * rejected, unknown) is simply not found.
 */
const loadPage = cache(async (slug: string) => {
  const clean = slug.toLowerCase();
  if (!SLUG.test(clean) || (RESERVED_BUSINESS_SLUGS as readonly string[]).includes(clean)) {
    return null;
  }
  try {
    const business = (await businessPagesService.get(clean)).data;
    const main = business.branches[0];
    if (!main) return null;
    const place = (await placesService.getBySlug(main.slug)).data;
    return { business, place };
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
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();
  const { business, place } = page;
  const category = business.category?.name ?? place.primaryCategory?.name ?? null;
  // The shared image comes from ./opengraph-image (a branded card with the cover photo).
  return pageMetadata({
    name: business.name,
    category,
    description: describe(
      business.name,
      category,
      place,
      business.description ?? place.description,
    ),
    path: ROUTES.businessPage(business.slug),
  });
}

export default async function BusinessPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();
  const { business, place } = page;
  const url = absoluteUrl(ROUTES.businessPage(business.slug));

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        // Built from public fields only; `<` is escaped (see localBusinessJsonLd).
        dangerouslySetInnerHTML={{ __html: localBusinessJsonLd(place, business, url) }}
      />
      <BusinessPageView place={place} business={business} pageUrl={url} />
    </main>
  );
}
