import {
  adminPromotionSchema,
  type CreatePromotionRequest,
  type UpdatePromotionRequest,
} from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';

const id = (value: string) => encodeURIComponent(value);

/** Staff management of in-app ads and announcements (`promotions.manage`). */
export const promotionsAdminService = {
  list: (signal?: AbortSignal) =>
    apiClient.get('/admin/promotions', {
      schema: z.array(adminPromotionSchema),
      signal,
      init: { cache: 'no-store' },
    }),
  create: (dto: CreatePromotionRequest) =>
    apiClient.post('/admin/promotions', { body: dto, schema: adminPromotionSchema }),
  update: (promotionId: string, dto: UpdatePromotionRequest) =>
    apiClient.patch(`/admin/promotions/${id(promotionId)}`, { body: dto, schema: adminPromotionSchema }),
  remove: (promotionId: string) =>
    apiClient.delete(`/admin/promotions/${id(promotionId)}`, { schema: z.null() }),
};
