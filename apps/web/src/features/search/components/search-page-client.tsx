'use client';

import { ApiClientError } from '@platform/api-client';
import type {
  CategoryGroup,
  CollegeCard,
  PageMeta,
  PlaceCard as PlaceCardData,
} from '@platform/contracts';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { PlaceCard } from '@/features/places/components/place-card';
import { PlaceCardSkeleton } from '@/features/places/components/place-card-skeleton';
import {
  hasFilters,
  searchHref,
  toPlaceListParams,
  type Applied,
} from '@/features/search/lib/search-filters';
import { placesService } from '@/services/places.service';

type Sort = Applied['sort'];
/** `nearest` is left out: it needs a geolocation UI this foundation phase does not build. */
const SORT_OPTIONS: Array<{ value: Sort; label: string }> = [
  { value: 'relevance', label: 'Best match' },
  { value: 'rating', label: 'Top rated' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
];

export interface SearchPageClientProps {
  initialApplied: Applied;
  initialPlaces: PlaceCardData[];
  initialMeta: PageMeta;
  /** Set when the server's own fetch was a 404 (an unknown category or college slug). */
  initialError?: string | null;
  categoryGroups: CategoryGroup[];
  colleges: CollegeCard[];
}

const SELECT_CLASSES = 'h-11 rounded-md border border-control bg-surface px-3.5 text-base text-ink';

/**
 * The one search page: a keyword search over places (ranked by real MySQL full-text relevance) that
 * doubles as a plain category/college/price/verified filter browser when no keyword is given (the
 * landing page's category tiles and campus search link straight into it). Unlike the
 * college-embedded place list, this page's filters ARE synced to the URL — it is the page itself,
 * shareable and back-button safe, the same as the standalone `/colleges` directory.
 */
export function SearchPageClient({
  initialApplied,
  initialPlaces,
  initialMeta,
  initialError = null,
  categoryGroups,
  colleges,
}: SearchPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [qInput, setQInput] = useState(initialApplied.q);
  const [minPriceInput, setMinPriceInput] = useState(initialApplied.minPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(initialApplied.maxPrice);
  const [applied, setApplied] = useState<Applied>(initialApplied);
  const [places, setPlaces] = useState(initialPlaces);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(
    initialError ? 'error' : 'idle',
  );
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(
    initialError ? { message: initialError } : null,
  );
  const [retryCount, setRetryCount] = useState(0);

  const isFirstRun = useRef(true);

  useEffect(() => {
    const wasFirstRun = isFirstRun.current;
    isFirstRun.current = false;

    // Nothing to fetch on the first render (the server already supplied the initial data) or once
    // every filter is cleared; the render checks `hasFilters` itself, ahead of `status`, so a stale
    // `status`/`error` from an earlier search is harmless here.
    if (wasFirstRun || !hasFilters(applied)) {
      if (!wasFirstRun) router.replace(pathname, { scroll: false });
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    setError(null);

    placesService
      .list(toPlaceListParams(applied), controller.signal)
      .then((result) => {
        setPlaces(result.data);
        setMeta(
          result.meta ?? {
            page: applied.page,
            limit: 20,
            total: result.data.length,
            totalPages: 1,
          },
        );
        setStatus('idle');

        router.replace(searchHref(applied), { scroll: false });
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
  }, [applied, retryCount]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setApplied((current) => ({
      ...current,
      q: qInput.trim(),
      minPrice: minPriceInput.trim(),
      maxPrice: maxPriceInput.trim(),
      page: 1,
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Search places"
          placeholder="Try “mess”, “library”, “PG”…"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
        />
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Category
            <select
              value={applied.category}
              onChange={(event) =>
                setApplied((current) => ({ ...current, category: event.target.value, page: 1 }))
              }
              className={SELECT_CLASSES}
            >
              <option value="">Any category</option>
              {categoryGroups.map((group) => (
                <optgroup key={group.id} label={group.name}>
                  {group.children.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {colleges.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Near college
              <select
                value={applied.college}
                onChange={(event) =>
                  setApplied((current) => ({ ...current, college: event.target.value, page: 1 }))
                }
                className={`${SELECT_CLASSES} max-w-64`}
              >
                <option value="">Any college</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.slug}>
                    {college.shortName ?? college.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Input
            label="Min price (₹)"
            type="number"
            min={0}
            value={minPriceInput}
            onChange={(event) => setMinPriceInput(event.target.value)}
            className="w-32"
          />
          <Input
            label="Max price (₹)"
            type="number"
            min={0}
            value={maxPriceInput}
            onChange={(event) => setMaxPriceInput(event.target.value)}
            className="w-32"
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Rating
            <select
              value={applied.minRating}
              onChange={(event) =>
                setApplied((current) => ({ ...current, minRating: event.target.value, page: 1 }))
              }
              className={SELECT_CLASSES}
            >
              <option value="">Any rating</option>
              {['4', '3', '2'].map((stars) => (
                <option key={stars} value={stars}>
                  {stars}★ and up
                </option>
              ))}
            </select>
          </label>
          <label className="flex h-11 items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={applied.verified}
              onChange={(event) =>
                setApplied((current) => ({ ...current, verified: event.target.checked, page: 1 }))
              }
              className="size-4 rounded border-control"
            />
            Verified only
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Sort by
            <select
              value={applied.sort}
              onChange={(event) =>
                setApplied((current) => ({ ...current, sort: event.target.value as Sort, page: 1 }))
              }
              className={SELECT_CLASSES}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Search</Button>
        </div>
      </form>

      {!hasFilters(applied) ? (
        <EmptyState
          title="Search for a place"
          description="Try a name, pick a category or college, or set a price range above."
        />
      ) : status === 'error' && error ? (
        <ErrorState
          message={error.message}
          requestId={error.requestId}
          onRetry={() => setRetryCount((n) => n + 1)}
        />
      ) : status === 'loading' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <PlaceCardSkeleton key={index} />
          ))}
        </div>
      ) : places.length === 0 ? (
        <EmptyState
          title={applied.q ? `No results for "${applied.q}".` : 'Nothing matches these filters.'}
          description="Try a different search or clear a filter."
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
                disabled={applied.page <= 1}
                onClick={() =>
                  setApplied((current) => ({ ...current, page: Math.max(1, current.page - 1) }))
                }
              >
                Previous
              </Button>
              <span className="text-sm text-body">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={applied.page >= meta.totalPages}
                onClick={() => setApplied((current) => ({ ...current, page: current.page + 1 }))}
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
