/**
 * Warehouses & inventory API contract.
 *
 * `Inventory.quantity` is the current on-hand state of one product in one
 * warehouse. Every change to it is recorded as an immutable `StockMovement`
 * in the same transaction (before + delta = after), so the history always
 * explains the current value.
 */

import type { Pagination, ProductStatus, SortOrder } from './catalog.js';

/** Input limits shared by API validation and client-side form validation. */
export const INVENTORY_LIMITS = {
  warehouseNameMaxLength: 200,
  warehouseCodeMaxLength: 32,
  warehouseAddressMaxLength: 500,
  reasonMaxLength: 500,
  /** Largest quantity per operation, and largest on-hand quantity of one inventory row. */
  quantityMax: 1_000_000_000,
  searchMaxLength: 100,
  pageSizeDefault: 20,
  pageSizeMax: 100,
} as const;

/**
 * Warehouse codes are stored upper-case ("main" → "MAIN"): letters, digits,
 * `-` and `_`, starting with a letter or digit.
 */
export const WAREHOUSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;

// --- Warehouses --------------------------------------------------------------------

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean;
  /** Products with stock (quantity > 0) in this warehouse. */
  productCount: number;
  /** Sum of all on-hand quantities in this warehouse. */
  totalUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseListResponse {
  warehouses: Warehouse[];
}

export interface WarehouseResponse {
  warehouse: Warehouse;
}

export interface CreateWarehouseRequest {
  name: string;
  code: string;
  address?: string | null;
}

/** Code is immutable; status changes only through archive/restore. */
export interface UpdateWarehouseRequest {
  name?: string;
  address?: string | null;
}

// --- Inventory -----------------------------------------------------------------------

export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
/**
 * Per warehouse: OUT_OF_STOCK when quantity = 0, LOW_STOCK when
 * 0 < quantity ≤ product.minimumStock, otherwise IN_STOCK.
 */
export type StockStatus = (typeof STOCK_STATUSES)[number];

export interface InventoryWarehouseRef {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface InventoryProductRef {
  id: string;
  name: string;
  sku: string;
  status: ProductStatus;
}

export interface InventoryItem {
  id: string;
  warehouse: InventoryWarehouseRef;
  product: InventoryProductRef;
  quantity: number;
  /** The product's reorder level (the same for every warehouse). */
  minimumStock: number;
  status: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  pagination: Pagination;
}

export interface InventoryResponse {
  inventory: InventoryItem;
}

/** Whitelisted sort fields for `GET …/inventory?sortBy=`. */
export const INVENTORY_SORT_FIELDS = ['productName', 'sku', 'quantity', 'updatedAt'] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

export interface InventoryListQuery {
  warehouseId?: string;
  productId?: string;
  /** Case-insensitive match on product name or SKU. */
  search?: string;
  status?: StockStatus;
  /** Default `productName`. */
  sortBy?: InventorySortField;
  /** Default `asc`. */
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

// --- Stock movements ---------------------------------------------------------------

/** Mirrors the `stock_movement_type` database enum. */
export const STOCK_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'ADJUSTMENT',
  'DAMAGE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface StockMovementActor {
  id: string;
  name: string;
}

/** An immutable ledger entry. There is no API to change or delete one. */
export interface StockMovement {
  id: string;
  movementType: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string | null;
  /** null for system-generated movements or deleted users. */
  actor: StockMovementActor | null;
  warehouse: InventoryWarehouseRef;
  product: InventoryProductRef;
  referenceType: string | null;
  referenceId: string | null;
  /** Shared by the TRANSFER_OUT and TRANSFER_IN rows of one transfer. */
  transferGroupId: string | null;
  createdAt: string;
}

export interface StockMovementListResponse {
  items: StockMovement[];
  pagination: Pagination;
}

/** Query of `GET …/inventory/:inventoryId/movements` (always newest first). */
export interface InventoryMovementsQuery {
  page?: number;
  pageSize?: number;
}

/** Query of `GET …/stock-movements`. Results are ordered by creation time. */
export interface StockMovementListQuery {
  warehouseId?: string;
  productId?: string;
  movementType?: StockMovementType;
  actorUserId?: string;
  /** Both legs (TRANSFER_OUT + TRANSFER_IN) of one transfer. */
  transferGroupId?: string;
  /** ISO 8601 date or date-time, inclusive; a date is a local day in `timeZone`. */
  from?: string;
  /** ISO 8601 date or date-time, inclusive; a date-only value includes that whole local day. */
  to?: string;
  /**
   * IANA time zone of date-only `from`/`to` (default UTC): a date is that local
   * day, as on the dashboard and in the reports.
   */
  timeZone?: string;
  /** Case-insensitive match on product name, SKU, or reason. */
  search?: string;
  /** By `createdAt`; default `desc` (newest first). */
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

// --- Stock operations --------------------------------------------------------------

export interface ReceiveStockRequest {
  warehouseId: string;
  productId: string;
  /** Whole number > 0. */
  quantity: number;
  reason?: string | null;
}

export type IssueStockRequest = ReceiveStockRequest;

export interface DamageStockRequest {
  warehouseId: string;
  productId: string;
  quantity: number;
  /** Required: why the stock was written off. */
  reason: string;
}

export interface AdjustStockRequest {
  warehouseId: string;
  productId: string;
  /** The counted quantity (≥ 0). The movement records the difference. */
  newQuantity: number;
  reason: string;
}

export interface TransferStockRequest {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  productId: string;
  quantity: number;
  reason?: string | null;
}

/** Result of receive, issue, and damage. */
export interface StockOperationResponse {
  inventory: InventoryItem;
  movement: StockMovement;
}

/**
 * Result of an adjustment. `movement` is null when the counted quantity equals
 * the current one (nothing is written); `inventory` is null only when no stock
 * record exists and the counted quantity is 0.
 */
export interface AdjustStockResponse {
  inventory: InventoryItem | null;
  movement: StockMovement | null;
}

export interface TransferStockResponse {
  transferGroupId: string;
  source: InventoryItem;
  destination: InventoryItem;
  /** Exactly two rows: TRANSFER_OUT (source) and TRANSFER_IN (destination). */
  movements: [StockMovement, StockMovement];
}
