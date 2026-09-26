'use client';

import { ApiClientError } from '@platform/api-client';
import {
  LISTING_CATEGORIES,
  LISTING_CATEGORY_LABELS,
  type ListingCard as ListingCardData,
  type ListingCategory,
  type MarketplaceScope,
  type MarketplaceSort,
  type PageMeta,
} from '@platform/contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { useSession } from '@/lib/auth/session-context';
import { marketplaceService, type BrowseParams } from '@/services/marketplace.service';
import { ListingCard } from './listing-card';

const SELECT = 'h-10 rounded-md border border-control bg-surface px-3 text-sm text-ink';
const LINK_BUTTON =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-action px-4 text-sm font-medium text-white hover:bg-action-hover';

const SCOPES: Array<[MarketplaceScope, string]> = [
  ['my_college', 'My college'],
  ['nearby', 'Nearby colleges'],
  ['city', 'Whole city'],
];

/** Browse what verified students near my college are selling. */
export function MarketplaceBrowse() {
  const { user } = useSession();
  const [scope, setScope] = useState<MarketplaceScope>('nearby');
  const [category, setCategory] = useState<ListingCategory | ''>('');
  const [sort, setSort] = useState<MarketplaceSort>('newest');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ListingCardData[] | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params: BrowseParams = {
      scope,
      sort,
      page,
      ...(category ? { category } : {}),
      ...(q ? { q } : {}),
      ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
    };
    marketplaceService
      .browse(params, controller.signal)
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
  }, [scope, category, sort, q, maxPrice, page, reload]);

  /** Any filter change starts again from page 1 with a fresh skeleton. */
  function refilter(apply: () => void) {
    setItems(null);
    setPage(1);
    apply();
  }

  function search(event: FormEvent) {
    event.preventDefault();
    refilter(() => setQ(qInput.trim()));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Student marketplace</h1>
          <p className="text-sm text-body">
            Buy and sell with verified students
            {user?.student.college ? ` of ${user.student.college.name} and nearby` : ''}. Chat in
            the app — your phone number stays private.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={ROUTES.marketplaceMine}
            className="inline-flex h-10 items-center rounded-md border border-control px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            My listings
          </Link>
          <Link href={ROUTES.marketplaceNew} className={LINK_BUTTON}>
            <Icon name="tag" className="size-4" /> Sell
          </Link>
        </div>
      </div>

      <form onSubmit={search} className="flex gap-2">
        <label htmlFor="market-search" className="sr-only">
          Search listings
        </label>
        <input
          id="market-search"
          type="search"
          placeholder="Search books, cycles, calculators…"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-control bg-surface px-3.5 text-base text-ink placeholder:text-muted"
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="How far"
          value={scope}
          onChange={(event) => refilter(() => setScope(event.target.value as MarketplaceScope))}
          className={SELECT}
        >
          {SCOPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(event) => refilter(() => setSort(event.target.value as MarketplaceSort))}
          className={SELECT}
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
        <select
          aria-label="Maximum price"
          value={maxPrice}
          onChange={(event) => refilter(() => setMaxPrice(event.target.value))}
          className={SELECT}
        >
          <option value="">Any price</option>
          <option value="0">Free</option>
          <option value="200">Under ₹200</option>
          <option value="500">Under ₹500</option>
          <option value="1000">Under ₹1,000</option>
          <option value="5000">Under ₹5,000</option>
        </select>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2 pb-1">
          {(['', ...LISTING_CATEGORIES] as const).map((value) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={category === value}
              onClick={() => refilter(() => setCategory(value))}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                category === value
                  ? 'border-action bg-action text-white'
                  : 'border-line bg-surface text-body hover:border-action'
              }`}
            >
              {value ? LISTING_CATEGORY_LABELS[value] : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => refilter(() => setReload((n) => n + 1))} />
      ) : !items ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-[3/4] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Try a wider area or another category, or be the first to sell something."
          action={
            <Link href={ROUTES.marketplaceNew} className={LINK_BUTTON}>
              Sell something
            </Link>
          }
        />
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
