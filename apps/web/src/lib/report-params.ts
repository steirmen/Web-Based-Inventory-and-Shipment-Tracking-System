import {
  INVENTORY_REPORT_SORT_FIELDS,
  type InventoryReportQuery,
  type InventoryReportSortField,
  ORDER_STATUSES,
  ORDERS_REPORT_SORT_FIELDS,
  type OrdersReportQuery,
  type OrdersReportSortField,
  type OrderStatus,
  REPORT_LIMITS,
  type ReportType,
  SALES_REPORT_SORT_FIELDS,
  SALES_REPORT_STATUSES,
  type SalesReportQuery,
  type SalesReportSortField,
  type SalesReportStatus,
  type SortOrder,
  STOCK_STATUSES,
  type StockStatus,
} from '@app/shared';
import { paths } from '@/routes/paths';
import {
  type DashboardParams,
  DEFAULT_DASHBOARD_PARAMS,
  readDashboardParams,
  toDashboardQuery,
  writeDashboardParams,
} from './dashboard-params';

/**
 * URL state of the report pages. The date range uses the dashboard's keys
 * (`range`, `from`, `to`), so a range carries over between the overview and
 * the reports. Only non-default values are written; anything invalid is
 * ignored here and validated again by the API.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidParam = (value: string | null) => (value && UUID_PATTERN.test(value) ? value : '');
const pageParam = (value: string | null) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};
function oneOf<T extends string>(values: readonly T[], value: string | null): T | '' {
  return value && (values as readonly string[]).includes(value) ? (value as T) : '';
}

export interface ReportSort<Field extends string> {
  field: Field;
  order: SortOrder;
}

function readSort<Field extends string>(
  fields: readonly Field[],
  value: string | null,
  fallback: ReportSort<Field>,
): ReportSort<Field> {
  const [field, order] = (value ?? '').split(':');
  return (fields as readonly string[]).includes(field ?? '') &&
    (order === 'asc' || order === 'desc')
    ? { field: field as Field, order }
    : fallback;
}

interface CommonParams {
  search: string;
  page: number;
}

function readCommon(searchParams: URLSearchParams): CommonParams {
  return {
    search: (searchParams.get('search') ?? '').slice(0, REPORT_LIMITS.searchMaxLength),
    page: pageParam(searchParams.get('page')),
  };
}

function writeCommon<Field extends string>(
  searchParams: URLSearchParams,
  params: CommonParams & { sort: ReportSort<Field> },
  defaultSort: ReportSort<Field>,
  filters: Record<string, string | boolean>,
) {
  if (params.search.trim()) searchParams.set('search', params.search.trim());
  for (const [key, value] of Object.entries(filters)) {
    if (value === true) searchParams.set(key, 'true');
    else if (typeof value === 'string' && value) searchParams.set(key, value);
  }
  if (params.sort.field !== defaultSort.field || params.sort.order !== defaultSort.order) {
    searchParams.set('sort', `${params.sort.field}:${params.sort.order}`);
  }
  if (params.page > 1) searchParams.set('page', String(params.page));
  return searchParams;
}

function pageQuery<Field extends string>(params: CommonParams & { sort: ReportSort<Field> }) {
  return {
    ...(params.search.trim() ? { search: params.search.trim() } : {}),
    sortBy: params.sort.field,
    sortOrder: params.sort.order,
    page: params.page,
    pageSize: REPORT_LIMITS.pageSizeDefault,
  };
}

/** Only set values, so query keys and URLs stay minimal. */
function setOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== '' && value !== false),
  ) as Partial<T>;
}

// --- Sales ---------------------------------------------------------------------------------

export const DEFAULT_SALES_SORT: ReportSort<SalesReportSortField> = {
  field: 'date',
  order: 'desc',
};

export interface SalesReportParams extends CommonParams {
  period: DashboardParams;
  warehouseId: string;
  customerId: string;
  productId: string;
  categoryId: string;
  status: SalesReportStatus | '';
  sort: ReportSort<SalesReportSortField>;
}

export function readSalesParams(searchParams: URLSearchParams): SalesReportParams {
  return {
    ...readCommon(searchParams),
    period: readDashboardParams(searchParams),
    warehouseId: uuidParam(searchParams.get('warehouseId')),
    customerId: uuidParam(searchParams.get('customerId')),
    productId: uuidParam(searchParams.get('productId')),
    categoryId: uuidParam(searchParams.get('categoryId')),
    status: oneOf(SALES_REPORT_STATUSES, searchParams.get('status')),
    sort: readSort(SALES_REPORT_SORT_FIELDS, searchParams.get('sort'), DEFAULT_SALES_SORT),
  };
}

export function writeSalesParams(params: SalesReportParams): URLSearchParams {
  return writeCommon(writeDashboardParams(params.period), params, DEFAULT_SALES_SORT, {
    warehouseId: params.warehouseId,
    customerId: params.customerId,
    productId: params.productId,
    categoryId: params.categoryId,
    status: params.status,
  });
}

export function toSalesQuery(params: SalesReportParams, timeZone: string): SalesReportQuery {
  return {
    ...toDashboardQuery(params.period, timeZone),
    ...setOnly({
      warehouseId: params.warehouseId,
      customerId: params.customerId,
      productId: params.productId,
      categoryId: params.categoryId,
      status: params.status,
    }),
    ...pageQuery(params),
  } as SalesReportQuery;
}

export const hasSalesFilters = (params: SalesReportParams) =>
  Boolean(
    params.search.trim() ||
    params.warehouseId ||
    params.customerId ||
    params.productId ||
    params.categoryId ||
    params.status,
  );

// --- Orders --------------------------------------------------------------------------------

export const DEFAULT_ORDERS_REPORT_SORT: ReportSort<OrdersReportSortField> = {
  field: 'createdAt',
  order: 'desc',
};

export interface OrdersReportParams extends CommonParams {
  period: DashboardParams;
  status: OrderStatus | '';
  warehouseId: string;
  customerId: string;
  sort: ReportSort<OrdersReportSortField>;
}

export function readOrdersReportParams(searchParams: URLSearchParams): OrdersReportParams {
  return {
    ...readCommon(searchParams),
    period: readDashboardParams(searchParams),
    status: oneOf(ORDER_STATUSES, searchParams.get('status')),
    warehouseId: uuidParam(searchParams.get('warehouseId')),
    customerId: uuidParam(searchParams.get('customerId')),
    sort: readSort(ORDERS_REPORT_SORT_FIELDS, searchParams.get('sort'), DEFAULT_ORDERS_REPORT_SORT),
  };
}

export function writeOrdersReportParams(params: OrdersReportParams): URLSearchParams {
  return writeCommon(writeDashboardParams(params.period), params, DEFAULT_ORDERS_REPORT_SORT, {
    status: params.status,
    warehouseId: params.warehouseId,
    customerId: params.customerId,
  });
}

export function toOrdersReportQuery(
  params: OrdersReportParams,
  timeZone: string,
): OrdersReportQuery {
  return {
    ...toDashboardQuery(params.period, timeZone),
    ...setOnly({
      status: params.status,
      warehouseId: params.warehouseId,
      customerId: params.customerId,
    }),
    ...pageQuery(params),
  } as OrdersReportQuery;
}

export const hasOrdersReportFilters = (params: OrdersReportParams) =>
  Boolean(params.search.trim() || params.status || params.warehouseId || params.customerId);

// --- Inventory -----------------------------------------------------------------------------

export const DEFAULT_INVENTORY_REPORT_SORT: ReportSort<InventoryReportSortField> = {
  field: 'productName',
  order: 'asc',
};

export interface InventoryReportParams extends CommonParams {
  warehouseId: string;
  productId: string;
  categoryId: string;
  status: StockStatus | '';
  includeArchived: boolean;
  sort: ReportSort<InventoryReportSortField>;
}

export function readInventoryReportParams(searchParams: URLSearchParams): InventoryReportParams {
  return {
    ...readCommon(searchParams),
    warehouseId: uuidParam(searchParams.get('warehouseId')),
    productId: uuidParam(searchParams.get('productId')),
    categoryId: uuidParam(searchParams.get('categoryId')),
    status: oneOf(STOCK_STATUSES, searchParams.get('status')),
    includeArchived: searchParams.get('includeArchived') === 'true',
    sort: readSort(
      INVENTORY_REPORT_SORT_FIELDS,
      searchParams.get('sort'),
      DEFAULT_INVENTORY_REPORT_SORT,
    ),
  };
}

export function writeInventoryReportParams(params: InventoryReportParams): URLSearchParams {
  return writeCommon(new URLSearchParams(), params, DEFAULT_INVENTORY_REPORT_SORT, {
    warehouseId: params.warehouseId,
    productId: params.productId,
    categoryId: params.categoryId,
    status: params.status,
    includeArchived: params.includeArchived,
  });
}

export function toInventoryReportQuery(params: InventoryReportParams): InventoryReportQuery {
  return {
    ...setOnly({
      warehouseId: params.warehouseId,
      productId: params.productId,
      categoryId: params.categoryId,
      status: params.status,
      includeArchived: params.includeArchived,
    }),
    ...pageQuery(params),
  } as InventoryReportQuery;
}

export const hasInventoryReportFilters = (params: InventoryReportParams) =>
  Boolean(
    params.search.trim() ||
    params.warehouseId ||
    params.productId ||
    params.categoryId ||
    params.status ||
    params.includeArchived,
  );

// --- Shared -----------------------------------------------------------------------------

export function reportPath(organizationId: string, type: ReportType, search = ''): string {
  return `${paths.report(organizationId, type)}${search ? `?${search}` : ''}`;
}

/** The sales report for a dashboard range (and optionally one product). */
export function salesReportPath(
  organizationId: string,
  period: DashboardParams = DEFAULT_DASHBOARD_PARAMS,
  productId = '',
): string {
  const params: SalesReportParams = {
    ...readSalesParams(new URLSearchParams()),
    period,
    productId,
  };
  return reportPath(organizationId, 'sales', writeSalesParams(params).toString());
}

/** Next sort when a column header is clicked: same column flips, a new column starts at its default. */
export function nextSort<Field extends string>(
  current: ReportSort<Field>,
  field: Field,
  defaultOrder: SortOrder,
): ReportSort<Field> {
  if (current.field === field) {
    return { field, order: current.order === 'asc' ? 'desc' : 'asc' };
  }
  return { field, order: defaultOrder };
}
