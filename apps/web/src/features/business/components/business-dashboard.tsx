'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessDashboard as Dashboard, BusinessListing } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { businessService } from '@/services/business.service';
import { DailyMenuPanel } from './daily-menu-panel';
import { EnquiriesPanel } from './enquiries-panel';
import { FoodMenuPanel } from './food-menu-panel';
import { InsightsPanel } from './insights-panel';
import { OrdersPanel } from './orders-panel';
import { QrPanel } from './qr-panel';
import { ADD_LISTING_CLASSES, ListingsPanel } from './listings-panel';
import { ProfilePanel } from './profile-panel';
import { ReviewsPanel } from './reviews-panel';
import { ServicesPanel } from './services-panel';

type Tab =
  'orders' | 'menu' | 'food' | 'services' | 'qr' | 'listings' | 'enquiries' | 'reviews' | 'profile';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'orders', label: 'Orders' },
  { id: 'menu', label: 'Daily menu' },
  { id: 'food', label: 'Food menu' },
  { id: 'services', label: 'Services' },
  { id: 'qr', label: 'QR codes' },
  { id: 'listings', label: 'Listings' },
  { id: 'enquiries', label: 'Enquiries' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'profile', label: 'Business profile' },
];

function StatCard({
  icon,
  label,
  value,
  detail,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-medium text-body">
        <Icon name={icon} className="size-4 text-accent-600" />
        {label}
      </span>
      <span className="text-3xl font-bold text-ink">{value}</span>
      <span className="text-sm text-muted">{detail}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left">
      <Card hover className="flex h-full flex-col gap-1 p-5">
        {body}
      </Card>
    </button>
  ) : (
    <Card className="flex h-full flex-col gap-1 p-5">{body}</Card>
  );
}

/**
 * The business owner's home: overview numbers, then tabs for listings, the enquiry inbox, reviews
 * and the business profile. Everything is fetched from `/business/*` for the signed-in owner.
 */
export function BusinessDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [listings, setListings] = useState<BusinessListing[] | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  // `?tab=orders` (from a notification) opens that tab.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'listings';
    const wanted = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((item) => item.id === wanted) ? (wanted as Tab) : 'listings';
  });
  const [pendingOrders, setPendingOrders] = useState(0);
  const [enquiryPlaceId, setEnquiryPlaceId] = useState('');
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      businessService.dashboard(controller.signal),
      businessService.listings(controller.signal),
    ])
      .then(([overview, places]) => {
        setDashboard(overview.data);
        setListings(places.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your dashboard.' },
        );
      });
    return () => controller.abort();
  }, [reload]);

  if (error) {
    return <ErrorState message={error.message} requestId={error.requestId} onRetry={refresh} />;
  }
  if (!dashboard || !listings) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { profile, stats } = dashboard;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="size-14 shrink-0 overflow-hidden rounded-full border border-line bg-subtle">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
              <img src={profile.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-lg font-bold text-primary-800">
                {profile.businessName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-muted">Business dashboard</p>
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">{profile.businessName}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('menu')}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-control px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            <span className="text-lg leading-none">+</span> Add today&apos;s menu
          </button>
          <Link href={ROUTES.dashboardNewListing} className={ADD_LISTING_CLASSES}>
            <span className="text-lg leading-none">+</span> Add a listing
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="store"
          label="Live listings"
          value={String(stats.listings.live)}
          detail={
            stats.listings.underReview > 0
              ? `${stats.listings.underReview} under review`
              : `${stats.listings.total} in total`
          }
          onClick={() => setTab('listings')}
        />
        <StatCard
          icon="chat"
          label="New enquiries"
          value={String(stats.enquiries.new)}
          detail={`${stats.enquiries.total} received in total`}
          onClick={() => {
            setEnquiryPlaceId('');
            setTab('enquiries');
          }}
        />
        <StatCard
          icon="star"
          label="Average rating"
          value={stats.reviews.count > 0 ? stats.reviews.averageRating.toFixed(1) : '–'}
          detail={`${stats.reviews.count} ${stats.reviews.count === 1 ? 'review' : 'reviews'}`}
          onClick={() => setTab('reviews')}
        />
        <StatCard
          icon="shield"
          label="Verification"
          value={profile.verificationStatus === 'VERIFIED' ? 'Verified' : 'Pending'}
          detail={
            profile.verificationStatus === 'VERIFIED'
              ? 'Students see a verified badge'
              : 'Our team verifies businesses'
          }
        />
      </div>

      <InsightsPanel
        onOpen={(target) =>
          setTab(
            target === 'requests' || target === 'bookings' || target === 'offers'
              ? 'services'
              : target,
          )
        }
      />

      <div className="flex flex-col gap-5">
        <div
          role="tablist"
          aria-label="Dashboard sections"
          className="flex gap-1 overflow-x-auto border-b border-line"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            const badge =
              item.id === 'enquiries' && stats.enquiries.new > 0
                ? stats.enquiries.new
                : item.id === 'orders' && pendingOrders > 0
                  ? pendingOrders
                  : null;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent-600 text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {item.label}
                {badge !== null && (
                  <span className="rounded-full bg-accent-600 px-1.5 text-xs font-semibold text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div role="tabpanel">
          {tab === 'listings' && (
            <ListingsPanel
              listings={listings}
              onShowEnquiries={(placeId) => {
                setEnquiryPlaceId(placeId);
                setTab('enquiries');
              }}
            />
          )}
          {tab === 'enquiries' && (
            <EnquiriesPanel
              listings={listings}
              placeId={enquiryPlaceId}
              onPlaceChange={setEnquiryPlaceId}
              onChanged={refresh}
            />
          )}
          {tab === 'orders' && <OrdersPanel onNewCount={setPendingOrders} />}
          {tab === 'menu' && <DailyMenuPanel listings={listings} />}
          {tab === 'food' && <FoodMenuPanel listings={listings} />}
          {tab === 'qr' && <QrPanel listings={listings} />}
          {tab === 'services' && <ServicesPanel listings={listings} />}
          {tab === 'reviews' && <ReviewsPanel />}
          {tab === 'profile' && (
            <ProfilePanel
              profile={profile}
              onSaved={(saved) =>
                setDashboard((current) => current && { ...current, profile: saved })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
