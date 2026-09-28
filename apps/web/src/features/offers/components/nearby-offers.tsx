'use client';

import { ApiClientError } from '@platform/api-client';
import type { StudentOffer } from '@platform/contracts';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useLocation } from '@/lib/geo/use-location';
import { engagementService } from '@/services/engagement.service';
import { OfferCard } from './offer-card';

/** Student offers usable today, nearest first once the location is known. */
export function NearbyOffers() {
  const { point, status: locationStatus, request } = useLocation();
  const [result, setResult] = useState<{ key: string; offers: StudentOffer[] } | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const key = JSON.stringify(point);
  const offers = result?.key === key ? result.offers : null;
  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    engagementService
      .nearbyOffers(point ?? {}, controller.signal)
      .then((response) => {
        setResult({ key, offers: response.data });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load offers.' },
        );
      });
    return () => controller.abort();
  }, [point, key, reload]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent-700">For CampusPin students</p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Student offers near you</h1>
        </div>
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
      {error ? (
        <ErrorState message={error.message} requestId={error.requestId} onRetry={retry} />
      ) : !offers ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <EmptyState
          title="No student offers today"
          description="Places add offers for CampusPin students often. Save your favourites to hear first."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
}
