import { promotionSchema, type PromotionEvent, type PromotionPlacement } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const id = (value: string) => encodeURIComponent(value);

/** In-app ads and announcements set by CampusPin staff. */
export const promotionsService = {
  live: (placement: PromotionPlacement, signal?: AbortSignal) =>
    apiClient.get('/promotions', { query: { placement }, schema: z.array(promotionSchema), signal }),
  /** Best effort: a lost count never bothers the member. */
  record: (promotionId: string, event: PromotionEvent) => {
    apiClient.post(`/promotions/${id(promotionId)}/${event}`, { schema: z.null() }).catch(() => undefined);
  },
};
