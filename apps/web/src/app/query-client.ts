import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { authQueryKeys } from '@/api/auth';
import { ApiError } from '@/api/http-client';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  /**
   * Any request rejected with 401 (session expired, revoked, or missing) means
   * the visitor is signed out: update the auth state so protected routes
   * redirect to the login page.
   */
  const handleUnauthenticated = (error: Error) => {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      error.code !== 'AUTH_INVALID_CREDENTIALS'
    ) {
      queryClient.setQueryData(authQueryKeys.me, null);
    }
  };

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleUnauthenticated }),
    mutationCache: new MutationCache({ onError: handleUnauthenticated }),
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

  return queryClient;
}
