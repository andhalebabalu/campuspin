import type { PlaceCard as PlaceCardData } from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { CATEGORY_TONES, categoryVisual } from '@/features/places/lib/category-visual';
import { SavePlaceButton } from '@/features/services/components/save-place-button';
import { categoryImage } from '@/utils/category-image';
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

/** "350 m", "1.2 km". */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

const PILL =
  'inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-xs font-semibold text-ink shadow-sm backdrop-blur';

/**
 * A place in a list: photo with its badges, category, name, where it is and the price. `saved`
 * shows the heart: pass the student's saved state (from `useSavedPlaceIds`) so a grid makes one
 * request, not one per card.
 */
export function PlaceCard({ place, saved }: { place: PlaceCardData; saved?: boolean }) {
  const fallback = categoryImage(place.primaryCategory?.slug, place.id);
  const image = place.coverImageUrl ?? fallback;
  const visual = categoryVisual(place.primaryCategory?.slug);
  const href = ROUTES.placeDetail(place.slug);
  const popular = !place.verified && place.ratingCount >= 25 && place.ratingAverage >= 4;

  return (
    <article
      data-reveal
      data-spotlight
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-subtle">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded cover or local stock photo.
          <img
            src={image}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-linear-to-br from-primary-50 to-accent-50 text-2xl font-bold text-primary-300">
            {initials(place.name)}
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
          {place.verified ? (
            <span className={`${PILL} !text-accent-600`}>
              <Icon name="shield" className="size-3.5" /> Verified
            </span>
          ) : popular ? (
            <span className={`${PILL} !bg-amber-600 !text-white`}>
              <Icon name="trending" className="size-3.5" /> Popular
            </span>
          ) : null}
          {!place.coverImageUrl && fallback && (
            <span className="rounded-full bg-ink/55 px-2 py-0.5 text-[10px] font-medium text-white">
              Illustrative photo
            </span>
          )}
        </div>

        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2">
          {place.distanceMeters !== null ? (
            <span className={PILL}>
              <Icon name="pin" className="size-3.5 text-body" />
              {formatDistance(place.distanceMeters)}
            </span>
          ) : (
            <span />
          )}
          {place.ratingCount > 0 && (
            <span className={PILL}>
              <Icon name="star" className="size-3.5 fill-current text-amber-600" />
              {place.ratingAverage.toFixed(1)}
              <span className="font-normal text-muted">({place.ratingCount})</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {place.primaryCategory && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-body">
            <span
              className={`inline-flex size-5 items-center justify-center rounded ${CATEGORY_TONES[visual.tone]}`}
            >
              <Icon name={visual.icon} className="size-3" />
            </span>
            {place.primaryCategory.name}
          </p>
        )}
        <h3 className="line-clamp-1 text-base font-bold text-primary-800">
          {/* The whole card is the link; the heart sits above it. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {place.name}
          </Link>
        </h3>
        <p className="line-clamp-1 text-sm text-body">
          {[place.city, place.state].filter(Boolean).join(', ')}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className="text-sm font-bold text-primary-800">
            {formatPrice(place.priceMin, place.priceMax, place.priceUnit)}
          </p>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white">
            <Icon name="arrowRight" className="size-4" />
          </span>
        </div>
      </div>

      {saved !== undefined && (
        <div className="absolute top-2.5 right-2.5 z-10">
          {/* Keyed by the state so it resets once the saved list has loaded. */}
          <SavePlaceButton
            key={String(saved)}
            placeId={place.id}
            initialSaved={saved}
            look="overlay"
          />
        </div>
      )}
    </article>
  );
}
