import {
  canTransition,
  ORDER_LIMITS,
  type OrderHistoryEntry,
  type OrderListResponse,
  type OrderResponse,
  type OrderSortField,
  type OrderStatus,
  type SortOrder,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { instantRange } from '../common/time/local-days.js';
import { escapeLikePattern } from '../common/validation/like-pattern.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import type {
  CreateOrderDto,
  OrderItemInputDto,
  OrderListQueryDto,
  UpdateOrderDto,
} from './dto/order.dto.js';
import {
  orderCustomerInactive,
  orderCustomerNotFound,
  orderCustomerRequired,
  orderDuplicateProducts,
  orderEmpty,
  orderInvalidTransition,
  orderNotEditable,
  orderNotFound,
  orderProductInactive,
  orderProductNotFound,
  orderStatusInvalid,
  orderWarehouseInactive,
  orderWarehouseNotFound,
} from './order-errors.js';
import { type LockedOrder, lockOrder } from './order-locks.js';
import { ORDER_LIST_SELECT, ORDER_SELECT, toOrder, toOrderListItem } from './order-mappers.js';
import { nextOrderNumber } from './order-number.js';
import { orderTotals } from './order-totals.js';

type Tx = Prisma.TransactionClient;
type Client = Tx | PrismaService;

/** Stock is shown next to the lines only while it can still matter (before fulfillment). */
const SHOWS_STOCK: readonly OrderStatus[] = ['DRAFT', 'CONFIRMED'];

/** Lifecycle steps without stock effect, and the activity each one records. */
const SIMPLE_TRANSITIONS = {
  SHIPPED: ActivityAction.ORDER_SHIPPED,
  COMPLETED: ActivityAction.ORDER_COMPLETED,
  CANCELLED: ActivityAction.ORDER_CANCELLED,
} as const;

function orderByFor(
  field: OrderSortField,
  order: SortOrder,
): Prisma.OrderOrderByWithRelationInput[] {
  // Unique tie-breaker so pages never overlap or skip rows.
  return [{ [field]: order } as Prisma.OrderOrderByWithRelationInput, { id: 'asc' }];
}

const label = (product: { name: string; sku: string }) => `${product.name} (${product.sku})`;

interface OrderProduct {
  id: string;
  name: string;
  sku: string;
  price: Prisma.Decimal;
  status: 'ACTIVE' | 'ARCHIVED';
}

/**
 * Organization-scoped orders: listing, drafts, and the lifecycle steps that
 * don't touch stock. Processing (the stock deduction) is OrderFulfillmentService.
 *
 * Every mutation locks the order row first (lockOrder) and re-checks its
 * status under that lock, so edits and transitions of one order never
 * interleave. Line prices are snapshots: a line keeps the price, name, and SKU
 * it was added with, and totals are computed from those snapshots only.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: OrderListQueryDto): Promise<OrderListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? ORDER_LIMITS.pageSizeDefault;
    if (query.customerId) await this.findCustomer(this.prisma, organizationId, query.customerId);
    if (query.warehouseId) await this.findWarehouse(this.prisma, organizationId, query.warehouseId);

    // Dates are local days in `timeZone` (default UTC), exactly as on the dashboard.
    const createdAt = instantRange(query.from, query.to, query.timeZone);

    const search = query.search ? escapeLikePattern(query.search) : undefined;
    const where: Prisma.OrderWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { companyName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: orderByFor(query.sortBy ?? 'createdAt', query.sortOrder ?? 'desc'),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: ORDER_LIST_SELECT,
      }),
    ]);
    return {
      items: rows.map(toOrderListItem),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  get(organizationId: string, orderId: string): Promise<OrderResponse> {
    return this.read(this.prisma, organizationId, orderId);
  }

  /** Creates a DRAFT with a server-generated number. No stock effect. */
  create(context: OrganizationContext, input: CreateOrderDto): Promise<OrderResponse> {
    const organizationId = context.organization.id;
    return this.prisma.$transaction(async (tx) => {
      await this.activeCustomer(tx, organizationId, input.customerId);
      await this.activeWarehouse(tx, organizationId, input.warehouseId);
      const items = input.items ?? [];
      assertUniqueProducts(items);
      const products = await this.products(tx, organizationId, items);
      const lines = items.map((item) => {
        const product = products.get(item.productId)!;
        if (product.status !== 'ACTIVE') throw orderProductInactive(label(product));
        // Price snapshot: the product's current price at the moment the line is added.
        return {
          productId: product.id,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitPrice: product.price,
          quantity: item.quantity,
        };
      });
      const { lineTotals, subtotal, total } = orderTotals(lines);
      const orderNumber = await nextOrderNumber(tx, organizationId);

      const order = await tx.order.create({
        data: {
          organizationId,
          orderNumber,
          customerId: input.customerId,
          warehouseId: input.warehouseId,
          notes: input.notes ?? null,
          subtotal,
          total,
          // organizationId and orderId are inherited from the order (composite relation).
          items: {
            create: lines.map((line, index) => ({ ...line, lineTotal: lineTotals[index]! })),
          },
        },
        select: { id: true },
      });
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.ORDER_CREATED,
        entityType: 'Order',
        entityId: order.id,
        metadata: {
          orderNumber,
          customerId: input.customerId,
          warehouseId: input.warehouseId,
          itemCount: lines.length,
          total: total.toFixed(2),
        },
      });
      return this.read(tx, organizationId, order.id);
    });
  }

  /**
   * Edits a DRAFT. `items` replaces the whole list: a product already on the
   * order keeps its line (and price snapshot) with the new quantity; a new
   * product gets a line at its current price; missing products are removed.
   */
  async update(
    context: OrganizationContext,
    orderId: string,
    input: UpdateOrderDto,
  ): Promise<OrderResponse> {
    if (input.status !== undefined) throw orderStatusInvalid();
    const organizationId = context.organization.id;

    return this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, organizationId, orderId);
      if (!order) throw orderNotFound();
      if (order.status !== 'DRAFT') throw orderNotEditable(order.orderNumber, order.status);

      const data: Prisma.OrderUncheckedUpdateInput = {};
      const changes: string[] = [];
      if (input.customerId !== undefined && input.customerId !== order.customerId) {
        await this.activeCustomer(tx, organizationId, input.customerId);
        data.customerId = input.customerId;
        changes.push('customer');
      }
      if (input.warehouseId !== undefined && input.warehouseId !== order.warehouseId) {
        await this.activeWarehouse(tx, organizationId, input.warehouseId);
        data.warehouseId = input.warehouseId;
        changes.push('warehouse');
      }
      if (input.notes !== undefined) {
        const current = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          select: { notes: true },
        });
        if (input.notes !== current.notes) {
          data.notes = input.notes;
          changes.push('notes');
        }
      }
      if (
        input.items !== undefined &&
        (await this.replaceItems(tx, organizationId, order, input.items))
      ) {
        changes.push('items');
      }
      if (changes.length === 0) return this.read(tx, organizationId, order.id);

      // Totals always come from the stored line snapshots.
      const lines = await tx.orderItem.findMany({
        where: { organizationId, orderId: order.id },
        select: { unitPrice: true, quantity: true },
      });
      const { total, subtotal } = orderTotals(lines);
      await tx.order.update({ where: { id: order.id }, data: { ...data, subtotal, total } });
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.ORDER_UPDATED,
        entityType: 'Order',
        entityId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          changes,
          itemCount: lines.length,
          total: total.toFixed(2),
        },
      });
      return this.read(tx, organizationId, order.id);
    });
  }

  /**
   * DRAFT → CONFIRMED. Requires an active customer and warehouse and at least
   * one line whose product is still active. No stock effect: stock is only
   * checked and deducted when the order is processed.
   */
  confirm(context: OrganizationContext, orderId: string): Promise<OrderResponse> {
    const organizationId = context.organization.id;
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockForTransition(tx, organizationId, orderId, 'CONFIRMED');
      if (!order.customerId) throw orderCustomerRequired();

      // Share locks: an archive of the customer, warehouse, or a product waits for this commit.
      const [customer] = await tx.$queryRaw<{ name: string; is_active: boolean }[]>`
        SELECT name, is_active FROM customers
        WHERE organization_id = ${organizationId}::uuid AND id = ${order.customerId}::uuid FOR SHARE`;
      if (!customer?.is_active) throw orderCustomerInactive(customer?.name ?? 'The customer');
      const [warehouse] = await tx.$queryRaw<{ code: string; is_active: boolean }[]>`
        SELECT code, is_active FROM warehouses
        WHERE organization_id = ${organizationId}::uuid AND id = ${order.warehouseId}::uuid FOR SHARE`;
      if (!warehouse?.is_active) throw orderWarehouseInactive(warehouse?.code ?? '');

      const items = await tx.orderItem.findMany({
        where: { organizationId, orderId: order.id },
        select: { productId: true, quantity: true, productNameSnapshot: true, skuSnapshot: true },
        orderBy: { productId: 'asc' },
      });
      if (items.length === 0) throw orderEmpty();
      for (const item of items) {
        const [product] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status::text AS status FROM products
          WHERE organization_id = ${organizationId}::uuid AND id = ${item.productId}::uuid FOR SHARE`;
        if (product?.status !== 'ACTIVE') {
          throw orderProductInactive(`${item.productNameSnapshot} (${item.skuSnapshot})`);
        }
      }

      const totals = await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { total: true },
      });
      await this.setStatus(tx, context, order, 'CONFIRMED', ActivityAction.ORDER_CONFIRMED, {
        itemCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        total: totals.total.toFixed(2),
      });
      return this.read(tx, organizationId, order.id);
    });
  }

  /** PROCESSING → SHIPPED, SHIPPED → COMPLETED, DRAFT/CONFIRMED → CANCELLED. No stock effect. */
  transition(
    context: OrganizationContext,
    orderId: string,
    target: keyof typeof SIMPLE_TRANSITIONS,
  ): Promise<OrderResponse> {
    const organizationId = context.organization.id;
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockForTransition(tx, organizationId, orderId, target);
      await this.setStatus(tx, context, order, target, SIMPLE_TRANSITIONS[target], {});
      return this.read(tx, organizationId, order.id);
    });
  }

  /** Locks the order and checks the state machine under the lock. */
  async lockForTransition(
    tx: Tx,
    organizationId: string,
    orderId: string,
    target: OrderStatus,
  ): Promise<LockedOrder> {
    const order = await lockOrder(tx, organizationId, orderId);
    if (!order) throw orderNotFound();
    if (!canTransition(order.status, target)) {
      throw orderInvalidTransition(order.orderNumber, order.status, target);
    }
    return order;
  }

  /** Conditional status update (from the locked status) plus its activity entry, in `tx`. */
  async setStatus(
    tx: Tx,
    context: OrganizationContext,
    order: LockedOrder,
    target: OrderStatus,
    action: ActivityAction,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    const organizationId = context.organization.id;
    const { count } = await tx.order.updateMany({
      where: { id: order.id, organizationId, status: order.status },
      data: { status: target },
    });
    // Unreachable while the row lock is held; kept as a guard against lost updates.
    if (count !== 1) throw orderInvalidTransition(order.orderNumber, order.status, target);
    await recordActivity(tx, {
      organizationId,
      actorUserId: context.user.id,
      action,
      entityType: 'Order',
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, from: order.status, to: target, ...metadata },
    });
  }

  async read(client: Client, organizationId: string, orderId: string): Promise<OrderResponse> {
    const row = await client.order.findFirst({
      where: { id: orderId, organizationId },
      select: ORDER_SELECT,
    });
    if (!row) throw orderNotFound();

    const [stock, history] = await Promise.all([
      SHOWS_STOCK.includes(row.status) && row.items.length > 0
        ? client.inventory.findMany({
            where: {
              organizationId,
              warehouseId: row.warehouse.id,
              productId: { in: row.items.map((item) => item.productId) },
            },
            select: { productId: true, quantity: true },
          })
        : null,
      client.activityLog.findMany({
        where: { organizationId, entityType: 'Order', entityId: row.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { action: true, createdAt: true, actor: { select: { id: true, name: true } } },
      }),
    ]);
    const available = stock
      ? new Map(stock.map((entry) => [entry.productId, entry.quantity]))
      : null;
    const entries: OrderHistoryEntry[] = history.map((entry) => ({
      action: entry.action,
      actor: entry.actor,
      createdAt: entry.createdAt.toISOString(),
    }));
    return { order: toOrder(row, available, entries) };
  }

  /** Applies a complete new line list to a locked DRAFT. Returns whether anything changed. */
  private async replaceItems(
    tx: Tx,
    organizationId: string,
    order: LockedOrder,
    items: OrderItemInputDto[],
  ): Promise<boolean> {
    assertUniqueProducts(items);
    const current = await tx.orderItem.findMany({
      where: { organizationId, orderId: order.id },
      select: { id: true, productId: true, quantity: true, unitPrice: true },
    });
    const byProduct = new Map(current.map((line) => [line.productId, line]));
    const wanted = new Set(items.map((item) => item.productId));
    const products = await this.products(tx, organizationId, items);
    let changed = false;

    const removed = current.filter((line) => !wanted.has(line.productId));
    if (removed.length > 0) {
      await tx.orderItem.deleteMany({
        where: { organizationId, orderId: order.id, id: { in: removed.map((line) => line.id) } },
      });
      changed = true;
    }
    for (const item of items) {
      const existing = byProduct.get(item.productId);
      if (existing) {
        if (existing.quantity !== item.quantity) {
          // Keeps the snapshot: same unit price, new quantity.
          const { lineTotals } = orderTotals([
            { unitPrice: existing.unitPrice, quantity: item.quantity },
          ]);
          await tx.orderItem.update({
            where: { id: existing.id },
            data: { quantity: item.quantity, lineTotal: lineTotals[0]! },
          });
          changed = true;
        }
        continue;
      }
      const product = products.get(item.productId)!;
      if (product.status !== 'ACTIVE') throw orderProductInactive(label(product));
      const { lineTotals } = orderTotals([{ unitPrice: product.price, quantity: item.quantity }]);
      await tx.orderItem.create({
        data: {
          organizationId,
          orderId: order.id,
          productId: product.id,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitPrice: product.price,
          quantity: item.quantity,
          lineTotal: lineTotals[0]!,
        },
      });
      changed = true;
    }
    return changed;
  }

  /** The requested products of this organization (any status). Unknown or foreign → 422. */
  private async products(
    tx: Tx,
    organizationId: string,
    items: OrderItemInputDto[],
  ): Promise<Map<string, OrderProduct>> {
    if (items.length === 0) return new Map();
    const ids = items.map((item) => item.productId);
    const rows = await tx.product.findMany({
      where: { organizationId, id: { in: ids } },
      select: { id: true, name: true, sku: true, price: true, status: true },
    });
    if (rows.length !== new Set(ids).size) throw orderProductNotFound();
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async findCustomer(client: Client, organizationId: string, customerId: string) {
    const customer = await client.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { name: true, isActive: true },
    });
    if (!customer) throw orderCustomerNotFound();
    return customer;
  }

  private async activeCustomer(client: Client, organizationId: string, customerId: string) {
    const customer = await this.findCustomer(client, organizationId, customerId);
    if (!customer.isActive) throw orderCustomerInactive(customer.name);
  }

  private async findWarehouse(client: Client, organizationId: string, warehouseId: string) {
    const warehouse = await client.warehouse.findFirst({
      where: { id: warehouseId, organizationId },
      select: { code: true, isActive: true },
    });
    if (!warehouse) throw orderWarehouseNotFound();
    return warehouse;
  }

  private async activeWarehouse(client: Client, organizationId: string, warehouseId: string) {
    const warehouse = await this.findWarehouse(client, organizationId, warehouseId);
    if (!warehouse.isActive) throw orderWarehouseInactive(warehouse.code);
  }
}

/** One line per product; a repeated product is a validation error, never silently merged. */
function assertUniqueProducts(items: OrderItemInputDto[]): void {
  const ids = items.map((item) => item.productId);
  if (new Set(ids).size !== ids.length) throw orderDuplicateProducts();
}
