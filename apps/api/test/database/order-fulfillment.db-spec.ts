import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ActivityLogModule from '../../src/activity/activity-log.js';
import { prisma } from './support/database.js';
import { createHttpApp } from './support/http-app.js';
import { expectLedgerConsistent, quantityOf } from './support/inventory.js';
import { expectOrderMovements, orderLogs, orderStatusOf, salesFixture } from './support/sales.js';

/**
 * CONFIRMED → PROCESSING deducts stock: one SALE movement per line, the status
 * change, and the ORDER_PROCESSING entry in ONE transaction — all or nothing.
 * Failure paths are simulated by making recordActivity throw (after the stock
 * writes) and by a temporary trigger that fails a movement insert.
 */

const failure = vi.hoisted(() => ({ action: null as string | null }));

vi.mock('../../src/activity/activity-log.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ActivityLogModule>();
  return {
    ...actual,
    recordActivity: async (
      ...args: Parameters<typeof ActivityLogModule.recordActivity>
    ): Promise<void> => {
      if (args[1].action === failure.action) {
        throw new Error('Simulated failure after the stock deduction');
      }
      return actual.recordActivity(...args);
    },
  };
});

let app: INestApplication;

beforeEach(async () => {
  failure.action = null;
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  failure.action = null;
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_sale ON stock_movements');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_sale()');
  await app.close();
});

async function setup() {
  const fixture = await salesFixture(app);
  const { org, main, pen, mouse } = fixture;
  const state = async () => ({
    pen: await quantityOf(main.id, pen.id),
    mouse: await quantityOf(main.id, mouse.id),
    movements: await prisma.stockMovement.count({ where: { organizationId: org } }),
    logs: await prisma.activityLog.count({ where: { organizationId: org } }),
  });
  return { ...fixture, state };
}

describe('POST …/orders/:id/process', () => {
  it.each(['owner', 'admin'] as const)(
    '%s processes a multi-line order: stock, SALE movements, status, and activity together',
    async (who) => {
      const { team, org, main, pen, mouse, stock, confirmedOrder, action } = await setup();
      await stock(main.id, pen.id, 10);
      await stock(main.id, mouse.id, 5);
      const order = await confirmedOrder([
        { productId: pen.id, quantity: 7 },
        { productId: mouse.id, quantity: 5 },
      ]);

      const response = await action(order.id, 'process', team[who]).expect(200);

      expect(response.body.order).toMatchObject({ status: 'PROCESSING' });
      expect(await quantityOf(main.id, pen.id)).toBe(3);
      expect(await quantityOf(main.id, mouse.id)).toBe(0);
      const sales = await prisma.stockMovement.findMany({
        where: { organizationId: org, movementType: 'SALE' },
        orderBy: { productId: 'asc' },
      });
      expect(sales).toHaveLength(2);
      for (const sale of sales) {
        expect(sale).toMatchObject({
          warehouseId: main.id,
          actorUserId: team[who].user.id,
          referenceType: 'ORDER',
          referenceId: order.id,
          reason: 'Order SO-1001',
          transferGroupId: null,
        });
      }
      expect(sales.find((sale) => sale.productId === pen.id)).toMatchObject({
        quantityBefore: 10,
        quantityDelta: -7,
        quantityAfter: 3,
      });
      expect(sales.find((sale) => sale.productId === mouse.id)).toMatchObject({
        quantityBefore: 5,
        quantityDelta: -5,
        quantityAfter: 0,
      });
      await expectOrderMovements(order.id);

      const [log] = await orderLogs(org, 'ORDER_PROCESSING');
      expect(log).toMatchObject({ actorUserId: team[who].user.id, entityId: order.id });
      expect(log?.metadata).toEqual({
        orderNumber: 'SO-1001',
        from: 'CONFIRMED',
        to: 'PROCESSING',
        orderId: order.id,
        warehouseId: main.id,
        itemCount: 2,
        totalQuantity: 12,
        movementIds: expect.arrayContaining(sales.map((sale) => sale.id)),
      });
      // One order event, not one STOCK_ISSUED per line.
      expect(await prisma.activityLog.count({ where: { action: 'STOCK_ISSUED' } })).toBe(0);
      await expectLedgerConsistent(org);
    },
  );

  it('refuses to process with insufficient stock, names every short line, and changes nothing', async () => {
    const { org, main, east, pen, mouse, stock, confirmedOrder, action, state } = await setup();
    await stock(main.id, pen.id, 10);
    await stock(main.id, mouse.id, 1);
    const order = await confirmedOrder([
      { productId: pen.id, quantity: 7 },
      { productId: mouse.id, quantity: 3 },
    ]);
    const before = await state();

    const oneShort = await action(order.id, 'process').expect(409);

    const mouseLine = order.items.find((item) => item.productId === mouse.id)!;
    expect(oneShort.body).toEqual({
      statusCode: 409,
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      message:
        'Not enough stock in MAIN for Wireless Mouse (MOUSE): 3 needed, 1 available. Nothing was deducted.',
      details: [
        {
          field: `items.${mouseLine.id}`,
          messages: ['Wireless Mouse (MOUSE): 3 needed, 1 available in MAIN.'],
        },
      ],
    });
    expect(await state()).toEqual(before);
    expect(await orderStatusOf(order.id)).toBe('CONFIRMED');
    expect(await orderLogs(org, 'ORDER_PROCESSING')).toEqual([]);

    // Both short now (pen never stocked in EAST): both lines are reported.
    const inEast = await confirmedOrder(
      [
        { productId: pen.id, quantity: 1 },
        { productId: mouse.id, quantity: 1 },
      ],
      { warehouseId: east.id },
    );
    const bothShort = await action(inEast.id, 'process').expect(409);
    expect(bothShort.body.message).toBe(
      'Not enough stock in EAST for 2 lines. Nothing was deducted.',
    );
    expect(bothShort.body.details).toHaveLength(2);
    // A failed decrease never creates an empty stock record.
    expect(await prisma.inventory.count({ where: { organizationId: org } })).toBe(2);
    await expectLedgerConsistent(org);
  });

  it('succeeds after the stock is replenished (the order stayed CONFIRMED)', async () => {
    const { main, pen, stock, confirmedOrder, action } = await setup();
    await stock(main.id, pen.id, 2);
    const order = await confirmedOrder([{ productId: pen.id, quantity: 5 }]);

    await action(order.id, 'process').expect(409);
    await stock(main.id, pen.id, 3);
    await action(order.id, 'process').expect(200);

    expect(await quantityOf(main.id, pen.id)).toBe(0);
  });

  it('refuses an archived warehouse or product at processing time', async () => {
    const { main, pen, mouse, stock, confirmedOrder, action, state } = await setup();
    await stock(main.id, pen.id, 10);
    await stock(main.id, mouse.id, 10);
    const first = await confirmedOrder([{ productId: pen.id, quantity: 1 }]);
    const second = await confirmedOrder([{ productId: mouse.id, quantity: 1 }]);
    const before = await state();

    await prisma.warehouse.update({ where: { id: main.id }, data: { isActive: false } });
    const closed = await action(first.id, 'process').expect(409);
    await prisma.warehouse.update({ where: { id: main.id }, data: { isActive: true } });
    await prisma.product.update({ where: { id: mouse.id }, data: { status: 'ARCHIVED' } });
    const archived = await action(second.id, 'process').expect(409);

    expect(closed.body.code).toBe('INVENTORY_WAREHOUSE_INACTIVE');
    expect(archived.body).toMatchObject({
      code: 'INVENTORY_PRODUCT_INACTIVE',
      message: 'Wireless Mouse (MOUSE) is archived. Restore it before changing its stock.',
    });
    expect(await state()).toEqual(before);
    expect([await orderStatusOf(first.id), await orderStatusOf(second.id)]).toEqual([
      'CONFIRMED',
      'CONFIRMED',
    ]);
  });

  it('never processes an order twice', async () => {
    const { org, main, pen, stock, confirmedOrder, action } = await setup();
    await stock(main.id, pen.id, 10);
    const order = await confirmedOrder([{ productId: pen.id, quantity: 4 }]);

    await action(order.id, 'process').expect(200);
    const again = await action(order.id, 'process').expect(409);

    expect(again.body).toMatchObject({
      code: 'ORDER_INVALID_TRANSITION',
      message: "Order SO-1001 is processing and can't be processed.",
    });
    expect(await quantityOf(main.id, pen.id)).toBe(6);
    expect(await prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(1);
    expect(await orderLogs(org, 'ORDER_PROCESSING')).toHaveLength(1);
  });
});

describe('rollback when processing fails midway', () => {
  it('failure after the stock writes (at the activity entry) rolls everything back', async () => {
    const { org, main, pen, mouse, stock, confirmedOrder, action, state } = await setup();
    await stock(main.id, pen.id, 10);
    await stock(main.id, mouse.id, 10);
    const order = await confirmedOrder([
      { productId: pen.id, quantity: 2 },
      { productId: mouse.id, quantity: 3 },
    ]);
    const before = await state();
    failure.action = 'ORDER_PROCESSING';

    const response = await action(order.id, 'process').expect(500);

    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(response.body.message).not.toMatch(/simulated/i);
    expect(await state()).toEqual(before);
    expect(await orderStatusOf(order.id)).toBe('CONFIRMED');
    await expectLedgerConsistent(org);

    failure.action = null;
    await action(order.id, 'process').expect(200);
    expect(await state()).toMatchObject({ pen: 8, mouse: 7 });
  });

  it('failure at the second SALE insert undoes the first line too', async () => {
    const { org, main, pen, mouse, stock, confirmedOrder, action, state } = await setup();
    await stock(main.id, pen.id, 10);
    await stock(main.id, mouse.id, 10);
    const order = await confirmedOrder([
      { productId: pen.id, quantity: 2 },
      { productId: mouse.id, quantity: 3 },
    ]);
    // Fails whichever SALE line is written second (lines are applied in product-id order).
    const second = [pen.id, mouse.id].sort()[1];
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_sale() RETURNS trigger AS $$
      BEGIN
        IF NEW.movement_type = 'SALE' AND NEW.product_id = '${second}'::uuid THEN
          RAISE EXCEPTION 'simulated movement failure';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_sale BEFORE INSERT ON stock_movements
      FOR EACH ROW EXECUTE FUNCTION test_fail_sale()`);
    const before = await state();

    await action(order.id, 'process').expect(500);

    expect(await state()).toEqual(before);
    expect(await orderStatusOf(order.id)).toBe('CONFIRMED');
    await expectLedgerConsistent(org);
  });
});
