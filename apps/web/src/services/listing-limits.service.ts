import {
  adminMemberCreditsSchema,
  listingLimitSettingsSchema,
  type AdjustCreditsRequest,
  type UpdateListingLimitSettings,
} from '@platform/contracts';
import { apiClient } from '@/lib/api/client';

const id = (value: string) => encodeURIComponent(value);

/** Super admin: marketplace listing limits and students' listing credits (`settings.manage`). */
export const listingLimitsService = {
  settings: (signal?: AbortSignal) =>
    apiClient.get('/admin/settings/listing-limits', {
      schema: listingLimitSettingsSchema,
      signal,
      init: { cache: 'no-store' },
    }),
  updateSettings: (dto: UpdateListingLimitSettings) =>
    apiClient.patch('/admin/settings/listing-limits', {
      body: dto,
      schema: listingLimitSettingsSchema,
    }),
  credits: (userId: string, signal?: AbortSignal) =>
    apiClient.get(`/admin/users/${id(userId)}/listing-credits`, {
      schema: adminMemberCreditsSchema,
      signal,
      init: { cache: 'no-store' },
    }),
  adjust: (userId: string, dto: AdjustCreditsRequest) =>
    apiClient.post(`/admin/users/${id(userId)}/listing-credits`, {
      body: dto,
      schema: adminMemberCreditsSchema,
    }),
};
