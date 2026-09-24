import type { PlaceDetail } from '@platform/contracts';
import { Badge, VerifiedBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PlaceReviews } from '@/features/reviews/components/place-reviews';
import { EnquiryForm } from './enquiry-form';
import { formatPrice } from '@/utils/format-price';

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function hoursLine(hour: PlaceDetail['hours'][number]): string {
  const day = DAY_LABELS[hour.dayOfWeek - 1] ?? `Day ${hour.dayOfWeek}`;
  if (hour.isClosed) return `${day}: Closed`;
  if (hour.is24Hours) return `${day}: Open 24 hours`;
  const slot = hour.slotLabel ? `${hour.slotLabel} ` : '';
  return `${day}: ${slot}${hour.openTime}–${hour.closeTime}`;
}

function directionsUrl(place: PlaceDetail): string {
  return (
    place.googleMapsUrl ??
    `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`
  );
}

export function PlaceDetailView({ place }: { place: PlaceDetail }) {
  const cover = place.coverImageUrl ?? place.images[0]?.imageUrl ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="aspect-[16/9] w-full overflow-hidden rounded-lg bg-subtle">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- foundation phase: no remote-image domains configured yet.
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-lg font-medium text-neutral-400">
            {place.name}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-ink">{place.name}</h1>
          {place.verified && <VerifiedBadge />}
        </div>
        {place.primaryCategory && <p className="text-body">{place.primaryCategory.name}</p>}
        <p className="text-body">
          {place.address}, {place.city}, {place.state}, {place.country}
        </p>
        <p className="text-lg font-semibold text-ink">
          {formatPrice(place.priceMin, place.priceMax, place.priceUnit)}
        </p>
        <a href="#reviews" className="w-fit text-sm text-muted underline-offset-2 hover:underline">
          {place.ratingCount > 0
            ? `★ ${place.ratingAverage.toFixed(1)} (${place.ratingCount} ${place.ratingCount === 1 ? 'review' : 'reviews'})`
            : 'No reviews yet'}
        </a>

        <a
          href={directionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 w-fit items-center justify-center rounded-md bg-action px-5 text-sm font-medium text-white transition-colors hover:bg-action-hover"
        >
          Open in Google Maps
        </a>
        {place.acceptsEnquiries && (
          <a
            href="#enquiry"
            className="inline-flex h-11 w-fit items-center justify-center rounded-md border border-control px-5 text-sm font-medium text-ink transition-colors hover:bg-subtle"
          >
            Send an enquiry
          </a>
        )}
      </div>

      {place.description && (
        <Card className="p-6">
          <p className="whitespace-pre-line text-body">{place.description}</p>
        </Card>
      )}

      {place.acceptsEnquiries && (
        <EnquiryForm placeId={place.id} placeSlug={place.slug} placeName={place.name} />
      )}

      {place.categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {place.categories.map((category) => (
            <Badge key={category.id} tone={category.isPrimary ? 'accent' : 'neutral'}>
              {category.name}
            </Badge>
          ))}
        </div>
      )}

      {place.amenities.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">Amenities</h2>
          <div className="flex flex-wrap gap-2">
            {place.amenities.map((amenity) => (
              <Badge key={amenity.id}>{amenity.name}</Badge>
            ))}
          </div>
        </div>
      )}

      {place.hours.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">Hours</h2>
          <ul className="flex flex-col gap-1 text-sm text-body">
            {place.hours.map((hour) => (
              <li key={hour.id}>{hoursLine(hour)}</li>
            ))}
          </ul>
        </div>
      )}

      {place.images.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-ink">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {place.images.map((image) => (
              <div key={image.id} className="aspect-square overflow-hidden rounded-md bg-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element -- foundation phase: no remote-image domains configured yet. */}
                <img
                  src={image.imageUrl}
                  alt={image.altText ?? `${place.name} — photo`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <PlaceReviews placeId={place.id} placeSlug={place.slug} />
    </div>
  );
}
