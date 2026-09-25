'use client';

import { ApiClientError } from '@platform/api-client';
import type { CollegeCard as CollegeCardData, CollegeFacets, PageMeta } from '@platform/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { collegesService } from '@/services/colleges.service';
import { DIRECTORY_PAGE_SIZE, type DirectoryQuery } from '../lib/directory-query';
import { STREAM_STYLE } from '../lib/college-streams';
import { CollegeCard } from './college-card';
import { CollegeCardSkeleton } from './college-card-skeleton';

type Sort = DirectoryQuery['sort'];

const SORT_OPTIONS: Array<{ value: Sort; label: string }> = [
  { value: 'name', label: 'Name (A – Z)' },
  { value: 'popular', label: 'Most places around' },
  { value: 'newest', label: 'Recently added' },
];

export interface CollegeDirectoryProps {
  initialColleges: CollegeCardData[];
  initialMeta: PageMeta;
  initialQuery: DirectoryQuery;
  facets: CollegeFacets | null;
}

const PANEL = 'rounded-xl border border-line bg-surface p-5 shadow-xs';
const SELECT =
  'h-11 w-full rounded-md border border-control bg-surface px-3.5 text-sm text-ink focus-visible:outline-2';

const toggle = <T,>(list: readonly T[], value: T): T[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

const sameSet = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item) => b.includes(item));

/** "1 2 3 … 17", keeping the current page and its neighbours visible. */
function pageItems(current: number, total: number): Array<number | 'gap'> {
  const pages = new Set(
    [1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) =>
    index > 0 && page - (sorted[index - 1] ?? page) > 1 ? (['gap', page] as const) : [page],
  );
}

/**
 * The college directory: a server-rendered first page handed off to client-side filtering. Every
 * filter (search, taluka, streams, management, sort, page) lives in the URL, so a filtered list is
 * shareable and back-button safe. The side panel edits a draft that applies on "Apply filters"; the
 * chips and toolbar apply at once.
 */
export function CollegeDirectory({
  initialColleges,
  initialMeta,
  initialQuery,
  facets,
}: CollegeDirectoryProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState<DirectoryQuery>(initialQuery);
  const [qInput, setQInput] = useState(initialQuery.q);
  const [draft, setDraft] = useState({
    city: initialQuery.city,
    stream: initialQuery.stream,
    management: initialQuery.management,
  });
  const [colleges, setColleges] = useState(initialColleges);
  const [meta, setMeta] = useState(initialMeta);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const isFirstRun = useRef(true);

  // The search box commits 300 ms after typing stops, and always back to page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((current) =>
        current.q === qInput.trim() ? current : { ...current, q: qInput.trim(), page: 1 },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const search = new URLSearchParams();
    if (query.q) search.set('q', query.q);
    if (query.city) search.set('city', query.city);
    if (query.stream.length) search.set('stream', query.stream.join(','));
    if (query.management.length) search.set('management', query.management.join(','));
    if (query.sort !== 'name') search.set('sort', query.sort);
    if (query.page > 1) search.set('page', String(query.page));
    const suffix = search.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });

    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    collegesService
      .list(
        {
          ...(query.q ? { q: query.q } : {}),
          ...(query.city ? { city: query.city } : {}),
          stream: query.stream,
          management: query.management,
          sort: query.sort,
          page: query.page,
          limit: DIRECTORY_PAGE_SIZE,
        },
        controller.signal,
      )
      .then((result) => {
        setColleges(result.data);
        setMeta(
          result.meta ?? {
            page: query.page,
            limit: DIRECTORY_PAGE_SIZE,
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
  }, [query, retryCount, pathname, router]);

  function apply(change: Partial<DirectoryQuery>) {
    const next = { ...query, ...change, page: change.page ?? 1 };
    setQuery(next);
    setDraft({ city: next.city, stream: next.stream, management: next.management });
    if (change.page)
      document.getElementById('college-results')?.scrollIntoView({ behavior: 'smooth' });
  }

  const clearAll = () => {
    setQInput('');
    apply({ q: '', city: '', stream: [], management: [] });
  };

  const streamCounts = facets?.streams.filter((stream) => stream.count > 0) ?? [];
  const draftDirty =
    draft.city !== query.city ||
    !sameSet(draft.stream, query.stream) ||
    !sameSet(draft.management, query.management);
  const first = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.total, meta.page * meta.limit);
  const hasFilters = Boolean(
    query.q || query.city || query.stream.length || query.management.length,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Results ────────────────────────────────────────────────────────────────────── */}
      <div id="college-results" className="flex min-w-0 scroll-mt-6 flex-col gap-5">
        <div className={`${PANEL} flex flex-col gap-4`}>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_200px]">
            <label className="relative block">
              <span className="sr-only">Search colleges</span>
              <Icon
                name="search"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={qInput}
                onChange={(event) => setQInput(event.target.value)}
                placeholder="Search college by name or town…"
                className="h-11 w-full rounded-md border border-control bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted"
              />
            </label>
            <label className="block">
              <span className="sr-only">Taluka</span>
              <select
                value={query.city}
                onChange={(event) => apply({ city: event.target.value })}
                className={SELECT}
              >
                <option value="">All talukas</option>
                {facets?.cities.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name} ({city.count})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Sort by</span>
              <select
                value={query.sort}
                onChange={(event) => apply({ sort: event.target.value as Sort })}
                className={SELECT}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort: {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {streamCounts.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by stream">
              <button
                type="button"
                aria-pressed={query.stream.length === 0}
                onClick={() => apply({ stream: [] })}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  query.stream.length === 0
                    ? 'border-accent-600 bg-accent-600 text-white'
                    : 'border-line bg-surface text-body hover:border-control'
                }`}
              >
                All ({facets?.total ?? meta.total})
              </button>
              {streamCounts.map((stream) => {
                const active = query.stream.length === 1 && query.stream[0] === stream.key;
                return (
                  <button
                    key={stream.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => apply({ stream: active ? [] : [stream.key] })}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'border-accent-600 bg-accent-600 text-white'
                        : 'border-line bg-surface text-body hover:border-control'
                    }`}
                  >
                    <Icon name={STREAM_STYLE[stream.key].icon} className="size-3.5" />
                    {stream.label} ({stream.count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {status === 'error' && error ? (
          <ErrorState
            message={error.message}
            requestId={error.requestId}
            onRetry={() => setRetryCount((n) => n + 1)}
          />
        ) : status === 'loading' ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <CollegeCardSkeleton key={index} />
            ))}
          </div>
        ) : colleges.length === 0 ? (
          <EmptyState
            title={query.q ? `No colleges match "${query.q}".` : 'No colleges match these filters.'}
            description="Try another name or clear a filter."
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearAll}>
                  Clear all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {colleges.map((college) => (
                <CollegeCard key={college.id} college={college} />
              ))}
            </div>

            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              {meta.totalPages > 1 ? (
                <nav aria-label="Pages" className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={meta.page <= 1}
                    onClick={() => apply({ page: meta.page - 1 })}
                    className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-body hover:border-control disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <Icon name="arrowLeft" className="size-4" />
                  </button>
                  {pageItems(meta.page, meta.totalPages).map((item, index) =>
                    item === 'gap' ? (
                      <span key={`gap-${index}`} className="px-1 text-muted">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        aria-current={item === meta.page ? 'page' : undefined}
                        onClick={() => apply({ page: item })}
                        className={`flex size-9 items-center justify-center rounded-full text-sm font-medium ${
                          item === meta.page
                            ? 'bg-accent-600 text-white'
                            : 'border border-line bg-surface text-body hover:border-control'
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => apply({ page: meta.page + 1 })}
                    className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-body hover:border-control disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <Icon name="arrowRight" className="size-4" />
                  </button>
                </nav>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted">
                Showing {first}–{last} of {meta.total} {meta.total === 1 ? 'college' : 'colleges'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Side panel ─────────────────────────────────────────────────────────────────── */}
      <aside className="flex flex-col gap-6">
        {facets && (
          <section aria-labelledby="filters-heading" className={PANEL}>
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="filters-heading"
                className="flex items-center gap-2 text-lg font-bold text-ink"
              >
                <Icon name="target" className="size-5 text-accent-700" />
                Filter colleges
              </h2>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-medium text-action hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-2 text-sm font-semibold text-ink">
                By location
                <select
                  value={draft.city}
                  onChange={(event) => setDraft((d) => ({ ...d, city: event.target.value }))}
                  className={`${SELECT} font-normal`}
                >
                  <option value="">Select taluka</option>
                  {facets.cities.map((city) => (
                    <option key={city.name} value={city.name}>
                      {city.name} ({city.count})
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold text-ink">By course type</legend>
                {facets.streams
                  .filter((stream) => stream.count > 0)
                  .map((stream) => (
                    <label
                      key={stream.key}
                      className="flex cursor-pointer items-center gap-2.5 text-sm text-body"
                    >
                      <input
                        type="checkbox"
                        checked={draft.stream.includes(stream.key)}
                        onChange={() =>
                          setDraft((d) => ({ ...d, stream: toggle(d.stream, stream.key) }))
                        }
                        className="size-4 rounded border-control accent-accent-600"
                      />
                      {stream.label} <span className="text-muted">({stream.count})</span>
                    </label>
                  ))}
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold text-ink">By management</legend>
                {facets.management
                  .filter((entry) => entry.count > 0)
                  .map((entry) => (
                    <label
                      key={entry.key}
                      className="flex cursor-pointer items-center gap-2.5 text-sm text-body"
                    >
                      <input
                        type="checkbox"
                        checked={draft.management.includes(entry.key)}
                        onChange={() =>
                          setDraft((d) => ({ ...d, management: toggle(d.management, entry.key) }))
                        }
                        className="size-4 rounded border-control accent-accent-600"
                      />
                      {entry.label} <span className="text-muted">({entry.count})</span>
                    </label>
                  ))}
              </fieldset>

              <button
                type="button"
                disabled={!draftDirty}
                onClick={() =>
                  apply({ city: draft.city, stream: draft.stream, management: draft.management })
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent-600 text-sm font-semibold text-white transition-colors hover:bg-accent-650 disabled:opacity-50"
              >
                <Icon name="check" className="size-4" />
                Apply filters
              </button>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-line bg-gradient-to-br from-accent-50 to-surface p-5 shadow-xs">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface text-primary-700 shadow-xs">
            <Icon name="graduation" className="size-6" />
          </span>
          <h2 className="text-lg font-bold text-ink">Not sure which college is right for you?</h2>
          <p className="mt-1 text-sm text-body">
            Filter by course and taluka, then open a college to see the hostels, messes and buses
            around it.
          </p>
          <Link
            href={`${ROUTES.home}#how-it-works`}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-action text-sm font-semibold text-action hover:bg-primary-50"
          >
            How it works <Icon name="arrowRight" className="size-4" />
          </Link>
        </section>

        <section aria-labelledby="links-heading" className={PANEL}>
          <h2
            id="links-heading"
            className="mb-3 flex items-center gap-2 text-lg font-bold text-ink"
          >
            <Icon name="star" className="size-5 text-amber-600" />
            Quick links
          </h2>
          <ul className="flex flex-col">
            {(
              [
                { href: ROUTES.colleges, label: 'View all colleges', icon: 'building' },
                { href: ROUTES.search, label: 'Search places', icon: 'search' },
                {
                  href: `${ROUTES.search}?category=hostels`,
                  label: 'Hostels near colleges',
                  icon: 'bed',
                },
                { href: ROUTES.suggestPlace, label: 'Suggest a place', icon: 'pin' },
              ] satisfies Array<{ href: string; label: string; icon: IconName }>
            ).map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  onClick={link.href === ROUTES.colleges ? clearAll : undefined}
                  className="flex items-center gap-3 rounded-md px-1 py-2.5 text-sm text-body hover:text-action"
                >
                  <Icon name={link.icon} className="size-4 text-muted" />
                  {link.label}
                  <Icon name="chevronRight" className="ml-auto size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary-800 to-accent-700 p-5 text-white shadow-md">
          <h2 className="text-lg font-bold">Explore nearby amenities</h2>
          <p className="mt-1 text-sm text-white/80">
            Find messes, PGs, hostels, libraries and more near your college.
          </p>
          <Link
            href={ROUTES.search}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-white/60 px-4 text-sm font-semibold hover:bg-white/10"
          >
            Explore now <Icon name="arrowRight" className="size-4" />
          </Link>
        </section>
      </aside>
    </div>
  );
}
