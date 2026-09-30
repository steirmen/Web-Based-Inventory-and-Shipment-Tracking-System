import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createProduct, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createTeam } from './support/organizations.js';

/**
 * Organization A must not be able to see or change anything of organization
 * B's warehouses, stock, or movements: not through B's routes (not a member),
 * and not by putting B's ids into A's routes or bodies.
 */

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

async function twoOrganizations() {
  const a = await createTeam('org-a');
  const b = await createTeam('org-b');
  const warehouseA = await createWarehouse(a.organization.id, { code: 'MAIN', name: 'A main' });
  const warehouseB = await createWarehouse(b.organization.id, { code: 'MAIN', name: 'B main' });
  const warehouseB2 = await createWarehouse(b.organization.id, { code: 'EAST', name: 'B east' });
  const productA = await createProduct(a.organization.id, { sku: 'SAME' });
  const productB = await createProduct(b.organization.id, { sku: 'SAME' });
  await api()
    .post(`/organizations/${b.organization.id}/inventory/receive`)
    .set('Cookie', b.owner.cookie)
    .send({ warehouseId: warehouseB.id, productId: productB.id, quantity: 9 })
    .expect(200);
  await api()
    .post(`/organizations/${a.organization.id}/inventory/receive`)
    .set('Cookie', a.owner.cookie)
    .send({ warehouseId: warehouseA.id, productId: productA.id, quantity: 4 })
    .expect(200);
  const inventoryB = await prisma.inventory.findFirstOrThrow({
    where: { organizationId: b.organization.id },
  });
  const snapshot = async () => ({
    warehouses: await prisma.warehouse.findMany({
      where: { organizationId: b.organization.id },
      orderBy: { id: 'asc' },
    }),
    inventory: await prisma.inventory.findMany({
      where: { organizationId: b.organization.id },
      orderBy: { id: 'asc' },
    }),
    movements: await prisma.stockMovement.count({ where: { organizationId: b.organization.id } }),
    logs: await prisma.activityLog.count({ where: { organizationId: b.organization.id } }),
  });
  return { a, b, warehouseA, warehouseB, warehouseB2, productA, productB, inventoryB, snapshot };
}

describe('warehouse & inventory tenant isolation', () => {
  it("shows A only A's warehouses, stock, and movements", async () => {
    const { a, warehouseA } = await twoOrganizations();
    const get = (path: string) =>
      api()
        .get(`/organizations/${a.organization.id}${path}`)
        .set('Cookie', a.staff.cookie)
        .expect(200);

    const warehouses = await get('/warehouses');
    const inventory = await get('/inventory?search=SAME');
    const movements = await get('/stock-movements');

    expect(warehouses.body.warehouses.map((w: { id: string }) => w.id)).toEqual([warehouseA.id]);
    expect(warehouses.body.warehouses[0]).toMatchObject({ totalUnits: 4, productCount: 1 });
    expect(inventory.body.items).toHaveLength(1);
    expect(inventory.body.items[0].quantity).toBe(4);
    expect(movements.body.items).toHaveLength(1);
    expect(movements.body.items[0].quantityDelta).toBe(4);
  });

  it("refuses every one of B's routes to A's members with ORGANIZATION_NOT_FOUND", async () => {
    const { a, b, warehouseB, warehouseB2, productB, inventoryB, snapshot } =
      await twoOrganizations();
    const before = await snapshot();
    const base = `/organizations/${b.organization.id}`;
    const attempts = [
      () => api().get(`${base}/warehouses`),
      () => api().get(`${base}/warehouses/${warehouseB.id}`),
      () => api().patch(`${base}/warehouses/${warehouseB.id}`).send({ name: 'Hijacked' }),
      () => api().post(`${base}/warehouses/${warehouseB.id}/archive`),
      () => api().post(`${base}/warehouses/${warehouseB.id}/restore`),
      () => api().get(`${base}/inventory`),
      () => api().get(`${base}/inventory/${inventoryB.id}`),
      () => api().get(`${base}/inventory/${inventoryB.id}/movements`),
      () => api().get(`${base}/stock-movements`),
      () =>
        api()
          .post(`${base}/inventory/issue`)
          .send({ warehouseId: warehouseB.id, productId: productB.id, quantity: 1 }),
      () =>
        api().post(`${base}/inventory/transfer`).send({
          sourceWarehouseId: warehouseB.id,
          destinationWarehouseId: warehouseB2.id,
          productId: productB.id,
          quantity: 1,
        }),
    ];

    for (const attempt of attempts) {
      const response = await attempt().set('Cookie', a.owner.cookie).expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it("does not find B's warehouses or stock records through A's routes", async () => {
    const { a, warehouseB, inventoryB, snapshot } = await twoOrganizations();
    const before = await snapshot();
    const base = `/organizations/${a.organization.id}`;
    const warehouseAttempts = [
      () => api().get(`${base}/warehouses/${warehouseB.id}`),
      () => api().patch(`${base}/warehouses/${warehouseB.id}`).send({ name: 'Hijacked' }),
      () => api().post(`${base}/warehouses/${warehouseB.id}/archive`),
      () => api().post(`${base}/warehouses/${warehouseB.id}/restore`),
    ];
    const inventoryAttempts = [
      () => api().get(`${base}/inventory/${inventoryB.id}`),
      () => api().get(`${base}/inventory/${inventoryB.id}/movements`),
    ];

    for (const attempt of warehouseAttempts) {
      const response = await attempt().set('Cookie', a.owner.cookie).expect(404);
      expect(response.body.code).toBe('WAREHOUSE_NOT_FOUND');
    }
    for (const attempt of inventoryAttempts) {
      const response = await attempt().set('Cookie', a.owner.cookie).expect(404);
      expect(response.body.code).toBe('INVENTORY_NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
  });

  it("can't use B's warehouses or products in A's stock operations or filters", async () => {
    const { a, warehouseA, warehouseB, productA, productB, snapshot } = await twoOrganizations();
    const before = await snapshot();
    const base = `/organizations/${a.organization.id}`;
    const post = (operation: string, body: Record<string, unknown>) =>
      api().post(`${base}/inventory/${operation}`).set('Cookie', a.owner.cookie).send(body);

    const cases = [
      () => post('receive', { warehouseId: warehouseB.id, productId: productA.id, quantity: 1 }),
      () => post('issue', { warehouseId: warehouseB.id, productId: productB.id, quantity: 1 }),
      () =>
        post('damage', {
          warehouseId: warehouseB.id,
          productId: productA.id,
          quantity: 1,
          reason: 'x',
        }),
      () =>
        post('adjust', {
          warehouseId: warehouseB.id,
          productId: productA.id,
          newQuantity: 0,
          reason: 'x',
        }),
      () =>
        post('transfer', {
          sourceWarehouseId: warehouseA.id,
          destinationWarehouseId: warehouseB.id,
          productId: productA.id,
          quantity: 1,
        }),
      () =>
        post('transfer', {
          sourceWarehouseId: warehouseB.id,
          destinationWarehouseId: warehouseA.id,
          productId: productA.id,
          quantity: 1,
        }),
      () =>
        api().get(`${base}/inventory?warehouseId=${warehouseB.id}`).set('Cookie', a.owner.cookie),
      () =>
        api()
          .get(`${base}/stock-movements?warehouseId=${warehouseB.id}`)
          .set('Cookie', a.owner.cookie),
    ];
    const productCases = [
      () => post('receive', { warehouseId: warehouseA.id, productId: productB.id, quantity: 1 }),
      () =>
        post('adjust', {
          warehouseId: warehouseA.id,
          productId: productB.id,
          newQuantity: 3,
          reason: 'x',
        }),
      () => api().get(`${base}/inventory?productId=${productB.id}`).set('Cookie', a.owner.cookie),
      () =>
        api().get(`${base}/stock-movements?productId=${productB.id}`).set('Cookie', a.owner.cookie),
    ];

    for (const attempt of cases) {
      const response = await attempt().expect(422);
      expect(response.body.code).toBe('INVENTORY_WAREHOUSE_NOT_FOUND');
    }
    for (const attempt of productCases) {
      const response = await attempt().expect(422);
      expect(response.body.code).toBe('INVENTORY_PRODUCT_NOT_FOUND');
    }
    expect(await snapshot()).toEqual(before);
    expect(await prisma.inventory.count({ where: { organizationId: a.organization.id } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { organizationId: a.organization.id } })).toBe(
      1,
    );
  });

  it('keeps search, filters, and counts inside the organization (both have a "Wireless Mouse")', async () => {
    /** The same warehouse codes, product name, and SKU in both organizations. */
    async function stockedMouse(team: Awaited<ReturnType<typeof createTeam>>, units: number) {
      const org = team.organization.id;
      const main = await createWarehouse(org, { code: 'MAIN', name: 'Main' });
      const east = await createWarehouse(org, { code: 'EAST', name: 'East' });
      const mouse = await createProduct(org, {
        name: 'Wireless Mouse',
        sku: 'ACC-MOUSE',
        minimumStock: 100,
      });
      const post = (operation: string, body: Record<string, unknown>) =>
        api()
          .post(`/organizations/${org}/inventory/${operation}`)
          .set('Cookie', team.owner.cookie)
          .send({ productId: mouse.id, ...body })
          .expect(200);
      await post('receive', { warehouseId: main.id, quantity: units, reason: 'Mouse delivery' });
      const transfer = await post('transfer', {
        sourceWarehouseId: main.id,
        destinationWarehouseId: east.id,
        quantity: 1,
      });
      return { org, east, transferGroupId: transfer.body.transferGroupId as string };
    }
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const stockA = await stockedMouse(a, 5);
    const stockB = await stockedMouse(b, 50);
    const get = (path: string) =>
      api().get(`/organizations/${stockA.org}${path}`).set('Cookie', a.staff.cookie).expect(200);
    const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
    const inventoryA = idsOf(
      await prisma.inventory.findMany({ where: { organizationId: stockA.org } }),
    );
    const movementsA = idsOf(
      await prisma.stockMovement.findMany({ where: { organizationId: stockA.org } }),
    );

    const search = await get('/inventory?search=mouse');
    const low = await get('/inventory?status=LOW_STOCK');
    const byWarehouse = await get(`/inventory?warehouseId=${stockA.east.id}`);
    const movementSearch = await get('/stock-movements?search=mouse');
    const transfersOut = await get('/stock-movements?movementType=TRANSFER_OUT');
    const foreignGroup = await get(`/stock-movements?transferGroupId=${stockB.transferGroupId}`);
    const ownGroup = await get(`/stock-movements?transferGroupId=${stockA.transferGroupId}`);
    const warehouses = await get('/warehouses');

    expect(idsOf(search.body.items)).toEqual(inventoryA);
    expect(search.body.pagination.totalItems).toBe(2);
    expect(idsOf(low.body.items)).toEqual(inventoryA);
    expect(byWarehouse.body.items).toHaveLength(1);
    expect(byWarehouse.body.items[0].quantity).toBe(1);
    // PURCHASE ("Mouse delivery" reason and product name) + both transfer legs (product name).
    expect(idsOf(movementSearch.body.items)).toEqual(movementsA);
    expect(movementSearch.body.pagination.totalItems).toBe(3);
    expect(transfersOut.body.items).toHaveLength(1);
    expect(transfersOut.body.items[0].transferGroupId).toBe(stockA.transferGroupId);
    expect(foreignGroup.body).toMatchObject({ items: [], pagination: { totalItems: 0 } });
    expect(
      ownGroup.body.items.map((movement: { movementType: string }) => movement.movementType).sort(),
    ).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    // Totals come from A's stock only (B holds 49 + 1 units).
    expect(
      warehouses.body.warehouses.map((w: { code: string; totalUnits: number }) => [
        w.code,
        w.totalUnits,
      ]),
    ).toEqual([
      ['EAST', 1],
      ['MAIN', 4],
    ]);
  });
});
