import type {
  ReportExportQuery,
  InventoryReportQuery,
  InventoryReportResponse,
  OrdersReportQuery,
  OrdersReportResponse,
  ReportType,
  SalesReportQuery,
  SalesReportResponse,
} from '@app/shared';
import { apiDownload, apiRequest } from './http-client';
import { organizationKeys } from './organizations';

export type ReportQuery = SalesReportQuery | OrdersReportQuery | InventoryReportQuery;

/** Report query keys live under the organization: one workspace's report never answers another's. */
export const reportKeys = {
  all: (organizationId: string) => [...organizationKeys.detail(organizationId), 'reports'] as const,
  report: (organizationId: string, type: ReportType, query: ReportQuery) =>
    [...reportKeys.all(organizationId), type, query] as const,
};

const reportPath = (organizationId: string, type: ReportType, suffix = '') =>
  `/organizations/${encodeURIComponent(organizationId)}/reports/${type}${suffix}`;

/** Serializes only the parameters that are set. Filtering and paging happen on the server. */
function toSearchParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function getSalesReport(
  organizationId: string,
  query: SalesReportQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<SalesReportResponse>(
    `${reportPath(organizationId, 'sales')}${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

export function getOrdersReport(
  organizationId: string,
  query: OrdersReportQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<OrdersReportResponse>(
    `${reportPath(organizationId, 'orders')}${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

export function getInventoryReport(
  organizationId: string,
  query: InventoryReportQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<InventoryReportResponse>(
    `${reportPath(organizationId, 'inventory')}${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

/**
 * The export of a report with the same filters and sort (no paging: the server
 * caps the row count): an Excel workbook or a CSV file, with labels in `lang`.
 */
export function exportReport(
  organizationId: string,
  type: ReportType,
  query: ReportQuery,
  options: ReportExportQuery,
) {
  const { page: _page, pageSize: _pageSize, ...filters } = query;
  return apiDownload(
    `${reportPath(organizationId, type, '/export')}${toSearchParams({ ...filters, ...options })}`,
  );
}
