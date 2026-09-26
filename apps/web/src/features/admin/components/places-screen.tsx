'use client';

import {
  PLACE_STATUSES,
  VERIFICATION_STATUSES,
  type AdminPlaceListItem,
  type PlaceStatus,
  type VerificationStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { Skeleton } from '@/components/shared/skeleton';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';
import { adminService } from '@/services/admin.service';
import { formatPrice } from '@/utils/format-price';
import {
  AdminHeader,
  PRIMARY_LINK_CLASSES,
  Pagination,
  SEARCH_CLASSES,
  SELECT_CLASSES,
  useAdminList,
} from './admin-ui';

export const PLACE_STATUS: Record<PlaceStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Live', tone: 'success' },
  PENDING: { label: 'Pending review', tone: 'accent' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export function PlacesScreen() {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PlaceStatus | ''>('');
  const [verification, setVerification] = useState<VerificationStatus | ''>('');
  const [page, setPage] = useState(1);
  const list = useAdminList(
    (signal) =>
      adminService.places(
        {
          page,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
          ...(verification ? { verification } : {}),
        },
        signal,
      ),
    [q, status, verification, page],
  );

  return (
    <div>
      <AdminHeader
        title="Places"
        description="Every place in any state. Pending ones are approved from Submissions."
        action={
          <Link href={ROUTES.adminNewPlace} className={PRIMARY_LINK_CLASSES}>
            + New place
          </Link>
        }
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setQ(qInput.trim());
          setPage(1);
        }}
        className="mb-4 flex flex-wrap gap-3"
      >
        <input
          type="search"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
          placeholder="Name, address or city"
          aria-label="Search places"
          className={`${SEARCH_CLASSES} w-64`}
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as PlaceStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">All statuses</option>
          {PLACE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PLACE_STATUS[value].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Verification"
          value={verification}
          onChange={(event) => {
            setVerification(event.target.value as VerificationStatus | '');
            setPage(1);
          }}
          className={SELECT_CLASSES}
        >
          <option value="">Any verification</option>
          {VERIFICATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0) + value.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm" className="h-10">
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
        <EmptyState title="No places" description="No places match this search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((place) => (
            <li key={place.id}>
              <PlaceRow place={place} />
            </li>
          ))}
        </ul>
      )}
      <Pagination meta={list.meta} page={page} onPage={setPage} />
    </div>
  );
}

function PlaceRow({ place }: { place: AdminPlaceListItem }) {
  const status = PLACE_STATUS[place.status];
  return (
    <Link href={ROUTES.adminPlace(place.id)}>
      <Card hover className="flex items-center gap-4 p-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-md bg-subtle">
          {place.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, served by the API.
            <img src={place.coverImageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-ink">{place.name}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            {place.verified && <Badge tone="success">Verified</Badge>}
            {place.isDemo && <Badge>Demo</Badge>}
          </div>
          <span className="truncate text-sm text-body">
            {[place.primaryCategory?.name, place.city].filter(Boolean).join(' · ')} ·{' '}
            {formatPrice(place.priceMin, place.priceMax, place.priceUnit)}
          </span>
        </div>
        <span className="hidden shrink-0 text-sm text-muted sm:block">
          {place.ratingCount > 0
            ? `★ ${place.ratingAverage.toFixed(1)} (${place.ratingCount})`
            : ''}
        </span>
      </Card>
    </Link>
  );
}
