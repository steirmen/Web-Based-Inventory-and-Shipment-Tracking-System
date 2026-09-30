import type { InventoryItem, StockMovement, StockStatus, Warehouse } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** OUT_OF_STOCK at 0, LOW_STOCK up to and including the reorder level, IN_STOCK above it. */
export function stockStatus(quantity: number, minimumStock: number): StockStatus {
  if (quantity === 0) return 'OUT_OF_STOCK';
  return quantity <= minimumStock ? 'LOW_STOCK' : 'IN_STOCK';
}

// --- Warehouses ----------------------------------------------------------------------

export const WAREHOUSE_SELECT = {
  id: true,
  name: true,
  code: true,
  address: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarehouseSelect;

type WarehouseRow = Prisma.WarehouseGetPayload<{ select: typeof WAREHOUSE_SELECT }>;

export interface WarehouseTotals {
  productCount: number;
  totalUnits: number;
}

export const NO_STOCK: WarehouseTotals = { productCount: 0, totalUnits: 0 };

export function toWarehouse(row: WarehouseRow, totals: WarehouseTotals = NO_STOCK): Warehouse {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    isActive: row.isActive,
    productCount: totals.productCount,
    totalUnits: totals.totalUnits,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --- Inventory -----------------------------------------------------------------------

const WAREHOUSE_REF_SELECT = {
  id: true,
  name: true,
  code: true,
  isActive: true,
} satisfies Prisma.WarehouseSelect;

const PRODUCT_REF_SELECT = {
  id: true,
  name: true,
  sku: true,
  status: true,
} satisfies Prisma.ProductSelect;

export const INVENTORY_SELECT = {
  id: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
  warehouse: { select: WAREHOUSE_REF_SELECT },
  product: { select: { ...PRODUCT_REF_SELECT, minimumStock: true } },
} satisfies Prisma.InventorySelect;

type InventoryRow = Prisma.InventoryGetPayload<{ select: typeof INVENTORY_SELECT }>;

export function toInventoryItem(row: InventoryRow): InventoryItem {
  const { minimumStock, ...product } = row.product;
  return {
    id: row.id,
    warehouse: row.warehouse,
    product,
    quantity: row.quantity,
    minimumStock,
    status: stockStatus(row.quantity, minimumStock),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// --- Stock movements -----------------------------------------------------------------

export const STOCK_MOVEMENT_SELECT = {
  id: true,
  movementType: true,
  quantityDelta: true,
  quantityBefore: true,
  quantityAfter: true,
  reason: true,
  referenceType: true,
  referenceId: true,
  transferGroupId: true,
  createdAt: true,
  // Only the name: emails and other account data are never part of the ledger view.
  actor: { select: { id: true, name: true } },
  warehouse: { select: WAREHOUSE_REF_SELECT },
  product: { select: PRODUCT_REF_SELECT },
} satisfies Prisma.StockMovementSelect;

type StockMovementRow = Prisma.StockMovementGetPayload<{ select: typeof STOCK_MOVEMENT_SELECT }>;

export function toStockMovement(row: StockMovementRow): StockMovement {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
