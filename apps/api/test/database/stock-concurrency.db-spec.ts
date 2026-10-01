import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isConcurrencyConflict } from '../../src/common/errors/prisma-errors.js';
import { prisma } from './support/database.js';
import { createProduct, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { expectLedgerConsistent, quantityOf } from './support/inventory.js';
import { createTeam } from './support/organizations.js';

/**
 * Parallel requests against a real listening server. Row locks must serialize
 * changes to the same stock: no overselling, no lost updates, no deadlocks,
 * and the movement ledger must still explain every quantity.
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

async function setup() {
  const team = await createTeam();
  const org = team.organization.id;
  const main = await createWarehouse(org, { code: 'MAIN' });
  const east = await createWarehouse(org, { code: 'EAST' });
  const product = await createProduct(org, { minimumStock: 0 });
  const op = (operation: string, body: Record<string, unknown>) =>
    request(baseUrl)
      .post(`/organizations/${org}/inventory/${operation}`)
      .set('Cookie', team.owner.cookie)
      .send({ productId: product.id, ...body });
  return { org, main, east, product, op };
}

const statuses = (responses: { status: number }[]) =>
  responses.reduce<Record<number, number>>((counts, { status }) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});

describe('concurrent stock operations', () => {
  it('10 on hand, two parallel issues of 7: exactly one succeeds, 3 remain, one SALE', async () => {
    const { org, main, product, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 10 }).expect(200);

    const responses = await Promise.all([
      op('issue', { warehouseId: main.id, quantity: 7 }),
      op('issue', { warehouseId: main.id, quantity: 7 }),
    ]);

    expect(statuses(responses)).toEqual({ 200: 1, 409: 1 });
    expect(responses.find((r) => r.status === 409)?.body).toMatchObject({
      code: 'INVENTORY_INSUFFICIENT_STOCK',
      message: 'Not enough stock: 3 units available in MAIN.',
    });
    expect(await quantityOf(main.id, product.id)).toBe(3);
    const sales = await prisma.stockMovement.findMany({ where: { movementType: 'SALE' } });
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ quantityBefore: 10, quantityAfter: 3 });
    await expectLedgerConsistent(org);
  });

  it('10 on hand, parallel receipts of +5 and +7: 22, with an unbroken movement chain', async () => {
    const { org, main, product, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 10 }).expect(200);

    const responses = await Promise.all([
      op('receive', { warehouseId: main.id, quantity: 5 }),
      op('receive', { warehouseId: main.id, quantity: 7 }),
    ]);

    expect(statuses(responses)).toEqual({ 200: 2 });
    expect(await quantityOf(main.id, product.id)).toBe(22);
    const befores = responses.map((r) => r.body.movement.quantityBefore).sort((x, y) => x - y);
    expect(befores[0]).toBe(10);
    expect([15, 17]).toContain(befores[1]);
    await expectLedgerConsistent(org);
  });

  it('never oversells: 20 parallel issues of 1 against 10 units', async () => {
    const { org, main, product, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 10 }).expect(200);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => op('issue', { warehouseId: main.id, quantity: 1 })),
    );

    expect(statuses(responses)).toEqual({ 200: 10, 409: 10 });
    expect(responses.filter((r) => r.status === 409).map((r) => r.body.code)).toEqual(
      Array(10).fill('INVENTORY_INSUFFICIENT_STOCK'),
    );
    expect(await quantityOf(main.id, product.id)).toBe(0);
    expect(await prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(10);
    await expectLedgerConsistent(org);
  });

  it('loses no update: 15 parallel first receipts into an empty location', async () => {
    const { org, east, product, op } = await setup();

    const responses = await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        op('receive', { warehouseId: east.id, quantity: index + 1 }),
      ),
    );

    expect(statuses(responses)).toEqual({ 200: 15 });
    expect(await prisma.inventory.count({ where: { warehouseId: east.id } })).toBe(1);
    expect(await quantityOf(east.id, product.id)).toBe((15 * 16) / 2);
    await expectLedgerConsistent(org);
  });

  it('does not deadlock on opposite transfers, and conserves the total', async () => {
    const { org, main, east, product, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 50 }).expect(200);
    await op('receive', { warehouseId: east.id, quantity: 50 }).expect(200);

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        op('transfer', {
          sourceWarehouseId: index % 2 === 0 ? main.id : east.id,
          destinationWarehouseId: index % 2 === 0 ? east.id : main.id,
          quantity: 3,
        }),
      ),
    );

    expect(statuses(responses)).toEqual({ 200: 20 });
    const total =
      (await quantityOf(main.id, product.id))! + (await quantityOf(east.id, product.id))!;
    expect(total).toBe(100);
    expect(await quantityOf(main.id, product.id)).toBe(50);
    const groups = await prisma.stockMovement.groupBy({
      by: ['transferGroupId'],
      where: { transferGroupId: { not: null } },
      _count: { _all: true },
      _sum: { quantityDelta: true },
    });
    expect(groups).toHaveLength(20);
    expect(groups.every((group) => group._count._all === 2 && group._sum.quantityDelta === 0)).toBe(
      true,
    );
    await expectLedgerConsistent(org);
  });

  it('competing transfers of 7 from 10 units: one moves, the other moves nothing (no half transfer)', async () => {
    const { org, main, east, product, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 10 }).expect(200);

    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        op('transfer', {
          sourceWarehouseId: main.id,
          destinationWarehouseId: east.id,
          quantity: 7,
        }),
      ),
    );

    expect(statuses(responses)).toEqual({ 200: 1, 409: 1 });
    expect(await quantityOf(main.id, product.id)).toBe(3);
    expect(await quantityOf(east.id, product.id)).toBe(7);
    // Exactly one OUT and one IN: the refused transfer left no orphan movement.
    const moves = await prisma.stockMovement.findMany({
      where: { organizationId: org, movementType: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] } },
    });
    expect(moves.map((move) => move.movementType).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
    await expectLedgerConsistent(org);
  });

  it('mixes receipts, issues, damage, adjustments, and transfers without breaking the ledger', async () => {
    const { org, main, east, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 30 }).expect(200);

    const responses = await Promise.all([
      ...Array.from({ length: 5 }, () => op('receive', { warehouseId: main.id, quantity: 2 })),
      ...Array.from({ length: 5 }, () => op('issue', { warehouseId: main.id, quantity: 3 })),
      ...Array.from({ length: 3 }, () =>
        op('damage', { warehouseId: main.id, quantity: 1, reason: 'Broken' }),
      ),
      ...Array.from({ length: 4 }, () =>
        op('transfer', {
          sourceWarehouseId: main.id,
          destinationWarehouseId: east.id,
          quantity: 2,
        }),
      ),
      op('adjust', { warehouseId: east.id, newQuantity: 1, reason: 'Count' }),
    ]);

    expect(responses.every((response) => [200, 409].includes(response.status))).toBe(true);
    await expectLedgerConsistent(org);
  });
});

/**
 * The lock order makes deadlocks between stock operations impossible, but a
 * lost lock race must still never surface as a generic 500. These errors are
 * produced by real PostgreSQL lock conflicts, not constructed by hand.
 */
describe('lost lock races', () => {
  const lockWarehouse = (tx: { $queryRaw: typeof prisma.$queryRaw }, id: string) =>
    tx.$queryRaw`SELECT id FROM warehouses WHERE id = ${id}::uuid FOR UPDATE`;

  /** A second transaction with a 100 ms lock_timeout waits for a row another one holds. */
  async function realLockTimeout(warehouseId: string): Promise<unknown> {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let signalLocked = () => {};
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));
    const holder = prisma.$transaction(async (tx) => {
      await lockWarehouse(tx, warehouseId);
      signalLocked();
      await held;
    });
    await locked;
    const error = await prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
        await lockWarehouse(tx, warehouseId);
      })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    release();
    await holder;
    return error;
  }

  /** Two transactions lock A and B, then each other's row: PostgreSQL aborts one of them. */
  async function realDeadlock(a: string, b: string): Promise<unknown> {
    let arrived = 0;
    let open = () => {};
    const barrier = new Promise<void>((resolve) => (open = resolve));
    const run = (first: string, second: string) =>
      prisma.$transaction(
        async (tx) => {
          await lockWarehouse(tx, first);
          if (++arrived === 2) open();
          await barrier;
          await lockWarehouse(tx, second);
        },
        { timeout: 10_000 },
      );
    const results = await Promise.allSettled([run(a, b), run(b, a)]);
    const failed = results.filter((result) => result.status === 'rejected');
    expect(failed).toHaveLength(1);
    return (failed[0] as PromiseRejectedResult).reason;
  }

  it('recognizes real deadlock and lock-timeout errors — and nothing else — as concurrency conflicts', async () => {
    const { main, east } = await setup();

    const timeout = await realLockTimeout(main.id);
    const deadlock = await realDeadlock(main.id, east.id);
    const unique = await createWarehouse(main.organizationId, { code: main.code }).then(
      () => undefined,
      (reason: unknown) => reason,
    );

    expect(timeout).toBeDefined();
    expect(isConcurrencyConflict(timeout)).toBe(true);
    expect(isConcurrencyConflict(deadlock)).toBe(true);
    expect(isConcurrencyConflict(unique)).toBe(false);
    expect(isConcurrencyConflict(new Error('deadlock detected'))).toBe(false);
  });

  it('answers 409 INVENTORY_CONCURRENCY_CONFLICT (not 500) when a stock transaction loses a lock race', async () => {
    const { org, main, east, product, op } = await setup();
    await op('receive', { warehouseId: main.id, quantity: 10 }).expect(200);
    const deadlock = await realDeadlock(main.id, east.id);
    // The stock operation's transaction is the deadlock victim.
    const spy = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(deadlock);

    try {
      const response = await op('issue', { warehouseId: main.id, quantity: 4 });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        statusCode: 409,
        code: 'INVENTORY_CONCURRENCY_CONFLICT',
        message:
          'Another stock change for the same items was in progress. Nothing was changed; please try again.',
      });
    } finally {
      spy.mockRestore();
    }
    expect(await quantityOf(main.id, product.id)).toBe(10);
    expect(await prisma.stockMovement.count({ where: { organizationId: org } })).toBe(1);
    // A retry succeeds.
    await op('issue', { warehouseId: main.id, quantity: 4 }).expect(200);
    expect(await quantityOf(main.id, product.id)).toBe(6);
    await expectLedgerConsistent(org);
  });
});
