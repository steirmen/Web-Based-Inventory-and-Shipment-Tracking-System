import {
  DASHBOARD_LIMITS,
  DASHBOARD_RANGES,
  type DashboardRange,
  type DashboardSummaryQuery,
  DEFAULT_DASHBOARD_RANGE,
  type OrderStatus,
  type StockStatus,
} from '@app/shared';
import { paths } from '@/routes/paths';
import { dayOf } from './local-days';

export { browserTimeZone, formatBucketLabel, formatDayRange } from './local-days';
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

export function toDashboardQuery(params: DashboardParams, timeZone: string): DashboardSummaryQuery {
  return {
    range: params.range,
    ...(params.range === 'CUSTOM' ? { from: params.from, to: params.to } : {}),
    timeZone,
  };
}

const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
export const formatCount = (value: number): string => countFormatter.format(value);

// --- Links into the detailed pages ---------------------------------------------------

/** Inventory list filtered to one stock status. */
export function inventoryStatusPath(organizationId: string, status: StockStatus): string {
  return `${paths.inventory(organizationId)}?${new URLSearchParams({ status }).toString()}`;
}

/**
 * Orders list filtered to one status (or all) and exactly the dashboard's
 * days: the same local days in the same time zone (the orders list counts days
 * in `timeZone`, like the dashboard).
 */
export function ordersInPeriodPath(
  organizationId: string,
  status: OrderStatus | '',
  period: { from: string; to: string; timeZone: string },
): string {
  const query = writeOrderParams({
    ...EMPTY_ORDER_PARAMS,
    status,
    from: period.from,
    to: period.to,
    timeZone: period.timeZone,
  }).toString();
  return `${paths.orders(organizationId)}?${query}`;
}
