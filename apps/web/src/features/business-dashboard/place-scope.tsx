'use client';

import type { OwnedPlace } from '@platform/contracts';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { NotLiveNote, PlacePicker } from '@/features/business/components/place-picker';
import { DASHBOARD } from './routes';
import { useOwnedPlace } from './use-owned-place';
import { useWorkspace } from './workspace';

/**
 * For the per-place editors (photos, hours, location): which place (a picker when there are
 * several), then that place loaded fresh. `children` gets the place and a setter for save results.
 * Keyed by place id so switching places resets the editor's draft.
 */
export function PlaceScope({
  children,
}: {
  children: (place: OwnedPlace, setPlace: (place: OwnedPlace) => void) => ReactNode;
}) {
  const { listings } = useWorkspace();
  const [placeId, setPlaceId] = useState('');
  const { place, error, retry, setPlace } = useOwnedPlace(placeId || undefined);
  const listing = listings.find((item) => item.id === placeId);

  if (listings.length === 0) {
    return (
      <EmptyState
        title="Add your place first"
        description="Photos, hours and location belong to your place. Add it with its exact location, then come back."
        action={
          <Link href={DASHBOARD.newListing} className="text-sm font-semibold text-action">
            + Add your place
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PlacePicker listings={listings} value={placeId} onChange={setPlaceId} />
      <NotLiveNote listing={listing} />
      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !place ? (
        <Skeleton className="h-80 w-full rounded-2xl" />
      ) : (
        <div key={place.id}>{children(place, setPlace)}</div>
      )}
    </div>
  );
}
