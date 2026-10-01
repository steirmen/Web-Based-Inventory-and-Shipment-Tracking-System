import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createProduct } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { expectLedgerConsistent, quantityOf } from './support/inventory.js';
import { expectOrderMovements, orderLogs, salesFixture } from './support/sales.js';

/**
 * Parallel requests against a real listening server: fulfillment must never
 * oversell, never deduct an order twice, and never deadlock, and the stock
 * ledger must still explain every quantity.
 */

let app: INestApplication;
let baseUrl: string;

beforeEach(async () => {
  ({ app } = await createHttpApp());
  await app.listen(0, '127.0.0.1');
  baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});

afterEach(async () => {
  await app.close();
});

const statuses = (responses: { status: number }[]) =>
  responses.reduce<Record<number, number>>((counts, { status }) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

describe('concurrent order fulfillment', () => {
  it('10 in stock, two orders of 7 processed in parallel: one succeeds, 3 remain, one SALE', async () => {
    const { org, main, pen, stock, confirmedOrder, action } = await salesFixture(baseUrl);
    await stock(main.id, pen.id, 10);
    const a = await confirmedOrder([{ productId: pen.id, quantity: 7 }]);
    const b = await confirmedOrder([{ productId: pen.id, quantity: 7 }]);

    const responses = await Promise.all([action(a.id, 'process'), action(b.id, 'process')]);

    expect(statuses(responses)).toEqual({ 200: 1, 409: 1 });
    expect(responses.find((r) => r.status === 409)?.body).toMatchObject({
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      message:
        'Not enough stock in MAIN for Ballpoint Pen (PEN): 7 needed, 3 available. Nothing was deducted.',
    });
    expect(await quantityOf(main.id, pen.id)).toBe(3);
    const sales = await prisma.stockMovement.findMany({ where: { movementType: 'SALE' } });
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ quantityBefore: 10, quantityAfter: 3 });
    const statusesAfter = await prisma.order.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { status: true },
    });
    expect(statusesAfter.map((o) => o.status).sort()).toEqual(['CONFIRMED', 'PROCESSING']);
    await expectLedgerConsistent(org);
  });

  it('processes one order exactly once when the request is sent 6 times at once', async () => {
    const { org, main, pen, stock, confirmedOrder, action } = await salesFixture(baseUrl);
    await stock(main.id, pen.id, 100);
    const order = await confirmedOrder([{ productId: pen.id, quantity: 5 }]);

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => action(order.id, 'process')),
    );

    expect(statuses(responses)).toEqual({ 200: 1, 409: 5 });
    expect(
      responses
        .filter((r) => r.status === 409)
        .every((r) => r.body.code === 'ORDER_INVALID_TRANSITION'),
    ).toBe(true);
    expect(await quantityOf(main.id, pen.id)).toBe(95);
    await expectOrderMovements(order.id);
    expect(await orderLogs(org, 'ORDER_PROCESSING')).toHaveLength(1);
  });

  it('does not deadlock on orders that share products in opposite line order', async () => {
    const fixture = await salesFixture(baseUrl);
    const { org, main, pen, mouse, stock, order, action } = fixture;
    const tape = await createProduct(org, { name: 'Tape', sku: 'TAPE', price: '3.40' });
    for (const product of [pen, mouse, tape]) await stock(main.id, product.id, 100);
    const lineSets = [
      [pen, mouse, tape],
      [tape, mouse, pen],
      [mouse, tape, pen],
    ];
    const orders: string[] = [];
    for (let index = 0; index < 9; index++) {
      const items = lineSets[index % 3]!.map((product) => ({ productId: product.id, quantity: 2 }));
      const created = await order(items).expect(201);
      await action(created.body.order.id, 'confirm').expect(200);
      orders.push(created.body.order.id);
    }

    const responses = await Promise.all(orders.map((id) => action(id, 'process')));

    expect(statuses(responses)).toEqual({ 200: 9 });
    for (const product of [pen, mouse, tape]) {
      expect(await quantityOf(main.id, product.id)).toBe(100 - 9 * 2);
    }
    for (const id of orders) await expectOrderMovements(id);
    await expectLedgerConsistent(org);
  });

  it('stays consistent when order processing races manual stock operations', async () => {
    const { org, base, team, main, pen, stock, confirmedOrder, action } =
      await salesFixture(baseUrl);
    await stock(main.id, pen.id, 30);
    const orders = [];
    for (let index = 0; index < 4; index++) {
      orders.push(await confirmedOrder([{ productId: pen.id, quantity: 6 }]));
    }
    const manual = (operation: string, body: object) =>
      request(baseUrl)
        .post(`${base}/inventory/${operation}`)
        .set('Cookie', team.owner.cookie)
        .send({ warehouseId: main.id, productId: pen.id, ...body });

    const responses = await Promise.all([
      ...orders.map((o) => action(o.id, 'process')),
      manual('issue', { quantity: 5 }),
      manual('receive', { quantity: 4 }),
      manual('damage', { quantity: 2, reason: 'Broken' }),
    ]);

    expect(responses.every((r) => [200, 409].includes(r.status))).toBe(true);
    const quantity = (await quantityOf(main.id, pen.id))!;
    expect(quantity).toBeGreaterThanOrEqual(0);
    const processed = await prisma.order.count({
      where: { id: { in: orders.map((o) => o.id) }, status: 'PROCESSING' },
    });
    const sold = await prisma.stockMovement.aggregate({
      where: { organizationId: org, referenceType: 'ORDER' },
      _sum: { quantityDelta: true },
    });
    expect(sold._sum.quantityDelta ?? 0).toBe(-6 * processed);
    await expectLedgerConsistent(org);
  });
});
