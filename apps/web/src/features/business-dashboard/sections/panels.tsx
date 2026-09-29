'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Icon } from '@/components/ui/icon';
import { BookingsPanel } from '@/features/business/components/bookings-panel';
import { EnquiriesPanel } from '@/features/business/components/enquiries-panel';
import { ADD_LISTING_CLASSES, ListingsPanel } from '@/features/business/components/listings-panel';
import { OffersPanel } from '@/features/business/components/offers-panel';
import { OrdersPanel } from '@/features/business/components/orders-panel';
import { QrPanel } from '@/features/business/components/qr-panel';
import { RequestsPanel } from '@/features/business/components/requests-panel';
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

const OPS_VIEWS = [
  { id: 'orders', label: 'Orders', icon: 'cart' },
  { id: 'requests', label: 'Requests', icon: 'wrench' },
  { id: 'bookings', label: 'Bookings', icon: 'calendar' },
] as const;
type OpsView = (typeof OPS_VIEWS)[number]['id'];

export function OrdersSection() {
  const router = useRouter();
  const params = useSearchParams();
  const { listings } = useWorkspace();
  const [pending, setPending] = useState(0);
  const wanted = params.get('view');
  const view: OpsView = OPS_VIEWS.some((item) => item.id === wanted)
    ? (wanted as OpsView)
    : 'orders';
  return (
    <>
      <PageHeader
        title="Orders & bookings"
        description="Live orders, table and repair requests, and bookings. Refreshes by itself."
      />
      <div
        role="tablist"
        aria-label="Orders and bookings"
        className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-subtle p-1"
      >
        {OPS_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={view === item.id}
            onClick={() => router.replace(`${DASHBOARD.orders}?view=${item.id}`, { scroll: false })}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${view === item.id ? 'bg-surface text-ink shadow-xs' : 'text-body hover:text-ink'}`}
          >
            <Icon name={item.icon} className="size-4" /> {item.label}
            {item.id === 'orders' && pending > 0 && (
              <span className="rounded-full bg-primary-600 px-1.5 text-xs font-semibold text-white">
                {pending}
              </span>
            )}
          </button>
        ))}
      </div>
      {view === 'orders' && <OrdersPanel onNewCount={setPending} />}
      {view === 'requests' && <RequestsPanel listings={listings} />}
      {view === 'bookings' && <BookingsPanel listings={listings} />}
    </>
  );
}
