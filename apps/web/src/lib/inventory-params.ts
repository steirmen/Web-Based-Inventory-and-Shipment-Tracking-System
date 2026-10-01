import {
  INVENTORY_LIMITS,
  INVENTORY_SORT_FIELDS,
  type InventoryListQuery,
  type InventorySortField,
  type SortOrder,
  STOCK_MOVEMENT_TYPES,
  STOCK_STATUSES,
  type StockMovementListQuery,
  type StockMovementType,
  type StockStatus,
} from '@app/shared';
import { paths } from '@/routes/paths';
import { browserTimeZone } from './local-days';

/**
 * URL state of the inventory and stock movement pages. Only non-default
 * values are written, so URLs stay short and shareable. Unknown values are
 * ignored here; the API validates everything again.
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

// --- Inventory ---------------------------------------------------------------------

type InventorySort = `${InventorySortField}:${SortOrder}`;

export const DEFAULT_INVENTORY_SORT: InventorySort = 'productName:asc';

export const INVENTORY_SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: 'productName:asc', label: 'Product (A–Z)' },
  { value: 'productName:desc', label: 'Product (Z–A)' },
  { value: 'sku:asc', label: 'SKU (A–Z)' },
  { value: 'quantity:asc', label: 'Quantity (low to high)' },
  { value: 'quantity:desc', label: 'Quantity (high to low)' },
  { value: 'updatedAt:desc', label: 'Recently changed' },
];

export interface InventoryParams {
  search: string;
  warehouseId: string;
  status: StockStatus | '';
  sort: InventorySort;
  page: number;
}

function isInventorySort(value: string | null): value is InventorySort {
  const [field, order] = (value ?? '').split(':');
  return (
    (INVENTORY_SORT_FIELDS as readonly string[]).includes(field ?? '') &&
    (order === 'asc' || order === 'desc')
  );
}

export function readInventoryParams(searchParams: URLSearchParams): InventoryParams {
  const sort = searchParams.get('sort');
  return {
    search: (searchParams.get('search') ?? '').slice(0, INVENTORY_LIMITS.searchMaxLength),
    warehouseId: uuidParam(searchParams.get('warehouseId')),
    status: oneOf(STOCK_STATUSES, searchParams.get('status')),
    sort: isInventorySort(sort) ? sort : DEFAULT_INVENTORY_SORT,
    page: pageParam(searchParams.get('page')),
  };
}

export function writeInventoryParams(params: InventoryParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search.trim()) searchParams.set('search', params.search.trim());
  if (params.warehouseId) searchParams.set('warehouseId', params.warehouseId);
  if (params.status) searchParams.set('status', params.status);
  if (params.sort !== DEFAULT_INVENTORY_SORT) searchParams.set('sort', params.sort);
  if (params.page > 1) searchParams.set('page', String(params.page));
  return searchParams;
}

export function toInventoryQuery(params: InventoryParams): InventoryListQuery {
  const [sortBy, sortOrder] = params.sort.split(':') as [InventorySortField, SortOrder];
  return {
    ...(params.search.trim() ? { search: params.search.trim() } : {}),
    ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}),
    ...(params.status ? { status: params.status } : {}),
    sortBy,
    sortOrder,
    page: params.page,
    pageSize: INVENTORY_LIMITS.pageSizeDefault,
  };
}

export const hasInventoryFilters = (params: InventoryParams) =>
  Boolean(params.search.trim() || params.warehouseId || params.status);

// --- Stock movements ---------------------------------------------------------------

export interface MovementParams {
  warehouseId: string;
  productId: string;
  movementType: StockMovementType | '';
  /** Both legs of one transfer. */
  transferGroupId: string;
  /** yyyy-mm-dd (inclusive). */
  from: string;
  /** yyyy-mm-dd (inclusive, the whole day). */
  to: string;
  sortOrder: SortOrder;
  page: number;
}

export function readMovementParams(searchParams: URLSearchParams): MovementParams {
  return {
    warehouseId: uuidParam(searchParams.get('warehouseId')),
    productId: uuidParam(searchParams.get('productId')),
    movementType: oneOf(STOCK_MOVEMENT_TYPES, searchParams.get('movementType')),
    transferGroupId: uuidParam(searchParams.get('transferGroupId')),
    from: dateParam(searchParams.get('from')),
    to: dateParam(searchParams.get('to')),
    sortOrder: searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
    page: pageParam(searchParams.get('page')),
  };
}

export function writeMovementParams(params: MovementParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.warehouseId) searchParams.set('warehouseId', params.warehouseId);
  if (params.productId) searchParams.set('productId', params.productId);
  if (params.movementType) searchParams.set('movementType', params.movementType);
  if (params.transferGroupId) searchParams.set('transferGroupId', params.transferGroupId);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.sortOrder === 'asc') searchParams.set('sortOrder', 'asc');
  if (params.page > 1) searchParams.set('page', String(params.page));
  return searchParams;
}

export function toMovementQuery(params: MovementParams): StockMovementListQuery {
  return {
    ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}),
    ...(params.productId ? { productId: params.productId } : {}),
    ...(params.movementType ? { movementType: params.movementType } : {}),
    ...(params.transferGroupId ? { transferGroupId: params.transferGroupId } : {}),
    ...(params.from ? { from: params.from } : {}),
    ...(params.to ? { to: params.to } : {}),
    // The viewer's local days, cut by the API like the dashboard's.
    ...(params.from || params.to ? { timeZone: browserTimeZone() } : {}),
    sortOrder: params.sortOrder,
    page: params.page,
    pageSize: INVENTORY_LIMITS.pageSizeDefault,
  };
}

export const hasMovementFilters = (params: MovementParams) =>
  Boolean(
    params.warehouseId ||
    params.productId ||
    params.movementType ||
    params.transferGroupId ||
    params.from ||
    params.to,
  );

const EMPTY_MOVEMENT_PARAMS: MovementParams = {
  warehouseId: '',
  productId: '',
  movementType: '',
  transferGroupId: '',
  from: '',
  to: '',
  sortOrder: 'desc',
  page: 1,
};

/** Stock movements filtered to a warehouse and/or product, or to the two legs of one transfer. */
export function movementsPath(
  organizationId: string,
  filters: { warehouseId?: string; productId?: string; transferGroupId?: string },
): string {
  const query = writeMovementParams({ ...EMPTY_MOVEMENT_PARAMS, ...filters }).toString();
  return query
    ? `${paths.stockMovements(organizationId)}?${query}`
    : paths.stockMovements(organizationId);
}

/** Inventory filtered to one warehouse. */
export function warehouseInventoryPath(organizationId: string, warehouseId: string): string {
  const query = writeInventoryParams({
    search: '',
    warehouseId,
    status: '',
    sort: DEFAULT_INVENTORY_SORT,
    page: 1,
  });
  return `${paths.inventory(organizationId)}?${query.toString()}`;
}

// --- Labels --------------------------------------------------------------------------

export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  DAMAGE: 'Damage',
  ADJUSTMENT: 'Adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
};

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
};

/**
 * A short, human-comparable label for a transfer group: both legs of a
 * transfer show the same one (the id's random tail, not its time prefix).
 */
export function transferLabel(transferGroupId: string): string {
  return `#${transferGroupId.replaceAll('-', '').slice(-6).toUpperCase()}`;
}

/** "+50", "-10" (with a real minus sign for readability). */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta.toLocaleString()}` : `−${Math.abs(delta).toLocaleString()}`;
}
