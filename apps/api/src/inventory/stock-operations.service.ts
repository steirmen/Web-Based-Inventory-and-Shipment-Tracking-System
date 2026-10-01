import {
  type AdjustStockResponse,
  INVENTORY_LIMITS,
  type StockMovementType,
  type StockOperationResponse,
  type TransferStockResponse,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { uuidV7 } from '../common/ids/uuid-v7.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import type {
  AdjustStockDto,
  DamageStockDto,
  StockQuantityDto,
  TransferStockDto,
} from './dto/inventory.dto.js';
import {
  insufficientStock,
  inventoryOrderShortage,
  inventoryProductInactive,
  inventoryProductNotFound,
  inventoryQuantityLimit,
  inventoryWarehouseNotFound,
  inventorySameWarehouse,
  inventoryWarehouseInactive,
} from './inventory-errors.js';
import {
  INVENTORY_SELECT,
  STOCK_MOVEMENT_SELECT,
  toInventoryItem,
  toStockMovement,
} from './inventory-mappers.js';
import { runStockTransaction } from './stock-transaction.js';

type Tx = Prisma.TransactionClient;

interface LockedWarehouse {
  id: string;
  code: string;
  isActive: boolean;
}

interface LockedProduct {
  id: string;
  sku: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

interface LockedInventory {
  id: string;
  quantity: number;
}

/** Operations that write one movement against one inventory row. */
type SingleMovementType = Exclude<StockMovementType, 'TRANSFER_IN' | 'TRANSFER_OUT'>;

const ACTIVITY_FOR: Record<SingleMovementType, ActivityAction> = {
  PURCHASE: ActivityAction.STOCK_RECEIVED,
  SALE: ActivityAction.STOCK_ISSUED,
  DAMAGE: ActivityAction.STOCK_DAMAGED,
  ADJUSTMENT: ActivityAction.STOCK_ADJUSTED,
};

const MAX = INVENTORY_LIMITS.quantityMax;

/** Archived products keep their history but take no new stock activity of any kind. */
function assertProductActive(product: LockedProduct, label?: string): void {
  if (product.status !== 'ACTIVE') throw inventoryProductInactive(label);
}

/** One order line to fulfill (see issueForOrder). */
export interface OrderStockLine {
  /** Order item id; reported back for shortages. */
  itemId: string;
  productId: string;
  quantity: number;
  /** Snapshot label for messages, e.g. "Wireless Mouse (ACC-MOUSE-WL)". */
  label: string;
}

/**
 * Every stock change: inventory (current state) and stock_movements (history)
 * are written in ONE transaction, with `quantity_before + delta = quantity_after`
 * taken from the locked row, so the two can never disagree.
 *
 * Concurrency (READ COMMITTED + explicit row locks, all held until commit):
 * 0. (order fulfillment only) the `orders` row FOR UPDATE, taken by the caller.
 * 1. `warehouses` row(s) FOR SHARE, in id order — an archive (UPDATE) waits.
 * 2. `products` row(s) FOR SHARE, in id order — a product archive waits.
 * 3. `inventory` row(s) FOR UPDATE, ordered by warehouse id, then product id
 *    (a missing row is first inserted with quantity 0) — concurrent changes to
 *    the same stock run one after another, and each reads the quantity its
 *    predecessor left.
 * The quantity is read only after its lock is held, and every check and write
 * happens in the same transaction, so before/after values are never stale and
 * stock never goes negative (the CHECK constraint is the last line of defense).
 * The fixed lock order means operations never wait on each other in a cycle.
 */
@Injectable()
export class StockOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** PURCHASE: add stock. */
  receive(context: OrganizationContext, input: StockQuantityDto): Promise<StockOperationResponse> {
    return this.change(context, input, 'PURCHASE', input.quantity);
  }

  /** SALE recorded by hand. Order fulfillment uses issueForOrder() instead. */
  issue(context: OrganizationContext, input: StockQuantityDto): Promise<StockOperationResponse> {
    return this.change(context, input, 'SALE', -input.quantity);
  }

  /** DAMAGE: write stock off, with a required reason. */
  damage(context: OrganizationContext, input: DamageStockDto): Promise<StockOperationResponse> {
    return this.change(context, input, 'DAMAGE', -input.quantity);
  }

  /** ADJUSTMENT: set the counted quantity. Equal to the current quantity → no-op. */
  adjust(context: OrganizationContext, input: AdjustStockDto): Promise<AdjustStockResponse> {
    const organizationId = context.organization.id;
    return this.transaction(async (tx) => {
      const [warehouse] = await this.lockWarehouses(tx, organizationId, [input.warehouseId]);
      const product = await this.lockProduct(tx, organizationId, input.productId);
      if (!warehouse.isActive) throw inventoryWarehouseInactive(warehouse.code);
      assertProductActive(product);

      const existing = await this.lockInventory(
        tx,
        organizationId,
        warehouse.id,
        product.id,
        false,
      );
      const before = existing?.quantity ?? 0;
      if (input.newQuantity === before) {
        return {
          inventory: existing ? await this.readInventory(tx, existing.id) : null,
          movement: null,
        };
      }
      const row =
        existing ?? (await this.lockInventory(tx, organizationId, warehouse.id, product.id, true));

      const { inventory, movement } = await this.record(tx, context, {
        warehouse,
        product,
        inventory: row!,
        movementType: 'ADJUSTMENT',
        delta: input.newQuantity - before,
        reason: input.reason,
      });
      return { inventory, movement };
    });
  }

  /** TRANSFER_OUT (source) + TRANSFER_IN (destination), linked by one transferGroupId. */
  transfer(context: OrganizationContext, input: TransferStockDto): Promise<TransferStockResponse> {
    const organizationId = context.organization.id;
    const sourceId = input.sourceWarehouseId.toLowerCase();
    const destinationId = input.destinationWarehouseId.toLowerCase();
    if (sourceId === destinationId) throw inventorySameWarehouse();

    return this.transaction(async (tx) => {
      const warehouses = await this.lockWarehouses(tx, organizationId, [sourceId, destinationId]);
      const source = warehouses.find((warehouse) => warehouse.id === sourceId)!;
      const destination = warehouses.find((warehouse) => warehouse.id === destinationId)!;
      const product = await this.lockProduct(tx, organizationId, input.productId);
      if (!source.isActive) throw inventoryWarehouseInactive(source.code);
      if (!destination.isActive) throw inventoryWarehouseInactive(destination.code);
      assertProductActive(product);

      // Lock both inventory rows in warehouse-id order (the destination row may be new).
      const rows = new Map<string, LockedInventory | null>();
      for (const warehouse of [...warehouses].sort((a, b) => a.id.localeCompare(b.id))) {
        const isDestination = warehouse.id === destination.id;
        rows.set(
          warehouse.id,
          await this.lockInventory(tx, organizationId, warehouse.id, product.id, isDestination),
        );
      }
      const sourceRow = rows.get(source.id) ?? null;
      const destinationRow = rows.get(destination.id)!;

      const available = sourceRow?.quantity ?? 0;
      if (!sourceRow || available < input.quantity) {
        throw insufficientStock(available, source.code);
      }
      if (destinationRow.quantity + input.quantity > MAX) throw inventoryQuantityLimit(MAX);

      const transferGroupId = uuidV7();
      const outgoing = await this.record(tx, context, {
        warehouse: source,
        product,
        inventory: sourceRow,
        movementType: 'TRANSFER_OUT',
        delta: -input.quantity,
        reason: input.reason ?? null,
        transferGroupId,
      });
      const incoming = await this.record(tx, context, {
        warehouse: destination,
        product,
        inventory: destinationRow,
        movementType: 'TRANSFER_IN',
        delta: input.quantity,
        reason: input.reason ?? null,
        transferGroupId,
      });

      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.STOCK_TRANSFERRED,
        entityType: 'Product',
        entityId: product.id,
        // ONE entry per transfer (not one per leg), identified by its transfer group.
        metadata: {
          productId: product.id,
          sku: product.sku,
          sourceWarehouseId: source.id,
          sourceWarehouseCode: source.code,
          destinationWarehouseId: destination.id,
          destinationWarehouseCode: destination.code,
          quantity: input.quantity,
          transferGroupId,
          source: {
            quantityBefore: outgoing.movement.quantityBefore,
            quantityAfter: outgoing.movement.quantityAfter,
          },
          destination: {
            quantityBefore: incoming.movement.quantityBefore,
            quantityAfter: incoming.movement.quantityAfter,
          },
          movementIds: [outgoing.movement.id, incoming.movement.id],
        },
      });

      return {
        transferGroupId,
        source: outgoing.inventory,
        destination: incoming.inventory,
        movements: [outgoing.movement, incoming.movement],
      };
    });
  }

  /**
   * Order fulfillment (Phase 7A): one SALE movement per order line, all from
   * one warehouse, inside the CALLER's transaction (which already holds the
   * order row lock and also changes the order status). Either every line has
   * enough stock and all are deducted, or nothing is written: all shortages
   * are reported together (409 INVENTORY_INSUFFICIENT_STOCK, one detail per line).
   * Movements reference the order (`ORDER` + order id); the caller records the
   * single ORDER_PROCESSING activity entry, so no per-line STOCK_ISSUED is logged.
   */
  async issueForOrder(
    tx: Tx,
    context: OrganizationContext,
    order: { id: string; orderNumber: string; warehouseId: string; lines: OrderStockLine[] },
  ): Promise<StockOperationResponse['movement'][]> {
    const organizationId = context.organization.id;
    const [warehouse] = await this.lockWarehouses(tx, organizationId, [order.warehouseId]);
    if (!warehouse.isActive) throw inventoryWarehouseInactive(warehouse.code);

    // Same lock order as every other stock operation: products by id, then their inventory rows.
    const lines = [...order.lines].sort((a, b) => a.productId.localeCompare(b.productId));
    const locked: { line: OrderStockLine; product: LockedProduct }[] = [];
    for (const line of lines) {
      const product = await this.lockProduct(tx, organizationId, line.productId);
      assertProductActive(product, line.label);
      locked.push({ line, product });
    }
    const rows: (LockedInventory | null)[] = [];
    for (const { product } of locked) {
      rows.push(await this.lockInventory(tx, organizationId, warehouse.id, product.id, false));
    }

    const shortages = locked.flatMap(({ line }, index) => {
      const available = rows[index]?.quantity ?? 0;
      return available < line.quantity ? [{ ...line, available }] : [];
    });
    if (shortages.length > 0) throw inventoryOrderShortage(warehouse.code, shortages);

    const movements: StockOperationResponse['movement'][] = [];
    for (const [index, { line, product }] of locked.entries()) {
      const { movement } = await this.record(tx, context, {
        warehouse,
        product,
        inventory: rows[index]!,
        movementType: 'SALE',
        delta: -line.quantity,
        reason: `Order ${order.orderNumber}`,
        reference: { type: 'ORDER', id: order.id },
        logActivity: false,
      });
      movements.push(movement);
    }
    return movements;
  }

  private transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return runStockTransaction(this.prisma, work);
  }

  /** Receive, issue, or damage: one signed change to one inventory row. */
  private change(
    context: OrganizationContext,
    input: { warehouseId: string; productId: string; reason?: string | null },
    movementType: 'PURCHASE' | 'SALE' | 'DAMAGE',
    delta: number,
  ): Promise<StockOperationResponse> {
    const organizationId = context.organization.id;
    return this.transaction(async (tx) => {
      const [warehouse] = await this.lockWarehouses(tx, organizationId, [input.warehouseId]);
      const product = await this.lockProduct(tx, organizationId, input.productId);
      if (!warehouse.isActive) throw inventoryWarehouseInactive(warehouse.code);
      assertProductActive(product);

      // Stock is only ever created by an increase; a decrease needs an existing row.
      const row = await this.lockInventory(tx, organizationId, warehouse.id, product.id, delta > 0);
      const before = row?.quantity ?? 0;
      if (!row || before + delta < 0) throw insufficientStock(before, warehouse.code);

      return this.record(tx, context, {
        warehouse,
        product,
        inventory: row,
        movementType,
        delta,
        reason: input.reason ?? null,
      });
    });
  }

  /**
   * Applies `delta` to the locked row and appends the matching movement (and,
   * except for transfer legs and order lines, the activity entry).
   */
  private async record(
    tx: Tx,
    context: OrganizationContext,
    change: {
      warehouse: LockedWarehouse;
      product: LockedProduct;
      inventory: LockedInventory;
      movementType: StockMovementType;
      delta: number;
      reason: string | null;
      transferGroupId?: string;
      /** What caused the movement (e.g. an order); transfers reference themselves. */
      reference?: { type: string; id: string };
      /** Default true; false when the caller logs one entry for several movements. */
      logActivity?: boolean;
    },
  ): Promise<StockOperationResponse> {
    const organizationId = context.organization.id;
    const quantityBefore = change.inventory.quantity;
    const quantityAfter = quantityBefore + change.delta;
    if (quantityAfter > MAX) throw inventoryQuantityLimit(MAX);

    const inventory = await tx.inventory.update({
      where: { id: change.inventory.id },
      data: { quantity: quantityAfter },
      select: INVENTORY_SELECT,
    });
    // Stamped now — after the row lock was acquired — rather than with the
    // transaction start time, so (createdAt, id) order is the order in which
    // movements were applied, even if a waiting transaction started earlier.
    const createdAt = new Date();
    const movement = await tx.stockMovement.create({
      data: {
        id: uuidV7(createdAt.getTime()),
        createdAt,
        organizationId,
        warehouseId: change.warehouse.id,
        productId: change.product.id,
        actorUserId: context.user.id,
        movementType: change.movementType,
        quantityDelta: change.delta,
        quantityBefore,
        quantityAfter,
        reason: change.reason,
        transferGroupId: change.transferGroupId ?? null,
        // Both legs of a transfer reference the transfer itself.
        referenceType: change.reference?.type ?? (change.transferGroupId ? 'TRANSFER' : null),
        referenceId: change.reference?.id ?? change.transferGroupId ?? null,
      },
      select: STOCK_MOVEMENT_SELECT,
    });

    if (
      change.logActivity !== false &&
      change.movementType !== 'TRANSFER_IN' &&
      change.movementType !== 'TRANSFER_OUT'
    ) {
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ACTIVITY_FOR[change.movementType],
        entityType: 'Product',
        entityId: change.product.id,
        // Ids and numbers only: the free-text reason stays in the movement.
        metadata: {
          warehouseId: change.warehouse.id,
          warehouseCode: change.warehouse.code,
          productId: change.product.id,
          sku: change.product.sku,
          inventoryId: inventory.id,
          movementId: movement.id,
          // Units moved (receive/issue/damage); an adjustment is described by before/after/delta.
          ...(change.movementType === 'ADJUSTMENT' ? {} : { quantity: Math.abs(change.delta) }),
          quantityBefore,
          quantityAfter,
          quantityDelta: change.delta,
        },
      });
    }
    return { inventory: toInventoryItem(inventory), movement: toStockMovement(movement) };
  }

  /** Warehouses of this organization, share-locked in id order. Unknown ids → 422. */
  private async lockWarehouses(
    tx: Tx,
    organizationId: string,
    warehouseIds: string[],
  ): Promise<LockedWarehouse[]> {
    const ids = [...new Set(warehouseIds.map((id) => id.toLowerCase()))].sort();
    const locked: LockedWarehouse[] = [];
    for (const id of ids) {
      const [row] = await tx.$queryRaw<{ id: string; code: string; is_active: boolean }[]>`
        SELECT id, code, is_active FROM warehouses
        WHERE organization_id = ${organizationId}::uuid AND id = ${id}::uuid
        FOR SHARE`;
      if (!row) throw inventoryWarehouseNotFound();
      locked.push({ id: row.id, code: row.code, isActive: row.is_active });
    }
    return locked;
  }

  /** The product, share-locked so its status can't change mid-operation. Unknown → 422. */
  private async lockProduct(
    tx: Tx,
    organizationId: string,
    productId: string,
  ): Promise<LockedProduct> {
    const [row] = await tx.$queryRaw<LockedProduct[]>`
      SELECT id, sku, status::text AS status FROM products
      WHERE organization_id = ${organizationId}::uuid AND id = ${productId}::uuid
      FOR SHARE`;
    if (!row) throw inventoryProductNotFound();
    return row;
  }

  /**
   * Locks the inventory row FOR UPDATE. With `create`, a missing row is first
   * inserted with quantity 0 (ON CONFLICT DO NOTHING makes concurrent first
   * receipts safe); otherwise a missing row returns null.
   */
  private async lockInventory(
    tx: Tx,
    organizationId: string,
    warehouseId: string,
    productId: string,
    create: boolean,
  ): Promise<LockedInventory | null> {
    if (create) {
      await tx.$executeRaw`
        INSERT INTO inventory (id, organization_id, warehouse_id, product_id, quantity)
        VALUES (${uuidV7()}::uuid, ${organizationId}::uuid, ${warehouseId}::uuid, ${productId}::uuid, 0)
        ON CONFLICT (warehouse_id, product_id) DO NOTHING`;
    }
    const [row] = await tx.$queryRaw<LockedInventory[]>`
      SELECT id, quantity FROM inventory
      WHERE organization_id = ${organizationId}::uuid
        AND warehouse_id = ${warehouseId}::uuid
        AND product_id = ${productId}::uuid
      FOR UPDATE`;
    return row ?? null;
  }

  private async readInventory(tx: Tx, inventoryId: string) {
    const row = await tx.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: INVENTORY_SELECT,
    });
    return toInventoryItem(row);
  }
}
