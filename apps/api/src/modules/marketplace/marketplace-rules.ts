import type {
  ListingSellerAction,
  ListingStatus,
  ListingVisibility,
  MarketplaceScope,
} from '@platform/contracts';

/** A verified student browsing the marketplace, with their college's position. */
export interface Shopper {
  userId: string;
  collegeId: string;
  city: string;
  /** Colleges within the nearby radius of the shopper's college (their own included). */
  nearbyCollegeIds: string[];
  /** Members blocked either way. */
  hidden: string[];
}

interface ListingAudience {
  sellerId: string;
  collegeId: string;
  visibility: ListingVisibility;
  college: { city: string };
}

const sameCity = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Whether a listing's audience includes this shopper. The seller's own college always sees it;
 * NEARBY_COLLEGES adds colleges within the radius; CITY adds those plus the rest of the city.
 * The relation is symmetric (distance between the two colleges), so a buyer sees exactly the
 * listings whose sellers chose to reach them.
 */
export function inAudience(listing: ListingAudience, shopper: Shopper): boolean {
  if (shopper.hidden.includes(listing.sellerId)) return false;
  if (listing.collegeId === shopper.collegeId) return true;
  if (listing.visibility === 'MY_COLLEGE') return false;
  if (shopper.nearbyCollegeIds.includes(listing.collegeId)) return true;
  return listing.visibility === 'CITY' && sameCity(listing.college.city, shopper.city);
}

/**
 * The same rule as {@link inAudience}, as a database filter, narrowed by the browse scope the
 * shopper picked (my college / nearby / whole city).
 */
export function audienceWhere(shopper: Shopper, scope: MarketplaceScope) {
  const own = { collegeId: shopper.collegeId };
  if (scope === 'my_college') return own;
  const nearby = {
    visibility: { in: ['NEARBY_COLLEGES', 'CITY'] as ListingVisibility[] },
    collegeId: { in: shopper.nearbyCollegeIds },
  };
  if (scope === 'nearby') return { OR: [own, nearby] };
  return {
    OR: [own, nearby, { visibility: 'CITY' as const, college: { city: shopper.city } }],
  };
}

/** Listings past their end date read as EXPIRED even before a sweep updates the row. */
export function effectiveStatus(status: ListingStatus, expiresAt: Date, now = new Date()) {
  if ((status === 'ACTIVE' || status === 'RESERVED') && expiresAt <= now) return 'EXPIRED';
  return status;
}

/** Statuses a buyer can see a listing in (sold ones stay readable so old chats make sense). */
export const BROWSABLE_STATUSES: readonly ListingStatus[] = ['ACTIVE', 'RESERVED'];

/** Statuses in which a new conversation can start or a message be sent. */
export const MESSAGEABLE_STATUSES: readonly ListingStatus[] = ['ACTIVE', 'RESERVED', 'SOLD'];

/**
 * The status after a seller action, or null when the action does not apply. REMOVED and HIDDEN are
 * out of the seller's hands (deleted, or held by a moderator).
 */
export function nextStatus(
  current: ListingStatus,
  action: ListingSellerAction,
): ListingStatus | null {
  switch (action) {
    case 'reserve':
      return current === 'ACTIVE' ? 'RESERVED' : null;
    case 'unreserve':
      return current === 'RESERVED' ? 'ACTIVE' : null;
    case 'sold':
      return current === 'ACTIVE' || current === 'RESERVED' ? 'SOLD' : null;
    // Renewing moves the end date; an expired listing comes back as ACTIVE.
    case 'renew':
      if (current === 'EXPIRED') return 'ACTIVE';
      return current === 'ACTIVE' || current === 'RESERVED' ? current : null;
  }
}

/** Rounded kilometres, or null for the shopper's own college. */
export function roundedKm(meters: number | null): number | null {
  return meters === null ? null : Math.round(meters / 100) / 10;
}
