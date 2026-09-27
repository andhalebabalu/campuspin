import { notificationSchema, unreadCountSchema } from '@platform/contracts';
import { z } from 'zod';
import { apiClient } from '@/lib/api';

const listSchema = z.array(notificationSchema);

/** The signed-in member's notifications. */
export const notificationsService = {
  list: (params: { page?: number; unread?: boolean } = {}, signal?: AbortSignal) =>
    apiClient.get('/me/notifications', {
      query: { page: params.page, unread: params.unread ? 'true' : undefined },
      schema: listSchema,
      signal,
    }),

  unreadCount: (signal?: AbortSignal) =>
    apiClient.get('/me/notifications/unread-count', {
      schema: unreadCountSchema,
      signal,
    }),

  markRead: (id: string) =>
    apiClient.post(`/me/notifications/${encodeURIComponent(id)}/read`, {
      schema: unreadCountSchema,
    }),

  markAllRead: () => apiClient.post('/me/notifications/read-all', { schema: unreadCountSchema }),
};
