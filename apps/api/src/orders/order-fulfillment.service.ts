import type { OrderResponse } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction } from '../activity/activity-log.js';
import { PrismaService } from '../database/prisma.service.js';
import { StockOperationsService } from '../inventory/stock-operations.service.js';
import { runStockTransaction } from '../inventory/stock-transaction.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import { orderEmpty } from './order-errors.js';
import { OrdersService } from './orders.service.js';

/**
 * CONFIRMED → PROCESSING: the one point where an order changes stock.
 *
 * ONE transaction (the Phase 6 stock transaction, so lost lock races answer
 * 409 INVENTORY_CONCURRENCY_CONFLICT):
 *   1. lock the order row FOR UPDATE and re-check it is still CONFIRMED
 *      (a concurrent or repeated request waits, then fails: no double deduction);
 *   2. StockOperationsService.issueForOrder locks the warehouse, the products
 *      (id order), and the inventory rows (product-id order), reads quantities
 *      under those locks, checks EVERY line, then writes one SALE movement per
 *      line (reference ORDER + order id);
 *   3. set PROCESSING and record ORDER_PROCESSING.
 * Any failure — a short line, an archived warehouse or product — rolls all of
 * it back: the order stays CONFIRMED and no stock or movement changes remain.
 */
@Injectable()
export class OrderFulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly stock: StockOperationsService,
  ) {}

  async process(context: OrganizationContext, orderId: string): Promise<OrderResponse> {
    const organizationId = context.organization.id;
    await runStockTransaction(this.prisma, async (tx) => {
      const order = await this.orders.lockForTransition(tx, organizationId, orderId, 'PROCESSING');
      const items = await tx.orderItem.findMany({
        where: { organizationId, orderId: order.id },
        select: {
          id: true,
          productId: true,
          quantity: true,
          productNameSnapshot: true,
          skuSnapshot: true,
        },
      });
      if (items.length === 0) throw orderEmpty();

      const movements = await this.stock.issueForOrder(tx, context, {
        id: order.id,
        orderNumber: order.orderNumber,
        warehouseId: order.warehouseId,
        lines: items.map((item) => ({
          itemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          label: `${item.productNameSnapshot} (${item.skuSnapshot})`,
        })),
      });

      await this.orders.setStatus(
        tx,
        context,
        order,
        'PROCESSING',
        ActivityAction.ORDER_PROCESSING,
        {
          orderId: order.id,
          warehouseId: order.warehouseId,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
          movementIds: movements.map((movement) => movement.id),
        },
      );
    });
    return this.orders.get(organizationId, orderId);
  }
}
