import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createCustomer, createProduct, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { quantityOf } from './support/inventory.js';
import { NON_EXISTENT_ID } from './support/organizations.js';
import { orderLogs, orderStatusOf, salesFixture } from './support/sales.js';

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const setup = (slug?: string) => salesFixture(app, slug);

describe('POST …/orders (create draft)', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s creates a DRAFT with price snapshots and exact totals, without touching stock',
    async (who) => {
      const { team, org, main, customer, pen, mouse, stock, order } = await setup();
      await stock(main.id, pen.id, 10);

      const response = await order(
        [
          { productId: pen.id, quantity: 3 },
          { productId: mouse.id, quantity: 2 },
        ],
        { actor: team[who] },
      ).expect(201);

      const created = response.body.order;
      expect(created).toMatchObject({
        orderNumber: 'SO-1001',
        status: 'DRAFT',
        customer: { id: customer.id, name: 'Riverside Dental', isActive: true },
        warehouse: { id: main.id, code: 'MAIN', isActive: true },
        itemCount: 2,
        totalQuantity: 5,
        // 3 × 8.50 + 2 × 24.99 = 25.50 + 49.98
        subtotal: '75.48',
        total: '75.48',
        notes: null,
        currency: 'TRY',
      });
      expect(created.items).toEqual([
        {
          id: expect.any(String),
          productId: pen.id,
          productName: 'Ballpoint Pen',
          sku: 'PEN',
          unitPrice: '8.50',
          currency: 'TRY',
          quantity: 3,
          lineTotal: '25.50',
          productStatus: 'ACTIVE',
          availableQuantity: 10,
        },
        expect.objectContaining({
          productId: mouse.id,
          unitPrice: '24.99',
          lineTotal: '49.98',
          availableQuantity: 0,
        }),
      ]);
      expect(created.history).toEqual([
        {
          action: 'ORDER_CREATED',
          actor: { id: team[who].user.id, name: team[who].user.name },
          createdAt: expect.any(String),
        },
      ]);
      const [log] = await orderLogs(org, 'ORDER_CREATED');
      expect(log?.metadata).toEqual({
        orderNumber: 'SO-1001',
        customerId: customer.id,
        warehouseId: main.id,
        itemCount: 2,
        total: '75.48',
        currency: 'TRY',
      });
      // Drafts never affect stock.
      expect(await quantityOf(main.id, pen.id)).toBe(10);
      expect(await prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(0);
    },
  );

  it('numbers orders per organization, sequentially and without collisions under concurrency', async () => {
    const a = await setup('org-a');
    const b = await setup('org-b');

    const first = await a.order([]).expect(201);
    const parallel = await Promise.all(Array.from({ length: 8 }, () => a.order([])));
    const otherOrg = await b.order([]).expect(201);

    expect(first.body.order.orderNumber).toBe('SO-1001');
    expect(parallel.map((response) => response.status)).toEqual(Array(8).fill(201));
    expect(parallel.map((response) => response.body.order.orderNumber).sort()).toEqual(
      Array.from({ length: 8 }, (_, index) => `SO-${1002 + index}`),
    );
    expect(otherOrg.body.order.orderNumber).toBe('SO-1001');
  });

  it('skips numbers that are already taken', async () => {
    const { org, main, order } = await setup();
    await prisma.order.create({
      data: { organizationId: org, orderNumber: 'SO-1001', warehouseId: main.id },
    });

    const response = await order([]).expect(201);

    expect(response.body.order.orderNumber).toBe('SO-1002');
  });

  it.each([
    ['quantity 0', { quantity: 0 }, 'items.0.quantity'],
    ['a negative quantity', { quantity: -2 }, 'items.0.quantity'],
    ['a fractional quantity', { quantity: 1.5 }, 'items.0.quantity'],
    ['a quantity as a string', { quantity: '2' }, 'items.0.quantity'],
    ['a quantity above the maximum', { quantity: 1_000_001 }, 'items.0.quantity'],
    ['a client-sent unit price', { quantity: 1, unitPrice: '0.01' }, 'items.0.unitPrice'],
  ])('rejects %s', async (_case, line, field) => {
    const { base, team, main, customer, pen, api } = await setup();

    const response = await api()
      .post(`${base}/orders`)
      .set('Cookie', team.owner.cookie)
      .send({
        customerId: customer.id,
        warehouseId: main.id,
        items: [{ productId: pen.id, ...line }],
      })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await prisma.order.count()).toBe(0);
  });

  it('rejects server-owned fields and duplicate products', async () => {
    const { base, team, main, customer, pen, api } = await setup();
    const post = (body: object) =>
      api()
        .post(`${base}/orders`)
        .set('Cookie', team.owner.cookie)
        .send({ customerId: customer.id, warehouseId: main.id, ...body })
        .expect(400);

    for (const field of ['orderNumber', 'status', 'total', 'subtotal', 'organizationId']) {
      const response = await post({ [field]: field === 'organizationId' ? NON_EXISTENT_ID : 'X' });
      expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    }
    const duplicate = await post({
      items: [
        { productId: pen.id, quantity: 1 },
        { productId: pen.id.toUpperCase(), quantity: 2 },
      ],
    });
    const missingCustomer = await api()
      .post(`${base}/orders`)
      .set('Cookie', team.owner.cookie)
      .send({ warehouseId: main.id })
      .expect(400);

    expect(duplicate.body.details).toEqual([
      {
        field: 'items',
        messages: ['Each product can appear only once; change its quantity instead.'],
      },
    ]);
    expect(missingCustomer.body.details[0].field).toBe('customerId');
    expect(await prisma.order.count()).toBe(0);
  });

  it('requires an active customer, warehouse, and products of this organization', async () => {
    const { org, order } = await setup();
    const other = await setup('other');
    const archivedCustomer = await createCustomer(org, { name: 'Closed', isActive: false });
    const closed = await createWarehouse(org, { code: 'CLOSED', isActive: false });
    const archivedProduct = await createProduct(org, {
      name: 'Old Pen',
      sku: 'OLD',
      status: 'ARCHIVED',
    });

    const cases = [
      [() => order([], { customerId: other.customer.id }), 422, 'ORDER_CUSTOMER_NOT_FOUND'],
      [() => order([], { customerId: archivedCustomer.id }), 409, 'ORDER_CUSTOMER_INACTIVE'],
      [() => order([], { warehouseId: other.main.id }), 422, 'ORDER_WAREHOUSE_NOT_FOUND'],
      [() => order([], { warehouseId: closed.id }), 409, 'ORDER_WAREHOUSE_INACTIVE'],
      [() => order([{ productId: other.pen.id, quantity: 1 }]), 422, 'ORDER_PRODUCT_NOT_FOUND'],
      [
        () => order([{ productId: archivedProduct.id, quantity: 1 }]),
        409,
        'ORDER_PRODUCT_INACTIVE',
      ],
    ] as const;
    for (const [request, status, code] of cases) {
      const response = await request().expect(status);
      expect(response.body.code).toBe(code);
    }

    expect(await prisma.order.count({ where: { organizationId: org } })).toBe(0);
    // Failed creates roll the number counter back too.
    expect(await prisma.orderNumberSequence.count({ where: { organizationId: org } })).toBe(0);
  });
});

describe('PATCH …/orders/:id (edit draft)', () => {
  it('keeps price snapshots of existing lines, prices new lines now, and recalculates totals', async () => {
    const { base, api, team, org, east, customer, pen, mouse, order } = await setup();
    const created = (await order([{ productId: pen.id, quantity: 2 }]).expect(201)).body.order;
    // Prices change after the pen was added to the draft.
    await prisma.product.update({ where: { id: pen.id }, data: { price: '99.00' } });
    await prisma.product.update({ where: { id: mouse.id }, data: { price: '30.00' } });
    const otherCustomer = await createCustomer(org, { name: 'Brightline' });

    const response = await api()
      .patch(`${base}/orders/${created.id}`)
      .set('Cookie', team.staff.cookie)
      .send({
        customerId: otherCustomer.id,
        warehouseId: east.id,
        notes: ' Deliver before noon ',
        items: [
          { productId: pen.id, quantity: 5 },
          { productId: mouse.id, quantity: 1 },
        ],
      })
      .expect(200);

    const updated = response.body.order;
    expect(updated).toMatchObject({
      customer: { id: otherCustomer.id },
      warehouse: { id: east.id },
      notes: 'Deliver before noon',
      // 5 × 8.50 (snapshot) + 1 × 30.00 (current price)
      subtotal: '72.50',
      total: '72.50',
      totalQuantity: 6,
    });
    expect(updated.items.map((i: { unitPrice: string; lineTotal: string }) => i.unitPrice)).toEqual(
      ['8.50', '30.00'],
    );
    const [log] = await orderLogs(org, 'ORDER_UPDATED');
    expect(log?.metadata).toEqual({
      orderNumber: 'SO-1001',
      changes: ['customer', 'warehouse', 'notes', 'items'],
      itemCount: 2,
      total: '72.50',
    });
    expect(customer.id).not.toBe(otherCustomer.id);
  });

  it('removes lines, allows an empty draft, and logs nothing for a no-op', async () => {
    const { base, api, team, org, pen, mouse, order } = await setup();
    const created = (
      await order([
        { productId: pen.id, quantity: 2 },
        { productId: mouse.id, quantity: 1 },
      ]).expect(201)
    ).body.order;
    const patch = (body: object) =>
      api().patch(`${base}/orders/${created.id}`).set('Cookie', team.owner.cookie).send(body);

    const removed = await patch({ items: [{ productId: mouse.id, quantity: 1 }] }).expect(200);
    await patch({ items: [{ productId: mouse.id, quantity: 1 }] }).expect(200);
    const emptied = await patch({ items: [] }).expect(200);

    expect(removed.body.order).toMatchObject({ itemCount: 1, total: '24.99' });
    expect(emptied.body.order).toMatchObject({ itemCount: 0, subtotal: '0.00', total: '0.00' });
    expect(await orderLogs(org, 'ORDER_UPDATED')).toHaveLength(2);
    expect(await prisma.orderItem.count({ where: { orderId: created.id } })).toBe(0);
  });

  it('edits drafts only, and never sets a status directly', async () => {
    const { base, api, team, pen, confirmedOrder, order } = await setup();
    const confirmed = await confirmedOrder([{ productId: pen.id, quantity: 1 }]);
    const draft = (await order([]).expect(201)).body.order;

    const notEditable = await api()
      .patch(`${base}/orders/${confirmed.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ notes: 'Too late' })
      .expect(409);
    const status = await api()
      .patch(`${base}/orders/${draft.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ status: 'COMPLETED' })
      .expect(400);

    expect(notEditable.body).toMatchObject({
      code: 'ORDER_NOT_EDITABLE',
      message: 'Order SO-1001 is confirmed. Only draft orders can be edited.',
    });
    expect(status.body.code).toBe('ORDER_STATUS_INVALID');
    expect(await orderStatusOf(draft.id)).toBe('DRAFT');
  });
});

describe('one currency per order', () => {
  async function currencySetup() {
    const f = await setup();
    const chair = await createProduct(f.org, {
      name: 'Chair',
      sku: 'CHAIR',
      price: '249.00',
      currency: 'EUR',
    });
    const desk = await createProduct(f.org, {
      name: 'Desk',
      sku: 'DESK',
      price: '499.00',
      currency: 'EUR',
    });
    return { ...f, chair, desk };
  }

  it('takes the currency of the first line, snapshots it per line, and lists it', async () => {
    const { order, chair, desk, api, base, team } = await currencySetup();

    const created = (
      await order([
        { productId: chair.id, quantity: 2 },
        { productId: desk.id, quantity: 1 },
      ]).expect(201)
    ).body.order;
    const listed = await api().get(`${base}/orders`).set('Cookie', team.owner.cookie).expect(200);

    expect(created).toMatchObject({ currency: 'EUR', total: '997.00' });
    expect(created.items.map((item: { currency: string }) => item.currency)).toEqual([
      'EUR',
      'EUR',
    ]);
    expect(listed.body.items[0]).toMatchObject({ currency: 'EUR', total: '997.00' });
  });

  it('refuses a line in another currency, on create and on edit, changing nothing', async () => {
    const { order, chair, pen, api, base, team, org } = await currencySetup();

    const mixed = await order([
      { productId: chair.id, quantity: 1 },
      { productId: pen.id, quantity: 1 },
    ]).expect(422);
    const draft = (await order([{ productId: chair.id, quantity: 1 }]).expect(201)).body.order;
    const added = await api()
      .patch(`${base}/orders/${draft.id}`)
      .set('Cookie', team.owner.cookie)
      .send({
        items: [
          { productId: chair.id, quantity: 3 },
          { productId: pen.id, quantity: 1 },
        ],
      })
      .expect(422);

    for (const response of [mixed, added]) {
      expect(response.body).toMatchObject({
        code: 'ORDER_CURRENCY_MISMATCH',
        message:
          "Ballpoint Pen (PEN) is priced in TRY, but this order is in EUR. An order can't mix currencies.",
      });
    }
    // Nothing changed: one order (the draft), still one EUR line of quantity 1.
    expect(await prisma.order.count({ where: { organizationId: org } })).toBe(1);
    const lines = await prisma.orderItem.findMany({ where: { orderId: draft.id } });
    expect(lines.map((line) => [line.quantity, line.currency])).toEqual([[1, 'EUR']]);
  });

  it('lets a draft switch currency only by replacing all of its lines', async () => {
    const { order, chair, pen, api, base, team } = await currencySetup();
    const draft = (await order([{ productId: chair.id, quantity: 1 }]).expect(201)).body.order;
    const patch = (items: object[]) =>
      api().patch(`${base}/orders/${draft.id}`).set('Cookie', team.owner.cookie).send({ items });

    const emptied = (await patch([]).expect(200)).body.order;
    const switched = (await patch([{ productId: pen.id, quantity: 2 }]).expect(200)).body.order;
    const replaced = (await patch([{ productId: chair.id, quantity: 1 }]).expect(200)).body.order;

    expect(emptied).toMatchObject({ currency: null, total: '0.00' });
    expect(switched).toMatchObject({ currency: 'TRY', total: '17.00' });
    expect(replaced).toMatchObject({ currency: 'EUR', total: '249.00' });
  });

  it('keeps the historical currency of lines after the product changes currency', async () => {
    const { order, pen, mouse, api, base, team } = await currencySetup();
    const draft = (await order([{ productId: pen.id, quantity: 2 }]).expect(201)).body.order;

    await api()
      .patch(`${base}/products/${pen.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ currency: 'USD', price: '3.00' })
      .expect(200);
    const reloaded = await api()
      .get(`${base}/orders/${draft.id}`)
      .set('Cookie', team.owner.cookie)
      .expect(200);

    expect(reloaded.body.order).toMatchObject({ currency: 'TRY', total: '17.00' });
    expect(reloaded.body.order.items[0]).toMatchObject({ unitPrice: '8.50', currency: 'TRY' });
    // The pen's line can stay (its snapshot is TRY), but as a NEW line the (now USD) pen no
    // longer fits this TRY order.
    const patch = (items: object[]) =>
      api().patch(`${base}/orders/${draft.id}`).set('Cookie', team.owner.cookie).send({ items });
    await patch([{ productId: pen.id, quantity: 3 }]).expect(200);
    await patch([{ productId: mouse.id, quantity: 1 }]).expect(200);
    const readded = await patch([
      { productId: mouse.id, quantity: 1 },
      { productId: pen.id, quantity: 1 },
    ]).expect(422);
    expect(readded.body.code).toBe('ORDER_CURRENCY_MISMATCH');
  });
});

describe('lifecycle', () => {
  it('confirms (no stock effect), then processes, ships, and completes — each logged', async () => {
    const { org, main, pen, stock, order, action } = await setup();
    await stock(main.id, pen.id, 10);
    const created = (await order([{ productId: pen.id, quantity: 4 }]).expect(201)).body.order;

    const confirmed = await action(created.id, 'confirm').expect(200);
    expect(confirmed.body.order.status).toBe('CONFIRMED');
    expect(await quantityOf(main.id, pen.id)).toBe(10);

    await action(created.id, 'process').expect(200);
    expect(await quantityOf(main.id, pen.id)).toBe(6);
    const shipped = await action(created.id, 'ship').expect(200);
    const completed = await action(created.id, 'complete').expect(200);

    expect(shipped.body.order.status).toBe('SHIPPED');
    expect(completed.body.order).toMatchObject({ status: 'COMPLETED' });
    expect(completed.body.order.items[0].availableQuantity).toBeNull();
    expect(completed.body.order.history.map((h: { action: string }) => h.action)).toEqual([
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_PROCESSING',
      'ORDER_SHIPPED',
      'ORDER_COMPLETED',
    ]);
    const [confirmLog] = await orderLogs(org, 'ORDER_CONFIRMED');
    expect(confirmLog?.metadata).toEqual({
      orderNumber: 'SO-1001',
      from: 'DRAFT',
      to: 'CONFIRMED',
      itemCount: 1,
      totalQuantity: 4,
      total: '34.00',
    });
    // Shipping and completing never touch stock.
    expect(await quantityOf(main.id, pen.id)).toBe(6);
    expect(await prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(1);
  });

  it('cancels a DRAFT or a CONFIRMED order without touching stock', async () => {
    const { org, main, pen, stock, order, action, confirmedOrder } = await setup();
    await stock(main.id, pen.id, 10);
    const draft = (await order([{ productId: pen.id, quantity: 1 }]).expect(201)).body.order;
    const confirmed = await confirmedOrder([{ productId: pen.id, quantity: 2 }]);

    const cancelledDraft = await action(draft.id, 'cancel').expect(200);
    const cancelledConfirmed = await action(confirmed.id, 'cancel').expect(200);

    expect(cancelledDraft.body.order.status).toBe('CANCELLED');
    expect(cancelledConfirmed.body.order.status).toBe('CANCELLED');
    expect((await orderLogs(org, 'ORDER_CANCELLED')).map((log) => log.metadata)).toEqual([
      { orderNumber: 'SO-1001', from: 'DRAFT', to: 'CANCELLED' },
      { orderNumber: 'SO-1002', from: 'CONFIRMED', to: 'CANCELLED' },
    ]);
    expect(await quantityOf(main.id, pen.id)).toBe(10);
  });

  it('rejects every transition the state machine does not allow', async () => {
    const { main, pen, stock, order, action, confirmedOrder } = await setup();
    await stock(main.id, pen.id, 50);
    const draft = (await order([{ productId: pen.id, quantity: 1 }]).expect(201)).body.order;
    const confirmed = await confirmedOrder([{ productId: pen.id, quantity: 1 }]);
    const processing = await confirmedOrder([{ productId: pen.id, quantity: 1 }]);
    await action(processing.id, 'process').expect(200);
    const shipped = await confirmedOrder([{ productId: pen.id, quantity: 1 }]);
    await action(shipped.id, 'process').expect(200);
    await action(shipped.id, 'ship').expect(200);
    const completed = await confirmedOrder([{ productId: pen.id, quantity: 1 }]);
    for (const step of ['process', 'ship', 'complete'] as const) {
      await action(completed.id, step).expect(200);
    }
    const cancelled = (await order([]).expect(201)).body.order;
    await action(cancelled.id, 'cancel').expect(200);
    const stockBefore = await quantityOf(main.id, pen.id);

    const invalid = [
      [draft.id, 'process'],
      [draft.id, 'ship'],
      [draft.id, 'complete'],
      [confirmed.id, 'confirm'],
      [confirmed.id, 'ship'],
      [confirmed.id, 'complete'],
      [processing.id, 'confirm'],
      [processing.id, 'process'],
      [processing.id, 'complete'],
      [processing.id, 'cancel'],
      [shipped.id, 'process'],
      [shipped.id, 'cancel'],
      [completed.id, 'process'],
      [completed.id, 'ship'],
      [completed.id, 'cancel'],
      [cancelled.id, 'confirm'],
      [cancelled.id, 'process'],
    ] as const;
    for (const [id, step] of invalid) {
      const response = await action(id, step).expect(409);
      expect(response.body.code).toBe('ORDER_INVALID_TRANSITION');
    }
    const message = (await action(shipped.id, 'cancel').expect(409)).body.message;

    expect(message).toBe("Order SO-1004 is shipped and can't be cancelled.");
    expect(await quantityOf(main.id, pen.id)).toBe(stockBefore);
  });

  it('confirms only complete, valid orders', async () => {
    const { org, main, pen, mouse, order, action } = await setup();
    const empty = (await order([]).expect(201)).body.order;
    const withArchived = (await order([{ productId: mouse.id, quantity: 1 }]).expect(201)).body
      .order;
    await prisma.product.update({ where: { id: mouse.id }, data: { status: 'ARCHIVED' } });
    const archivedCustomer = await createCustomer(org, { name: 'Leaving' });
    const forArchivedCustomer = (
      await order([{ productId: pen.id, quantity: 1 }], { customerId: archivedCustomer.id }).expect(
        201,
      )
    ).body.order;
    await prisma.customer.update({ where: { id: archivedCustomer.id }, data: { isActive: false } });
    const inClosing = (await order([{ productId: pen.id, quantity: 1 }]).expect(201)).body.order;

    const emptyResponse = await action(empty.id, 'confirm').expect(422);
    const archivedProduct = await action(withArchived.id, 'confirm').expect(409);
    const archivedCustomerResponse = await action(forArchivedCustomer.id, 'confirm').expect(409);
    await prisma.warehouse.update({ where: { id: main.id }, data: { isActive: false } });
    const closedWarehouse = await action(inClosing.id, 'confirm').expect(409);

    expect(emptyResponse.body.code).toBe('ORDER_EMPTY');
    expect(archivedProduct.body).toMatchObject({
      code: 'ORDER_PRODUCT_INACTIVE',
      message:
        'Wireless Mouse (MOUSE) is archived. Remove it from the order or restore the product.',
    });
    expect(archivedCustomerResponse.body.code).toBe('ORDER_CUSTOMER_INACTIVE');
    expect(closedWarehouse.body.code).toBe('ORDER_WAREHOUSE_INACTIVE');
    for (const id of [empty.id, withArchived.id, forArchivedCustomer.id, inClosing.id]) {
      expect(await orderStatusOf(id)).toBe('DRAFT');
    }
    expect(await orderLogs(org, 'ORDER_CONFIRMED')).toEqual([]);
  });

  it('lets STAFF create, edit, and confirm, but not process, ship, complete, or cancel', async () => {
    const { base, api, team, main, pen, stock, order, action } = await setup();
    await stock(main.id, pen.id, 10);
    const created = (
      await order([{ productId: pen.id, quantity: 1 }], { actor: team.staff }).expect(201)
    ).body.order;
    await api()
      .patch(`${base}/orders/${created.id}`)
      .set('Cookie', team.staff.cookie)
      .send({ items: [{ productId: pen.id, quantity: 2 }] })
      .expect(200);
    await action(created.id, 'confirm', team.staff).expect(200);

    for (const step of ['process', 'cancel'] as const) {
      const response = await action(created.id, step, team.staff).expect(403);
      expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    }
    await action(created.id, 'process').expect(200);
    for (const step of ['ship', 'complete'] as const) {
      await action(created.id, step, team.staff).expect(403);
    }
    expect(await orderStatusOf(created.id)).toBe('PROCESSING');
    expect(await quantityOf(main.id, pen.id)).toBe(8);
  });
});

describe('history stays correct', () => {
  it('renders from snapshots after the product, customer, and warehouse change', async () => {
    const { base, api, team, main, customer, pen, stock, confirmedOrder, action } = await setup();
    await stock(main.id, pen.id, 10);
    const created = await confirmedOrder([{ productId: pen.id, quantity: 2 }]);
    await action(created.id, 'process').expect(200);

    await prisma.product.update({
      where: { id: pen.id },
      data: { name: 'Gel Pen (renamed)', sku: 'PEN-2', price: '1.00', status: 'ARCHIVED' },
    });
    await prisma.customer.update({ where: { id: customer.id }, data: { name: 'Renamed Clinic' } });
    await prisma.warehouse.update({ where: { id: main.id }, data: { isActive: false } });

    const detail = await api()
      .get(`${base}/orders/${created.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);

    expect(detail.body.order).toMatchObject({
      status: 'PROCESSING',
      subtotal: '17.00',
      total: '17.00',
      warehouse: { id: main.id, code: 'MAIN', isActive: false },
      // The customer is a reference (the current name), not a snapshot.
      customer: { id: customer.id, name: 'Renamed Clinic' },
    });
    expect(detail.body.order.items[0]).toMatchObject({
      productId: pen.id,
      productName: 'Ballpoint Pen',
      sku: 'PEN',
      unitPrice: '8.50',
      lineTotal: '17.00',
      productStatus: 'ARCHIVED',
    });
  });
});

describe('GET …/orders', () => {
  it('filters, searches, sorts, and paginates on the server', async () => {
    const { base, api, team, org, east, pen, order, action } = await setup();
    const brightline = await createCustomer(org, { name: 'Sam Patel', companyName: 'Brightline' });
    await order([{ productId: pen.id, quantity: 1 }]).expect(201);
    const b = (
      await order([{ productId: pen.id, quantity: 10 }], {
        customerId: brightline.id,
        warehouseId: east.id,
      }).expect(201)
    ).body.order;
    const c = (await order([]).expect(201)).body.order;
    await action(c.id, 'cancel').expect(200);
    const list = (query = '') =>
      api().get(`${base}/orders${query}`).set('Cookie', team.staff.cookie).expect(200);
    const numbers = (body: { items: { orderNumber: string }[] }) =>
      body.items.map((item) => item.orderNumber);

    const all = await list();
    const cancelled = await list('?status=CANCELLED');
    const forCustomer = await list(`?customerId=${brightline.id}`);
    const inEast = await list(`?warehouseId=${east.id}`);
    const byNumber = await list('?search=so-1002');
    const byCompany = await list('?search=bright');
    const byTotal = await list('?sortBy=total&sortOrder=desc');
    const page2 = await list('?pageSize=2&page=2');
    const today = new Date().toISOString().slice(0, 10);
    const todayOnly = await list(`?from=${today}&to=${today}`);
    const future = await list('?from=2999-01-01');

    expect(numbers(all.body)).toEqual(['SO-1003', 'SO-1002', 'SO-1001']);
    expect(all.body.items[1]).toEqual({
      id: b.id,
      orderNumber: 'SO-1002',
      status: 'DRAFT',
      customer: { id: brightline.id, name: 'Sam Patel', companyName: 'Brightline', isActive: true },
      warehouse: { id: east.id, name: 'East', code: 'EAST', isActive: true },
      itemCount: 1,
      total: '85.00',
      currency: 'TRY',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(numbers(cancelled.body)).toEqual(['SO-1003']);
    expect(numbers(forCustomer.body)).toEqual(['SO-1002']);
    expect(numbers(inEast.body)).toEqual(['SO-1002']);
    expect(numbers(byNumber.body)).toEqual(['SO-1002']);
    expect(numbers(byCompany.body)).toEqual(['SO-1002']);
    expect(numbers(byTotal.body)).toEqual(['SO-1002', 'SO-1001', 'SO-1003']);
    expect(page2.body).toMatchObject({
      items: [expect.objectContaining({ orderNumber: 'SO-1001' })],
      pagination: { page: 2, pageSize: 2, totalItems: 3, totalPages: 2 },
    });
    expect(todayOnly.body.pagination.totalItems).toBe(3);
    expect(future.body.items).toEqual([]);
  });

  it('validates filters against the organization and the whitelists', async () => {
    const { base, api, team } = await setup();
    const other = await setup('other');
    const get = (query: string) =>
      api().get(`${base}/orders${query}`).set('Cookie', team.owner.cookie);

    const customer = await get(`?customerId=${other.customer.id}`).expect(422);
    const warehouse = await get(`?warehouseId=${other.main.id}`).expect(422);
    const status = await get('?status=LOST').expect(400);
    const sort = await get('?sortBy=customer').expect(400);
    const range = await get('?from=2026-09-10&to=2026-09-01').expect(400);

    expect([customer.body.code, warehouse.body.code]).toEqual([
      'ORDER_CUSTOMER_NOT_FOUND',
      'ORDER_WAREHOUSE_NOT_FOUND',
    ]);
    expect([status.body.code, sort.body.code, range.body.code]).toEqual([
      'VALIDATION_ERROR',
      'VALIDATION_ERROR',
      'VALIDATION_ERROR',
    ]);
  });

  it('answers ORDER_NOT_FOUND for unknown and malformed ids, and has no delete route', async () => {
    const { base, api, team, order } = await setup();
    const created = (await order([]).expect(201)).body.order;

    for (const id of [NON_EXISTENT_ID, 'SO-1001']) {
      const response = await api()
        .get(`${base}/orders/${id}`)
        .set('Cookie', team.owner.cookie)
        .expect(404);
      expect(response.body.code).toBe('ORDER_NOT_FOUND');
    }
    await api().delete(`${base}/orders/${created.id}`).set('Cookie', team.owner.cookie).expect(404);
    expect(await orderStatusOf(created.id)).toBe('DRAFT');
  });
});
