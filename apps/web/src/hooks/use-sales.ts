import type {
  CreateCustomerRequest,
  CustomerStatus,
  CreateOrderRequest,
  CustomerListQuery,
  OrderAction,
  OrderListQuery,
  UpdateCustomerRequest,
  UpdateOrderRequest,
} from '@app/shared';
import {
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { inventoryKeys } from '@/api/inventory';
import {
  createCustomer,
  createOrder,
  getCustomer,
  getOrder,
  listCustomers,
  listOrders,
  runOrderAction,
  salesKeys,
  setCustomerStatus,
  updateCustomer,
  updateOrder,
} from '@/api/sales';
import { refreshAccessOnDenial } from './use-organizations';

// --- Customers -----------------------------------------------------------------------

/** One server-side page of customers. The previous page stays visible while the next loads. */
export function useCustomers(
  organizationId: string,
  query: CustomerListQuery,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: salesKeys.customerList(organizationId, query),
    queryFn: ({ signal }) => listCustomers(organizationId, query, { signal }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

/** Customers per page in the customer picker (more load on demand). */
export const CUSTOMER_SEARCH_PAGE_SIZE = 20;

/**
 * Server-side customer search for pickers: pages of 20 sorted by name, more
 * on demand (`fetchNextPage`), so any customer is reachable without loading
 * the whole list. Keys live under the organization.
 */
export function useCustomerSearch(
  organizationId: string,
  { search, status }: { search: string; status?: CustomerStatus },
) {
  return useInfiniteQuery({
    queryKey: [...salesKeys.customers(organizationId), 'search', { search, status }] as const,
    queryFn: ({ pageParam, signal }) =>
      listCustomers(
        organizationId,
        {
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          sortBy: 'name',
          sortOrder: 'asc',
          page: pageParam,
          pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
        },
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

/** One customer. 404 = unknown, malformed, or in another organization. */
export function useCustomer(organizationId: string, customerId: string) {
  return useQuery({
    queryKey: salesKeys.customer(organizationId, customerId),
    queryFn: ({ signal }) => getCustomer(organizationId, customerId, { signal }),
    retry: false,
    enabled: customerId !== '',
  });
}

/** Customer changes also show up on orders (customer name and status). */
function onCustomerChanged(queryClient: QueryClient, organizationId: string) {
  void queryClient.invalidateQueries({ queryKey: salesKeys.customers(organizationId) });
  void queryClient.invalidateQueries({ queryKey: salesKeys.orders(organizationId) });
}

export function useCreateCustomer(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCustomerRequest) => createCustomer(organizationId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: salesKeys.customers(organizationId) }),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useUpdateCustomer(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, body }: { customerId: string; body: UpdateCustomerRequest }) =>
      updateCustomer(organizationId, customerId, body),
    onSuccess: ({ customer }) => {
      queryClient.setQueryData(salesKeys.customer(organizationId, customer.id), { customer });
      onCustomerChanged(queryClient, organizationId);
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useCustomerStatusChange(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, action }: { customerId: string; action: 'archive' | 'restore' }) =>
      setCustomerStatus(organizationId, customerId, action),
    onSuccess: ({ customer }) => {
      queryClient.setQueryData(salesKeys.customer(organizationId, customer.id), { customer });
      onCustomerChanged(queryClient, organizationId);
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

// --- Orders --------------------------------------------------------------------------

export function useOrders(organizationId: string, query: OrderListQuery) {
  return useQuery({
    queryKey: salesKeys.orderList(organizationId, query),
    queryFn: ({ signal }) => listOrders(organizationId, query, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** One order. 404 = unknown, malformed, or in another organization. */
export function useOrder(organizationId: string, orderId: string) {
  return useQuery({
    queryKey: salesKeys.order(organizationId, orderId),
    queryFn: ({ signal }) => getOrder(organizationId, orderId, { signal }),
    retry: false,
  });
}

/** Orders show on customers (order count), so both lists are refreshed. */
function onOrderChanged(queryClient: QueryClient, organizationId: string) {
  void queryClient.invalidateQueries({ queryKey: salesKeys.orders(organizationId) });
  void queryClient.invalidateQueries({ queryKey: salesKeys.customers(organizationId) });
}

export function useCreateOrder(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderRequest) => createOrder(organizationId, body),
    onSuccess: ({ order }) => {
      queryClient.setQueryData(salesKeys.order(organizationId, order.id), { order });
      onOrderChanged(queryClient, organizationId);
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useUpdateOrder(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: UpdateOrderRequest }) =>
      updateOrder(organizationId, orderId, body),
    onSuccess: ({ order }) => {
      queryClient.setQueryData(salesKeys.order(organizationId, order.id), { order });
      onOrderChanged(queryClient, organizationId);
    },
    onError: (error) => {
      refreshAccessOnDenial(queryClient, organizationId, error);
      // E.g. ORDER_NOT_EDITABLE: someone else moved the order on. Show the real state.
      onOrderChanged(queryClient, organizationId);
    },
  });
}

/**
 * confirm / process / ship / complete / cancel. Processing changes stock, so
 * inventory, movements, and warehouse totals are refreshed too. On failure
 * (e.g. insufficient stock, or someone else already moved the order on) the
 * order and stock are reloaded from the server — nothing is kept optimistically.
 */
export function useOrderAction(organizationId: string) {
  const queryClient = useQueryClient();
  const refresh = (action: OrderAction) => {
    onOrderChanged(queryClient, organizationId);
    if (action === 'process') {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.inventory(organizationId) });
      void queryClient.invalidateQueries({
        queryKey: inventoryKeys.stockMovements(organizationId),
      });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouses(organizationId) });
    }
  };
  return useMutation({
    mutationFn: ({ orderId, action }: { orderId: string; action: OrderAction }) =>
      runOrderAction(organizationId, orderId, action),
    onSuccess: ({ order }, { action }) => {
      queryClient.setQueryData(salesKeys.order(organizationId, order.id), { order });
      refresh(action);
    },
    onError: (error, { action }) => {
      refreshAccessOnDenial(queryClient, organizationId, error);
      refresh(action);
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.inventory(organizationId) });
    },
  });
}
