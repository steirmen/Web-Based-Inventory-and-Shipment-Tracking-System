import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createProduct, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { expectLedgerConsistent, quantityOf } from './support/inventory.js';
import { createTeam, NON_EXISTENT_ID, type TeamMember } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

type Operation = 'receive' | 'issue' | 'damage' | 'adjust' | 'transfer';

/** An organization with two active warehouses and one product (reorder level 5). */
async function setup() {
  const team = await createTeam();
  const org = team.organization.id;
  const main = await createWarehouse(org, { name: 'Main', code: 'MAIN' });
  const east = await createWarehouse(org, { name: 'East', code: 'EAST' });
  const product = await createProduct(org, {
    name: 'Wireless Mouse',
    sku: 'MOUSE',
    minimumStock: 5,
  });
  const op = (operation: Operation, actor: TeamMember, body: Record<string, unknown>) =>
    api()
      .post(`/organizations/${org}/inventory/${operation}`)
      .set('Cookie', actor.cookie)
      .send(body);
  const stock = (warehouseId: string, quantity: number) =>
    op('receive', team.owner, { warehouseId, productId: product.id, quantity }).expect(200);
  return { team, org, main, east, product, op, stock };
}

const movementsOf = (organizationId: string) =>
  prisma.stockMovement.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

const logsOf = (organizationId: string, action?: string) =>
  prisma.activityLog.findMany({
    where: { organizationId, ...(action ? { action } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

describe('POST …/inventory/receive', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s receives stock: inventory + PURCHASE movement + activity in one go',
    async (who) => {
      const { team, org, main, product, op } = await setup();

      const response = await op('receive', team[who], {
        warehouseId: main.id,
        productId: product.id,
        quantity: 12,
        reason: '  Supplier delivery  ',
      }).expect(200);

      expect(response.body.inventory).toEqual({
        id: expect.any(String),
        warehouse: { id: main.id, name: 'Main', code: 'MAIN', isActive: true },
        product: { id: product.id, name: 'Wireless Mouse', sku: 'MOUSE', status: 'ACTIVE' },
        quantity: 12,
        minimumStock: 5,
        status: 'IN_STOCK',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(response.body.movement).toMatchObject({
        movementType: 'PURCHASE',
        quantityDelta: 12,
        quantityBefore: 0,
        quantityAfter: 12,
        reason: 'Supplier delivery',
        actor: { id: team[who].user.id, name: team[who].user.name },
        transferGroupId: null,
        referenceType: null,
        referenceId: null,
      });
      expect(response.body.movement.actor).not.toHaveProperty('email');

      const [log] = await logsOf(org, 'STOCK_RECEIVED');
      expect(log).toMatchObject({
        actorUserId: team[who].user.id,
        entityType: 'Product',
        entityId: product.id,
      });
      expect(log?.metadata).toEqual({
        warehouseId: main.id,
        warehouseCode: 'MAIN',
        productId: product.id,
        sku: 'MOUSE',
        inventoryId: response.body.inventory.id,
        movementId: response.body.movement.id,
        quantity: 12,
        quantityBefore: 0,
        quantityAfter: 12,
        quantityDelta: 12,
      });
      await expectLedgerConsistent(org);
    },
  );

  it('adds to existing stock', async () => {
    const { team, org, main, product, op, stock } = await setup();
    await stock(main.id, 4);

    const response = await op('receive', team.staff, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 3,
    }).expect(200);

    expect(response.body.movement).toMatchObject({ quantityBefore: 4, quantityAfter: 7 });
    expect(response.body.inventory).toMatchObject({ quantity: 7, status: 'IN_STOCK' });
    expect(await prisma.inventory.count()).toBe(1);
    await expectLedgerConsistent(org);
  });

  it('refuses an archived product and an archived warehouse', async () => {
    const { team, org, main, product, op } = await setup();
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });

    const archivedProduct = await op('receive', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 1,
    }).expect(409);
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
    await prisma.warehouse.update({ where: { id: main.id }, data: { isActive: false } });
    const archivedWarehouse = await op('receive', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 1,
    }).expect(409);

    expect(archivedProduct.body.code).toBe('INVENTORY_PRODUCT_INACTIVE');
    expect(archivedWarehouse.body).toMatchObject({
      code: 'INVENTORY_WAREHOUSE_INACTIVE',
      message: 'Warehouse MAIN is archived. Restore it before moving stock in or out of it.',
    });
    expect(await prisma.inventory.count()).toBe(0);
    expect(await movementsOf(org)).toEqual([]);
    expect(await logsOf(org)).toEqual([]);
  });

  it.each([
    ['zero', { quantity: 0 }, 'quantity'],
    ['negative', { quantity: -3 }, 'quantity'],
    ['fractional', { quantity: 1.5 }, 'quantity'],
    ['string', { quantity: '5' }, 'quantity'],
    ['too large', { quantity: 1_000_000_001 }, 'quantity'],
    ['too long reason', { quantity: 1, reason: 'r'.repeat(501) }, 'reason'],
    ['malformed warehouseId', { quantity: 1, warehouseId: 'nope' }, 'warehouseId'],
    [
      'organizationId in the body',
      { quantity: 1, organizationId: NON_EXISTENT_ID },
      'organizationId',
    ],
  ])('rejects %s', async (_case, overrides, field) => {
    const { team, org, main, product, op } = await setup();

    const response = await op('receive', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      ...overrides,
    }).expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await movementsOf(org)).toEqual([]);
  });

  it('answers 422 for a warehouse or product that is not in this organization', async () => {
    const { team, main, product, op } = await setup();
    const other = await createTeam('other');
    const foreignWarehouse = await createWarehouse(other.organization.id);
    const foreignProduct = await createProduct(other.organization.id);

    const cases = [
      [
        { warehouseId: foreignWarehouse.id, productId: product.id },
        'INVENTORY_WAREHOUSE_NOT_FOUND',
      ],
      [{ warehouseId: NON_EXISTENT_ID, productId: product.id }, 'INVENTORY_WAREHOUSE_NOT_FOUND'],
      [{ warehouseId: main.id, productId: foreignProduct.id }, 'INVENTORY_PRODUCT_NOT_FOUND'],
      [{ warehouseId: main.id, productId: NON_EXISTENT_ID }, 'INVENTORY_PRODUCT_NOT_FOUND'],
    ] as const;
    for (const [ids, code] of cases) {
      const response = await op('receive', team.owner, { ...ids, quantity: 1 }).expect(422);
      expect(response.body.code).toBe(code);
    }
    expect(await prisma.inventory.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('refuses to exceed the maximum on-hand quantity', async () => {
    const { team, org, main, product, op, stock } = await setup();
    await stock(main.id, 1_000_000_000);

    const response = await op('receive', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 1,
    }).expect(422);

    expect(response.body.code).toBe('INVENTORY_QUANTITY_LIMIT');
    expect(await quantityOf(main.id, product.id)).toBe(1_000_000_000);
    await expectLedgerConsistent(org);
  });
});

describe('POST …/inventory/issue and …/damage', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s issues stock as a SALE movement',
    async (who) => {
      const { team, org, main, product, op, stock } = await setup();
      await stock(main.id, 10);

      const response = await op('issue', team[who], {
        warehouseId: main.id,
        productId: product.id,
        quantity: 6,
      }).expect(200);

      expect(response.body.movement).toMatchObject({
        movementType: 'SALE',
        quantityDelta: -6,
        quantityBefore: 10,
        quantityAfter: 4,
        reason: null,
      });
      expect(response.body.inventory).toMatchObject({ quantity: 4, status: 'LOW_STOCK' });
      expect((await logsOf(org, 'STOCK_ISSUED'))[0]).toMatchObject({
        actorUserId: team[who].user.id,
        metadata: {
          warehouseId: main.id,
          productId: product.id,
          quantity: 6,
          quantityDelta: -6,
          quantityBefore: 10,
          quantityAfter: 4,
        },
      });
      await expectLedgerConsistent(org);
    },
  );

  it('can issue everything (OUT_OF_STOCK) but never more than is on hand', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 3);

    const tooMuch = await op('issue', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 4,
    }).expect(409);
    const noStockHere = await op('issue', team.owner, {
      warehouseId: east.id,
      productId: product.id,
      quantity: 1,
    }).expect(409);
    const all = await op('issue', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 3,
    }).expect(200);

    expect(tooMuch.body).toMatchObject({
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      message: 'Not enough stock: 3 units available in MAIN.',
    });
    expect(noStockHere.body).toMatchObject({
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      message: 'Not enough stock: 0 units available in EAST.',
    });
    expect(all.body.inventory).toMatchObject({ quantity: 0, status: 'OUT_OF_STOCK' });
    // A failed decrease never creates an empty inventory row.
    expect(await quantityOf(east.id, product.id)).toBeNull();
    expect((await movementsOf(org)).map((m) => m.movementType)).toEqual(['PURCHASE', 'SALE']);
    await expectLedgerConsistent(org);
  });

  it.each(['owner', 'admin', 'staff'] as const)(
    '%s writes off damaged stock (reason required); stock decreases, DAMAGE + activity recorded',
    async (who) => {
      const { team, org, main, product, op, stock } = await setup();
      await stock(main.id, 8);

      const withoutReason = await op('damage', team[who], {
        warehouseId: main.id,
        productId: product.id,
        quantity: 2,
        reason: '   ',
      }).expect(400);
      expect(await logsOf(org, 'STOCK_DAMAGED')).toEqual([]);
      const response = await op('damage', team[who], {
        warehouseId: main.id,
        productId: product.id,
        quantity: 2,
        reason: 'Water damage',
      }).expect(200);

      expect(withoutReason.body.details).toEqual([
        { field: 'reason', messages: expect.arrayContaining(['Reason is required.']) },
      ]);
      expect(response.body.movement).toMatchObject({
        movementType: 'DAMAGE',
        quantityDelta: -2,
        quantityBefore: 8,
        quantityAfter: 6,
        reason: 'Water damage',
        actor: { id: team[who].user.id },
      });
      expect(response.body.inventory).toMatchObject({ quantity: 6 });
      expect(await quantityOf(main.id, product.id)).toBe(6);
      const damaged = await logsOf(org, 'STOCK_DAMAGED');
      expect(damaged).toHaveLength(1);
      expect(damaged[0]).toMatchObject({
        actorUserId: team[who].user.id,
        metadata: { quantity: 2, quantityDelta: -2, quantityBefore: 8, quantityAfter: 6 },
      });
      // The free-text reason stays in the movement, not in the activity log.
      expect(JSON.stringify(damaged[0]?.metadata)).not.toContain('Water damage');
      await expectLedgerConsistent(org);
    },
  );

  it('refuses to move stock out of an archived warehouse', async () => {
    const { team, org, main, product, op, stock } = await setup();
    await stock(main.id, 5);
    await prisma.warehouse.update({ where: { id: main.id }, data: { isActive: false } });

    for (const [operation, extra] of [
      ['issue', {}],
      ['damage', { reason: 'Broken' }],
    ] as const) {
      const response = await op(operation, team.owner, {
        warehouseId: main.id,
        productId: product.id,
        quantity: 1,
        ...extra,
      }).expect(409);
      expect(response.body.code).toBe('INVENTORY_WAREHOUSE_INACTIVE');
    }
    expect(await quantityOf(main.id, product.id)).toBe(5);
    await expectLedgerConsistent(org);
  });
});

describe('POST …/inventory/adjust', () => {
  it.each(['owner', 'admin'] as const)('%s sets a counted quantity (up and down)', async (who) => {
    const { team, org, main, product, op, stock } = await setup();
    await stock(main.id, 10);

    const down = await op('adjust', team[who], {
      warehouseId: main.id,
      productId: product.id,
      newQuantity: 7,
      reason: 'Cycle count',
    }).expect(200);
    const up = await op('adjust', team[who], {
      warehouseId: main.id,
      productId: product.id,
      newQuantity: 9,
      reason: 'Found in back room',
    }).expect(200);

    expect(down.body.movement).toMatchObject({
      movementType: 'ADJUSTMENT',
      quantityDelta: -3,
      quantityBefore: 10,
      quantityAfter: 7,
      reason: 'Cycle count',
    });
    expect(up.body.movement).toMatchObject({
      quantityDelta: 2,
      quantityBefore: 7,
      quantityAfter: 9,
    });
    const adjusted = await logsOf(org, 'STOCK_ADJUSTED');
    expect(adjusted.map((log) => log.metadata)).toEqual([
      expect.objectContaining({ quantityBefore: 10, quantityAfter: 7, quantityDelta: -3 }),
      expect.objectContaining({ quantityBefore: 7, quantityAfter: 9, quantityDelta: 2 }),
    ]);
    expect(adjusted[0]?.metadata).toMatchObject({ warehouseId: main.id, productId: product.id });
    expect(adjusted[0]?.metadata).not.toHaveProperty('quantity');
    await expectLedgerConsistent(org);
  });

  it('is a no-op when the count matches (no movement, no log)', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 4);

    const same = await op('adjust', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      newQuantity: 4,
      reason: 'Count',
    }).expect(200);
    const zeroWithoutStock = await op('adjust', team.owner, {
      warehouseId: east.id,
      productId: product.id,
      newQuantity: 0,
      reason: 'Count',
    }).expect(200);

    expect(same.body).toMatchObject({ inventory: { quantity: 4 }, movement: null });
    expect(zeroWithoutStock.body).toEqual({ inventory: null, movement: null });
    expect(await movementsOf(org)).toHaveLength(1);
    expect(await logsOf(org, 'STOCK_ADJUSTED')).toEqual([]);
    expect(await quantityOf(east.id, product.id)).toBeNull();
  });

  it('creates the stock record when counting stock in a new location, and can count to zero', async () => {
    const { team, org, east, product, op } = await setup();

    const created = await op('adjust', team.owner, {
      warehouseId: east.id,
      productId: product.id,
      newQuantity: 6,
      reason: 'Initial count',
    }).expect(200);
    const zero = await op('adjust', team.owner, {
      warehouseId: east.id,
      productId: product.id,
      newQuantity: 0,
      reason: 'Nothing left',
    }).expect(200);

    expect(created.body.movement).toMatchObject({ quantityBefore: 0, quantityAfter: 6 });
    expect(zero.body.inventory).toMatchObject({ quantity: 0, status: 'OUT_OF_STOCK' });
    await expectLedgerConsistent(org);
  });

  it('forbids STAFF, and requires a reason and a non-negative whole number', async () => {
    const { team, org, main, product, op, stock } = await setup();
    await stock(main.id, 4);

    const staff = await op('adjust', team.staff, {
      warehouseId: main.id,
      productId: product.id,
      newQuantity: 1,
      reason: 'Count',
    }).expect(403);
    const negative = await op('adjust', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      newQuantity: -1,
      reason: 'Count',
    }).expect(400);
    const noReason = await op('adjust', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      newQuantity: 1,
    }).expect(400);

    expect(staff.body.code).toBe('ORGANIZATION_FORBIDDEN');
    expect(negative.body.details[0].field).toBe('newQuantity');
    expect(noReason.body.details[0].field).toBe('reason');
    expect(await quantityOf(main.id, product.id)).toBe(4);
    expect(await logsOf(org, 'STOCK_ADJUSTED')).toEqual([]);
  });
});

describe('POST …/inventory/transfer', () => {
  it.each(['owner', 'admin'] as const)(
    '%s transfers: exactly two linked movements, one transaction, one activity entry',
    async (who) => {
      const { team, org, main, east, product, op, stock } = await setup();
      await stock(main.id, 10);
      await stock(east.id, 1);

      const response = await op('transfer', team[who], {
        sourceWarehouseId: main.id,
        destinationWarehouseId: east.id,
        productId: product.id,
        quantity: 4,
        reason: 'Rebalance',
      }).expect(200);

      const { transferGroupId, source, destination, movements } = response.body;
      expect(source).toMatchObject({ warehouse: { id: main.id }, quantity: 6 });
      expect(destination).toMatchObject({ warehouse: { id: east.id }, quantity: 5 });
      expect(movements).toEqual([
        expect.objectContaining({
          movementType: 'TRANSFER_OUT',
          quantityDelta: -4,
          quantityBefore: 10,
          quantityAfter: 6,
          transferGroupId,
          warehouse: expect.objectContaining({ id: main.id }),
          reason: 'Rebalance',
        }),
        expect.objectContaining({
          movementType: 'TRANSFER_IN',
          quantityDelta: 4,
          quantityBefore: 1,
          quantityAfter: 5,
          transferGroupId,
          warehouse: expect.objectContaining({ id: east.id }),
        }),
      ]);
      const group = await prisma.stockMovement.findMany({ where: { transferGroupId } });
      expect(group).toHaveLength(2);
      // Both legs reference the transfer.
      for (const movement of movements) {
        expect(movement).toMatchObject({ referenceType: 'TRANSFER', referenceId: transferGroupId });
      }

      const transfers = await logsOf(org, 'STOCK_TRANSFERRED');
      expect(transfers).toHaveLength(1);
      expect(transfers[0]).toMatchObject({
        actorUserId: team[who].user.id,
        entityType: 'Product',
        entityId: product.id,
      });
      expect(transfers[0]?.metadata).toEqual({
        productId: product.id,
        sku: 'MOUSE',
        sourceWarehouseId: main.id,
        sourceWarehouseCode: 'MAIN',
        destinationWarehouseId: east.id,
        destinationWarehouseCode: 'EAST',
        quantity: 4,
        transferGroupId,
        source: { quantityBefore: 10, quantityAfter: 6 },
        destination: { quantityBefore: 1, quantityAfter: 5 },
        movementIds: [movements[0].id, movements[1].id],
      });
      // One transfer is one activity entry — the legs don't log separately.
      expect(await logsOf(org)).toHaveLength(3);
      // sourceBefore + sourceDelta = sourceAfter, destinationBefore + destinationDelta = destinationAfter,
      // and sourceDelta + destinationDelta = 0.
      expect(movements[0].quantityDelta + movements[1].quantityDelta).toBe(0);
      await expectLedgerConsistent(org);
    },
  );

  it('creates the destination stock record on first transfer', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 3);

    const response = await op('transfer', team.owner, {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      productId: product.id,
      quantity: 3,
    }).expect(200);

    expect(response.body.source).toMatchObject({ quantity: 0, status: 'OUT_OF_STOCK' });
    expect(response.body.destination).toMatchObject({ quantity: 3, status: 'LOW_STOCK' });
    await expectLedgerConsistent(org);
  });

  it('rejects insufficient stock, the same warehouse, archived or foreign warehouses — atomically', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    const other = await createTeam('other');
    const foreign = await createWarehouse(other.organization.id);
    await stock(main.id, 2);
    const closed = await createWarehouse(org, { code: 'CLOSED', isActive: false });
    const transfer = (body: Record<string, unknown>) =>
      op('transfer', team.owner, { productId: product.id, quantity: 1, ...body });

    const insufficient = await transfer({
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      quantity: 3,
    }).expect(409);
    const same = await transfer({
      sourceWarehouseId: main.id,
      destinationWarehouseId: main.id.toUpperCase(),
    }).expect(400);
    const toClosed = await transfer({
      sourceWarehouseId: main.id,
      destinationWarehouseId: closed.id,
    }).expect(409);
    const fromClosed = await transfer({
      sourceWarehouseId: closed.id,
      destinationWarehouseId: main.id,
    }).expect(409);
    const toForeign = await transfer({
      sourceWarehouseId: main.id,
      destinationWarehouseId: foreign.id,
    }).expect(422);

    expect(insufficient.body).toMatchObject({
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      message: 'Not enough stock: 2 units available in MAIN.',
    });
    expect(same.body.code).toBe('INVENTORY_SAME_WAREHOUSE');
    expect(toClosed.body.message).toContain('CLOSED');
    expect(fromClosed.body.code).toBe('INVENTORY_WAREHOUSE_INACTIVE');
    expect(toForeign.body.code).toBe('INVENTORY_WAREHOUSE_NOT_FOUND');
    // Nothing moved; no half-transfer; no empty rows left behind.
    expect(await quantityOf(main.id, product.id)).toBe(2);
    expect(await quantityOf(east.id, product.id)).toBeNull();
    expect(await quantityOf(closed.id, product.id)).toBeNull();
    expect((await movementsOf(org)).map((m) => m.movementType)).toEqual(['PURCHASE']);
    expect(await logsOf(org, 'STOCK_TRANSFERRED')).toEqual([]);
    await expectLedgerConsistent(org);
  });

  it('forbids STAFF', async () => {
    const { team, main, east, product, op, stock } = await setup();
    await stock(main.id, 2);

    const response = await op('transfer', team.staff, {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      productId: product.id,
      quantity: 1,
    }).expect(403);

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    expect(await quantityOf(main.id, product.id)).toBe(2);
  });
});

describe('immutability', () => {
  it('exposes no route that changes or deletes a movement', async () => {
    const { team, org, main, product, stock } = await setup();
    const { body } = await stock(main.id, 2);
    const movementId = body.movement.id;
    const inventoryId = body.inventory.id;

    for (const method of ['patch', 'put', 'delete'] as const) {
      await api()
        [method](`/organizations/${org}/stock-movements/${movementId}`)
        .set('Cookie', team.owner.cookie)
        .send({ quantityDelta: 100 })
        .expect(404);
      await api()
        [method](`/organizations/${org}/inventory/${inventoryId}/movements/${movementId}`)
        .set('Cookie', team.owner.cookie)
        .send({ quantityDelta: 100 })
        .expect(404);
    }
    await api()
      .patch(`/organizations/${org}/inventory/${inventoryId}`)
      .set('Cookie', team.owner.cookie)
      .send({ quantity: 100 })
      .expect(404);

    const movement = await prisma.stockMovement.findUniqueOrThrow({ where: { id: movementId } });
    expect(movement).toMatchObject({ quantityDelta: 2, quantityBefore: 0, quantityAfter: 2 });
    expect(await quantityOf(main.id, product.id)).toBe(2);
  });
});

describe('rules shared by every operation', () => {
  /** One valid request per operation, against MAIN (and EAST for transfers). */
  function requests(main: string, east: string, productId: string) {
    return {
      receive: { warehouseId: main, productId, quantity: 1 },
      issue: { warehouseId: main, productId, quantity: 1 },
      damage: { warehouseId: main, productId, quantity: 1, reason: 'Broken' },
      adjust: { warehouseId: main, productId, newQuantity: 1, reason: 'Count' },
      transfer: { sourceWarehouseId: main, destinationWarehouseId: east, productId, quantity: 1 },
    } satisfies Record<Operation, Record<string, unknown>>;
  }

  it('rejects every operation for an archived product; its history stays readable', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 5);
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });

    for (const [operation, body] of Object.entries(requests(main.id, east.id, product.id))) {
      const response = await op(operation as Operation, team.owner, body).expect(409);
      expect(response.body).toMatchObject({
        code: 'INVENTORY_PRODUCT_INACTIVE',
        message: 'This product is archived. Restore it before changing its stock.',
      });
    }

    expect(await quantityOf(main.id, product.id)).toBe(5);
    expect(await movementsOf(org)).toHaveLength(1);
    const history = await api()
      .get(`/organizations/${org}/stock-movements?productId=${product.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);
    expect(history.body.items).toHaveLength(1);
    const inventory = await api()
      .get(`/organizations/${org}/inventory?productId=${product.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);
    expect(inventory.body.items[0]).toMatchObject({ quantity: 5, product: { status: 'ARCHIVED' } });
  });

  it('rejects every operation that touches an inactive warehouse', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 5);
    await stock(east.id, 5);
    await prisma.warehouse.update({ where: { id: east.id }, data: { isActive: false } });
    const intoInactive = requests(east.id, main.id, product.id);

    for (const [operation, body] of Object.entries(intoInactive)) {
      const response = await op(operation as Operation, team.owner, body).expect(409);
      expect(response.body.code).toBe('INVENTORY_WAREHOUSE_INACTIVE');
    }
    const transferIn = await op('transfer', team.owner, {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      productId: product.id,
      quantity: 1,
    }).expect(409);

    expect(transferIn.body.code).toBe('INVENTORY_WAREHOUSE_INACTIVE');
    expect(await quantityOf(main.id, product.id)).toBe(5);
    expect(await quantityOf(east.id, product.id)).toBe(5);
    expect(await movementsOf(org)).toHaveLength(2);
    await expectLedgerConsistent(org);
  });

  it.each([
    ['receive', { quantity: -100000 }, 'quantity'],
    ['issue', { quantity: -100000 }, 'quantity'],
    ['damage', { quantity: -100000, reason: 'x' }, 'quantity'],
    ['adjust', { newQuantity: -100000, reason: 'x' }, 'newQuantity'],
    ['transfer', { quantity: -100000 }, 'quantity'],
    ['receive', { quantity: 2.5 }, 'quantity'],
    ['issue', { quantity: 0.5 }, 'quantity'],
    ['adjust', { newQuantity: 3.25, reason: 'x' }, 'newQuantity'],
    ['transfer', { quantity: 1.5 }, 'quantity'],
    ['issue', { quantity: '1e3' }, 'quantity'],
  ] as const)('rejects %s with %j', async (operation, values, field) => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 5);
    const body = { ...requests(main.id, east.id, product.id)[operation], ...values };

    const response = await op(operation, team.owner, body).expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await quantityOf(main.id, product.id)).toBe(5);
    expect(await quantityOf(east.id, product.id)).toBeNull();
    await expectLedgerConsistent(org);
  });

  it('leaves everything unchanged when an issue exceeds the stock (5 on hand, issue 10)', async () => {
    const { team, org, main, product, op, stock } = await setup();
    await stock(main.id, 5);
    const logsBefore = await logsOf(org);

    await op('issue', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 10,
    }).expect(409);
    await op('damage', team.owner, {
      warehouseId: main.id,
      productId: product.id,
      quantity: 10,
      reason: 'x',
    }).expect(409);

    expect(await quantityOf(main.id, product.id)).toBe(5);
    expect(await movementsOf(org)).toHaveLength(1);
    expect(await logsOf(org)).toEqual(logsBefore);
  });

  it('leaves both warehouses unchanged when a transfer exceeds the source (5 on hand, move 10)', async () => {
    const { team, org, main, east, product, op, stock } = await setup();
    await stock(main.id, 5);
    await stock(east.id, 2);
    const logsBefore = await logsOf(org);
    const movementsBefore = await movementsOf(org);

    await op('transfer', team.owner, {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      productId: product.id,
      quantity: 10,
    }).expect(409);

    expect(await quantityOf(main.id, product.id)).toBe(5);
    expect(await quantityOf(east.id, product.id)).toBe(2);
    expect(await movementsOf(org)).toEqual(movementsBefore);
    expect(await logsOf(org)).toEqual(logsBefore);
  });
});
