import type { BusinessListing } from '@platform/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChipRow } from '@/components/ui';
import { businessService } from '@/services/business.service';

/**
 * The listing a business screen works on: the one chosen, else the first live one. Most owners have
 * a single listing, so the switcher only appears when there are several.
 */
export function usePlaceSelection() {
  const listings = useQuery({
    queryKey: ['business', 'listings'],
    queryFn: ({ signal }) => businessService.listings(signal).then((r) => r.data),
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const ordered = [...(listings.data ?? [])].sort(
    (a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE'),
  );
  const place: BusinessListing | undefined =
    ordered.find((listing) => listing.id === chosen) ?? ordered[0];
  return { listings, ordered, place, choose: setChosen };
}

export function PlaceSwitcher({
  ordered,
  place,
  choose,
}: Pick<ReturnType<typeof usePlaceSelection>, 'ordered' | 'place' | 'choose'>) {
  if (ordered.length <= 1 || !place) return null;
  return (
    <ChipRow
      options={ordered.map((listing) => ({ value: listing.id, label: listing.name }))}
      value={place.id}
      onChange={choose}
    />
  );
}
