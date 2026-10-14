'use client';

import { ApiClientError } from '@platform/api-client';
import type {
  CategoryGroup,
  CollegeCard,
  PageMeta,
  PlaceCard as PlaceCardData,
} from '@platform/contracts';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Pagination } from '@/components/shared/pagination';
import { CollegePicker, type PickedCollege } from '@/features/colleges/components/college-picker';
import { PlaceCard } from '@/features/places/components/place-card';
import { PlaceCardSkeleton } from '@/features/places/components/place-card-skeleton';
import { CATEGORY_TONES, categoryVisual } from '@/features/places/lib/category-visual';
import { searchHref, toPlaceListParams, type Applied } from '@/features/search/lib/search-filters';
import { useSavedPlaceIds } from '@/features/services/components/save-place-button';
import { placesService } from '@/services/places.service';

/** Leaflet touches `window`: the map only ever renders in the browser. */
const ResultsMap = dynamic(
  () => import('@/features/search/components/results-map').then((mod) => mod.ResultsMap),
  { ssr: false, loading: () => <div className="h-[32rem] animate-pulse rounded-2xl bg-subtle" /> },
);

type Sort = Applied['sort'];
const SORT_OPTIONS: Array<{ value: Sort; label: string; needsCollege?: boolean }> = [
  { value: 'relevance', label: 'Best match' },
  { value: 'nearest', label: 'Nearest first', needsCollege: true },
  { value: 'rating', label: 'Top rated' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
];

/** The quick category chips. A group slug (e.g. `daily-needs`) means all of its categories. */
const CHIPS: Array<{ label: string; slug: string; icon?: IconName }> = [
  { label: 'Mess & Tiffin', slug: 'mess' },
  { label: 'Rooms & PG', slug: 'rooms' },
  { label: 'Hostel', slug: 'hostels' },
  { label: 'Libraries', slug: 'libraries' },
  { label: 'Cafes', slug: 'cafes' },
  { label: 'Gyms', slug: 'gyms' },
  { label: 'Xerox & Print', slug: 'xerox' },
  { label: 'Services', slug: 'daily-needs', icon: 'wrench' },
];

export interface SearchPageClientProps {
  initialApplied: Applied;
  initialPlaces: PlaceCardData[];
  initialMeta: PageMeta;
  /** Set when the server's own fetch was a 404 (an unknown category or college slug). */
  initialError?: string | null;
  categoryGroups: CategoryGroup[];
  /** Offered before anything is typed in the college box. */
  colleges: CollegeCard[];
  /** The college in the URL, so its name shows in the box. */
  selectedCollege?: PickedCollege | null;
}

const FIELD = 'h-14 w-full rounded-xl border border-line bg-surface text-sm text-ink';

/** A labelled control in the second filter row: icon, small label, the control itself. */
function FilterBox({
  icon,
  label,
  htmlFor,
  children,
}: {
  icon: ReactNode;
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex h-14 items-center gap-3 rounded-xl border border-line bg-surface px-3 focus-within:border-primary-400">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-primary-700">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={htmlFor} className="text-[11px] font-medium text-muted">
          {label}
        </label>
        {children}
      </span>
    </div>
  );
}

const INNER_SELECT =
  'w-full appearance-none truncate bg-transparent pr-5 text-sm font-semibold text-ink focus-visible:outline-none';

/**
 * The Discover page: a keyword search over places (ranked by real MySQL full-text relevance) that
 * doubles as a category/college/price/rating browser, with a grid or map of the results. With no
 * filters it lists the top places. Filters are synced to the URL, so a search is shareable and
 * back-button safe.
 */
export function SearchPageClient({
  initialApplied,
  initialPlaces,
  initialMeta,
  initialError = null,
  categoryGroups,
  colleges,
  selectedCollege = null,
}: SearchPageClientProps) {
  const router = useRouter();
  const ids = { category: useId(), min: useId(), max: useId(), rating: useId(), sort: useId() };
  const savedIds = useSavedPlaceIds();

  const [qInput, setQInput] = useState(initialApplied.q);
  const [pickedCollege, setPickedCollege] = useState<PickedCollege | null>(selectedCollege);
  const [minPriceInput, setMinPriceInput] = useState(initialApplied.minPrice);
  const [maxPriceInput, setMaxPriceInput] = useState(initialApplied.maxPrice);
  const [applied, setApplied] = useState<Applied>(initialApplied);
  const [places, setPlaces] = useState(initialPlaces);
  const [meta, setMeta] = useState(initialMeta);
  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>(
    initialError ? 'error' : 'idle',
  );
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(
    initialError ? { message: initialError } : null,
  );
  const [retryCount, setRetryCount] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);
  const isFirstRun = useRef(true);

  useEffect(() => {
    // The server already supplied the first page.
    if (isFirstRun.current) {
      isFirstRun.current = false;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable
  }, [applied, retryCount]);

  const update = (patch: Partial<Applied>) =>
    setApplied((current) => ({ ...current, page: 1, ...patch }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    update({
      q: qInput.trim(),
      minPrice: minPriceInput.trim(),
      maxPrice: maxPriceInput.trim(),
    });
  }

  function goToPage(page: number) {
    setApplied((current) => ({ ...current, page }));
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const collegeName = applied.college ? pickedCollege?.name : null;
  const sortSelect = (id?: string) => (
    <select
      id={id}
      value={applied.sort}
      onChange={(event) => update({ sort: event.target.value as Sort })}
      className={INNER_SELECT}
    >
      {SORT_OPTIONS.filter((option) => !option.needsCollege || applied.college).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Filters. */}
      <form
        onSubmit={handleSubmit}
        role="search"
        className="relative z-10 -mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-28px_rgb(4_35_73/0.35)] sm:p-6"
      >
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1.4fr_auto]">
          <div className="relative">
            <label htmlFor="search-q" className="sr-only">
              Search places
            </label>
            <span className="pointer-events-none absolute top-1/2 left-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Icon name="search" className="size-4" />
            </span>
            <input
              id="search-q"
              type="search"
              value={qInput}
              onChange={(event) => setQInput(event.target.value)}
              placeholder="Try “mess”, “library”, “PG”, “cafe”…"
              className={`${FIELD} pr-4 pl-14 placeholder:text-muted`}
            />
          </div>
          <CollegePicker
            value={applied.college ? pickedCollege : null}
            onChange={(college) => {
              setPickedCollege(college);
              update({ college: college?.slug ?? '' });
            }}
            suggestions={colleges}
            label="Select your college"
            hideLabel
            placeholder="Select your college"
            icon="graduation"
            inputClassName={`${FIELD} pr-10 pl-12`}
          />
          <button
            type="submit"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-primary-600 px-8 text-sm font-semibold text-white shadow-md shadow-primary-600/25 transition-colors hover:bg-primary-700"
          >
            Search Places
            <Icon name="arrowRight" className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr_1.3fr_auto]">
          <div className="col-span-2 md:col-span-1">
            <FilterBox
              icon={<Icon name="grid" className="size-4" />}
              label="Category"
              htmlFor={ids.category}
            >
              <select
                id={ids.category}
                value={applied.category}
                onChange={(event) => update({ category: event.target.value })}
                className={INNER_SELECT}
              >
                <option value="">Any category</option>
                {categoryGroups.map((group) => (
                  <optgroup key={group.id} label={group.name}>
                    <option value={group.slug}>All {group.name.toLowerCase()}</option>
                    {group.children.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FilterBox>
          </div>
          <FilterBox
            icon={<span className="text-sm font-bold">₹</span>}
            label="Min price (₹)"
            htmlFor={ids.min}
          >
            <input
              id={ids.min}
              type="number"
              min={0}
              inputMode="numeric"
              value={minPriceInput}
              onChange={(event) => setMinPriceInput(event.target.value)}
              placeholder="Any"
              className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-normal placeholder:text-muted focus-visible:outline-none"
            />
          </FilterBox>
          <FilterBox
            icon={<span className="text-sm font-bold">₹</span>}
            label="Max price (₹)"
            htmlFor={ids.max}
          >
            <input
              id={ids.max}
              type="number"
              min={0}
              inputMode="numeric"
              value={maxPriceInput}
              onChange={(event) => setMaxPriceInput(event.target.value)}
              placeholder="Any"
              className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-normal placeholder:text-muted focus-visible:outline-none"
            />
          </FilterBox>
          <FilterBox
            icon={<Icon name="star" className="size-4 fill-current text-amber-600" />}
            label="Rating"
            htmlFor={ids.rating}
          >
            <select
              id={ids.rating}
              value={applied.minRating}
              onChange={(event) => update({ minRating: event.target.value })}
              className={INNER_SELECT}
            >
              <option value="">Any rating</option>
              {['4', '3', '2'].map((stars) => (
                <option key={stars} value={stars}>
                  {stars}★ and up
                </option>
              ))}
            </select>
          </FilterBox>
          <FilterBox
            icon={<Icon name="filter" className="size-4" />}
            label="Sort by"
            htmlFor={ids.sort}
          >
            {sortSelect(ids.sort)}
          </FilterBox>
          <label className="flex h-14 cursor-pointer items-center gap-2.5 px-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={applied.verified}
              onChange={(event) => update({ verified: event.target.checked })}
              className="size-5 rounded accent-accent-600"
            />
            Verified only
          </label>
        </div>
      </form>

      {/* Category chips. */}
      <ul
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible"
        aria-label="Categories"
      >
        <li>
          <button
            type="button"
            onClick={() => update({ category: '' })}
            aria-pressed={applied.category === ''}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold whitespace-nowrap text-ink shadow-xs transition-colors hover:border-primary-200 aria-pressed:border-accent-600 aria-pressed:bg-accent-600 aria-pressed:text-white"
          >
            <Icon name="grid" className="size-4" />
            All
          </button>
        </li>
        {CHIPS.map((chip) => {
          const visual = categoryVisual(chip.slug);
          const active = applied.category === chip.slug;
          return (
            <li key={chip.slug}>
              <button
                type="button"
                onClick={() => update({ category: active ? '' : chip.slug })}
                aria-pressed={active}
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface py-1 pr-3.5 pl-1 text-sm font-semibold whitespace-nowrap text-ink shadow-xs transition-colors hover:border-primary-200 aria-pressed:border-accent-600 aria-pressed:bg-accent-50"
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full ${CATEGORY_TONES[visual.tone]}`}
                >
                  <Icon name={chip.icon ?? visual.icon} className="size-4" />
                </span>
                {chip.label}
              </button>
            </li>
          );
        })}
        <li>
          {/* Every other category is in the Category list above. */}
          <button
            type="button"
            onClick={() => {
              const select = document.getElementById(ids.category) as HTMLSelectElement | null;
              select?.focus();
              select?.showPicker?.();
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold whitespace-nowrap text-ink shadow-xs transition-colors hover:border-primary-200"
          >
            <Icon name="more" className="size-4" />
            More
          </button>
        </li>
      </ul>

      {/* Results. */}
      <section
        ref={resultsRef}
        aria-labelledby="results-title"
        className="flex scroll-mt-24 flex-col gap-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="results-title"
            className="text-xl font-extrabold text-primary-800 sm:text-2xl"
            aria-live="polite"
          >
            {status === 'loading'
              ? 'Finding places…'
              : `${meta.total.toLocaleString('en-IN')} ${meta.total === 1 ? 'place' : 'places'} found${
                  applied.q ? ` for “${applied.q}”` : ''
                }${collegeName ? ` near ${collegeName}` : ''}`}
          </h2>
          <div className="flex items-center gap-2">
            <div
              className="flex rounded-xl border border-line bg-surface p-1"
              role="group"
              aria-label="View"
            >
              {(
                [
                  ['grid', 'Grid', 'grid'],
                  ['map', 'Map', 'pin'],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  aria-pressed={view === value}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold text-body transition-colors aria-pressed:bg-primary-50 aria-pressed:text-primary-700"
                >
                  <Icon name={icon} className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="relative hidden h-11 items-center rounded-xl border border-line bg-surface pr-3 pl-3.5 sm:flex">
              <label htmlFor="results-sort" className="sr-only">
                Sort results
              </label>
              {sortSelect('results-sort')}
              <Icon
                name="chevronDown"
                className="pointer-events-none absolute right-3 size-4 text-muted"
              />
            </div>
          </div>
        </div>

        {status === 'error' && error ? (
          <ErrorState
            message={error.message}
            requestId={error.requestId}
            onRetry={() => setRetryCount((n) => n + 1)}
          />
        ) : status === 'loading' ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <PlaceCardSkeleton key={index} />
            ))}
          </div>
        ) : places.length === 0 ? (
          <EmptyState
            title={applied.q ? `No results for “${applied.q}”.` : 'Nothing matches these filters.'}
            description="Try a different search or clear a filter."
          />
        ) : view === 'map' ? (
          <ResultsMap places={places} />
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {places.map((place) => (
              <li key={place.id}>
                <PlaceCard place={place} saved={savedIds.has(place.id)} />
              </li>
            ))}
          </ul>
        )}

        {status !== 'error' && (
          <Pagination page={applied.page} totalPages={meta.totalPages} onChange={goToPage} />
        )}
      </section>
    </div>
  );
}
