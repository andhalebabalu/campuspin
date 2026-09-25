'use client';

import { ApiClientError } from '@platform/api-client';
import type { PlaceCard as PlaceCardData, PageMeta } from '@platform/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { placesService, type PlaceListParams } from '@/services/places.service';
import { PlaceCard } from './place-card';
import { PlaceCardSkeleton } from './place-card-skeleton';

type Sort = NonNullable<PlaceListParams['sort']>;

const SORT_OPTIONS: Array<{ value: Sort; label: string }> = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'name', label: 'Name' },
  { value: 'newest', label: 'Newest' },
];

export interface CollegePlaceListProps {
  collegeSlug: string;
  initialPlaces: PlaceCardData[];
  initialMeta: PageMeta;
  /** Category filter, controlled by the parent (so other sections can set it); '' for all. */
  categorySlug?: string;
  /** Categories to offer as filter chips; none shows no chips. */
  categories?: ReadonlyArray<{ slug: string; name: string; count: number }>;
  onCategoryChange?: (slug: string) => void;
}

/**
 * The places serving one college, embedded in its detail page. Unlike the standalone `/colleges`
 * directory, filters here are component-local state, not synced to the URL: this is a section of a
 * larger page, not a page of its own.
 */
export function CollegePlaceList({
  collegeSlug,
  initialPlaces,
  initialMeta,
  categorySlug = '',
  categories = [],
  onCategoryChange,
}: CollegePlaceListProps) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<Sort>('nearest');
  const [page, setPage] = useState(1);
  const [places, setPlaces] = useState(initialPlaces);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const isFirstRun = useRef(true);
  const prevFilters = useRef({ q: '', sort: 'nearest' as Sort, categorySlug: '' });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    const filtersChanged =
      prevFilters.current.q !== debouncedQ ||
      prevFilters.current.sort !== sort ||
      prevFilters.current.categorySlug !== categorySlug;
    prevFilters.current = { q: debouncedQ, sort, categorySlug };
    if (filtersChanged && page !== 1) {
      setPage(1);
      return;
    }
    const effectivePage = filtersChanged ? 1 : page;

    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    const params: PlaceListParams = { collegeSlug, sort, page: effectivePage };
    if (debouncedQ) params.q = debouncedQ;
    if (categorySlug) params.categorySlug = categorySlug;

    placesService
      .list(params, controller.signal)
      .then((result) => {
        setPlaces(result.data);
        setMeta(
          result.meta ?? {
            page: effectivePage,
            limit: 20,
            total: result.data.length,
            totalPages: 1,
          },
        );
        setStatus('idle');
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(
          caught instanceof ApiClientError
            ? { message: caught.message, requestId: caught.requestId }
            : { message: 'Something went wrong. Please try again.' },
        );
      });

    return () => controller.abort();
  }, [collegeSlug, debouncedQ, sort, categorySlug, page, retryCount]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          label="Search places"
          placeholder="Search by name…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          className="sm:max-w-sm"
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink sm:w-48">
          Sort by
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="h-11 rounded-md border border-control bg-surface px-3.5 text-base text-ink"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {[{ slug: '', name: 'All', count: 0 }, ...categories].map((category) => {
            const active = category.slug === categorySlug;
            return (
              <button
                key={category.slug || 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => onCategoryChange?.(category.slug)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-action bg-action text-white'
                    : 'border-line bg-surface text-body hover:border-control hover:text-ink'
                }`}
              >
                {category.name}
                {category.count > 0 && (
                  <span className={active ? 'text-white/80' : 'text-muted'}> {category.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {status === 'error' && error ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      ) : status === 'loading' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <PlaceCardSkeleton key={index} />
          ))}
        </div>
      ) : places.length === 0 ? (
        <EmptyState
          title={
            debouncedQ
              ? `No results for "${debouncedQ}".`
              : "We haven't discovered any places here yet."
          }
          description={
            debouncedQ ? 'Try a different name.' : 'Check back soon — more are on the way.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} />
            ))}
          </div>

          {meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-body">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
