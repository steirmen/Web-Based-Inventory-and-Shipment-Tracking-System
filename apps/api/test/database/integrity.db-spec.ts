import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyIntegrity } from '../../prisma/integrity.js';
import { prisma } from './support/database.js';
import { createProduct } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { salesFixture } from './support/sales.js';

/**
 * The read-only integrity audit (`npm run db:verify`, prisma/integrity.ts):
 * it passes on data produced by the real API, never writes, and reports each
 * kind of broken invariant.
 */

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const failing = async () =>
  (await verifyIntegrity(prisma))
    .filter((check) => check.violations.length > 0)
    .map((check) => check.name);

/** A workspace with stock, a transfer, a completed order, a confirmed order, and a cancelled one. */
async function busyWorkspace() {
  const f = await salesFixture(app);
  await f.stock(f.main.id, f.pen.id, 20);
  await f.stock(f.main.id, f.mouse.id, 5);
  await f
    .api()
    .post(`${f.base}/inventory/transfer`)
    .set('Cookie', f.team.owner.cookie)
    .send({
      sourceWarehouseId: f.main.id,
      destinationWarehouseId: f.east.id,
      productId: f.pen.id,
      quantity: 4,
    })
    .expect(200);
  const completed = await f.confirmedOrder([
    { productId: f.pen.id, quantity: 3 },
    { productId: f.mouse.id, quantity: 1 },
  ]);
  for (const step of ['process', 'ship', 'complete'] as const) {
    await f.action(completed.id, step).expect(200);
  }
  const confirmed = await f.confirmedOrder([{ productId: f.pen.id, quantity: 2 }]);
  const cancelled = await f.confirmedOrder([{ productId: f.mouse.id, quantity: 1 }]);
  await f.action(cancelled.id, 'cancel').expect(200);
  return { ...f, completed, confirmed };
}

describe('database integrity audit', () => {
  it('passes on data written by the real API, in two workspaces', async () => {
    await busyWorkspace();
    await busyWorkspace();
    const checks = await verifyIntegrity(prisma);
    expect(checks.length).toBe(14);
    expect(await failing()).toEqual([]);
  });

  it('is read-only: the database is unchanged afterwards', async () => {
    await busyWorkspace();
    const counts = async () =>
      Promise.all([
        prisma.stockMovement.count(),
        prisma.inventory.aggregate({ _sum: { quantity: true } }),
        prisma.order.findMany({ select: { id: true, status: true, total: true } }),
      ]);
    const before = JSON.stringify(await counts());
    await verifyIntegrity(prisma);
    expect(JSON.stringify(await counts())).toBe(before);
  });

  it('reports each kind of broken invariant', async () => {
    const f = await busyWorkspace();

    // Inventory that no movement explains.
    const stray = await createProduct(f.org);
    await prisma.inventory.create({
      data: { organizationId: f.org, warehouseId: f.main.id, productId: stray.id, quantity: 9 },
    });
    // A confirmed order marked as processed without stock being issued.
    await prisma.order.update({ where: { id: f.confirmed.id }, data: { status: 'PROCESSING' } });
    // An order total that no longer matches its lines.
    await prisma.order.update({
      where: { id: f.completed.id },
      data: { total: '1.00', subtotal: '1.00' },
    });
    // An order line in another currency than its order (bypassing the API and the trigger,
    // the way only a manual repair could).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.$executeRaw`UPDATE order_items SET currency = 'EUR' WHERE order_id = ${f.completed.id}::uuid`;
    });
    // A workspace whose owner left (bypassing the API).
    await prisma.organizationMember.delete({ where: { id: f.team.owner.memberId } });

    expect(await failing()).toEqual([
      'inventory-matches-ledger',
      'order-totals',
      'order-currency',
      'fulfilled-orders-have-sales',
      'one-owner',
    ]);
  });
});
