import { activityOverviewSchema } from '@platform/contracts';
import { apiClient } from '@/lib/api/client';

/** Staff activity analytics (`analytics.view`). */
export const adminAnalyticsService = {
  activity: (signal?: AbortSignal) =>
    apiClient.get('/admin/analytics/activity', {
      schema: activityOverviewSchema,
      signal,
      init: { cache: 'no-store' },
    }),
};
