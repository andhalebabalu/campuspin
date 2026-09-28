'use client';

import { ApiClientError } from '@platform/api-client';
import type { PlaceCard as PlaceCardData, ServiceType } from '@platform/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { PlaceCard } from '@/features/places/components/place-card';
import { useLocation } from '@/lib/geo/use-location';
import { servicesService } from '@/services/services.service';
import { serviceIcon } from '../lib/service-meta';

/** Places offering one service (a quick action), nearest first when the location is known. */
export function ServicePlaces({ serviceKey }: { serviceKey: string }) {
  const { point, status: locationStatus, request } = useLocation();
  const [type, setType] = useState<ServiceType | null | undefined>(undefined);
  const [result, setResult] = useState<{ key: string; places: PlaceCardData[] } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [reload, setReload] = useState(0);

  const retry = useCallback(() => setReload((count) => count + 1), []);
  const filterKey = JSON.stringify([serviceKey, point]);
  const places = result?.key === filterKey ? result.places : null;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      servicesService.types(controller.signal),
      servicesService.typePlaces(serviceKey, { ...point, page: 1 }, controller.signal),
    ])
      .then(([types, result]) => {
        setType(types.data.find((item) => item.key === serviceKey) ?? null);
        setResult({ key: filterKey, places: result.data });
        setPage(1);
        setHasMore((result.meta?.totalPages ?? 1) > 1);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiClientError && caught.status === 404) {
          setType(null);
          setResult({ key: filterKey, places: [] });
          return;
        }
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Could not load places.' },
        );
      });
    return () => controller.abort();
  }, [serviceKey, point, reload, filterKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await servicesService.typePlaces(serviceKey, { ...point, page: page + 1 });
      setResult((current) => ({
        key: filterKey,
        places: [...(current?.places ?? []), ...result.data],
      }));
      setPage(page + 1);
      setHasMore((result.meta?.totalPages ?? 1) > page + 1);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error)
    return <ErrorState message={error.message} requestId={error.requestId} onRetry={retry} />;

  if (type === null) {
    return (
      <EmptyState
        title="This service isn't available"
        description="It may have been renamed or switched off."
        action={
          <Link href={ROUTES.search} className="text-sm font-semibold text-primary-700">
            Discover places
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
            <Icon name={serviceIcon(type?.icon ?? null)} className="size-6" />
          </span>
          <div>
            {type ? (
              <h1 className="text-2xl font-bold text-ink">{type.name}</h1>
            ) : (
              <Skeleton className="h-8 w-48" />
            )}
            {type?.description && <p className="text-body">{type.description}</p>}
          </div>
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

      {places === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      ) : places.length === 0 ? (
        <EmptyState
          title={
            type?.kind === 'OFFERS'
              ? 'No student offers right now'
              : `No place offers ${type?.name ?? 'this'} on CampusPin yet`
          }
          description="Businesses are joining every week. Know one that should be here? Tell them about CampusPin or suggest the place."
          action={
            <Link href={ROUTES.suggestPlace} className="text-sm font-semibold text-primary-700">
              Suggest a place
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>
          {hasMore && (
            <Button
              variant="secondary"
              className="self-center"
              onClick={() => void loadMore()}
              loading={loadingMore}
            >
              Show more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
