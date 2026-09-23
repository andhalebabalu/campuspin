import type { PlaceCard as PlaceCardData } from '@platform/contracts';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { VerifiedBadge } from '@/components/ui/badge';
import { ROUTES } from '@/constants/routes';
import { formatPrice } from '@/utils/format-price';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function PlaceCard({ place }: { place: PlaceCardData }) {
  return (
    <Link href={ROUTES.placeDetail(place.slug)} className="block">
      <Card hover className="flex h-full flex-col overflow-hidden">
        <div className="aspect-[4/3] w-full bg-subtle">
          {place.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foundation phase: no remote-image domains configured yet.
            <img
              src={place.coverImageUrl}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-2xl font-bold text-neutral-400">
              {initials(place.name)}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-ink">{place.name}</h3>
            {place.verified && <VerifiedBadge />}
          </div>
          {place.primaryCategory && (
            <p className="text-sm text-body">{place.primaryCategory.name}</p>
          )}
          <p className="text-sm text-body">
            {place.city}, {place.state}
            {place.distanceMeters !== null && ` · ${(place.distanceMeters / 1000).toFixed(1)} km`}
          </p>
          <p className="mt-auto text-sm font-medium text-ink">
            {formatPrice(place.priceMin, place.priceMax, place.priceUnit)}
          </p>
        </div>
      </Card>
    </Link>
  );
}
