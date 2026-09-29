import type { HealthResponse } from '@app/shared';
import { apiRequest } from './http-client';

export const healthQueryKeys = {
  all: ['health'] as const,
};

/** `GET /health` — API liveness and dependency status. */
export function getHealth(options?: { signal?: AbortSignal }): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { signal: options?.signal });
}
