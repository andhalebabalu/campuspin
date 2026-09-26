'use client';

import { ApiClientError } from '@platform/api-client';
import type { ListingCard as ListingCardData, ListingStatus, PageMeta } from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { marketplaceService } from '@/services/marketplace.service';
import { ListingCard, STATUS_LABELS } from './listing-card';

const TABS: Array<ListingStatus | ''> = ['', 'ACTIVE', 'RESERVED', 'SOLD', 'EXPIRED', 'HIDDEN'];

/** Everything I am selling or sold, by status. */
export function MyListings() {
  const [status, setStatus] = useState<ListingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ListingCardData[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    marketplaceService
      .mine({ page, ...(status ? { status } : {}) }, controller.signal)
      .then((result) => {
        setItems((current) =>
          page === 1 || !current ? result.data : [...current, ...result.data],
        );
        setMeta(result.meta ?? null);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(caught instanceof ApiClientError ? caught.message : 'Could not load listings.');
      });
    return () => controller.abort();
  }, [status, page, reload]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">My listings</h1>
        <Link
          href={ROUTES.marketplaceNew}
          className="inline-flex h-10 items-center rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover"
        >
          Sell something
        </Link>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-line">
          {TABS.map((value) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={status === value}
              onClick={() => {
                setItems(null);
                setPage(1);
                setStatus(value);
              }}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium ${
                status === value
                  ? 'border-action text-action'
                  : 'border-transparent text-body hover:text-ink'
              }`}
            >
              {value ? STATUS_LABELS[value] : 'All'}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !items ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState title="No listings here" description="Things you sell show up here." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((listing) => (
            <li key={listing.id}>
              <ListingCard listing={listing} />
            </li>
          ))}
        </ul>
      )}
      {meta && items && meta.page < meta.totalPages && (
        <Button variant="secondary" className="self-center" onClick={() => setPage((p) => p + 1)}>
          Load more
        </Button>
      )}
    </div>
  );
}
