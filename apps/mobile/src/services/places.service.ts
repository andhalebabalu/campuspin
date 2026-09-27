import { placeCardSchema, placeDetailSchema, type PLACE_SORTS } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

export interface PlaceListParams {
  q?: string;
  city?: string;
  collegeSlug?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  /** 1-5: at least this review average. Unrated places never match. */
  minRating?: number;
  /** Sent as the literal string `true` when set; omitted entirely otherwise (the API rejects any
   * other value for this flag, so a plain `false` must never be sent). */
  verified?: true;
  sort?: (typeof PLACE_SORTS)[number];
  page?: number;
  limit?: number;
}

const placeListSchema = z.array(placeCardSchema);

export const placesService = {
  /** `GET /places`: active places as cards, paginated (public, cacheable). */
  list: (params: PlaceListParams = {}, signal?: AbortSignal) =>
    apiClient.get('/places', {
      query: { ...params, verified: params.verified ? 'true' : undefined },
      schema: placeListSchema,
      signal,
    }),

  /** `GET /places/:idOrSlug`: one active place with everything about it (public, cacheable). */
  getBySlug: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/places/${encodeURIComponent(idOrSlug)}`, {
      schema: placeDetailSchema,
      signal,
    }),
};
