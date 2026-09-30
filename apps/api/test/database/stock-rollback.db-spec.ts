import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ActivityLogModule from '../../src/activity/activity-log.js';
import { prisma } from './support/database.js';
import { createProduct, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { expectLedgerConsistent, quantityOf } from './support/inventory.js';
import { createTeam } from './support/organizations.js';

/**
 * Test-only failure paths: a stock operation fails AFTER the inventory row was
 * already updated. The whole transaction must roll back — inventory, movement(s),
 * and activity — so the ledger never disagrees with the stock.
 *
 * 1. `recordActivity` is replaced to throw for a chosen action (failure after
 *    the inventory update and the movement insert, before the activity entry).
 * 2. A temporary trigger makes the movement INSERT fail (failure after the
 *    inventory update, at the movement; for transfers at the second leg).
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
        throw new Error('Simulated failure after the stock mutation');
      }
      return actual.recordActivity(...args);
    },
  };
});

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  failure.action = null;
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  failure.action = null;
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_movement ON stock_movements');
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_movement()');
  await app.close();
});

/** Makes inserting a movement fail when its reason is SIMULATE_FAILURE (except TRANSFER_OUT). */
async function failMovementInserts() {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION test_fail_movement() RETURNS trigger AS $$
    BEGIN
      IF NEW.reason = 'SIMULATE_FAILURE' AND NEW.movement_type <> 'TRANSFER_OUT' THEN
        RAISE EXCEPTION 'simulated movement failure';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER test_fail_movement BEFORE INSERT ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION test_fail_movement()`);
}

async function setup() {
  const team = await createTeam();
  const org = team.organization.id;
  const main = await createWarehouse(org, { code: 'MAIN' });
  const east = await createWarehouse(org, { code: 'EAST' });
  const product = await createProduct(org);
  const op = (operation: string, body: Record<string, unknown>) =>
    api()
      .post(`/organizations/${org}/inventory/${operation}`)
      .set('Cookie', team.owner.cookie)
      .send({ productId: product.id, ...body });
  await op('receive', { warehouseId: main.id, quantity: 10 }).expect(200);
  await op('receive', { warehouseId: east.id, quantity: 4 }).expect(200);

  const state = async () => ({
    main: await quantityOf(main.id, product.id),
    east: await quantityOf(east.id, product.id),
    inventoryRows: await prisma.inventory.count({ where: { organizationId: org } }),
    movements: await prisma.stockMovement.count({ where: { organizationId: org } }),
    logs: await prisma.activityLog.count({ where: { organizationId: org } }),
  });
  return { org, main, east, product, op, state };
}

const expectSafeServerError = (body: { code: string; message: string }) => {
  expect(body.code).toBe('INTERNAL_ERROR');
  expect(body.message).not.toMatch(/simulated/i);
};

describe('rollback when a stock operation fails midway', () => {
  it.each([
    ['receive', 'STOCK_RECEIVED', { quantity: 5 }],
    ['issue', 'STOCK_ISSUED', { quantity: 5 }],
    ['damage', 'STOCK_DAMAGED', { quantity: 5, reason: 'Broken' }],
    ['adjust', 'STOCK_ADJUSTED', { newQuantity: 1, reason: 'Count' }],
  ] as const)(
    '%s: failure before the activity entry rolls back inventory and movement',
    async (operation, action, values) => {
      const { org, main, op, state } = await setup();
      const before = await state();
      failure.action = action;

      const response = await op(operation, { warehouseId: main.id, ...values }).expect(500);

      expectSafeServerError(response.body);
      expect(await state()).toEqual(before);
      await expectLedgerConsistent(org);
    },
  );

  it('transfer: failure before the activity entry rolls back both warehouses and both movements', async () => {
    const { org, main, east, op, state } = await setup();
    const before = await state();
    failure.action = 'STOCK_TRANSFERRED';

    const response = await op('transfer', {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      quantity: 3,
    }).expect(500);

    expectSafeServerError(response.body);
    expect(await state()).toEqual(before);
    expect(await prisma.stockMovement.count({ where: { transferGroupId: { not: null } } })).toBe(0);
    await expectLedgerConsistent(org);
  });

  it('receive: failure at the movement insert rolls back the inventory change (and a new row)', async () => {
    const { org, op, state, product } = await setup();
    const north = await createWarehouse(org, { code: 'NORTH' });
    await failMovementInserts();
    const before = await state();

    await op('receive', { warehouseId: north.id, quantity: 5, reason: 'SIMULATE_FAILURE' }).expect(
      500,
    );

    expect(await state()).toEqual(before);
    expect(await quantityOf(north.id, product.id)).toBeNull();
    await expectLedgerConsistent(org);
  });

  it('transfer: failure at the TRANSFER_IN insert rolls back the source decrease and TRANSFER_OUT', async () => {
    const { org, main, east, op, state } = await setup();
    await failMovementInserts();
    const before = await state();

    const response = await op('transfer', {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      quantity: 3,
      reason: 'SIMULATE_FAILURE',
    }).expect(500);

    expectSafeServerError(response.body);
    expect(await state()).toEqual(before);
    expect(before).toMatchObject({ main: 10, east: 4 });
    await expectLedgerConsistent(org);
  });

  it('works normally again once the failure is gone', async () => {
    const { org, main, east, op } = await setup();

    await op('transfer', {
      sourceWarehouseId: main.id,
      destinationWarehouseId: east.id,
      quantity: 3,
    }).expect(200);

    await expectLedgerConsistent(org);
  });
});
