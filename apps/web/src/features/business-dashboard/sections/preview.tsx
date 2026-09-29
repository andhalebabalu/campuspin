'use client';

import type { PlaceDetail } from '@platform/contracts';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import {
  BusinessPageView,
  type PageBusiness,
} from '@/features/business-page/components/business-page-view';
import { DASHBOARD } from '../routes';
import { useOwnedPlace } from '../use-owned-place';
import { mainListing, useWorkspace } from '../workspace';
import { publicUrlOf } from './public-link';

/**
 * Exactly the page students see, drawn from the owner's current (unpublished) data: the same
 * component as `/business/<slug>`, with counting, saving, reviews and ordering switched off.
 */
export function Preview() {
  const { dashboard, listings } = useWorkspace();
  const main = mainListing(listings);
  const { place, error, retry } = useOwnedPlace(main?.id);
  const { profile, stats } = dashboard;

  if (!main) {
    return (
      <EmptyState
        title="Nothing to preview yet"
        description="Your page is built from your place: add it with its location and photos first."
        action={
          <Link href={DASHBOARD.newListing} className="text-sm font-semibold text-action">
            + Add your place
          </Link>
        }
      />
    );
  }
  if (error) return <ErrorState message={error} onRetry={retry} />;
  if (!place) return <Skeleton className="h-[40rem] w-full" />;

  const detail: PlaceDetail = { ...place, nearbyColleges: [], business: null };
  const business: PageBusiness = {
    slug: profile.slug,
    name: profile.businessName,
    description: profile.description,
    category: profile.category,
    logoUrl: profile.logoUrl,
    coverUrl: profile.coverUrl,
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    email: profile.email,
    website: profile.website,
    instagramUrl: profile.instagramUrl,
    facebookUrl: profile.facebookUrl,
    verified: profile.verificationStatus === 'VERIFIED',
    ratingAverage: stats.reviews.averageRating,
    ratingCount: stats.reviews.count,
    branches: listings
      .filter((listing) => listing.id === place.id || listing.status === 'ACTIVE')
      .map((listing) => ({
        id: listing.id,
        slug: listing.slug,
        name: listing.name,
        address: listing.id === place.id ? place.address : listing.city,
        city: listing.city,
        latitude: place.latitude,
        longitude: place.longitude,
        coverImageUrl: listing.coverImageUrl,
        primaryCategory: listing.primaryCategory,
        ratingAverage: listing.ratingAverage,
        ratingCount: listing.ratingCount,
      })),
  };

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 lg:-my-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-amber-50 px-4 py-3 text-sm sm:px-6">
        <span className="flex items-center gap-2 text-ink">
          <Icon name="eye" className="size-4" />
          Preview of your page as students see it
          {!profile.isPublic && <span className="text-body"> (not live yet)</span>}
        </span>
        <Link href={DASHBOARD.profile} className="font-semibold text-action">
          Edit profile
        </Link>
      </div>
      <BusinessPageView
        place={detail}
        business={business}
        pageUrl={publicUrlOf(profile.slug)}
        preview
      />
    </div>
  );
}
