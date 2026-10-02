import {
  CUSTOMER_LIMITS,
  CUSTOMER_SORT_FIELDS,
  CUSTOMER_STATUSES,
  type CustomerListQuery,
  type CustomerSortField,
  type CustomerStatus,
  ORDER_LIMITS,
  ORDER_SORT_FIELDS,
  ORDER_STATUSES,
  type OrderAction,
  type OrderListQuery,
  type OrderSortField,
  type OrderStatus,
  type Permission,
  type SortOrder,
} from '@app/shared';
import { paths } from '@/routes/paths';
import { browserTimeZone, timeZoneParam } from './local-days';

/**
 * URL state of the customer and order lists (only non-default values are
 * written, so URLs stay short and shareable), plus order labels and the
 * lifecycle actions offered per status. Unknown URL values are ignored; the
 * API validates everything again.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const uuidParam = (value: string | null) => (value && UUID_PATTERN.test(value) ? value : '');
const dateParam = (value: string | null) => (value && DATE_PATTERN.test(value) ? value : '');
const pageParam = (value: string | null) => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};
function oneOf<T extends string>(values: readonly T[], value: string | null): T | '' {
  return value && (values as readonly string[]).includes(value) ? (value as T) : '';
}
function sortParam<Field extends string>(
  fields: readonly Field[],
  value: string | null,
  fallback: `${Field}:${SortOrder}`,
): `${Field}:${SortOrder}` {
  const [field, order] = (value ?? '').split(':');
  return (fields as readonly string[]).includes(field ?? '') &&
    (order === 'asc' || order === 'desc')
    ? (value as `${Field}:${SortOrder}`)
    : fallback;
}

// --- Customers -----------------------------------------------------------------------

export type CustomerSort = `${CustomerSortField}:${SortOrder}`;
export const DEFAULT_CUSTOMER_SORT: CustomerSort = 'name:asc';

/** Sort options in menu order (labels: `sales.customers.sortOptions`). */
export const CUSTOMER_SORT_OPTIONS = [
  'name:asc',
  'name:desc',
  'companyName:asc',
  'createdAt:desc',
  'updatedAt:desc',
] as const satisfies readonly CustomerSort[];

export interface CustomerParams {
  search: string;
  /** Default ACTIVE; ALL shows active and archived customers. */
  status: CustomerStatus | 'ALL';
  sort: CustomerSort;
  page: number;
}

export function readCustomerParams(searchParams: URLSearchParams): CustomerParams {
  const status = searchParams.get('status');
  return {
    search: (searchParams.get('search') ?? '').slice(0, CUSTOMER_LIMITS.searchMaxLength),
    status: status === 'ALL' ? 'ALL' : oneOf(CUSTOMER_STATUSES, status) || 'ACTIVE',
    sort: sortParam(CUSTOMER_SORT_FIELDS, searchParams.get('sort'), DEFAULT_CUSTOMER_SORT),
    page: pageParam(searchParams.get('page')),
  };
}

export function writeCustomerParams(params: CustomerParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search.trim()) searchParams.set('search', params.search.trim());
  if (params.status !== 'ACTIVE') searchParams.set('status', params.status);
  if (params.sort !== DEFAULT_CUSTOMER_SORT) searchParams.set('sort', params.sort);
  if (params.page > 1) searchParams.set('page', String(params.page));
  return searchParams;
}

export function toCustomerQuery(params: CustomerParams): CustomerListQuery {
  const [sortBy, sortOrder] = params.sort.split(':') as [CustomerSortField, SortOrder];
  return {
    ...(params.search.trim() ? { search: params.search.trim() } : {}),
    ...(params.status !== 'ALL' ? { status: params.status } : {}),
    sortBy,
    sortOrder,
    page: params.page,
    pageSize: CUSTOMER_LIMITS.pageSizeDefault,
  };
}

// --- Orders --------------------------------------------------------------------------

export type OrderSort = `${OrderSortField}:${SortOrder}`;
export const DEFAULT_ORDER_SORT: OrderSort = 'createdAt:desc';

/** Sort options in menu order (labels: `sales.orders.sortOptions`). */
export const ORDER_SORT_OPTIONS = [
  'createdAt:desc',
  'createdAt:asc',
  'updatedAt:desc',
  'orderNumber:desc',
  'total:desc',
  'total:asc',
] as const satisfies readonly OrderSort[];

export interface OrderParams {
  search: string;
  status: OrderStatus | '';
  customerId: string;
  warehouseId: string;
  /** yyyy-mm-dd (inclusive). */
  from: string;
  /** yyyy-mm-dd (inclusive, the whole day). */
  to: string;
  /**
   * IANA zone the days are counted in, when a link fixes it (e.g. from the
   * dashboard); otherwise the viewer's zone.
   */
  timeZone: string;
  sort: OrderSort;
  page: number;
}

export const EMPTY_ORDER_PARAMS: OrderParams = {
  search: '',
  status: '',
  customerId: '',
  warehouseId: '',
  from: '',
  to: '',
  timeZone: '',
  sort: DEFAULT_ORDER_SORT,
  page: 1,
};

export function readOrderParams(searchParams: URLSearchParams): OrderParams {
  return {
    search: (searchParams.get('search') ?? '').slice(0, ORDER_LIMITS.searchMaxLength),
    status: oneOf(ORDER_STATUSES, searchParams.get('status')),
    customerId: uuidParam(searchParams.get('customerId')),
    warehouseId: uuidParam(searchParams.get('warehouseId')),
    from: dateParam(searchParams.get('from')),
    to: dateParam(searchParams.get('to')),
    timeZone: timeZoneParam(searchParams.get('timeZone')),
    sort: sortParam(ORDER_SORT_FIELDS, searchParams.get('sort'), DEFAULT_ORDER_SORT),
    page: pageParam(searchParams.get('page')),
  };
}

export function writeOrderParams(params: OrderParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search.trim()) searchParams.set('search', params.search.trim());
  if (params.status) searchParams.set('status', params.status);
  if (params.customerId) searchParams.set('customerId', params.customerId);
  if (params.warehouseId) searchParams.set('warehouseId', params.warehouseId);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.timeZone && (params.from || params.to)) searchParams.set('timeZone', params.timeZone);
  if (params.sort !== DEFAULT_ORDER_SORT) searchParams.set('sort', params.sort);
  if (params.page > 1) searchParams.set('page', String(params.page));
  return searchParams;
}

export function toOrderQuery(params: OrderParams): OrderListQuery {
  const [sortBy, sortOrder] = params.sort.split(':') as [OrderSortField, SortOrder];
  return {
    ...(params.search.trim() ? { search: params.search.trim() } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.customerId ? { customerId: params.customerId } : {}),
    ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    // Days are local days, cut by the API exactly like the dashboard's.
    ...(params.from || params.to ? { timeZone: params.timeZone || browserTimeZone() } : {}),
    sortBy,
    sortOrder,
    page: params.page,
    pageSize: ORDER_LIMITS.pageSizeDefault,
  };
}

export const hasOrderFilters = (params: OrderParams) =>
  Boolean(
    params.search.trim() ||
    params.status ||
    params.customerId ||
    params.warehouseId ||
    params.from ||
    params.to,
  );

/** Orders filtered to one customer (from the customer page). */
export function customerOrdersPath(organizationId: string, customerId: string): string {
  const query = writeOrderParams({ ...EMPTY_ORDER_PARAMS, customerId }).toString();
  return `${paths.orders(organizationId)}?${query}`;
}

// --- Actions (labels: `sales.actions`; status names: `common.orderStatus`) ---------------

export interface OrderActionInfo {
  action: OrderAction;
  permission: Permission;
  tone: 'primary' | 'danger';
}

export const ORDER_ACTION_INFO: Record<OrderAction, OrderActionInfo> = {
  confirm: { action: 'confirm', permission: 'ORDERS_CONFIRM', tone: 'primary' },
  process: { action: 'process', permission: 'ORDERS_PROCESS', tone: 'primary' },
  ship: { action: 'ship', permission: 'ORDERS_SHIP', tone: 'primary' },
  complete: { action: 'complete', permission: 'ORDERS_COMPLETE', tone: 'primary' },
  cancel: { action: 'cancel', permission: 'ORDERS_CANCEL', tone: 'danger' },
};

/** Lifecycle actions per status, in display order (mirrors ORDER_TRANSITIONS). */
export const ORDER_ACTIONS_BY_STATUS: Record<OrderStatus, readonly OrderAction[]> = {
  DRAFT: ['confirm', 'cancel'],
  CONFIRMED: ['process', 'cancel'],
  PROCESSING: ['ship'],
  SHIPPED: ['complete'],
  COMPLETED: [],
  CANCELLED: [],
};
