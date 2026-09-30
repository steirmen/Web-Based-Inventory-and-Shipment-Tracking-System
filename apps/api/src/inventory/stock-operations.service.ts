import {
  type AdjustStockResponse,
  INVENTORY_LIMITS,
  type StockMovementType,
  type StockOperationResponse,
  type TransferStockResponse,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { isConcurrencyConflict } from '../common/errors/prisma-errors.js';
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
  inventoryConcurrencyConflict,
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
function assertProductActive(product: LockedProduct): void {
  if (product.status !== 'ACTIVE') throw inventoryProductInactive();
}

/** Row locks may make a request wait for a concurrent one; allow for that. */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * Every stock change: inventory (current state) and stock_movements (history)
 * are written in ONE transaction, with `quantity_before + delta = quantity_after`
 * taken from the locked row, so the two can never disagree.
 *
 * Concurrency (READ COMMITTED + explicit row locks, all held until commit):
 * 1. `warehouses` row(s) FOR SHARE, in id order — an archive (UPDATE) waits.
 * 2. `products` row FOR SHARE — a product archive waits.
 * 3. `inventory` row(s) FOR UPDATE, in warehouse-id order (a missing row is
 *    first inserted with quantity 0) — concurrent changes to the same stock
 *    run one after another, and each reads the quantity its predecessor left.
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

  /** SALE: remove stock (no order integration yet). */
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
   * The one transaction boundary of every stock operation: all reads, locks,
   * checks, and writes run inside `work`, and either all commit or none do.
   * A lost lock race (deadlock, lock or transaction timeout) — which the lock
   * ordering makes unlikely — answers 409 instead of a generic 500.
   */
  private async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work, TRANSACTION_OPTIONS);
    } catch (error) {
      if (isConcurrencyConflict(error)) throw inventoryConcurrencyConflict();
      throw error;
    }
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
   * except for transfer legs, the activity entry).
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
        referenceType: change.transferGroupId ? 'TRANSFER' : null,
        referenceId: change.transferGroupId ?? null,
      },
      select: STOCK_MOVEMENT_SELECT,
    });

    if (change.movementType !== 'TRANSFER_IN' && change.movementType !== 'TRANSFER_OUT') {
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
