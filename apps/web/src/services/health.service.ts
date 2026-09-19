import { databaseHealthSchema, healthSchema } from '@platform/contracts';
import { apiClient } from '@/lib/api/client';

export const healthService = {
  /** GET /health: is the API process up? */
  check: (signal?: AbortSignal) => apiClient.get('/health', { schema: healthSchema, signal }),

  /** GET /health/database: does the API reach MySQL (XAMPP)? */
  checkDatabase: (signal?: AbortSignal) =>
    apiClient.get('/health/database', { schema: databaseHealthSchema, signal }),
};
