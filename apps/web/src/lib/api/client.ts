import { createApiClient } from '@platform/api-client';
import { env } from '@/lib/env';

/**
 * The single HTTP client for the NestJS API. It centralises the base URL, headers,
 * response parsing and error handling. Components never call fetch() directly: they use
 * a service from src/services, which uses this client.
 */
export const apiClient = createApiClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  defaultHeaders: { 'X-Client': 'web' },
});
