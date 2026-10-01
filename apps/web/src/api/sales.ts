import type {
  CreateCustomerRequest,
  CreateOrderRequest,
  CustomerListQuery,
  CustomerListResponse,
  CustomerResponse,
  OrderAction,
  OrderListQuery,
  OrderListResponse,
  OrderResponse,
  UpdateCustomerRequest,
  UpdateOrderRequest,
} from '@app/shared';
import { apiRequest } from './http-client';
import { organizationKeys } from './organizations';

/**
 * Customer and order query keys. All live under the organization, so one
 * workspace's cache entries can never answer a query of another workspace.
 */
export const salesKeys = {
  customers: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'customers'] as const,
  customerList: (organizationId: string, query: CustomerListQuery) =>
    [...salesKeys.customers(organizationId), 'list', query] as const,
  customer: (organizationId: string, customerId: string) =>
    [...salesKeys.customers(organizationId), 'item', customerId] as const,
  orders: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'orders'] as const,
  orderList: (organizationId: string, query: OrderListQuery) =>
    [...salesKeys.orders(organizationId), 'list', query] as const,
  order: (organizationId: string, orderId: string) =>
    [...salesKeys.orders(organizationId), 'item', orderId] as const,
};

const base = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`;
const customerPath = (organizationId: string, customerId: string) =>
  `${base(organizationId)}/customers/${encodeURIComponent(customerId)}`;
const orderPath = (organizationId: string, orderId: string) =>
  `${base(organizationId)}/orders/${encodeURIComponent(orderId)}`;

/** Serializes only the parameters that are set. Filtering and paging happen on the server. */
function toSearchParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

// --- Customers -----------------------------------------------------------------------

export function listCustomers(
  organizationId: string,
  query: CustomerListQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<CustomerListResponse>(
    `${base(organizationId)}/customers${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

export function getCustomer(
  organizationId: string,
  customerId: string,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<CustomerResponse>(customerPath(organizationId, customerId), {
    signal: options?.signal,
  });
}

export function createCustomer(organizationId: string, body: CreateCustomerRequest) {
  return apiRequest<CustomerResponse>(`${base(organizationId)}/customers`, {
    method: 'POST',
    body,
  });
}

export function updateCustomer(
  organizationId: string,
  customerId: string,
  body: UpdateCustomerRequest,
) {
  return apiRequest<CustomerResponse>(customerPath(organizationId, customerId), {
    method: 'PATCH',
    body,
  });
}

export function setCustomerStatus(
  organizationId: string,
  customerId: string,
  action: 'archive' | 'restore',
) {
  return apiRequest<CustomerResponse>(`${customerPath(organizationId, customerId)}/${action}`, {
    method: 'POST',
  });
}

// --- Orders --------------------------------------------------------------------------

export function listOrders(
  organizationId: string,
  query: OrderListQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<OrderListResponse>(`${base(organizationId)}/orders${toSearchParams(query)}`, {
    signal: options?.signal,
  });
}

export function getOrder(
  organizationId: string,
  orderId: string,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<OrderResponse>(orderPath(organizationId, orderId), { signal: options?.signal });
}

export function createOrder(organizationId: string, body: CreateOrderRequest) {
  return apiRequest<OrderResponse>(`${base(organizationId)}/orders`, { method: 'POST', body });
}

export function updateOrder(organizationId: string, orderId: string, body: UpdateOrderRequest) {
  return apiRequest<OrderResponse>(orderPath(organizationId, orderId), { method: 'PATCH', body });
}

/** confirm, process, ship, complete, or cancel: each is its own endpoint. */
export function runOrderAction(organizationId: string, orderId: string, action: OrderAction) {
  return apiRequest<OrderResponse>(`${orderPath(organizationId, orderId)}/${action}`, {
    method: 'POST',
  });
}
