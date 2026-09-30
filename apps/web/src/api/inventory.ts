import type {
  AdjustStockRequest,
  AdjustStockResponse,
  CreateWarehouseRequest,
  DamageStockRequest,
  InventoryListQuery,
  InventoryListResponse,
  IssueStockRequest,
  ReceiveStockRequest,
  StockMovementListQuery,
  StockMovementListResponse,
  StockOperationResponse,
  TransferStockRequest,
  TransferStockResponse,
  UpdateWarehouseRequest,
  WarehouseListResponse,
  WarehouseResponse,
} from '@app/shared';
import { apiRequest } from './http-client';
import { organizationKeys } from './organizations';

/**
 * Warehouse, inventory, and stock movement query keys. All live under the
 * organization, so one workspace's cache entries can never answer a query of
 * another workspace, and organization-level invalidation reaches them.
 */
export const inventoryKeys = {
  warehouses: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'warehouses'] as const,
  warehouseList: (organizationId: string) =>
    [...inventoryKeys.warehouses(organizationId), 'list'] as const,
  warehouse: (organizationId: string, warehouseId: string) =>
    [...inventoryKeys.warehouses(organizationId), 'item', warehouseId] as const,
  inventory: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'inventory'] as const,
  inventoryList: (organizationId: string, query: InventoryListQuery) =>
    [...inventoryKeys.inventory(organizationId), 'list', query] as const,
  stockMovements: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'stock-movements'] as const,
  stockMovementList: (organizationId: string, query: StockMovementListQuery) =>
    [...inventoryKeys.stockMovements(organizationId), 'list', query] as const,
};

const base = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`;
const warehousePath = (organizationId: string, warehouseId: string) =>
  `${base(organizationId)}/warehouses/${encodeURIComponent(warehouseId)}`;

/** Serializes only the parameters that are set. Filtering and paging happen on the server. */
function toSearchParams(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

// --- Warehouses ----------------------------------------------------------------------

export function listWarehouses(organizationId: string, options?: { signal?: AbortSignal }) {
  return apiRequest<WarehouseListResponse>(`${base(organizationId)}/warehouses`, {
    signal: options?.signal,
  });
}

export function getWarehouse(
  organizationId: string,
  warehouseId: string,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<WarehouseResponse>(warehousePath(organizationId, warehouseId), {
    signal: options?.signal,
  });
}

export function createWarehouse(organizationId: string, body: CreateWarehouseRequest) {
  return apiRequest<WarehouseResponse>(`${base(organizationId)}/warehouses`, {
    method: 'POST',
    body,
  });
}

export function updateWarehouse(
  organizationId: string,
  warehouseId: string,
  body: UpdateWarehouseRequest,
) {
  return apiRequest<WarehouseResponse>(warehousePath(organizationId, warehouseId), {
    method: 'PATCH',
    body,
  });
}

export function setWarehouseStatus(
  organizationId: string,
  warehouseId: string,
  action: 'archive' | 'restore',
) {
  return apiRequest<WarehouseResponse>(`${warehousePath(organizationId, warehouseId)}/${action}`, {
    method: 'POST',
  });
}

// --- Inventory & movements ---------------------------------------------------------

export function listInventory(
  organizationId: string,
  query: InventoryListQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<InventoryListResponse>(
    `${base(organizationId)}/inventory${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

export function listStockMovements(
  organizationId: string,
  query: StockMovementListQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<StockMovementListResponse>(
    `${base(organizationId)}/stock-movements${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

/** Every stock operation, keyed by its endpoint name. */
export type StockOperation =
  | { kind: 'receive'; body: ReceiveStockRequest }
  | { kind: 'issue'; body: IssueStockRequest }
  | { kind: 'damage'; body: DamageStockRequest }
  | { kind: 'adjust'; body: AdjustStockRequest }
  | { kind: 'transfer'; body: TransferStockRequest };

export type StockOperationResult =
  | { kind: 'receive' | 'issue' | 'damage'; data: StockOperationResponse }
  | { kind: 'adjust'; data: AdjustStockResponse }
  | { kind: 'transfer'; data: TransferStockResponse };

export async function runStockOperation(
  organizationId: string,
  operation: StockOperation,
): Promise<StockOperationResult> {
  const path = `${base(organizationId)}/inventory/${operation.kind}`;
  switch (operation.kind) {
    case 'adjust':
      return {
        kind: 'adjust',
        data: await apiRequest<AdjustStockResponse>(path, { method: 'POST', body: operation.body }),
      };
    case 'transfer':
      return {
        kind: 'transfer',
        data: await apiRequest<TransferStockResponse>(path, {
          method: 'POST',
          body: operation.body,
        }),
      };
    default:
      return {
        kind: operation.kind,
        data: await apiRequest<StockOperationResponse>(path, {
          method: 'POST',
          body: operation.body,
        }),
      };
  }
}
