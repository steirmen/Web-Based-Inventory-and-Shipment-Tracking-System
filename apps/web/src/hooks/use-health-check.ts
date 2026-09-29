import type { HealthResponse } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { getHealth, healthQueryKeys } from '@/api/health';

export interface HealthCheckResult {
  response: HealthResponse;
  /** Round-trip time of the request in milliseconds. */
  latencyMs: number;
}

/** Runs the API health check. Never retries, so failures surface immediately. */
export function useHealthCheck() {
  return useQuery({
    queryKey: healthQueryKeys.all,
    queryFn: async ({ signal }): Promise<HealthCheckResult> => {
      const startedAt = performance.now();
      const response = await getHealth({ signal });
      return { response, latencyMs: Math.round(performance.now() - startedAt) };
    },
    retry: false,
    staleTime: 0,
  });
}
