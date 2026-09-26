import {
  LISTING_CATEGORY_LABELS,
  LISTING_CONDITION_LABELS,
  type ListingCard as ListingCardData,
  type ListingStatus,
} from '@platform/contracts';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ROUTES } from '@/constants/routes';
import { timeAgo } from '@/lib/format/time';

const rupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function formatPrice(price: number): string {
  return price === 0 ? 'Free' : rupees.format(price);
}

export const STATUS_LABELS: Record<ListingStatus, string> = {
  ACTIVE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  EXPIRED: 'Expired',
  HIDDEN: 'Under review',
  REMOVED: 'Deleted',
};

export function StatusPill({ status }: { status: ListingStatus }) {
  if (status === 'ACTIVE') return null;
  const tone =
    status === 'RESERVED'
      ? 'bg-accent-50 text-accent-700'
      : status === 'SOLD'
        ? 'bg-success-50 text-success-700'
        : 'bg-subtle text-body';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/** A photo, or a drawn placeholder that says there is none (never a random stock image). */
export function ListingImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-subtle text-muted">
        <Icon name="image" className="size-8" />
        <span className="text-xs">No photo</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the API host.
  return <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />;
}

export function ListingCard({ listing }: { listing: ListingCardData }) {
  return (
    <Link
      href={ROUTES.marketplaceListing(listing.id)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs hover:border-action"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <ListingImage src={listing.coverImageUrl} alt={listing.title} />
        <span className="absolute left-2 top-2">
          <StatusPill status={listing.status} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-lg font-bold text-ink">
          {formatPrice(listing.price)}
          {listing.negotiable && listing.price > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted">negotiable</span>
          )}
        </p>
        <h2 className="line-clamp-2 text-sm font-medium text-ink group-hover:text-action">
          {listing.title}
        </h2>
        <p className="text-xs text-muted">
          {LISTING_CATEGORY_LABELS[listing.category]} ·{' '}
          {LISTING_CONDITION_LABELS[listing.condition]}
        </p>
        <p className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted">
          <Icon name="graduation" className="size-3.5 shrink-0" />
          <span className="truncate">
            {listing.college.name}
            {listing.distanceKm !== null && ` · ${listing.distanceKm} km`}
          </span>
        </p>
        <p className="text-xs text-muted">{timeAgo(listing.createdAt)}</p>
      </div>
    </Link>
  );
}
