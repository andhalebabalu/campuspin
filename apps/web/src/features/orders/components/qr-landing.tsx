'use client';

import { ApiClientError } from '@platform/api-client';
import type { PlaceServices, QrResolution } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { ROUTES } from '@/constants/routes';
import { ordersService } from '@/services/orders.service';
import { OrderingView } from './ordering-view';

/**
 * Where a printed CampusPin code leads (`/q/<token>`): the place, the table when it is a table code,
 * and what can be used there. Old or disabled codes say so plainly.
 */
export function QrLanding({
  token,
  extra,
}: {
  token: string;
  extra?: (services: PlaceServices, qrToken: string, table: string | null) => ReactNode;
}) {
  const [resolved, setResolved] = useState<QrResolution | null>(null);
  const [error, setError] = useState<ApiClientError | Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    ordersService
      .resolveQr(token, controller.signal)
      .then((result) => setResolved(result.data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught : new Error('Could not open this code.'));
      });
    return () => controller.abort();
  }, [token]);

  if (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 410)) {
      return (
        <EmptyState
          title={
            error.status === 410 ? 'This code is no longer in use' : 'This is not a CampusPin code'
          }
          description={
            error.status === 410
              ? 'The business replaced or switched off this QR code. Ask the staff for the current one.'
              : 'Check you scanned the CampusPin sticker, or search for the place instead.'
          }
          action={
            <Link href={ROUTES.search} className="text-sm font-semibold text-primary-700">
              Search places
            </Link>
          }
        />
      );
    }
    return <ErrorState message={error.message} onRetry={() => window.location.reload()} />;
  }
  if (!resolved) return <Skeleton className="h-96 w-full" />;

  const table = resolved.table?.label ?? null;
  return (
    <OrderingView
      placeSlug={resolved.place.slug}
      {...(resolved.kind === 'TABLE' ? { qrToken: token, tableLabel: table ?? undefined } : {})}
      extra={
        extra
          ? (services) => extra(services, token, resolved.kind === 'TABLE' ? table : null)
          : undefined
      }
    />
  );
}
