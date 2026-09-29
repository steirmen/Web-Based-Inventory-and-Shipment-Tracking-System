import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StockMovementType } from '../../src/generated/prisma/client.js';
import { prisma } from './support/database.js';
import { expectCheckViolation, expectUniqueViolation } from './support/db-errors.js';
import {
  createOrganization,
  createProduct,
  createStockFixture,
  createUser,
  createWarehouse,
} from './support/factories.js';

describe('Warehouse', () => {
  it('creates an active warehouse with an optional address', async () => {
    const organization = await createOrganization();

    const warehouse = await prisma.warehouse.create({
      data: { organizationId: organization.id, name: 'Main', code: 'MAIN' },
    });

    expect(warehouse).toMatchObject({ code: 'MAIN', isActive: true, address: null });
  });

  it('rejects a duplicate code within the same organization', async () => {
    const organization = await createOrganization();
    await createWarehouse(organization.id, { code: 'MAIN' });

    await expectUniqueViolation(
      createWarehouse(organization.id, { code: 'MAIN' }),
      'warehouses_organization_id_code_key',
    );
  });
});

describe('Inventory', () => {
  it('records the quantity of a product in a warehouse', async () => {
    const { organization, warehouse, product } = await createStockFixture();

    const inventory = await prisma.inventory.create({
      data: {
        organizationId: organization.id,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: 25,
      },
      include: { warehouse: true, product: true },
    });

    expect(inventory.quantity).toBe(25);
    expect(inventory.warehouse.id).toBe(warehouse.id);
    expect(inventory.product.id).toBe(product.id);
  });

  it('rejects a second record for the same product and warehouse', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const row = {
      organizationId: organization.id,
      warehouseId: warehouse.id,
      productId: product.id,
    };
    await prisma.inventory.create({ data: row });

    await expectUniqueViolation(
      prisma.inventory.create({ data: { ...row, quantity: 5 } }),
      'inventory_warehouse_id_product_id_key',
    );
  });

  it('allows the same product in different warehouses', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const secondWarehouse = await createWarehouse(organization.id);

    await prisma.inventory.createMany({
      data: [warehouse, secondWarehouse].map((w) => ({
        organizationId: organization.id,
        warehouseId: w.id,
        productId: product.id,
        quantity: 10,
      })),
    });

    const total = await prisma.inventory.aggregate({
      where: { organizationId: organization.id, productId: product.id },
      _sum: { quantity: true },
    });
    expect(total._sum.quantity).toBe(20);
  });

  it('rejects a negative quantity on create and on update', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const row = {
      organizationId: organization.id,
      warehouseId: warehouse.id,
      productId: product.id,
    };

    await expectCheckViolation(
      prisma.inventory.create({ data: { ...row, quantity: -1 } }),
      'inventory_quantity_non_negative_check',
    );

    const inventory = await prisma.inventory.create({ data: { ...row, quantity: 3 } });
    await expectCheckViolation(
      prisma.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { decrement: 4 } },
      }),
      'inventory_quantity_non_negative_check',
    );
  });
});

describe('StockMovement', () => {
  async function movementBase() {
    const { organization, warehouse, product } = await createStockFixture();
    return { organizationId: organization.id, warehouseId: warehouse.id, productId: product.id };
  }

  it('records a movement with an actor, reason, and reference', async () => {
    const base = await movementBase();
    const actor = await createUser();
    const orderId = randomUUID();

    const movement = await prisma.stockMovement.create({
      data: {
        ...base,
        actorUserId: actor.id,
        movementType: StockMovementType.SALE,
        quantityDelta: -3,
        quantityBefore: 10,
        quantityAfter: 7,
        reason: 'Order shipped',
        referenceType: 'ORDER',
        referenceId: orderId,
      },
      include: { actor: true },
    });

    expect(movement.actor?.id).toBe(actor.id);
    expect(movement).toMatchObject({ referenceType: 'ORDER', referenceId: orderId });
  });

  it('allows a system-generated movement without an actor', async () => {
    const base = await movementBase();

    const movement = await prisma.stockMovement.create({
      data: {
        ...base,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: 5,
        quantityBefore: 0,
        quantityAfter: 5,
      },
    });

    expect(movement.actorUserId).toBeNull();
  });

  it.each([
    [
      'a zero delta',
      { quantityDelta: 0, quantityBefore: 5, quantityAfter: 5 },
      'stock_movements_quantity_delta_non_zero_check',
    ],
    [
      'a negative quantityBefore',
      { quantityDelta: 5, quantityBefore: -1, quantityAfter: 4 },
      'stock_movements_quantity_before_non_negative_check',
    ],
    [
      'a negative quantityAfter',
      { quantityDelta: -6, quantityBefore: 5, quantityAfter: -1 },
      'stock_movements_quantity_after_non_negative_check',
    ],
    [
      'an unbalanced before/delta/after',
      { quantityDelta: 5, quantityBefore: 0, quantityAfter: 4 },
      'stock_movements_quantity_balance_check',
    ],
  ])('rejects %s', async (_case, quantities, constraint) => {
    const base = await movementBase();

    await expectCheckViolation(
      prisma.stockMovement.create({
        data: { ...base, movementType: StockMovementType.ADJUSTMENT, ...quantities },
      }),
      constraint,
    );
  });

  it.each([
    [StockMovementType.PURCHASE, -1],
    [StockMovementType.SALE, 1],
    [StockMovementType.DAMAGE, 1],
  ])('rejects a %s movement with the wrong sign (delta %i)', async (movementType, delta) => {
    const base = await movementBase();

    await expectCheckViolation(
      prisma.stockMovement.create({
        data: {
          ...base,
          movementType,
          quantityDelta: delta,
          quantityBefore: 5,
          quantityAfter: 5 + delta,
        },
      }),
      'stock_movements_delta_direction_check',
    );
  });

  it('correlates both sides of a transfer with a transfer group', async () => {
    const { organization, product, warehouse: source } = await createStockFixture();
    const destination = await createWarehouse(organization.id);
    const transferGroupId = randomUUID();
    const shared = { organizationId: organization.id, productId: product.id, transferGroupId };

    await prisma.stockMovement.createMany({
      data: [
        {
          ...shared,
          warehouseId: source.id,
          movementType: StockMovementType.TRANSFER_OUT,
          quantityDelta: -4,
          quantityBefore: 10,
          quantityAfter: 6,
        },
        {
          ...shared,
          warehouseId: destination.id,
          movementType: StockMovementType.TRANSFER_IN,
          quantityDelta: 4,
          quantityBefore: 0,
          quantityAfter: 4,
        },
      ],
    });

    const legs = await prisma.stockMovement.findMany({
      where: { transferGroupId },
      orderBy: { quantityDelta: 'asc' },
    });
    expect(legs.map((leg) => [leg.warehouseId, leg.quantityDelta])).toEqual([
      [source.id, -4],
      [destination.id, 4],
    ]);
  });

  it('requires a transfer group on transfers and forbids it elsewhere', async () => {
    const base = await movementBase();
    const quantities = { quantityDelta: 2, quantityBefore: 0, quantityAfter: 2 };

    await expectCheckViolation(
      prisma.stockMovement.create({
        data: { ...base, ...quantities, movementType: StockMovementType.TRANSFER_IN },
      }),
      'stock_movements_transfer_group_check',
    );
    await expectCheckViolation(
      prisma.stockMovement.create({
        data: {
          ...base,
          ...quantities,
          movementType: StockMovementType.PURCHASE,
          transferGroupId: randomUUID(),
        },
      }),
      'stock_movements_transfer_group_check',
    );
  });

  it('requires reference type and id together', async () => {
    const base = await movementBase();

    await expectCheckViolation(
      prisma.stockMovement.create({
        data: {
          ...base,
          movementType: StockMovementType.PURCHASE,
          quantityDelta: 1,
          quantityBefore: 0,
          quantityAfter: 1,
          referenceType: 'PURCHASE_ORDER',
        },
      }),
      'stock_movements_reference_pair_check',
    );
  });

  it('supports product history queries across warehouses, newest first', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const otherProduct = await createProduct(organization.id);
    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
    const purchase = (productId: string, before: number, createdAt: Date) => ({
      organizationId: organization.id,
      warehouseId: warehouse.id,
      productId,
      movementType: StockMovementType.PURCHASE,
      quantityDelta: 1,
      quantityBefore: before,
      quantityAfter: before + 1,
      createdAt,
    });
    await prisma.stockMovement.createMany({
      data: [
        purchase(product.id, 0, at(1)),
        purchase(otherProduct.id, 0, at(2)),
        purchase(product.id, 1, at(3)),
      ],
    });

    const history = await prisma.stockMovement.findMany({
      where: { organizationId: organization.id, productId: product.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(history.map((movement) => movement.quantityAfter)).toEqual([2, 1]);
  });
});
