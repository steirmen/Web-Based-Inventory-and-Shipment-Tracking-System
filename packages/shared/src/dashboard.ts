import type { ProductStatus } from './catalog.js';
import type { Currency } from './currency.js';
import type { OrderStatus } from './sales.js';

/**
 * Dashboard (Phase 8A): read-only, organization-scoped aggregates of the
 * organization's real data. See docs/dashboard-reporting.md for the exact
 * definition of every number.
 */

/** Date range presets. Every range is a whole number of local days in `timeZone`. */
export const DASHBOARD_RANGES = [
  'TODAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'THIS_MONTH',
  'PREVIOUS_MONTH',
  'THIS_YEAR',
  'CUSTOM',
] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DEFAULT_DASHBOARD_RANGE: DashboardRange = 'LAST_30_DAYS';
export const DEFAULT_DASHBOARD_TIME_ZONE = 'UTC';

/**
 * Orders whose stock has been deducted (CONFIRMED → PROCESSING issues the SALE
 * movements). Only these count as realized sales; DRAFT, CONFIRMED, and
 * CANCELLED orders never contribute revenue.
 */
export const REALIZED_ORDER_STATUSES = [
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
] as const satisfies readonly OrderStatus[];

export const DASHBOARD_LIMITS = {
  /** Longest CUSTOM range, in days (inclusive), so a request can't scan unbounded history. */
  customRangeMaxDays: 366,
  topProducts: 5,
  recentOrders: 5,
  timeZoneMaxLength: 64,
} as const;

/** Time series bucket size, chosen from the range length (see `dashboardBucket`). */
export const DASHBOARD_BUCKETS = ['DAY', 'WEEK', 'MONTH'] as const;
export type DashboardBucket = (typeof DASHBOARD_BUCKETS)[number];

/** Up to 31 days: daily; up to 92 days: ISO weeks (Monday start); longer: calendar months. */
export function dashboardBucket(days: number): DashboardBucket {
  if (days <= 31) return 'DAY';
  if (days <= 92) return 'WEEK';
  return 'MONTH';
}

/** `GET /organizations/:organizationId/dashboard/summary` query. */
export interface DashboardSummaryQuery {
  /** Default `LAST_30_DAYS`. */
  range?: DashboardRange;
  /** `YYYY-MM-DD`, first day (inclusive). Only with `range=CUSTOM` (required there). */
  from?: string;
  /** `YYYY-MM-DD`, last day (inclusive). Only with `range=CUSTOM` (required there). */
  to?: string;
  /** IANA time zone the days are counted in (e.g. `Europe/Istanbul`). Default `UTC`. */
  timeZone?: string;
  /**
   * Currency of the money figures (sales KPI, revenue series, top products).
   * Default: the currency with the most realized orders in the period (see
   * `DashboardSummaryResponse.currency`). Amounts in other currencies are never added in.
   */
  currency?: Currency;
}

/** A resolved period: local days `from`…`to` (inclusive) = instants [`start`, `end`). */
export interface DashboardPeriod {
  /** `YYYY-MM-DD` (local, inclusive). */
  from: string;
  /** `YYYY-MM-DD` (local, inclusive). */
  to: string;
  /** ISO 8601 UTC instant of `from` 00:00 in the time zone (inclusive). */
  start: string;
  /** ISO 8601 UTC instant of the day after `to`, 00:00 in the time zone (exclusive). */
  end: string;
  days: number;
}

export interface DashboardSelectedPeriod extends DashboardPeriod {
  range: DashboardRange;
  timeZone: string;
}

/**
 * A KPI over the selected period, compared with the previous period of the
 * same length. `percentageChange` is null when the previous value is 0
 * (no meaningful percentage); it is rounded to one decimal place.
 */
export interface DashboardCountMetric {
  current: number;
  previous: number;
  absoluteChange: number;
  percentageChange: number | null;
}

/** Same as `DashboardCountMetric`, with money as decimal strings ("1234.50", "-12.00"). */
export interface DashboardMoneyMetric {
  current: string;
  previous: string;
  absoluteChange: string;
  percentageChange: number | null;
}

export interface DashboardKpis {
  /**
   * Realized revenue in the response `currency`: Σ quantity × unit price of the
   * lines of realized orders in that currency created in the period.
   */
  sales: DashboardMoneyMetric;
  /** Orders created in the period, every status. */
  orders: DashboardCountMetric;
  /** Realized orders (PROCESSING, SHIPPED, COMPLETED) created in the period. */
  realizedOrders: DashboardCountMetric;
  /** Customers created in the period (whatever their current status). */
  newCustomers: DashboardCountMetric;
  /** Current state (not period-bound): customers that are not archived. */
  activeCustomers: number;
  archivedCustomers: number;
  /** Current state: products with status ACTIVE / ARCHIVED. */
  activeProducts: number;
  archivedProducts: number;
  /** Current state: units on hand of active products in active warehouses. */
  inventoryUnits: number;
  /** Current state: inventory rows (product × warehouse) that are IN_STOCK / LOW_STOCK / OUT_OF_STOCK, same scope. */
  inStockItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  activeWarehouses: number;
  inactiveWarehouses: number;
}

export interface DashboardOrderStatusCount {
  status: OrderStatus;
  count: number;
}

export interface DashboardTimeSeriesPoint {
  /** `YYYY-MM-DD`: first local day of the bucket inside the period. */
  period: string;
  /** `YYYY-MM-DD`: last local day of the bucket inside the period. */
  periodEnd: string;
  /** Orders created in the bucket, every status. */
  orders: number;
  /** Realized orders created in the bucket. */
  realizedOrders: number;
  /** Realized revenue in the response `currency` (decimal string). */
  revenue: string;
}

export interface DashboardTimeSeries {
  bucket: DashboardBucket;
  /** Every bucket of the period in order, including empty (zero) ones. */
  points: DashboardTimeSeriesPoint[];
}

export interface DashboardTopProduct {
  productId: string;
  /** Current product name and SKU (the product's identity); amounts come from order line snapshots. */
  name: string;
  sku: string;
  status: ProductStatus;
  unitsSold: number;
  /** Decimal string, in the response `currency`. */
  revenue: string;
}

export interface DashboardWarehouseSummary {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  /** Units of active products in this warehouse. */
  totalUnits: number;
  inStockItems: number;
  lowStockItems: number;
  outOfStockItems: number;
}

/** One of the newest orders of the period (any status). */
export interface DashboardRecentOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: { id: string; name: string; companyName: string | null } | null;
  /** Decimal string, in `currency`. */
  total: string;
  /** null for an order without lines. */
  currency: Currency | null;
  createdAt: string;
}

export interface DashboardSummaryResponse {
  period: DashboardSelectedPeriod;
  /** The same number of days immediately before `period`. */
  comparisonPeriod: DashboardPeriod;
  /** When the numbers were read (ISO 8601). */
  generatedAt: string;
  /**
   * The currency of every money figure (`kpis.sales`, the revenue series, top
   * products): the requested one, else the currency with the most realized
   * orders in the period (then the comparison period), else DEFAULT_CURRENCY.
   */
  currency: Currency;
  /** Currencies with realized sales in the period or the comparison period (always includes `currency`). */
  currencies: Currency[];
  kpis: DashboardKpis;
  /** Orders created in the period per status; always all six statuses, in lifecycle order. */
  orderStatus: DashboardOrderStatusCount[];
  timeSeries: DashboardTimeSeries;
  /** Up to 5 products by units sold in realized orders of the period in `currency`. */
  topProducts: DashboardTopProduct[];
  /** Every warehouse (active first, then by code) with its current stock summary. */
  warehouses: DashboardWarehouseSummary[];
  /** Up to 5 newest orders created in the period (any status), newest first. */
  recentOrders: DashboardRecentOrder[];
}
