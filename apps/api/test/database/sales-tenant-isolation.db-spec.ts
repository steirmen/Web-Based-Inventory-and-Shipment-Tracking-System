import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createHttpApp } from './support/http-app.js';
import { salesFixture } from './support/sales.js';

/**
 * Organization A must not see or change anything of organization B's
 * customers or orders — not through B's routes (not a member), and not by
 * putting B's ids into A's routes, bodies, or filters. Both organizations use
 * the same names and SKUs, so a leak would show up in search results.
 */

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

async function twoOrganizations() {
  const a = await salesFixture(app, 'org-a');
  const b = await salesFixture(app, 'org-b');
  await a.stock(a.main.id, a.pen.id, 20);
  await b.stock(b.main.id, b.pen.id, 20);
  const orderA = (await a.order([{ productId: a.pen.id, quantity: 1 }]).expect(201)).body.order;
  const orderB = await b.confirmedOrder([{ productId: b.pen.id, quantity: 2 }]);
  const snapshot = async () => ({
    customers: await prisma.customer.findMany({
      where: { organizationId: b.org },
      orderBy: { id: 'asc' },
    }),
    orders: await prisma.order.findMany({
      where: { organizationId: b.org },
      orderBy: { id: 'asc' },
      include: { items: true },
    }),
    inventory: await prisma.inventory.findMany({ where: { organizationId: b.org } }),
    movements: await prisma.stockMovement.count({ where: { organizationId: b.org } }),
    logs: await prisma.activityLog.count({ where: { organizationId: b.org } }),
  });
  return { a, b, orderA, orderB, snapshot };
}

describe('customer & order tenant isolation', () => {
  it("refuses every one of B's routes to A's members with ORGANIZATION_NOT_FOUND", async () => {
    const { a, b, orderB, snapshot } = await twoOrganizations();
    const before = await snapshot();
    const cookie = a.team.owner.cookie;
    const attempts = [
      () => a.api().get(`${b.base}/customers`),
      () => a.api().get(`${b.base}/customers/${b.customer.id}`),
      () => a.api().patch(`${b.base}/customers/${b.customer.id}`).send({ name: 'Hijacked' }),
      () => a.api().post(`${b.base}/customers/${b.customer.id}/archive`),
      () => a.api().post(`${b.base}/customers`).send({ name: 'Intruder' }),
      () => a.api().get(`${b.base}/orders`),
      () => a.api().get(`${b.base}/orders/${orderB.id}`),
      () => a.api().patch(`${b.base}/orders/${orderB.id}`).send({ notes: 'Hijacked' }),
      () =>
        a
          .api()
          .post(`${b.base}/orders`)
          .send({ customerId: b.customer.id, warehouseId: b.main.id }),
      ...(['confirm', 'process', 'ship', 'complete', 'cancel'] as const).map(
        (step) => () => a.api().post(`${b.base}/orders/${orderB.id}/${step}`),
      ),
    ];

    for (const attempt of attempts) {
      const response = await attempt().set('Cookie', cookie).expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it("does not find B's customers or orders through A's routes (same 404 as unknown ids)", async () => {
    const { a, b, orderB, snapshot } = await twoOrganizations();
    const before = await snapshot();
    const cookie = a.team.owner.cookie;
    const customerAttempts = [
      () => a.api().get(`${a.base}/customers/${b.customer.id}`),
      () => a.api().patch(`${a.base}/customers/${b.customer.id}`).send({ name: 'Hijacked' }),
      () => a.api().post(`${a.base}/customers/${b.customer.id}/archive`),
      () => a.api().post(`${a.base}/customers/${b.customer.id}/restore`),
    ];
    const orderAttempts = [
      () => a.api().get(`${a.base}/orders/${orderB.id}`),
      () => a.api().patch(`${a.base}/orders/${orderB.id}`).send({ notes: 'Hijacked' }),
      ...(['confirm', 'process', 'ship', 'complete', 'cancel'] as const).map(
        (step) => () => a.api().post(`${a.base}/orders/${orderB.id}/${step}`),
      ),
    ];

    for (const attempt of customerAttempts) {
      const response = await attempt().set('Cookie', cookie).expect(404);
      expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
    }
    for (const attempt of orderAttempts) {
      const response = await attempt().set('Cookie', cookie).expect(404);
      expect(response.body.code).toBe('ORDER_NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it("can't use B's customer, warehouse, or product on A's orders or in A's filters", async () => {
    const { a, b, orderA, snapshot } = await twoOrganizations();
    const before = await snapshot();
    const patchA = (body: object) =>
      a.api().patch(`${a.base}/orders/${orderA.id}`).set('Cookie', a.team.owner.cookie).send(body);
    const listA = (query: string) =>
      a.api().get(`${a.base}/orders${query}`).set('Cookie', a.team.owner.cookie);

    const cases = [
      [() => a.order([], { customerId: b.customer.id }), 422, 'ORDER_CUSTOMER_NOT_FOUND'],
      [() => a.order([], { warehouseId: b.main.id }), 422, 'ORDER_WAREHOUSE_NOT_FOUND'],
      [() => a.order([{ productId: b.pen.id, quantity: 1 }]), 422, 'ORDER_PRODUCT_NOT_FOUND'],
      [() => patchA({ customerId: b.customer.id }), 422, 'ORDER_CUSTOMER_NOT_FOUND'],
      [() => patchA({ warehouseId: b.main.id }), 422, 'ORDER_WAREHOUSE_NOT_FOUND'],
      [
        () => patchA({ items: [{ productId: b.pen.id, quantity: 1 }] }),
        422,
        'ORDER_PRODUCT_NOT_FOUND',
      ],
      [() => listA(`?customerId=${b.customer.id}`), 422, 'ORDER_CUSTOMER_NOT_FOUND'],
      [() => listA(`?warehouseId=${b.main.id}`), 422, 'ORDER_WAREHOUSE_NOT_FOUND'],
    ] as const;
    for (const [attempt, status, code] of cases) {
      const response = await attempt().expect(status);
      expect(response.body.code).toBe(code);
    }

    expect(await snapshot()).toEqual(before);
    const orderAfter = await prisma.order.findUniqueOrThrow({
      where: { id: orderA.id },
      include: { items: true },
    });
    expect(orderAfter).toMatchObject({ customerId: a.customer.id, warehouseId: a.main.id });
    expect(orderAfter.items.map((item) => item.productId)).toEqual([a.pen.id]);
  });

  it('keeps search, filters, and counts inside the organization (same names in both)', async () => {
    const { a, b, orderA } = await twoOrganizations();
    // A second order in B, so B has more of everything.
    await b.order([]).expect(201);
    const get = (path: string) =>
      a.api().get(`${a.base}${path}`).set('Cookie', a.team.staff.cookie).expect(200);

    const customers = await get('/customers?search=riverside');
    const orders = await get('/orders?search=riverside');
    const byNumber = await get('/orders?search=SO-100');
    const confirmed = await get('/orders?status=CONFIRMED');
    const detail = await get(`/customers/${a.customer.id}`);

    expect(customers.body.items.map((c: { id: string }) => c.id)).toEqual([a.customer.id]);
    expect(customers.body.pagination.totalItems).toBe(1);
    expect(orders.body.items.map((o: { id: string }) => o.id)).toEqual([orderA.id]);
    expect(byNumber.body.pagination.totalItems).toBe(1);
    expect(confirmed.body.items).toEqual([]);
    expect(detail.body.customer.orderCount).toBe(1);
  });
});
