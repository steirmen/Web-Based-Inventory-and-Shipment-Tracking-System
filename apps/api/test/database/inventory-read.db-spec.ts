import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createProduct, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, createTeam, NON_EXISTENT_ID } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

/**
 * Two warehouses and three products, stocked through the real API:
 *   MAIN: Mouse 10 (min 5 → IN_STOCK), Keyboard 2 (min 5 → LOW_STOCK), Cable 0 (OUT_OF_STOCK)
 *   EAST: Mouse 5 (min 5 → LOW_STOCK)
 */
async function stocked() {
  const team = await createTeam();
  const org = team.organization.id;
  const main = await createWarehouse(org, { name: 'Main', code: 'MAIN' });
  const east = await createWarehouse(org, { name: 'East', code: 'EAST' });
  const mouse = await createProduct(org, {
    name: 'Wireless Mouse',
    sku: 'ACC-MOUSE',
    minimumStock: 5,
  });
  const keyboard = await createProduct(org, { name: 'Keyboard', sku: 'ACC-KB', minimumStock: 5 });
  const cable = await createProduct(org, { name: 'USB Cable', sku: 'ELE-CABLE', minimumStock: 0 });
  const post = (operation: string, body: Record<string, unknown>) =>
    api()
      .post(`/organizations/${org}/inventory/${operation}`)
      .set('Cookie', team.owner.cookie)
      .send(body)
      .expect(200);

  await post('receive', {
    warehouseId: main.id,
    productId: mouse.id,
    quantity: 12,
    reason: 'PO 1001',
  });
  await post('issue', { warehouseId: main.id, productId: mouse.id, quantity: 2 });
  await post('receive', { warehouseId: main.id, productId: keyboard.id, quantity: 2 });
  await post('receive', { warehouseId: main.id, productId: cable.id, quantity: 1 });
  await post('damage', {
    warehouseId: main.id,
    productId: cable.id,
    quantity: 1,
    reason: 'Frayed',
  });
  await post('transfer', {
    sourceWarehouseId: main.id,
    destinationWarehouseId: east.id,
    productId: mouse.id,
    quantity: 5,
  });
  await post('receive', { warehouseId: main.id, productId: mouse.id, quantity: 5 });

  const list = (query = '', cookie = team.staff.cookie) =>
    api().get(`/organizations/${org}/inventory${query}`).set('Cookie', cookie);
  const ledger = (query = '', cookie = team.staff.cookie) =>
    api().get(`/organizations/${org}/stock-movements${query}`).set('Cookie', cookie);
  return { team, org, main, east, mouse, keyboard, cable, list, ledger };
}

const summary = (
  items: {
    warehouse: { code: string };
    product: { sku: string };
    quantity: number;
    status: string;
  }[],
) =>
  items.map((item) => `${item.warehouse.code}/${item.product.sku}=${item.quantity}:${item.status}`);

describe('GET /organizations/:id/inventory', () => {
  it('lists stock per warehouse with per-warehouse status, by product name by default', async () => {
    const { list } = await stocked();

    const response = await list().expect(200);

    expect(summary(response.body.items)).toEqual([
      'MAIN/ACC-KB=2:LOW_STOCK',
      'MAIN/ELE-CABLE=0:OUT_OF_STOCK',
      'EAST/ACC-MOUSE=5:LOW_STOCK',
      'MAIN/ACC-MOUSE=10:IN_STOCK',
    ]);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 4,
      totalPages: 1,
    });
    expect(response.body.items[0]).toEqual({
      id: expect.any(String),
      warehouse: expect.objectContaining({ code: 'MAIN', isActive: true }),
      product: expect.objectContaining({ name: 'Keyboard', sku: 'ACC-KB', status: 'ACTIVE' }),
      quantity: 2,
      minimumStock: 5,
      status: 'LOW_STOCK',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('filters by warehouse, product, status, and search (name or SKU, literal)', async () => {
    const { list, east, mouse } = await stocked();

    const byWarehouse = await list(`?warehouseId=${east.id}`).expect(200);
    const byProduct = await list(`?productId=${mouse.id}`).expect(200);
    const low = await list('?status=LOW_STOCK').expect(200);
    const out = await list('?status=OUT_OF_STOCK').expect(200);
    const inStock = await list('?status=IN_STOCK').expect(200);
    const byName = await list('?search=mouse').expect(200);
    const bySku = await list('?search=ele-').expect(200);
    const wildcard = await list('?search=%25').expect(200);

    expect(summary(byWarehouse.body.items)).toEqual(['EAST/ACC-MOUSE=5:LOW_STOCK']);
    expect(summary(byProduct.body.items)).toEqual([
      'EAST/ACC-MOUSE=5:LOW_STOCK',
      'MAIN/ACC-MOUSE=10:IN_STOCK',
    ]);
    expect(summary(low.body.items)).toEqual([
      'MAIN/ACC-KB=2:LOW_STOCK',
      'EAST/ACC-MOUSE=5:LOW_STOCK',
    ]);
    expect(summary(out.body.items)).toEqual(['MAIN/ELE-CABLE=0:OUT_OF_STOCK']);
    expect(summary(inStock.body.items)).toEqual(['MAIN/ACC-MOUSE=10:IN_STOCK']);
    expect(byName.body.pagination.totalItems).toBe(2);
    expect(summary(bySku.body.items)).toEqual(['MAIN/ELE-CABLE=0:OUT_OF_STOCK']);
    expect(wildcard.body.items).toEqual([]);
  });

  it('sorts by whitelisted fields only and paginates with stable totals', async () => {
    const { list } = await stocked();

    const byQuantity = await list('?sortBy=quantity&sortOrder=desc').expect(200);
    const bySku = await list('?sortBy=sku').expect(200);
    const page2 = await list('?sortBy=quantity&pageSize=3&page=2').expect(200);
    const beyond = await list('?page=9').expect(200);
    const injected = await list('?sortBy=quantity;DROP TABLE inventory').expect(400);
    const tooBig = await list('?pageSize=101').expect(400);

    expect(byQuantity.body.items.map((i: { quantity: number }) => i.quantity)).toEqual([
      10, 5, 2, 0,
    ]);
    expect(bySku.body.items.map((i: { product: { sku: string } }) => i.product.sku)).toEqual([
      'ACC-KB',
      'ACC-MOUSE',
      'ACC-MOUSE',
      'ELE-CABLE',
    ]);
    expect(page2.body).toMatchObject({
      items: [expect.objectContaining({ quantity: 10 })],
      pagination: { page: 2, pageSize: 3, totalItems: 4, totalPages: 2 },
    });
    expect(beyond.body).toMatchObject({ items: [], pagination: { totalItems: 4 } });
    expect(injected.body.code).toBe('VALIDATION_ERROR');
    expect(tooBig.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.inventory.count()).toBe(4);
  });

  it('rejects a status outside the whitelist and malformed ids', async () => {
    const { list } = await stocked();

    const status = await list('?status=SOLD_OUT').expect(400);
    const id = await list('?warehouseId=abc').expect(400);

    expect(status.body.details[0].field).toBe('status');
    expect(id.body.details[0].field).toBe('warehouseId');
  });

  it('answers 422 for warehouse or product filters from another organization', async () => {
    const { list } = await stocked();
    const other = await createTeam('other');
    const foreignWarehouse = await createWarehouse(other.organization.id);
    const foreignProduct = await createProduct(other.organization.id);

    const warehouse = await list(`?warehouseId=${foreignWarehouse.id}`).expect(422);
    const product = await list(`?productId=${foreignProduct.id}`).expect(422);

    expect(warehouse.body.code).toBe('INVENTORY_WAREHOUSE_NOT_FOUND');
    expect(product.body.code).toBe('INVENTORY_PRODUCT_NOT_FOUND');
  });

  it('is not available to non-members', async () => {
    const { org } = await stocked();
    const outsider = await createSignedInUser();

    const response = await api()
      .get(`/organizations/${org}/inventory`)
      .set('Cookie', outsider.cookie)
      .expect(404);

    expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });
});

describe('GET /organizations/:id/inventory/:inventoryId (+ /movements)', () => {
  it('returns one stock record and its history newest first, paginated', async () => {
    const { team, org, main, mouse } = await stocked();
    const row = await prisma.inventory.findUniqueOrThrow({
      where: { warehouseId_productId: { warehouseId: main.id, productId: mouse.id } },
    });

    const detail = await api()
      .get(`/organizations/${org}/inventory/${row.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);
    const history = await api()
      .get(`/organizations/${org}/inventory/${row.id}/movements?pageSize=3`)
      .set('Cookie', team.staff.cookie)
      .expect(200);

    expect(detail.body.inventory).toMatchObject({
      id: row.id,
      quantity: 10,
      minimumStock: 5,
      status: 'IN_STOCK',
      warehouse: { code: 'MAIN' },
      product: { sku: 'ACC-MOUSE' },
    });
    expect(detail.body.inventory).not.toHaveProperty('movements');
    expect(
      history.body.items.map((m: { movementType: string; quantityDelta: number }) => [
        m.movementType,
        m.quantityDelta,
      ]),
    ).toEqual([
      ['PURCHASE', 5],
      ['TRANSFER_OUT', -5],
      ['SALE', -2],
    ]);
    expect(history.body.pagination).toEqual({ page: 1, pageSize: 3, totalItems: 4, totalPages: 2 });
    expect(history.body.items[0]).toEqual({
      id: expect.any(String),
      movementType: 'PURCHASE',
      quantityDelta: 5,
      quantityBefore: 5,
      quantityAfter: 10,
      reason: null,
      actor: { id: team.owner.user.id, name: team.owner.user.name },
      warehouse: expect.objectContaining({ code: 'MAIN' }),
      product: expect.objectContaining({ sku: 'ACC-MOUSE' }),
      referenceType: null,
      referenceId: null,
      transferGroupId: null,
      createdAt: expect.any(String),
    });
  });

  it('returns INVENTORY_NOT_FOUND for unknown, malformed, and foreign ids', async () => {
    const { team, org } = await stocked();
    const other = await createTeam('other');
    const warehouse = await createWarehouse(other.organization.id);
    const product = await createProduct(other.organization.id);
    const foreign = await prisma.inventory.create({
      data: {
        organizationId: other.organization.id,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: 1,
      },
    });

    for (const id of [NON_EXISTENT_ID, 'nope', foreign.id]) {
      for (const suffix of ['', '/movements']) {
        const response = await api()
          .get(`/organizations/${org}/inventory/${id}${suffix}`)
          .set('Cookie', team.owner.cookie)
          .expect(404);
        expect(response.body.code).toBe('INVENTORY_NOT_FOUND');
      }
    }
  });
});

describe('GET /organizations/:id/stock-movements', () => {
  it('lists the whole ledger newest first, with filters', async () => {
    const { team, ledger, east, cable } = await stocked();

    const all = await ledger().expect(200);
    const oldestFirst = await ledger('?sortOrder=asc').expect(200);
    const inEast = await ledger(`?warehouseId=${east.id}`).expect(200);
    const forCable = await ledger(`?productId=${cable.id}`).expect(200);
    const damage = await ledger('?movementType=DAMAGE').expect(200);
    const byActor = await ledger(`?actorUserId=${team.owner.user.id}`).expect(200);
    const byReason = await ledger('?search=po 1001').expect(200);
    const bySku = await ledger('?search=acc-kb').expect(200);

    const types = (body: { items: { movementType: string }[] }) =>
      body.items.map((m) => m.movementType);
    expect(types(all.body)).toEqual([
      'PURCHASE',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'DAMAGE',
      'PURCHASE',
      'PURCHASE',
      'SALE',
      'PURCHASE',
    ]);
    expect(types(oldestFirst.body)).toEqual([...types(all.body)].reverse());
    expect(types(inEast.body)).toEqual(['TRANSFER_IN']);
    expect(types(forCable.body)).toEqual(['DAMAGE', 'PURCHASE']);
    expect(damage.body.items[0]).toMatchObject({ reason: 'Frayed', quantityDelta: -1 });
    expect(byActor.body.pagination.totalItems).toBe(8);
    expect(byReason.body.items).toEqual([expect.objectContaining({ reason: 'PO 1001' })]);
    expect(types(bySku.body)).toEqual(['PURCHASE']);
  });

  it('filters one transfer (both legs) by its transfer group', async () => {
    const { ledger } = await stocked();
    const [transferIn] = (await ledger('?movementType=TRANSFER_IN').expect(200)).body.items;

    const group = await ledger(`?transferGroupId=${transferIn.transferGroupId}`).expect(200);
    const malformed = await ledger('?transferGroupId=abc').expect(400);

    expect(group.body.items).toEqual([
      expect.objectContaining({ movementType: 'TRANSFER_IN', quantityDelta: 5 }),
      expect.objectContaining({ movementType: 'TRANSFER_OUT', quantityDelta: -5 }),
    ]);
    expect(
      group.body.items.every(
        (m: { transferGroupId: string }) => m.transferGroupId === transferIn.transferGroupId,
      ),
    ).toBe(true);
    expect(malformed.body.details[0].field).toBe('transferGroupId');
  });

  it('filters by an inclusive date range (a date-only "to" includes that day)', async () => {
    const { org, ledger } = await stocked();
    const movements = await prisma.stockMovement.findMany({ where: { organizationId: org } });
    // Spread the history over three known days.
    const days = [
      '2026-09-01T10:00:00.000Z',
      '2026-09-02T23:59:59.999Z',
      '2026-09-03T00:00:00.000Z',
    ];
    // The ledger is append-only (a trigger refuses UPDATE); backdating test fixtures needs
    // replica mode, which skips triggers and is available only to a superuser on the test DB.
    await prisma.$transaction([
      prisma.$executeRaw`SET LOCAL session_replication_role = replica`,
      ...movements.map(
        (movement, index) =>
          prisma.$executeRaw`UPDATE stock_movements SET created_at = ${new Date(days[index % 3]!)} WHERE id = ${movement.id}::uuid`,
      ),
    ]);

    const day2 = await ledger('?from=2026-09-02&to=2026-09-02').expect(200);
    const fromDay2 = await ledger('?from=2026-09-02T23:59:59.999Z').expect(200);
    const untilDay1 = await ledger('?to=2026-09-01T10:00:00.000Z').expect(200);
    const reversed = await ledger('?from=2026-09-03&to=2026-09-01').expect(400);
    const invalid = await ledger('?from=yesterday').expect(400);

    const count = (index: number) => movements.filter((_, i) => i % 3 === index).length;
    expect(day2.body.pagination.totalItems).toBe(count(1));
    expect(fromDay2.body.pagination.totalItems).toBe(count(1) + count(2));
    expect(untilDay1.body.pagination.totalItems).toBe(count(0));
    expect(reversed.body.details).toEqual([
      { field: 'to', messages: ['to must not be before from.'] },
    ]);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('validates every filter id against the organization', async () => {
    const { ledger } = await stocked();
    const other = await createTeam('other');
    const foreignWarehouse = await createWarehouse(other.organization.id);
    const foreignProduct = await createProduct(other.organization.id);

    const warehouse = await ledger(`?warehouseId=${foreignWarehouse.id}`).expect(422);
    const product = await ledger(`?productId=${foreignProduct.id}`).expect(422);
    const actor = await ledger(`?actorUserId=${other.owner.user.id}`).expect(422);
    const type = await ledger('?movementType=TRANSFER').expect(400);
    const sort = await ledger('?sortBy=quantity_delta').expect(400);

    expect([warehouse.body.code, product.body.code, actor.body.code]).toEqual([
      'INVENTORY_WAREHOUSE_NOT_FOUND',
      'INVENTORY_PRODUCT_NOT_FOUND',
      'STOCK_MOVEMENT_ACTOR_NOT_FOUND',
    ]);
    expect([type.body.code, sort.body.code]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);
  });

  it('still filters by a former member who recorded movements', async () => {
    const { team, org, ledger } = await stocked();
    await prisma.organizationMember.delete({ where: { id: team.owner.memberId } });

    const response = await ledger(`?actorUserId=${team.owner.user.id}`, team.admin.cookie).expect(
      200,
    );

    expect(response.body.pagination.totalItems).toBe(8);
    expect(await prisma.stockMovement.count({ where: { organizationId: org } })).toBe(8);
  });
});
