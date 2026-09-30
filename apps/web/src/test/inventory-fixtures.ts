import type {
  InventoryItem,
  InventoryListResponse,
  StockMovement,
  StockMovementListResponse,
  Warehouse,
} from '@app/shared';

/** Test data for warehouse, inventory, and stock movement screens. */

export function testWarehouse(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: '0198c0de-0000-7000-8000-0000000000a1',
    name: 'Main Warehouse',
    code: 'MAIN',
    address: '1 Harbour Road',
    isActive: true,
    productCount: 3,
    totalUnits: 120,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
    ...overrides,
  };
}

export const mainWarehouse = testWarehouse();
export const eastWarehouse = testWarehouse({
  id: '0198c0de-0000-7000-8000-0000000000a2',
  name: 'East Depot',
  code: 'EAST',
  address: null,
  productCount: 1,
  totalUnits: 10,
});
export const closedWarehouse = testWarehouse({
  id: '0198c0de-0000-7000-8000-0000000000a3',
  name: 'Old Store',
  code: 'OLD',
  isActive: false,
  productCount: 0,
  totalUnits: 0,
});

const ref = (warehouse: Warehouse) => ({
  id: warehouse.id,
  name: warehouse.name,
  code: warehouse.code,
  isActive: warehouse.isActive,
});

export const keyboard = {
  id: '0198c0de-0000-7000-8000-0000000000d1',
  name: 'Keyboard K2',
  sku: 'KEY-002',
  status: 'ACTIVE' as const,
};

export function testInventory(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '0198c0de-0000-7000-8000-0000000000e1',
    warehouse: ref(mainWarehouse),
    product: keyboard,
    quantity: 12,
    minimumStock: 5,
    status: 'IN_STOCK',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
    ...overrides,
  };
}

export const keyboardInMain = testInventory();
export const keyboardInEast = testInventory({
  id: '0198c0de-0000-7000-8000-0000000000e2',
  warehouse: ref(eastWarehouse),
  quantity: 3,
  status: 'LOW_STOCK',
});

export function inventoryPage(items: InventoryItem[]): InventoryListResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
    },
  };
}

export function testMovement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: '0198c0de-0000-7000-8000-0000000000f1',
    movementType: 'PURCHASE',
    quantityDelta: 50,
    quantityBefore: 0,
    quantityAfter: 50,
    reason: 'Supplier delivery',
    actor: { id: '0198c0de-0000-7000-8000-000000000001', name: 'Ada Example' },
    warehouse: ref(mainWarehouse),
    product: keyboard,
    referenceType: null,
    referenceId: null,
    transferGroupId: null,
    createdAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

export function movementPage(
  items: StockMovement[],
  pagination: Partial<StockMovementListResponse['pagination']> = {},
): StockMovementListResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
      ...pagination,
    },
  };
}
