import { placeCardSchema, savedPlaceIdsSchema, savedPlaceStateSchema } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

/** My bookmarked places (`/me/saved-places`). Needs a session. */
export const savedPlacesService = {
  list: (signal?: AbortSignal) =>
    apiClient.get('/me/saved-places', { schema: z.array(placeCardSchema), signal }),

  ids: (signal?: AbortSignal) =>
    apiClient.get('/me/saved-places/ids', { schema: savedPlaceIdsSchema, signal }),

  save: (placeId: string) =>
    apiClient.put(`/me/saved-places/${encodeURIComponent(placeId)}`, {
      schema: savedPlaceStateSchema,
    }),

  unsave: (placeId: string) =>
    apiClient.delete(`/me/saved-places/${encodeURIComponent(placeId)}`, {
      schema: savedPlaceStateSchema,
    }),
};
