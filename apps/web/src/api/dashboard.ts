import type { DashboardSummaryQuery, DashboardSummaryResponse } from '@app/shared';
import { apiRequest } from './http-client';
import { organizationKeys } from './organizations';

/**
 * Dashboard query keys live under the organization, so one workspace's
 * dashboard can never answer (or flash as) another workspace's.
 */
export const dashboardKeys = {
  all: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'dashboard'] as const,
  summary: (organizationId: string, query: DashboardSummaryQuery) =>
    [...dashboardKeys.all(organizationId), 'summary', query] as const,
};

export function getDashboardSummary(
  organizationId: string,
  query: DashboardSummaryQuery,
  options?: { signal?: AbortSignal },
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return apiRequest<DashboardSummaryResponse>(
    `/organizations/${encodeURIComponent(organizationId)}/dashboard/summary${search ? `?${search}` : ''}`,
    { signal: options?.signal },
  );
}
