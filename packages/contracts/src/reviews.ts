import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';
import { multiLineField, singleLineField, uuidSchema } from './text.js';

/**
 * Reviews: a student rates a place (overall 1-5, plus optional per-dimension ratings such as Mess
 * -> Food / Price / Hygiene, which come from the place's categories), may edit or withdraw their own
 * review, and staff hide, restore or remove reviews. A deliberately narrower slice of the original
 * design ([02 §5.9](../../docs/02-architecture.md#59-reviews)): no review photos (there is no upload
 * abstraction and no review-image table), no owner replies (no `review_replies` table, and business
 * owners arrive in a later phase), no review reports (the Reports phase), and no stored
 * `rating_stats` JSON (the histogram and dimension averages are computed on read). See
 * [02 §5.9 "Implemented in Phase 9"](../../docs/02-architecture.md#59-reviews) for the full list.
 */

// Matches the Prisma `ReviewStatus` enum exactly (Phase 2 migration). `REPORTED` belongs to the
// Reports phase and is never set by this API; it is treated like `PUBLISHED` wherever it appears.
export const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN', 'REPORTED', 'REMOVED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

export const REVIEW_SORTS = ['recent', 'highest', 'lowest'] as const;
export const ADMIN_REVIEW_SORTS = ['newest', 'oldest'] as const;

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_REVIEW_COMMENT_LENGTH = 2000;
/** More than any category defines today; bounds the request, the server checks the real list. */
export const MAX_DIMENSION_RATINGS = 10;

export const ratingValueSchema = z
  .number()
  .int('Use a whole number of stars')
  .min(MIN_RATING, `Use ${MIN_RATING} to ${MAX_RATING} stars`)
  .max(MAX_RATING, `Use ${MIN_RATING} to ${MAX_RATING} stars`)
  .meta({ example: 4 });

// ── Writing ──────────────────────────────────────────────────────────────────────────────────────

export const dimensionRatingInputSchema = z.strictObject({
  dimensionId: uuidSchema,
  rating: ratingValueSchema,
});
export type DimensionRatingInput = z.output<typeof dimensionRatingInputSchema>;

const dimensionRatingsSchema = z
  .array(dimensionRatingInputSchema)
  .max(MAX_DIMENSION_RATINGS)
  .check((ctx) => {
    const seen = new Set<string>();
    ctx.value.forEach((entry, index) => {
      if (seen.has(entry.dimensionId)) {
        ctx.issues.push({
          code: 'custom',
          message: 'Rate each dimension at most once',
          input: ctx.value,
          path: [index, 'dimensionId'],
        });
      }
      seen.add(entry.dimensionId);
    });
  });

const commentSchema = multiLineField('Comment', MAX_REVIEW_COMMENT_LENGTH).meta({
  example: 'Good food, fair price. Gets crowded at 1 pm.',
});

/**
 * `POST /places/:idOrSlug/reviews`. One review per user per place: a second one is a `409
 * ALREADY_REVIEWED` (edit the existing one instead). `dimensionRatings` may only name dimensions of
 * the place's own categories (listed by `GET /places/:idOrSlug/reviews/summary`).
 */
export const createReviewRequestSchema = z.strictObject({
  rating: ratingValueSchema,
  comment: commentSchema.optional(),
  dimensionRatings: dimensionRatingsSchema.default([]),
});
export type CreateReviewRequest = z.output<typeof createReviewRequestSchema>;

/**
 * `PATCH /reviews/:id`. Only what is sent changes. `comment: null` clears the comment;
 * `dimensionRatings` REPLACES the whole set (send `[]` to clear it), it is not merged.
 */
export const updateReviewRequestSchema = z
  .strictObject({
    rating: ratingValueSchema.optional(),
    comment: commentSchema.nullable().optional(),
    dimensionRatings: dimensionRatingsSchema.optional(),
  })
  .check((ctx) => {
    const { rating, comment, dimensionRatings } = ctx.value;
    if (rating === undefined && comment === undefined && dimensionRatings === undefined) {
      ctx.issues.push({
        code: 'custom',
        message: 'Send at least one of rating, comment or dimensionRatings',
        input: ctx.value,
        path: [],
      });
    }
  });
export type UpdateReviewRequest = z.output<typeof updateReviewRequestSchema>;

// ── Reading ──────────────────────────────────────────────────────────────────────────────────────

export const reviewDimensionRatingSchema = z.object({
  dimensionId: z.string(),
  key: z.string(),
  label: z.string(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
});
export type ReviewDimensionRating = z.infer<typeof reviewDimensionRatingSchema>;

/**
 * A review as the public sees it. The author is shown by a privacy-preserving display name only
 * ("Asha K."): never their id, email or full surname.
 */
export const publicReviewSchema = z.object({
  id: z.string(),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  comment: z.string().nullable(),
  authorName: z.string(),
  dimensionRatings: z.array(reviewDimensionRatingSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PublicReview = z.infer<typeof publicReviewSchema>;

export const reviewPlaceSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});
export type ReviewPlaceSummary = z.infer<typeof reviewPlaceSummarySchema>;

/**
 * A review with its moderation state: what the author sees of their own reviews, and what staff
 * see. The same shape for both (as with submissions), since nothing in it is staff-only beyond the
 * moderator's id, which the author is already told about through `status` and `moderationNote`.
 */
export const reviewSchema = publicReviewSchema.extend({
  place: reviewPlaceSummarySchema,
  userId: z.string(),
  status: reviewStatusSchema,
  moderationNote: z.string().nullable(),
  moderatedById: z.string().nullable(),
  moderatedAt: z.string().nullable(),
});
export type Review = z.infer<typeof reviewSchema>;

export const ratingHistogramEntrySchema = z.object({
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  count: z.number().int().min(0),
});

export const ratingDimensionSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  /** Average of published reviews that rated this dimension; null when none has yet. */
  average: z.number().min(0).max(MAX_RATING).nullable(),
  count: z.number().int().min(0),
});
export type RatingDimensionSummary = z.infer<typeof ratingDimensionSummarySchema>;

/**
 * `GET /places/:idOrSlug/reviews/summary`. `ratingAverage`/`ratingCount` are the same stored values
 * as on the place itself; `histogram` always lists 5 down to 1 (zeros included); `dimensions` lists
 * every dimension a reviewer of this place may rate, in display order, rated or not.
 */
export const reviewSummarySchema = z.object({
  ratingAverage: z.number().min(0).max(MAX_RATING),
  ratingCount: z.number().int().min(0),
  histogram: z.array(ratingHistogramEntrySchema),
  dimensions: z.array(ratingDimensionSummarySchema),
});
export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

/** `DELETE /reviews/:id`: the place's rating after the review was withdrawn. */
export const reviewWithdrawnSchema = z.object({
  placeId: z.string(),
  ratingAverage: z.number().min(0).max(MAX_RATING),
  ratingCount: z.number().int().min(0),
});
export type ReviewWithdrawn = z.infer<typeof reviewWithdrawnSchema>;

export const listPlaceReviewsQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(REVIEW_SORTS).default('recent'),
});
export type ListPlaceReviewsQuery = z.output<typeof listPlaceReviewsQuerySchema>;

/** `GET /me/reviews`. `placeId` answers "have I already reviewed this place?" in one call. */
export const listMyReviewsQuerySchema = paginationQuerySchema.extend({
  placeId: uuidSchema.optional(),
});
export type ListMyReviewsQuery = z.output<typeof listMyReviewsQuerySchema>;

export const adminListReviewsQuerySchema = paginationQuerySchema.extend({
  status: reviewStatusSchema.optional(),
  placeId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  sort: z.enum(ADMIN_REVIEW_SORTS).default('newest'),
});
export type AdminListReviewsQuery = z.output<typeof adminListReviewsQuerySchema>;

// ── Staff moderation ─────────────────────────────────────────────────────────────────────────────

const reasonField = singleLineField('Reason', 500);

/** `POST /admin/reviews/:id/hide`. Reversible (`restore`); the author sees the reason. */
export const hideReviewRequestSchema = z.strictObject({
  reason: reasonField.meta({ example: 'Personal information in the comment' }),
});
export type HideReviewRequest = z.output<typeof hideReviewRequestSchema>;

/** `POST /admin/reviews/:id/restore`. */
export const restoreReviewRequestSchema = z
  .strictObject({
    reason: reasonField.optional().meta({ example: 'Edited by the author' }),
  })
  .optional();
export type RestoreReviewRequest = z.output<typeof restoreReviewRequestSchema>;

/** `POST /admin/reviews/:id/remove`. Final: the row is kept (legal hold, audit) but never shown again. */
export const removeReviewRequestSchema = z.strictObject({
  reason: reasonField.meta({ example: 'Spam' }),
});
export type RemoveReviewRequest = z.output<typeof removeReviewRequestSchema>;
