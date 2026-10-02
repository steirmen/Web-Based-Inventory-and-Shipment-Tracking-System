import type {
  ReportExportQuery,
  InventoryReportQuery,
  OrdersReportQuery,
  ReportType,
  SalesReportQuery,
} from '@app/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  exportReport,
  getInventoryReport,
  getOrdersReport,
  getSalesReport,
  type ReportQuery,
  reportKeys,
} from '@/api/reports';
import { saveFile } from '@/lib/download';

/**
 * While another page/filter loads, the previous result of the SAME workspace
 * stays visible (dimmed by the page); another workspace's rows never do.
 */
const sameOrganization =
  (organizationId: string) =>
  <T>(previous: T | undefined, previousQuery: { queryKey: readonly unknown[] } | undefined) =>
    previousQuery?.queryKey[2] === organizationId ? previous : undefined;

export function useSalesReport(organizationId: string, query: SalesReportQuery) {
  return useQuery({
    queryKey: reportKeys.report(organizationId, 'sales', query),
    queryFn: ({ signal }) => getSalesReport(organizationId, query, { signal }),
    staleTime: 0,
    placeholderData: sameOrganization(organizationId),
  });
}

export function useOrdersReport(organizationId: string, query: OrdersReportQuery) {
  return useQuery({
    queryKey: reportKeys.report(organizationId, 'orders', query),
    queryFn: ({ signal }) => getOrdersReport(organizationId, query, { signal }),
    staleTime: 0,
    placeholderData: sameOrganization(organizationId),
  });
}

export function useInventoryReport(organizationId: string, query: InventoryReportQuery) {
  return useQuery({
    queryKey: reportKeys.report(organizationId, 'inventory', query),
    queryFn: ({ signal }) => getInventoryReport(organizationId, query, { signal }),
    staleTime: 0,
    placeholderData: sameOrganization(organizationId),
  });
}

/** Downloads the CSV of a report with its current filters (read-only on the server). */
export function useReportExport(organizationId: string, type: ReportType) {
  return useMutation({
    mutationFn: ({ query, ...options }: { query: ReportQuery } & ReportExportQuery) =>
      exportReport(organizationId, type, query, options),
    onSuccess: ({ blob, filename }, { format }) =>
      saveFile(blob, filename ?? `${type}-report.${format ?? 'csv'}`),
  });
}
