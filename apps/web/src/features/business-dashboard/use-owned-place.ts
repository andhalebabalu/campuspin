'use client';

import { ApiClientError } from '@platform/api-client';
import type { OwnedPlace } from '@platform/contracts';
import { useCallback, useEffect, useState } from 'react';
import { businessService } from '@/services/business.service';

type Result = { id: string; place: OwnedPlace | null; error: string | null };

/** One of the owner's places with everything editable; `setPlace` takes a save's response. */
export function useOwnedPlace(placeId: string | undefined) {
  const [result, setResult] = useState<Result | null>(null);
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    if (!placeId) return;
    const controller = new AbortController();
    businessService
      .place(placeId, controller.signal)
      .then((response) => setResult({ id: placeId, place: response.data, error: null }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          id: placeId,
          place: null,
          error: caught instanceof ApiClientError ? caught.message : 'Could not load the place.',
        });
      });
    return () => controller.abort();
  }, [placeId, reload]);

  const setPlace = useCallback(
    (place: OwnedPlace) => setResult({ id: place.id, place, error: null }),
    [],
  );
  const current = result && result.id === placeId ? result : null;
  return {
    place: current?.place ?? null,
    error: current?.error ?? null,
    loading: !!placeId && !current,
    setPlace,
    retry,
  };
}
