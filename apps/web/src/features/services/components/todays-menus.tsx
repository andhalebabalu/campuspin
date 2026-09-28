'use client';

import { ApiClientError } from '@platform/api-client';
import type { MessMenuCard as MessMenuCardData } from '@platform/contracts';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useSession } from '@/lib/auth/session-context';
import { useLocation } from '@/lib/geo/use-location';
import { servicesService } from '@/services/services.service';
import { dayLabel, indiaDate } from '../lib/service-meta';
import { MessMenuCard } from './menu-card';

/** Every mess that published today's menu: saved ones first, then nearest. */
export function TodaysMenus() {
  const { status } = useSession();
  const { point, status: locationStatus, request } = useLocation();
  const [savedOnly, setSavedOnly] = useState(false);
  const [result, setResult] = useState<{ key: string; cards: MessMenuCardData[] } | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);

  const retry = useCallback(() => setReload((count) => count + 1), []);
  const filterKey = JSON.stringify([point, savedOnly]);
  // Stale results (from the previous filter) show the skeleton rather than the wrong list.
  const cards = result?.key === filterKey ? result.cards : null;

  useEffect(() => {
    if (status === 'loading') return;
    const controller = new AbortController();
    servicesService
      .todaysMenus({ ...point, saved: savedOnly }, controller.signal)
      .then((response) => {
        setResult({ key: filterKey, cards: response.data });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load menus.' },
        );
      });
    return () => controller.abort();
  }, [point, savedOnly, status, reload, filterKey]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent-700">{dayLabel(indiaDate())}</p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Today&apos;s mess menus</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'authenticated' && (
            <Button
              variant={savedOnly ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setSavedOnly(!savedOnly)}
            >
              <Icon name="bookmark" className="size-4" /> My saved messes
            </Button>
          )}
          {!point && locationStatus !== 'unavailable' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={request}
              loading={locationStatus === 'locating'}
            >
              <Icon name="navigation" className="size-4" /> Nearest first
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error.message} requestId={error.requestId} onRetry={retry} />
      ) : cards === null ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          title={
            savedOnly
              ? 'Your saved messes have not published today'
              : 'No menus published yet today'
          }
          description={
            savedOnly
              ? 'You will get a notification as soon as they do.'
              : 'Messes publish their menu through CampusPin each morning. Check back soon.'
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <MessMenuCard key={card.place.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}
