import type { PublicReview, Review, ReviewStatus } from '@platform/contracts';
import { displayName } from './review-rules.js';

/**
 * Row -> response mapping, field by field (mirrors `place-mappers.ts`): a response is built from an
 * explicit list, never a spread, so a column added later cannot leak into the API by accident.
 */

export interface DimensionRatingRow {
  rating: number;
  dimension: { id: string; key: string; label: string };
}

export interface PublicReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  user: { name: string };
  ratings: DimensionRatingRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewRow extends PublicReviewRow {
  place: { id: string; slug: string; name: string };
  userId: string;
  status: ReviewStatus;
  moderationNote: string | null;
  moderatedById: string | null;
  moderatedAt: Date | null;
}

export function toPublicReview(row: PublicReviewRow): PublicReview {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    authorName: displayName(row.user.name),
    dimensionRatings: row.ratings.map((entry) => ({
      dimensionId: entry.dimension.id,
      key: entry.dimension.key,
      label: entry.dimension.label,
      rating: entry.rating,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toReview(row: ReviewRow): Review {
  return {
    ...toPublicReview(row),
    place: { id: row.place.id, slug: row.place.slug, name: row.place.name },
    userId: row.userId,
    status: row.status,
    moderationNote: row.moderationNote,
    moderatedById: row.moderatedById,
    moderatedAt: row.moderatedAt ? row.moderatedAt.toISOString() : null,
  };
}
