import type { DashboardSummaryQuery } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { dashboardKeys, getDashboardSummary } from '@/api/dashboard';

/**
 * The dashboard summary of one workspace for one date range. Always
 * refetched when the dashboard opens (it summarizes data that other pages
 * change). While another range loads, the previous range of the SAME
 * workspace stays on screen; another workspace's numbers never do.
 */
export function useDashboardSummary(organizationId: string, query: DashboardSummaryQuery) {
  return useQuery({
    queryKey: dashboardKeys.summary(organizationId, query),
    queryFn: ({ signal }) => getDashboardSummary(organizationId, query, { signal }),
    staleTime: 0,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === organizationId ? previous : undefined,
  });
}
