/**
 * Customers & orders API contract.
 *
 * Money is a decimal STRING with two fraction digits ("125.50"), as in the
 * catalog. Order lines keep a snapshot of the product's name, SKU, and price,
 * so historical orders never change when the product does.
 *
 * Stock is not affected by DRAFT or CONFIRMED orders. It is deducted (one SALE
 * movement per line) only when an order moves from CONFIRMED to PROCESSING.
 */

import type { Pagination, ProductStatus, SortOrder } from './catalog.js';

// --- Customers ---------------------------------------------------------------------

/** Input limits shared by API validation and client-side form validation. */
export const CUSTOMER_LIMITS = {
  nameMaxLength: 200,
  companyNameMaxLength: 200,
  emailMaxLength: 320,
  phoneMaxLength: 50,
  addressMaxLength: 1000,
  notesMaxLength: 2000,
  searchMaxLength: 100,
  pageSizeDefault: 20,
  pageSizeMax: 100,
} as const;

/** Letters, digits, spaces, and `+ - ( ) . /` — no validation of real phone numbers. */
export const PHONE_PATTERN = /^[0-9+()./\s-]+$/;

/** `ACTIVE` = `isActive: true`. Customers are archived, never deleted. */
export const CUSTOMER_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  id: string;
  name: string;
  companyName: string | null;
  /** Stored lower-case. */
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  /** All orders of this customer, any status. */
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerListResponse {
  items: Customer[];
  pagination: Pagination;
}

export interface CustomerResponse {
  customer: Customer;
}

/** Whitelisted sort fields for `GET …/customers?sortBy=`. */
export const CUSTOMER_SORT_FIELDS = ['name', 'companyName', 'createdAt', 'updatedAt'] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export interface CustomerListQuery {
  /** Case-insensitive match on name, company, email, or phone. */
  search?: string;
  status?: CustomerStatus;
  /** Default `name`. */
  sortBy?: CustomerSortField;
  /** Default `asc`. */
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface CreateCustomerRequest {
  name: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

/** Status changes only through archive/restore. */
export type UpdateCustomerRequest = Partial<CreateCustomerRequest>;

// --- Orders --------------------------------------------------------------------------

/** Mirrors the `order_status` database enum. */
export const ORDER_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The order state machine: the only allowed status changes. Stock is deducted
 * on CONFIRMED → PROCESSING, so cancelling is possible only before that.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Lifecycle endpoints (`POST …/orders/:id/<action>`) and the status each one sets. */
export const ORDER_ACTIONS = {
  confirm: 'CONFIRMED',
  process: 'PROCESSING',
  ship: 'SHIPPED',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
} as const satisfies Record<string, OrderStatus>;
export type OrderAction = keyof typeof ORDER_ACTIONS;

export const ORDER_LIMITS = {
  itemsMax: 100,
  quantityMax: 1_000_000,
  notesMaxLength: 2000,
  searchMaxLength: 100,
  pageSizeDefault: 20,
  pageSizeMax: 100,
  /** Largest line total / order total: what fits NUMERIC(14,2). */
  totalMax: '999999999999.99',
} as const;

export interface OrderCustomerRef {
  id: string;
  name: string;
  companyName: string | null;
  isActive: boolean;
}

export interface OrderWarehouseRef {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  /** Snapshot taken when the line was added. */
  productName: string;
  /** Snapshot taken when the line was added. */
  sku: string;
  /** Snapshot of the product price when the line was added (decimal string). */
  unitPrice: string;
  quantity: number;
  /** quantity × unitPrice (decimal string). */
  lineTotal: string;
  /** The product's CURRENT status (an archived product blocks confirmation and processing). */
  productStatus: ProductStatus;
  /**
   * Current on-hand quantity of the product in the order's warehouse, for
   * DRAFT and CONFIRMED orders (informational only); null afterwards.
   */
  availableQuantity: number | null;
}

export interface OrderHistoryEntry {
  action: string;
  actor: { id: string; name: string } | null;
  createdAt: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** null only for legacy orders created without a customer. */
  customer: OrderCustomerRef | null;
  warehouse: OrderWarehouseRef;
  itemCount: number;
  /** Decimal string. */
  total: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order extends OrderListItem {
  notes: string | null;
  /** Sum of line totals (decimal string). No taxes, discounts, or shipping: total = subtotal. */
  subtotal: string;
  totalQuantity: number;
  items: OrderItem[];
  /** Order events from the activity log, oldest first. */
  history: OrderHistoryEntry[];
}

export interface OrderListResponse {
  items: OrderListItem[];
  pagination: Pagination;
}

export interface OrderResponse {
  order: Order;
}

/** Whitelisted sort fields for `GET …/orders?sortBy=`. */
export const ORDER_SORT_FIELDS = ['createdAt', 'updatedAt', 'orderNumber', 'total'] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export interface OrderListQuery {
  /** Case-insensitive match on order number, customer name, or company. */
  search?: string;
  status?: OrderStatus;
  customerId?: string;
  warehouseId?: string;
  /** ISO 8601 date or date-time, inclusive (creation time); a date is a local day in `timeZone`. */
  from?: string;
  /** ISO 8601 date or date-time, inclusive; a date-only value includes that whole local day. */
  to?: string;
  /**
   * IANA time zone of date-only `from`/`to` (default UTC): a date is that local
   * day, as on the dashboard and in the reports.
   */
  timeZone?: string;
  /** Default `createdAt`. */
  sortBy?: OrderSortField;
  /** Default `desc`. */
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface OrderItemInput {
  productId: string;
  /** Whole number, 1 … ORDER_LIMITS.quantityMax. */
  quantity: number;
}

/** Creates a DRAFT. The order number is generated by the server. */
export interface CreateOrderRequest {
  customerId: string;
  warehouseId: string;
  notes?: string | null;
  /** May be empty for now; an order needs at least one line to be confirmed. */
  items?: OrderItemInput[];
}

/**
 * Edits a DRAFT. `items`, when sent, is the complete new list (one line per
 * product): lines of products already in the order keep their price
 * snapshot, new products are priced at their current price.
 */
export interface UpdateOrderRequest {
  customerId?: string;
  warehouseId?: string;
  notes?: string | null;
  items?: OrderItemInput[];
}
