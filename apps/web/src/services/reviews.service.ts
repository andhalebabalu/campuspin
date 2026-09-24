import {
  publicReviewSchema,
  reviewSchema,
  reviewSummarySchema,
  reviewWithdrawnSchema,
  type CreateReviewRequest,
  type REVIEW_SORTS,
  type UpdateReviewRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const publicReviewListSchema = z.array(publicReviewSchema);
const reviewListSchema = z.array(reviewSchema);

const place = (idOrSlug: string) => `/places/${encodeURIComponent(idOrSlug)}`;

export const reviewsService = {
  /** `GET /places/:idOrSlug/reviews`: published reviews, paginated (public, never cached — a new review shows at once). */
  listForPlace: (
    idOrSlug: string,
    params: { sort?: (typeof REVIEW_SORTS)[number]; page?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get(`${place(idOrSlug)}/reviews`, {
      query: { ...params },
      schema: publicReviewListSchema,
      signal,
      init: { cache: 'no-store' },
    }),

  /** `GET /places/:idOrSlug/reviews/summary`: average, histogram and the dimensions a reviewer may rate. */
  summary: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`${place(idOrSlug)}/reviews/summary`, {
      schema: reviewSummarySchema,
      signal,
      init: { cache: 'no-store' },
    }),

  /** `GET /me/reviews?placeId=`: the caller's own review of one place (0 or 1 items). Needs a session. */
  mineForPlace: (placeId: string, signal?: AbortSignal) =>
    apiClient.get('/me/reviews', {
      query: { placeId, limit: 1 },
      schema: reviewListSchema,
      signal,
      init: { cache: 'no-store' },
    }),

  /** `POST /places/:idOrSlug/reviews`: students only. `409 ALREADY_REVIEWED` if one exists. */
  create: (idOrSlug: string, dto: CreateReviewRequest, signal?: AbortSignal) =>
    apiClient.post(`${place(idOrSlug)}/reviews`, { body: dto, schema: reviewSchema, signal }),

  /** `PATCH /reviews/:id`: the author only, while the review is published. */
  update: (id: string, dto: UpdateReviewRequest, signal?: AbortSignal) =>
    apiClient.patch(`/reviews/${encodeURIComponent(id)}`, {
      body: dto,
      schema: reviewSchema,
      signal,
    }),

  /** `DELETE /reviews/:id`: withdraws the author's own review; returns the place's new rating. */
  withdraw: (id: string, signal?: AbortSignal) =>
    apiClient.delete(`/reviews/${encodeURIComponent(id)}`, {
      schema: reviewWithdrawnSchema,
      signal,
    }),
};
