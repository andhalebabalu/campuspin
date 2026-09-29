'use client';

import { ApiClientError } from '@platform/api-client';
import type { BusinessAnalytics } from '@platform/contracts';
import { useCallback, useEffect, useState } from 'react';
import { businessService } from '@/services/business.service';

type Result =
  | { days: number; data: BusinessAnalytics; error?: undefined }
  | { days: number; data?: undefined; error: string };

/** The owner's page analytics for a range; `null` while loading that range. */
export function useAnalytics(days: 7 | 30 | 90) {
  const [result, setResult] = useState<Result | null>(null);
  const [reload, setReload] = useState(0);
  const retry = useCallback(() => setReload((count) => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    businessService
      .analytics(days, controller.signal)
      .then((response) => setResult({ days, data: response.data }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          days,
          error: caught instanceof ApiClientError ? caught.message : 'Could not load analytics.',
        });
      });
    return () => controller.abort();
  }, [days, reload]);

  // A result for another range (or a retry in flight) counts as loading.
  const current = result?.days === days ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry };
}

export const ACTION_ROWS = [
  { key: 'PHONE_CLICK', label: 'Calls', color: 'bg-primary-500' },
  { key: 'WHATSAPP_CLICK', label: 'WhatsApp', color: 'bg-accent-600' },
  { key: 'DIRECTION_CLICK', label: 'Directions', color: 'bg-amber-600' },
  { key: 'SHARE_CLICK', label: 'Shares', color: 'bg-violet-600' },
] as const;
