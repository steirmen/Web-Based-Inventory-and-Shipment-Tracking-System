import type { Order, OrderHistoryEntry, OrderListItem } from '@app/shared';
import { toMoney } from '../catalog/catalog-mappers.js';
import type { Prisma } from '../generated/prisma/client.js';

/** List columns: customer, warehouse, and line count come from the same query (no N+1). */
export const ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, companyName: true, isActive: true } },
  warehouse: { select: { id: true, name: true, code: true, isActive: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

/** Detail: lines render from their snapshots; only the product's current status is joined. */
export const ORDER_SELECT = {
  ...ORDER_LIST_SELECT,
  notes: true,
  subtotal: true,
  items: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      productId: true,
      productNameSnapshot: true,
      skuSnapshot: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
      product: { select: { status: true } },
    },
  },
} satisfies Prisma.OrderSelect;

type OrderListRow = Prisma.OrderGetPayload<{ select: typeof ORDER_LIST_SELECT }>;
type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

export function toOrderListItem(row: OrderListRow): OrderListItem {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    customer: row.customer,
    warehouse: row.warehouse,
    itemCount: row._count.items,
    total: toMoney(row.total),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toOrder(
  row: OrderRow,
  /** Current stock per product in the order's warehouse (DRAFT/CONFIRMED only). */
  available: Map<string, number> | null,
  history: OrderHistoryEntry[],
): Order {
  return {
    ...toOrderListItem(row),
    notes: row.notes,
    subtotal: toMoney(row.subtotal),
    totalQuantity: row.items.reduce((sum, item) => sum + item.quantity, 0),
    items: row.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      sku: item.skuSnapshot,
      unitPrice: toMoney(item.unitPrice),
      quantity: item.quantity,
      lineTotal: toMoney(item.lineTotal),
      productStatus: item.product.status,
      availableQuantity: available ? (available.get(item.productId) ?? 0) : null,
    })),
    history,
  };
}
