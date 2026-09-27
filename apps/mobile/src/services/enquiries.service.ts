import { leadReceiptSchema, type CreateLeadRequest } from '@platform/contracts';
import { apiClient } from '@/lib/api';

export const enquiriesService = {
  /** `POST /places/:idOrSlug/enquiries`: students only; the place must accept enquiries. */
  send: (placeIdOrSlug: string, dto: CreateLeadRequest) =>
    apiClient.post(`/places/${encodeURIComponent(placeIdOrSlug)}/enquiries`, {
      body: dto,
      schema: leadReceiptSchema,
    }),
};
