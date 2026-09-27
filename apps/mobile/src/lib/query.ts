import { ApiClientError } from '@platform/api-client';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx will not fix itself on retry; network hiccups and 5xx might.
      retry: (failureCount, error) =>
        failureCount < 2 && !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
    },
  },
});
