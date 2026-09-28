'use client';

import { ApiClientError } from '@platform/api-client';
import type { QuickAction, StudentHome as StudentHomeData } from '@platform/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { OfferCard } from '@/features/offers/components/offer-card';
import { OrderCard } from '@/features/orders/components/my-orders';
import { RequestCard } from '@/features/requests/components/request-views';
import { PlaceCard } from '@/features/places/components/place-card';
import { useSession } from '@/lib/auth/session-context';
import { useLocation } from '@/lib/geo/use-location';
import { servicesService } from '@/services/services.service';
import { TILE_TONES, serviceIcon } from '../lib/service-meta';
import { MessMenuCard } from './menu-card';

function greeting(now: Date = new Date()): string {
  const hour = Number(
    now.toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function QuickActionTile({ action, index }: { action: QuickAction; index: number }) {
  const tone = TILE_TONES[index % TILE_TONES.length];
  return (
    <Link
      href={action.kind === 'OFFERS' ? ROUTES.offers : ROUTES.serviceType(action.key)}
      className="group flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-4 text-center transition-shadow hover:shadow-md"
    >
      <span className={`flex size-12 items-center justify-center rounded-2xl ${tone}`}>
        <Icon name={serviceIcon(action.icon)} className="size-6" />
      </span>
      <span className="text-sm font-semibold text-ink">{action.name}</span>
      <span className="text-xs text-muted">
        {action.available > 0
          ? `${action.available} ${action.available === 1 ? 'place' : 'places'}`
          : 'None nearby yet'}
      </span>
    </Link>
  );
}

const SEE_ALL = 'text-sm font-semibold text-primary-700 hover:text-primary-800';

/**
 * The signed-in student's daily dashboard: "What do you need today?", quick actions backed by real
 * services, today's mess menus and saved places. Every section has an honest empty state.
 */
export function StudentHome() {
  const { user } = useSession();
  const router = useRouter();
  const { point, status: locationStatus, request: requestLocation } = useLocation();
  const [home, setHome] = useState<StudentHomeData | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    servicesService
      .home(point, controller.signal)
      .then((result) => {
        setHome(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your home screen.' },
        );
      });
    return () => controller.abort();
  }, [point, reload]);

  function search(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `${ROUTES.search}?q=${encodeURIComponent(q)}` : ROUTES.search);
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-5 rounded-2xl bg-primary-800 px-5 py-7 text-white sm:px-8">
        <div>
          <p className="text-sm text-primary-100">
            {greeting()}
            {user ? `, ${user.name.split(' ')[0]}` : ''}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">What do you need today?</h1>
          {user?.college && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-primary-100">
              <Icon name="graduation" className="size-4" />
              {user.college.name}
            </p>
          )}
        </div>
        <form onSubmit={search} role="search" className="flex gap-2">
          <label htmlFor="home-search" className="sr-only">
            Search places and services
          </label>
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-4 text-ink">
            <Icon name="search" className="size-5 text-muted" />
            <input
              id="home-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Mess, xerox, PG, library…"
              className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted"
            />
          </div>
          <button
            type="submit"
            className="h-12 rounded-full bg-accent-600 px-5 text-sm font-semibold text-white hover:bg-accent-650"
          >
            Search
          </button>
        </form>
        {!point && locationStatus !== 'unavailable' && (
          <button
            type="button"
            onClick={requestLocation}
            disabled={locationStatus === 'locating'}
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary-100 hover:text-white disabled:opacity-60"
          >
            <Icon name="navigation" className="size-4" />
            {locationStatus === 'denied'
              ? 'Location is blocked: allow it in your browser to see distances'
              : locationStatus === 'locating'
                ? 'Finding you…'
                : 'Use my location for nearby places'}
          </button>
        )}
      </div>

      {error && (
        <ErrorState message={error.message} requestId={error.requestId} onRetry={refresh} />
      )}

      {!error && !home && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {home && (
        <>
          <Section title="Quick actions">
            {home.quickActions.length === 0 ? (
              <EmptyState title="No services yet" description="Check back soon." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {home.quickActions.map((action, index) => (
                  <QuickActionTile key={action.key} action={action} index={index} />
                ))}
              </div>
            )}
          </Section>

          {(home.activeOrders.length > 0 || home.activeRequests.length > 0) && (
            <Section
              title="On the way"
              action={
                <Link href={ROUTES.orders} className={SEE_ALL}>
                  All orders
                </Link>
              }
            >
              <ul className="grid gap-3 md:grid-cols-2">
                {home.activeOrders.map((order) => (
                  <li key={order.id}>
                    <OrderCard order={order} />
                  </li>
                ))}
                {home.activeRequests.map((request) => (
                  <li key={request.id}>
                    <RequestCard request={request} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section
            title="Today's mess menu"
            action={
              <Link href={ROUTES.todaysMenus} className={SEE_ALL}>
                See all
              </Link>
            }
          >
            {home.todaysMenus.length === 0 ? (
              <EmptyState
                title="No mess has published today's menu yet"
                description="Save your mess and we'll tell you when its menu is out."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {home.todaysMenus.map((card) => (
                  <MessMenuCard key={card.place.id} card={card} />
                ))}
              </div>
            )}
          </Section>

          {home.nearbyOffers.length > 0 && (
            <Section
              title="Student offers nearby"
              action={
                <Link href={ROUTES.offers} className={SEE_ALL}>
                  See all
                </Link>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {home.nearbyOffers.slice(0, 3).map((offer) => (
                  <OfferCard key={offer.id} offer={offer} />
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Saved places"
            action={
              home.saved.length > 0 ? (
                <Link href={ROUTES.saved} className={SEE_ALL}>
                  See all
                </Link>
              ) : undefined
            }
          >
            {home.saved.length === 0 ? (
              <EmptyState
                title="Nothing saved yet"
                description="Tap Save on a mess, library or shop to keep it here."
                action={
                  <Link href={ROUTES.search} className={SEE_ALL}>
                    Discover places
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {home.saved.slice(0, 4).map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
            )}
          </Section>

          {home.recentPlaces.length > 0 && (
            <Section title="Recently used">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {home.recentPlaces.slice(0, 4).map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
