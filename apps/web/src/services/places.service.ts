import { placeCardSchema, placeDetailSchema, type PLACE_SORTS } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

export interface PlaceListParams {
  q?: string;
  city?: string;
  collegeSlug?: string;
  categorySlug?: string;
  sort?: (typeof PLACE_SORTS)[number];
  page?: number;
  limit?: number;
}

const placeListSchema = z.array(placeCardSchema);

export const placesService = {
  /** `GET /places`: active places as cards, paginated (public, cacheable). */
  list: (params: PlaceListParams = {}, signal?: AbortSignal) =>
    apiClient.get('/places', {
      query: { ...params },
      schema: placeListSchema,
      signal,
      init: { next: { revalidate: 60 } },
    }),

  /** `GET /places/:idOrSlug`: one active place with everything about it (public, cacheable). */
  getBySlug: (idOrSlug: string, signal?: AbortSignal) =>
    apiClient.get(`/places/${encodeURIComponent(idOrSlug)}`, {
      schema: placeDetailSchema,
      signal,
      init: { next: { revalidate: 300, tags: [`place:${idOrSlug}`] } },
    }),
};
