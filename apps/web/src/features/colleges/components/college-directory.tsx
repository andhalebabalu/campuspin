'use client';

import { ApiClientError } from '@platform/api-client';
import type { CollegeCard as CollegeCardData, PageMeta } from '@platform/contracts';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { collegesService, type CollegeListParams } from '@/services/colleges.service';
import { CollegeCard } from './college-card';
import { CollegeCardSkeleton } from './college-card-skeleton';

type Sort = NonNullable<CollegeListParams['sort']>;

const SORT_OPTIONS: Array<{ value: Sort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'popular', label: 'Most places' },
  { value: 'newest', label: 'Newest' },
];

export interface CollegeDirectoryProps {
  initialColleges: CollegeCardData[];
  initialMeta: PageMeta;
  initialQuery: { q: string; sort: Sort; page: number };
}

/**
 * SSG shell (the first page of results, rendered on the server for a fast first paint and SEO)
 * handed off to client-side search: typing, changing sort or paging re-fetches through
 * `collegesService` and keeps the URL in sync, so results stay shareable and back-button safe.
 * `sort=nearest` needs a geolocation UI this foundation phase does not build yet, so it is left out.
 */
export function CollegeDirectory({
  initialColleges,
  initialMeta,
  initialQuery,
}: CollegeDirectoryProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [q, setQ] = useState(initialQuery.q);
  const [debouncedQ, setDebouncedQ] = useState(initialQuery.q);
  const [sort, setSort] = useState<Sort>(initialQuery.sort);
  const [page, setPage] = useState(initialQuery.page);
  const [colleges, setColleges] = useState(initialColleges);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const isFirstRun = useRef(true);
  const prevFilters = useRef({ q: initialQuery.q, sort: initialQuery.sort });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    // A new search term or sort jumps back to page 1: update it and let that change re-run this
    // effect, rather than fetching once for the old page and again a moment later for page 1.
    const filtersChanged =
      prevFilters.current.q !== debouncedQ || prevFilters.current.sort !== sort;
    prevFilters.current = { q: debouncedQ, sort };
    if (filtersChanged && page !== 1) {
      setPage(1);
      return;
    }
    const effectivePage = filtersChanged ? 1 : page;

    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    const params: CollegeListParams = { sort, page: effectivePage };
    if (debouncedQ) params.q = debouncedQ;

    collegesService
      .list(params, controller.signal)
      .then((result) => {
        setColleges(result.data);
        setMeta(
          result.meta ?? {
            page: effectivePage,
            limit: 20,
            total: result.data.length,
            totalPages: 1,
          },
        );
        setStatus('idle');

        const search = new URLSearchParams();
        if (debouncedQ) search.set('q', debouncedQ);
        if (sort !== 'name') search.set('sort', sort);
        if (effectivePage !== 1) search.set('page', String(effectivePage));
        const suffix = search.toString();
        router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname/router are stable
  }, [debouncedQ, sort, page, retryCount]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          label="Search colleges"
          placeholder="Search by name or city…"
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

      {status === 'error' && error ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      ) : status === 'loading' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <CollegeCardSkeleton key={index} />
          ))}
        </div>
      ) : colleges.length === 0 ? (
        <EmptyState
          title={debouncedQ ? `No results for "${debouncedQ}".` : 'No colleges yet.'}
          description={
            debouncedQ ? 'Try a different name or city.' : 'Check back soon — more are on the way.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {colleges.map((college) => (
              <CollegeCard key={college.id} college={college} />
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
