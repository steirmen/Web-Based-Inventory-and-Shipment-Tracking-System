import {
  DASHBOARD_LIMITS,
  DASHBOARD_RANGES,
  type DashboardBucket,
  type DashboardRange,
  type DashboardSummaryQuery,
  type OrderListQuery,
  DEFAULT_DASHBOARD_RANGE,
  DEFAULT_DASHBOARD_TIME_ZONE,
  type OrderStatus,
  type StockStatus,
} from '@app/shared';
import { paths } from '@/routes/paths';
import { EMPTY_ORDER_PARAMS, writeOrderParams } from './sales-params';

/**
 * URL state of the dashboard (`?range=…&from=…&to=…`). Only non-default values
 * are written, so links stay short and shareable; anything invalid in the URL
 * falls back to the default range. The API validates everything again.
 */

export interface DashboardParams {
  range: DashboardRange;
  /** yyyy-mm-dd, only for CUSTOM. */
  from: string;
  /** yyyy-mm-dd, only for CUSTOM. */
  to: string;
}

export const DEFAULT_DASHBOARD_PARAMS: DashboardParams = {
  range: DEFAULT_DASHBOARD_RANGE,
  from: '',
  to: '',
};

export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  TODAY: 'Today',
  LAST_7_DAYS: 'Last 7 days',
  LAST_30_DAYS: 'Last 30 days',
  THIS_MONTH: 'This month',
  PREVIOUS_MONTH: 'Previous month',
  THIS_YEAR: 'This year',
  CUSTOM: 'Custom range',
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Days since 1970-01-01 of a valid yyyy-mm-dd date, or null (rejects e.g. 2026-02-30). */
function dayOf(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return time / DAY_MS;
}

/** Why a custom range is not acceptable, or undefined when it is. */
export function customRangeError(from: string, to: string): string | undefined {
  const first = dayOf(from);
  const last = dayOf(to);
  if (first === null || last === null) return 'Choose a start and an end date.';
  if (first > last) return 'The end date must not be before the start date.';
  if (last - first + 1 > DASHBOARD_LIMITS.customRangeMaxDays) {
    return `Choose at most ${DASHBOARD_LIMITS.customRangeMaxDays} days.`;
  }
  return undefined;
}

export function readDashboardParams(searchParams: URLSearchParams): DashboardParams {
  const range = searchParams.get('range');
  if (!range || !(DASHBOARD_RANGES as readonly string[]).includes(range)) {
    return DEFAULT_DASHBOARD_PARAMS;
  }
  if (range !== 'CUSTOM') return { range: range as DashboardRange, from: '', to: '' };
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  return customRangeError(from, to) ? DEFAULT_DASHBOARD_PARAMS : { range, from, to };
}

export function writeDashboardParams(params: DashboardParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.range !== DEFAULT_DASHBOARD_RANGE) searchParams.set('range', params.range);
  if (params.range === 'CUSTOM') {
    searchParams.set('from', params.from);
    searchParams.set('to', params.to);
  }
  return searchParams;
}

/**
 * The viewer's IANA time zone, so "today" and the chart's days are the
 * viewer's days. Falls back to UTC when the browser reports none (or an
 * offset the API does not accept).
 */
export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && /^[A-Za-z][A-Za-z0-9_+/-]*$/.test(zone) ? zone : DEFAULT_DASHBOARD_TIME_ZONE;
  } catch {
    return DEFAULT_DASHBOARD_TIME_ZONE;
  }
}

export function toDashboardQuery(params: DashboardParams, timeZone: string): DashboardSummaryQuery {
  return {
    range: params.range,
    ...(params.range === 'CUSTOM' ? { from: params.from, to: params.to } : {}),
    timeZone,
  };
}

// --- Display ------------------------------------------------------------------------

/** Date-only values are calendar days: format them in UTC so they never shift. */
const dayFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const shortDayFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** "Sep 2 – Oct 1, 2026" (or a single day). */
export function formatDayRange(from: string, to: string): string {
  return from === to
    ? dayFormatter.format(asDate(from))
    : dayFormatter.formatRange(asDate(from), asDate(to));
}

/** Short x-axis label of a time series bucket. */
export function formatBucketLabel(period: string, bucket: DashboardBucket): string {
  return bucket === 'MONTH'
    ? monthFormatter.format(asDate(period))
    : shortDayFormatter.format(asDate(period));
}

const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
export const formatCount = (value: number): string => countFormatter.format(value);

// --- Links into the detailed pages ---------------------------------------------------

/** Inventory list filtered to one stock status. */
export function inventoryStatusPath(organizationId: string, status: StockStatus): string {
  return `${paths.inventory(organizationId)}?${new URLSearchParams({ status }).toString()}`;
}

/**
 * Orders list filtered to one status and the dashboard's days. Note: the
 * orders list counts days in UTC, the dashboard in the viewer's time zone.
 */
export function ordersInPeriodPath(
  organizationId: string,
  status: OrderStatus | '',
  from: string,
  to: string,
): string {
  const query = writeOrderParams({ ...EMPTY_ORDER_PARAMS, status, from, to }).toString();
  return `${paths.orders(organizationId)}?${query}`;
}

/** Recent orders on the dashboard: the five newest, from the regular orders list endpoint. */
export const RECENT_ORDERS_QUERY: OrderListQuery = {
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: 5,
};
