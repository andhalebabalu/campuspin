'use client';

import { ApiClientError } from '@platform/api-client';
import type { PlaceCard as PlaceCardData } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { PlaceCard } from '@/features/places/components/place-card';
import { savedPlacesService } from '@/services/saved-places.service';

/** My saved businesses. */
export function SavedPlaces() {
  const [places, setPlaces] = useState<PlaceCardData[] | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    savedPlacesService
      .list(controller.signal)
      .then((result) => {
        setPlaces(result.data);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load your saved places.' },
        );
      });
    return () => controller.abort();
  }, [reload]);

  if (error)
    return <ErrorState message={error.message} requestId={error.requestId} onRetry={retry} />;
  if (!places) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-64 w-full" />
        ))}
      </div>
    );
  }
  if (places.length === 0) {
    return (
      <EmptyState
        title="Nothing saved yet"
        description="Tap Save on a mess, library or shop to keep it here. Saved messes also tell you when their menu is out."
        action={
          <Link href={ROUTES.search} className="text-sm font-semibold text-primary-700">
            Discover places
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {places.map((place) => (
        <PlaceCard key={place.id} place={place} />
      ))}
    </div>
  );
}
