'use client';

import type { BusinessListing } from '@platform/contracts';
import { useEffect } from 'react';

const SELECT_CLASSES = 'h-10 rounded-md border border-control bg-surface px-3 text-sm text-ink';

/** The listing whose services are being managed. Live listings first; hidden when there is one. */
export function PlacePicker({
  listings,
  value,
  onChange,
}: {
  listings: BusinessListing[];
  value: string;
  onChange: (placeId: string) => void;
}) {
  const ordered = [...listings].sort(
    (a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'),
  );
  const first = ordered[0]?.id ?? '';

  useEffect(() => {
    if (!value && first) onChange(first);
  }, [value, first, onChange]);

  if (ordered.length <= 1) return null;
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-ink">
      Listing
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASSES}
      >
        {ordered.map((listing) => (
          <option key={listing.id} value={listing.id}>
            {listing.name}
            {listing.status === 'ACTIVE' ? '' : ' (not live yet)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A note shown on service panels while the selected listing is not live. */
export function NotLiveNote({ listing }: { listing: BusinessListing | undefined }) {
  if (!listing || listing.status === 'ACTIVE') return null;
  return (
    <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-600">
      {listing.name} is not live yet. You can set things up now; students see them once our team
      approves the listing.
    </p>
  );
}
