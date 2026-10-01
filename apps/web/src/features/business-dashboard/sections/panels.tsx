'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { EnquiriesPanel } from '@/features/business/components/enquiries-panel';
import { ADD_LISTING_CLASSES, ListingsPanel } from '@/features/business/components/listings-panel';
import { OffersPanel } from '@/features/business/components/offers-panel';
import { QrPanel } from '@/features/business/components/qr-panel';
import { ReviewsPanel } from '@/features/business/components/reviews-panel';
import { DASHBOARD } from '../routes';
import { useWorkspace } from '../workspace';

/** The existing dashboard tools, each on its own page of the sidebar. */

export function ListingsSection() {
  const router = useRouter();
  const { listings } = useWorkspace();
  return (
    <>
      <PageHeader
        title="Listings"
        description="Your places on CampusPin. New ones are checked by our team before they go live."
        actions={
          <Link href={DASHBOARD.newListing} className={ADD_LISTING_CLASSES}>
            <span className="text-lg leading-none">+</span> Add a listing
          </Link>
        }
      />
      <ListingsPanel
        listings={listings}
        onShowEnquiries={(placeId) => router.push(`${DASHBOARD.enquiries}?place=${placeId}`)}
      />
    </>
  );
}

export function EnquiriesSection() {
  const params = useSearchParams();
  const { listings, refresh } = useWorkspace();
  const [placeId, setPlaceId] = useState(params.get('place') ?? '');
  return (
    <>
      <PageHeader
        title="Messages & enquiries"
        description="Questions students sent from your page. Reply by phone or email, then mark them done."
      />
      <EnquiriesPanel
        listings={listings}
        placeId={placeId}
        onPlaceChange={setPlaceId}
        onChanged={refresh}
      />
    </>
  );
}

export function ReviewsSection() {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What students say about your places. Reviews cannot be edited or removed by businesses."
      />
      <ReviewsPanel />
    </>
  );
}

export function OffersSection() {
  const { listings } = useWorkspace();
  return (
    <>
      <PageHeader
        title="Offers"
        description="Student discounts shown on your page and in the offers list."
      />
      <OffersPanel listings={listings} />
    </>
  );
}

export function QrSection() {
  const { listings } = useWorkspace();
  return (
    <>
      <PageHeader
        title="QR codes"
        description="Printable codes for your counter and tables: students scan to order, ask for service or review."
      />
      <QrPanel listings={listings} />
    </>
  );
}
