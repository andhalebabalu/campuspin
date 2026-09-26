'use client';

import { LISTING_STATUSES, type AdminListing, type ListingStatus } from '@platform/contracts';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import {
  ListingImage,
  STATUS_LABELS,
  formatPrice,
} from '@/features/marketplace/components/listing-card';
import { adminService } from '@/services/admin.service';
import {
  AdminHeader,
  Pagination,
  ReasonDialog,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  dateFormat,
  useAdminList,
  type ReasonRequest,
} from './admin-ui';

const TONE: Record<ListingStatus, BadgeTone> = {
  ACTIVE: 'success',
  RESERVED: 'accent',
  SOLD: 'neutral',
  EXPIRED: 'neutral',
  HIDDEN: 'accent',
  REMOVED: 'danger',
};

/** Every marketplace listing: hide (reversible), restore, or remove for good. */
export function MarketplaceModerationScreen({ initialReported }: { initialReported: boolean }) {
  const [status, setStatus] = useState<ListingStatus | ''>('');
  const [reported, setReported] = useState(initialReported);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ReasonRequest | null>(null);
  const list = useAdminList(
    (signal) =>
      adminService.marketplaceListings(
        {
          page,
          ...(status ? { status } : {}),
          ...(q ? { q } : {}),
          ...(reported ? { reported: 'true' as const } : {}),
        },
        signal,
      ),
    [status, q, reported, page],
  );
  const update = (next: AdminListing) => list.replace((item) => item.id === next.id, next);

  function search(event: FormEvent) {
    event.preventDefault();
    setQ(qInput.trim());
    setPage(1);
  }

  return (
    <div>
      <AdminHeader
        title="Marketplace"
        description="Listings from every college. Hiding tells the seller why and can be undone; removing is final."
      />
      <form onSubmit={search} className="mb-4 flex flex-wrap gap-2">
        <input
          aria-label="Search titles"
          placeholder="Search titles"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          className={`${SEARCH_CLASSES} w-56`}
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ListingStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {LISTING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={reported}
            onChange={(event) => {
              setReported(event.target.checked);
              setPage(1);
            }}
          />
          Reported only
        </label>
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
      </form>

      {list.error ? (
        <ErrorState
          message={list.error.message}
          requestId={list.error.requestId}
          onRetry={list.reload}
        />
      ) : !list.items ? (
        <Skeleton className="h-64 w-full" />
      ) : list.items.length === 0 ? (
        <EmptyState title="No listings" description="Nothing matches this filter." />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.items.map((listing) => (
            <li key={listing.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row">
                <span className="size-20 shrink-0 overflow-hidden rounded-lg border border-line">
                  <ListingImage src={listing.coverImageUrl} alt="" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[listing.status]}>{STATUS_LABELS[listing.status]}</Badge>
                    <span className="font-semibold text-ink">{formatPrice(listing.price)}</span>
                    {listing.openReports > 0 && (
                      <span className="text-xs font-medium text-danger-700">
                        {listing.openReports} open reports
                      </span>
                    )}
                  </div>
                  <Link
                    href={ROUTES.marketplaceListing(listing.id)}
                    target="_blank"
                    className="font-medium text-ink hover:text-action"
                  >
                    {listing.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {listing.seller.name} · {listing.college.name} ·{' '}
                    {dateFormat.format(new Date(listing.createdAt))}
                  </p>
                  <p className="line-clamp-2 text-sm text-body">{listing.description}</p>
                  {listing.moderationNote && (
                    <p className="text-sm text-muted">Moderation note: {listing.moderationNote}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {listing.status !== 'HIDDEN' && listing.status !== 'REMOVED' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDialog({
                          title: 'Hide this listing?',
                          description: 'Buyers stop seeing it; the seller sees your reason.',
                          confirmLabel: 'Hide',
                          required: true,
                          onConfirm: async (reason) =>
                            update(
                              (await adminService.listingAction(listing.id, 'hide', reason)).data,
                            ),
                        })
                      }
                    >
                      Hide
                    </Button>
                  )}
                  {listing.status === 'HIDDEN' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDialog({
                          title: 'Restore this listing?',
                          confirmLabel: 'Restore',
                          required: false,
                          onConfirm: async (reason) =>
                            update(
                              (
                                await adminService.listingAction(
                                  listing.id,
                                  'restore',
                                  reason || undefined,
                                )
                              ).data,
                            ),
                        })
                      }
                    >
                      Restore
                    </Button>
                  )}
                  {listing.status !== 'REMOVED' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        setDialog({
                          title: 'Remove this listing for good?',
                          description: 'This cannot be undone.',
                          confirmLabel: 'Remove',
                          required: true,
                          danger: true,
                          onConfirm: async (reason) =>
                            update(
                              (await adminService.listingAction(listing.id, 'remove', reason)).data,
                            ),
                        })
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
      <ReasonDialog request={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
