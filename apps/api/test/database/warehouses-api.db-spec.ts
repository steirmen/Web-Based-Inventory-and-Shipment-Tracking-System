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

const base = (organizationId: string) => `/organizations/${organizationId}/warehouses`;

const logs = (organizationId: string, action?: string) =>
  prisma.activityLog.findMany({
    where: { organizationId, ...(action ? { action } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

describe('GET /organizations/:id/warehouses', () => {
  it('lists this organization’s warehouses with stock totals, active first then by name', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const main = await createWarehouse(a.organization.id, { name: 'Main', code: 'MAIN' });
    const annex = await createWarehouse(a.organization.id, { name: 'Annex', code: 'ANX' });
    const old = await createWarehouse(a.organization.id, {
      name: 'Aardvark (closed)',
      code: 'OLD',
      isActive: false,
    });
    await createWarehouse(b.organization.id, { name: 'Foreign', code: 'MAIN' });
    const pen = await createProduct(a.organization.id);
    const pad = await createProduct(a.organization.id);
    await prisma.inventory.createMany({
      data: [
        { organizationId: a.organization.id, warehouseId: main.id, productId: pen.id, quantity: 7 },
        { organizationId: a.organization.id, warehouseId: main.id, productId: pad.id, quantity: 3 },
        // Zero stock doesn't count as a product in stock.
        {
          organizationId: a.organization.id,
          warehouseId: annex.id,
          productId: pen.id,
          quantity: 0,
        },
      ],
    });

    const response = await api()
      .get(base(a.organization.id))
      .set('Cookie', a.staff.cookie)
      .expect(200);

    expect(response.body.warehouses.map((w: { code: string }) => w.code)).toEqual([
      'ANX',
      'MAIN',
      'OLD',
    ]);
    expect(response.body.warehouses[1]).toEqual({
      id: main.id,
      name: 'Main',
      code: 'MAIN',
      address: null,
      isActive: true,
      productCount: 2,
      totalUnits: 10,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(response.body.warehouses[0]).toMatchObject({ productCount: 0, totalUnits: 0 });
    expect(response.body.warehouses[2]).toMatchObject({ id: old.id, isActive: false });
  });

  it('is not available to non-members', async () => {
    const team = await createTeam();
    const outsider = await createSignedInUser();

    const response = await api()
      .get(base(team.organization.id))
      .set('Cookie', outsider.cookie)
      .expect(404);

    expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('requires a session', async () => {
    const team = await createTeam();
    await api().get(base(team.organization.id)).expect(401);
  });
});

describe('POST /organizations/:id/warehouses', () => {
  it.each(['owner', 'admin'] as const)(
    '%s creates a warehouse with a normalized code',
    async (who) => {
      const team = await createTeam();

      const response = await api()
        .post(base(team.organization.id))
        .set('Cookie', team[who].cookie)
        .send({ name: '  East   Depot ', code: ' east-1 ', address: '  12 Harbour Road  ' })
        .expect(201);

      expect(response.body.warehouse).toEqual({
        id: expect.any(String),
        name: 'East Depot',
        code: 'EAST-1',
        address: '12 Harbour Road',
        isActive: true,
        productCount: 0,
        totalUnits: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const [log] = await logs(team.organization.id, 'WAREHOUSE_CREATED');
      expect(log).toMatchObject({
        actorUserId: team[who].user.id,
        entityType: 'Warehouse',
        entityId: response.body.warehouse.id,
        metadata: { name: 'East Depot', code: 'EAST-1' },
      });
    },
  );

  it('forbids STAFF', async () => {
    const team = await createTeam();

    const response = await api()
      .post(base(team.organization.id))
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Depot', code: 'DEP' })
      .expect(403);

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    expect(await prisma.warehouse.count()).toBe(0);
  });

  it('stores a blank address as null', async () => {
    const team = await createTeam();

    const response = await api()
      .post(base(team.organization.id))
      .set('Cookie', team.owner.cookie)
      .send({ name: 'Depot', code: 'DEP', address: '   ' })
      .expect(201);

    expect(response.body.warehouse.address).toBeNull();
  });

  it('rejects a duplicate code in the same organization (any case), but not across organizations', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    await createWarehouse(a.organization.id, { code: 'MAIN' });

    const duplicate = await api()
      .post(base(a.organization.id))
      .set('Cookie', a.owner.cookie)
      .send({ name: 'Other', code: 'main' })
      .expect(409);
    await api()
      .post(base(b.organization.id))
      .set('Cookie', b.owner.cookie)
      .send({ name: 'Main', code: 'MAIN' })
      .expect(201);

    expect(duplicate.body.code).toBe('WAREHOUSE_CODE_TAKEN');
    expect(await logs(a.organization.id)).toEqual([]);
  });

  it.each([
    ['blank name', { name: '  ', code: 'A' }, 'name'],
    ['missing code', { name: 'Depot' }, 'code'],
    ['code with spaces', { name: 'Depot', code: 'EAST 1' }, 'code'],
    ['code starting with a dash', { name: 'Depot', code: '-EAST' }, 'code'],
    ['too long code', { name: 'Depot', code: 'A'.repeat(33) }, 'code'],
    ['too long name', { name: 'n'.repeat(201), code: 'A' }, 'name'],
    ['too long address', { name: 'Depot', code: 'A', address: 'x'.repeat(501) }, 'address'],
    [
      'organizationId in the body',
      { name: 'Depot', code: 'A', organizationId: NON_EXISTENT_ID },
      'organizationId',
    ],
    ['isActive in the body', { name: 'Depot', code: 'A', isActive: false }, 'isActive'],
  ])('rejects %s', async (_case, body, field) => {
    const team = await createTeam();

    const response = await api()
      .post(base(team.organization.id))
      .set('Cookie', team.owner.cookie)
      .send(body)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await prisma.warehouse.count()).toBe(0);
  });
});

describe('GET /organizations/:id/warehouses/:warehouseId', () => {
  it('returns one warehouse with its totals, and no movement history', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { code: 'MAIN' });
    const product = await createProduct(team.organization.id);
    await prisma.inventory.create({
      data: {
        organizationId: team.organization.id,
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: 12,
      },
    });

    const response = await api()
      .get(`${base(team.organization.id)}/${warehouse.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);

    expect(response.body.warehouse).toMatchObject({
      id: warehouse.id,
      code: 'MAIN',
      productCount: 1,
      totalUnits: 12,
    });
    expect(Object.keys(response.body.warehouse)).not.toContain('organizationId');
    expect(Object.keys(response.body.warehouse)).not.toContain('movements');
  });

  it('returns WAREHOUSE_NOT_FOUND for unknown, malformed, and foreign ids', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await createWarehouse(b.organization.id);

    for (const id of [NON_EXISTENT_ID, 'not-a-uuid', foreign.id]) {
      const response = await api()
        .get(`${base(a.organization.id)}/${id}`)
        .set('Cookie', a.owner.cookie)
        .expect(404);
      expect(response.body.code).toBe('WAREHOUSE_NOT_FOUND');
    }
  });
});

describe('PATCH /organizations/:id/warehouses/:warehouseId', () => {
  it('updates name and address and logs the change', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, {
      name: 'Main',
      code: 'MAIN',
      address: 'Old street 1',
    });

    const response = await api()
      .patch(`${base(team.organization.id)}/${warehouse.id}`)
      .set('Cookie', team.admin.cookie)
      .send({ name: ' Main   Hub ', address: 'New street 2' })
      .expect(200);

    expect(response.body.warehouse).toMatchObject({
      name: 'Main Hub',
      code: 'MAIN',
      address: 'New street 2',
    });
    const [log] = await logs(team.organization.id, 'WAREHOUSE_UPDATED');
    expect(log).toMatchObject({
      actorUserId: team.admin.user.id,
      entityId: warehouse.id,
      metadata: {
        code: 'MAIN',
        changes: { name: { from: 'Main', to: 'Main Hub' }, address: { changed: true } },
      },
    });
  });

  it('writes nothing when nothing changes', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { name: 'Main', address: null });

    await api()
      .patch(`${base(team.organization.id)}/${warehouse.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ name: 'Main', address: '  ' })
      .expect(200);

    expect(await logs(team.organization.id)).toEqual([]);
    const unchanged = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } });
    expect(unchanged.updatedAt).toEqual(warehouse.updatedAt);
  });

  it('keeps the code immutable and status out of reach', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { code: 'MAIN' });
    const patch = (body: object) =>
      api()
        .patch(`${base(team.organization.id)}/${warehouse.id}`)
        .set('Cookie', team.owner.cookie)
        .send(body);

    const code = await patch({ code: 'OTHER' }).expect(400);
    const status = await patch({ isActive: false }).expect(400);
    const id = await patch({ id: NON_EXISTENT_ID }).expect(400);
    const organization = await patch({ organizationId: NON_EXISTENT_ID }).expect(400);
    const createdAt = await patch({ createdAt: '2020-01-01T00:00:00.000Z' }).expect(400);

    expect([code.body.code, status.body.code]).toEqual([
      'WAREHOUSE_CODE_IMMUTABLE',
      'WAREHOUSE_STATUS_INVALID',
    ]);
    expect([id.body.code, organization.body.code, createdAt.body.code]).toEqual([
      'VALIDATION_ERROR',
      'VALIDATION_ERROR',
      'VALIDATION_ERROR',
    ]);
    expect(await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })).toMatchObject(
      {
        code: 'MAIN',
        isActive: true,
      },
    );
  });

  it('forbids STAFF', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { name: 'Main' });

    await api()
      .patch(`${base(team.organization.id)}/${warehouse.id}`)
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Renamed' })
      .expect(403);

    expect((await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouse.id } })).name).toBe(
      'Main',
    );
  });
});

describe('archive and restore', () => {
  it('archives and restores idempotently, logging only real transitions', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { code: 'MAIN' });
    const post = (action: 'archive' | 'restore', cookie = team.admin.cookie) =>
      api()
        .post(`${base(team.organization.id)}/${warehouse.id}/${action}`)
        .set('Cookie', cookie);

    const archived = await post('archive').expect(200);
    await post('archive').expect(200);
    const restored = await post('restore', team.owner.cookie).expect(200);
    await post('restore', team.owner.cookie).expect(200);

    expect(archived.body.warehouse.isActive).toBe(false);
    expect(restored.body.warehouse.isActive).toBe(true);
    const events = await logs(team.organization.id);
    expect(events.map((log) => [log.action, log.actorUserId])).toEqual([
      ['WAREHOUSE_ARCHIVED', team.admin.user.id],
      ['WAREHOUSE_RESTORED', team.owner.user.id],
    ]);
    expect(events[0]?.metadata).toEqual({ name: warehouse.name, code: 'MAIN' });
  });

  it.each(['owner', 'admin'] as const)('%s can archive and restore', async (who) => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id);
    const post = (action: 'archive' | 'restore') =>
      api()
        .post(`${base(team.organization.id)}/${warehouse.id}/${action}`)
        .set('Cookie', team[who].cookie)
        .expect(200);

    expect((await post('archive')).body.warehouse.isActive).toBe(false);
    expect((await post('restore')).body.warehouse.isActive).toBe(true);
    expect((await logs(team.organization.id)).map((log) => log.actorUserId)).toEqual([
      team[who].user.id,
      team[who].user.id,
    ]);
  });

  it('blocks stock operations while archived and allows them again after restore', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { code: 'MAIN' });
    const product = await createProduct(team.organization.id);
    const receive = () =>
      api()
        .post(`/organizations/${team.organization.id}/inventory/receive`)
        .set('Cookie', team.staff.cookie)
        .send({ warehouseId: warehouse.id, productId: product.id, quantity: 3 });
    const setStatus = (action: 'archive' | 'restore') =>
      api()
        .post(`${base(team.organization.id)}/${warehouse.id}/${action}`)
        .set('Cookie', team.owner.cookie)
        .expect(200);

    await setStatus('archive');
    const blocked = await receive().expect(409);
    await setStatus('restore');
    await receive().expect(200);

    expect(blocked.body.code).toBe('INVENTORY_WAREHOUSE_INACTIVE');
    expect(await prisma.stockMovement.count({ where: { warehouseId: warehouse.id } })).toBe(1);
  });

  it('keeps inventory and history when archiving', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id);
    const product = await createProduct(team.organization.id);
    await api()
      .post(`/organizations/${team.organization.id}/inventory/receive`)
      .set('Cookie', team.owner.cookie)
      .send({ warehouseId: warehouse.id, productId: product.id, quantity: 5 })
      .expect(200);

    await api()
      .post(`${base(team.organization.id)}/${warehouse.id}/archive`)
      .set('Cookie', team.owner.cookie)
      .expect(200);

    expect(await prisma.inventory.count({ where: { warehouseId: warehouse.id } })).toBe(1);
    expect(await prisma.stockMovement.count({ where: { warehouseId: warehouse.id } })).toBe(1);
    const inventory = await api()
      .get(`/organizations/${team.organization.id}/inventory?warehouseId=${warehouse.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);
    expect(inventory.body.items[0]).toMatchObject({
      quantity: 5,
      warehouse: { id: warehouse.id, isActive: false },
    });
  });

  it('forbids STAFF from archiving and restoring', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id, { isActive: false });

    for (const action of ['archive', 'restore']) {
      const response = await api()
        .post(`${base(team.organization.id)}/${warehouse.id}/${action}`)
        .set('Cookie', team.staff.cookie)
        .expect(403);
      expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    }
    expect(await logs(team.organization.id)).toEqual([]);
  });

  it('has no delete route', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id);

    await api()
      .delete(`${base(team.organization.id)}/${warehouse.id}`)
      .set('Cookie', team.owner.cookie)
      .expect(404);

    expect(await prisma.warehouse.count({ where: { id: warehouse.id } })).toBe(1);
  });
});
