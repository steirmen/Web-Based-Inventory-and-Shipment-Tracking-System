import type {
  CreateWarehouseRequest,
  InventoryListQuery,
  StockMovementListQuery,
  UpdateWarehouseRequest,
} from '@app/shared';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createWarehouse,
  getWarehouse,
  inventoryKeys,
  listInventory,
  listStockMovements,
  listWarehouses,
  runStockOperation,
  type StockOperation,
  setWarehouseStatus,
  updateWarehouse,
} from '@/api/inventory';
import { refreshAccessOnDenial } from './use-organizations';

export function useWarehouses(organizationId: string) {
  return useQuery({
    queryKey: inventoryKeys.warehouseList(organizationId),
    queryFn: ({ signal }) => listWarehouses(organizationId, { signal }),
  });
}

/** One warehouse. 404 = unknown, malformed, or in another organization. */
export function useWarehouse(organizationId: string, warehouseId: string) {
  return useQuery({
    queryKey: inventoryKeys.warehouse(organizationId, warehouseId),
    queryFn: ({ signal }) => getWarehouse(organizationId, warehouseId, { signal }),
    retry: false,
  });
}

/** One server-side page of stock records. The previous page stays visible while the next loads. */
export function useInventory(
  organizationId: string,
  query: InventoryListQuery,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: inventoryKeys.inventoryList(organizationId, query),
    queryFn: ({ signal }) => listInventory(organizationId, query, { signal }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useStockMovements(organizationId: string, query: StockMovementListQuery) {
  return useQuery({
    queryKey: inventoryKeys.stockMovementList(organizationId, query),
    queryFn: ({ signal }) => listStockMovements(organizationId, query, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Warehouse changes affect the warehouse list/detail and the warehouse shown on stock rows. */
function onWarehouseChanged(queryClient: QueryClient, organizationId: string) {
  void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouses(organizationId) });
  void queryClient.invalidateQueries({ queryKey: inventoryKeys.inventory(organizationId) });
  void queryClient.invalidateQueries({ queryKey: inventoryKeys.stockMovements(organizationId) });
}

export function useCreateWarehouse(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWarehouseRequest) => createWarehouse(organizationId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouses(organizationId) }),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useUpdateWarehouse(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ warehouseId, body }: { warehouseId: string; body: UpdateWarehouseRequest }) =>
      updateWarehouse(organizationId, warehouseId, body),
    onSuccess: ({ warehouse }) => {
      queryClient.setQueryData(inventoryKeys.warehouse(organizationId, warehouse.id), {
        warehouse,
      });
      onWarehouseChanged(queryClient, organizationId);
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useWarehouseStatusChange(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ warehouseId, action }: { warehouseId: string; action: 'archive' | 'restore' }) =>
      setWarehouseStatus(organizationId, warehouseId, action),
    onSuccess: ({ warehouse }) => {
      queryClient.setQueryData(inventoryKeys.warehouse(organizationId, warehouse.id), {
        warehouse,
      });
      onWarehouseChanged(queryClient, organizationId);
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

/**
 * Receive, issue, damage, adjust, or transfer. On success the stock lists,
 * the movement history, and the warehouse totals of this organization are
 * refreshed. On failure the stock is refreshed too, because a conflict (e.g.
 * INVENTORY_INSUFFICIENT_STOCK) means what is shown is out of date.
 */
export function useStockOperation(organizationId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.inventory(organizationId) });
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.stockMovements(organizationId) });
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.warehouses(organizationId) });
  };
  return useMutation({
    mutationFn: (operation: StockOperation) => runStockOperation(organizationId, operation),
    onSuccess: refresh,
    onError: (error) => {
      refreshAccessOnDenial(queryClient, organizationId, error);
      refresh();
    },
  });
}
