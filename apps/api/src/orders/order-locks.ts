import type { OrderStatus } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';

export interface LockedOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerId: string | null;
  warehouseId: string;
}

/**
 * Locks this organization's order row FOR UPDATE until the transaction ends,
 * so every status check and change (and every draft edit) on one order runs
 * one after another: a second "process" waits, then sees PROCESSING and fails.
 * The order row is always the FIRST lock an order operation takes.
 */
export async function lockOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  orderId: string,
): Promise<LockedOrder | null> {
  const [row] = await tx.$queryRaw<LockedOrder[]>`
    SELECT id, order_number AS "orderNumber", status::text AS status,
           customer_id AS "customerId", warehouse_id AS "warehouseId"
    FROM orders
    WHERE organization_id = ${organizationId}::uuid AND id = ${orderId}::uuid
    FOR UPDATE`;
  return row ?? null;
}
