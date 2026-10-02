import type { ProductStatus, SortOrder } from './catalog.js';
import type { Currency, MoneyAmount } from './currency.js';
import type { Language } from './i18n.js';
import type { DashboardRange, DashboardSelectedPeriod } from './dashboard.js';
import { REALIZED_ORDER_STATUSES } from './dashboard.js';
import type { StockStatus } from './inventory.js';
import type { OrderStatus } from './sales.js';

/**
 * Reports (Phase 8C): read-only, organization-scoped, server-filtered,
 * sorted, and paginated lists with CSV export. They use the dashboard's
 * definitions: realized sales, local-day date ranges, and Phase 6 stock status.
 * See docs/dashboard-reporting.md.
 */

export const REPORT_TYPES = ['sales', 'orders', 'inventory'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LIMITS = {
  pageSizeDefault: 25,
  pageSizeMax: 100,
  searchMaxLength: 100,
  /** Largest export (CSV or Excel); above it the API answers 422 REPORT_EXPORT_TOO_LARGE. */
  exportMaxRows: 10_000,
} as const;

/**
 * Export file formats: `xlsx` is a real Excel workbook (typed number, money,
 * and date cells; opens as a table in every Excel locale), `csv` is RFC 4180
 * (comma-separated, UTF-8 with BOM) for other tools. See docs/export.md.
 */
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Extra query parameters of every `…/export` endpoint (besides the report's
 * own filters and sorting). `lang` translates only the generated labels
 * (headers, statuses); user data is exported as entered.
 */
export interface ReportExportQuery {
  /** Default `csv`. */
  format?: ExportFormat;
  /** Default `en`. */
  lang?: Language;
}

/** The sales report lists realized orders only; its status filter narrows within them. */
export const SALES_REPORT_STATUSES = REALIZED_ORDER_STATUSES;
export type SalesReportStatus = (typeof SALES_REPORT_STATUSES)[number];

export const SALES_REPORT_SORT_FIELDS = [
  'date',
  'orderNumber',
  'customer',
  'units',
  'revenue',
] as const;
export type SalesReportSortField = (typeof SALES_REPORT_SORT_FIELDS)[number];

export const ORDERS_REPORT_SORT_FIELDS = [
  'createdAt',
  'orderNumber',
  'customer',
  'status',
  'total',
] as const;
export type OrdersReportSortField = (typeof ORDERS_REPORT_SORT_FIELDS)[number];

export const INVENTORY_REPORT_SORT_FIELDS = [
  'productName',
  'sku',
  'category',
  'warehouse',
  'quantity',
  'minimumStock',
] as const;
export type InventoryReportSortField = (typeof INVENTORY_REPORT_SORT_FIELDS)[number];

/** Date range of the sales and orders reports: the dashboard's ranges (default LAST_30_DAYS). */
export interface ReportPeriodQuery {
  range?: DashboardRange;
  from?: string;
  to?: string;
  timeZone?: string;
}

interface ReportPageQuery<TSort extends string> {
  search?: string;
  sortBy?: TSort;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface ReportPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ReportCustomerRef {
  id: string;
  name: string;
  companyName: string | null;
}

export interface ReportWarehouseRef {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

// --- Sales -----------------------------------------------------------------------------

export interface SalesReportQuery extends ReportPeriodQuery, ReportPageQuery<SalesReportSortField> {
  warehouseId?: string;
  customerId?: string;
  /** Only orders with lines of this product; units and revenue count those lines only. */
  productId?: string;
  /** Only orders with lines of products in this category; units and revenue count those lines only. */
  categoryId?: string;
  status?: SalesReportStatus;
  /**
   * Only orders in this currency (the totals are in it). Default: the currency
   * with the most matching orders, as on the dashboard (`SalesReportResponse.currency`).
   */
  currency?: Currency;
}

/** One realized order. */
export interface SalesReportRow {
  orderId: string;
  orderNumber: string;
  /** Order creation time (ISO 8601): the reporting date, as on the dashboard. */
  date: string;
  status: SalesReportStatus;
  customer: ReportCustomerRef | null;
  warehouse: ReportWarehouseRef;
  units: number;
  /** Σ quantity × unit price of the (matching) lines; decimal string, in `currency`. */
  revenue: string;
  currency: Currency;
}

export interface SalesReportResponse {
  period: DashboardSelectedPeriod;
  /** The currency of every row and of the totals (requested, or the default above). */
  currency: Currency;
  /** Currencies of the orders matching the other filters (always includes `currency`). */
  currencies: Currency[];
  items: SalesReportRow[];
  pagination: ReportPagination;
  /** Over every row matching the filters (not just this page). */
  totals: { orders: number; units: number; revenue: string };
}

// --- Orders ----------------------------------------------------------------------------

export interface OrdersReportQuery
  extends ReportPeriodQuery, ReportPageQuery<OrdersReportSortField> {
  status?: OrderStatus;
  warehouseId?: string;
  customerId?: string;
  /** Only orders in this currency (default: every order). */
  currency?: Currency;
}

export interface OrdersReportRow {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  customer: ReportCustomerRef | null;
  warehouse: ReportWarehouseRef;
  itemCount: number;
  /** Decimal string, in `currency`. */
  total: string;
  /** null for an order without lines. */
  currency: Currency | null;
  createdAt: string;
}

export interface OrdersReportResponse {
  period: DashboardSelectedPeriod;
  items: OrdersReportRow[];
  pagination: ReportPagination;
  /**
   * Over every row matching the filters: the count, and the summed order
   * totals PER CURRENCY (every listed status; amounts in different currencies
   * are never added). Orders without lines have no currency and add nothing.
   */
  totals: { orders: number; values: MoneyAmount[] };
}

// --- Inventory -------------------------------------------------------------------------

export interface InventoryReportQuery extends ReportPageQuery<InventoryReportSortField> {
  warehouseId?: string;
  productId?: string;
  categoryId?: string;
  status?: StockStatus;
  /**
   * Also list archived products and archived warehouses. Off by default, so
   * the report matches the dashboard's stock KPIs (sellable stock).
   */
  includeArchived?: boolean;
}

export interface InventoryReportRow {
  inventoryId: string;
  product: { id: string; name: string; sku: string; status: ProductStatus };
  category: { id: string; name: string } | null;
  warehouse: ReportWarehouseRef;
  quantity: number;
  minimumStock: number;
  status: StockStatus;
}

export interface InventoryReportResponse {
  items: InventoryReportRow[];
  pagination: ReportPagination;
  /** Over every row matching the filters. */
  totals: {
    rows: number;
    units: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
}
