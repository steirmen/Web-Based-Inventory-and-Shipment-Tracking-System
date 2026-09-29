import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/http-client';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retry transient failures only; 4xx responses won't succeed on retry.
        retry: (failureCount, error) => {
          const isClientError =
            error instanceof ApiError && error.status !== null && error.status < 500;
          return !isClientError && failureCount < MAX_RETRIES;
        },
      },
    },
  });
}
