import type { DashboardSummaryResponse } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dashboardFixture } from './support/dashboard.js';
import { createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';

/**
 * Organization A's dashboard must aggregate nothing of organization B — and
 * the reverse. Both organizations have data in the same period with the same
 * product names and SKUs but different amounts, so any leak changes a number.
 */

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

async function organizationWith(
  slug: string,
  amounts: { price: string; quantity: number; customers: number; stock: number },
) {
  const f = await dashboardFixture(app, slug);
  const pen = await f.product({ name: 'Pen', sku: 'PEN', minimumStock: amounts.stock + 1 });
  await f.product({ name: 'Old pen', sku: 'OLD-PEN', status: 'ARCHIVED' });
  const extra = await createWarehouse(f.org, { name: `${slug} extra`, code: 'EXTRA' });
  await f.stock(f.main.id, pen.id, amounts.stock); // LOW_STOCK
  await f.stock(extra.id, pen.id, 0); // OUT_OF_STOCK
  for (let index = 0; index < amounts.customers; index += 1) {
    await f.customer('2025-09-10T10:00:00Z');
  }
  await f.order('COMPLETED', '2025-09-15T10:00:00Z', [[pen, amounts.quantity, amounts.price]]);
  await f.order('DRAFT', '2025-09-16T10:00:00Z', [[pen, 1, amounts.price]]);
  return { ...f, pen, extra };
}

const read = async (f: Awaited<ReturnType<typeof organizationWith>>) =>
  f.custom('2025-09-01', '2025-09-30');

describe('dashboard tenant isolation', () => {
  it('aggregates only the requested organization, in both directions', async () => {
    const a = await organizationWith('dash-a', {
      price: '10.00',
      quantity: 2,
      customers: 1,
      stock: 5,
    });
    const b = await organizationWith('dash-b', {
      price: '1000.00',
      quantity: 7,
      customers: 3,
      stock: 40,
    });

    const expectOnly = (
      body: DashboardSummaryResponse,
      own: Awaited<ReturnType<typeof organizationWith>>,
      expected: { sales: string; units: number; customers: number; stock: number },
    ) => {
      expect(body.kpis).toMatchObject({
        sales: { current: expected.sales },
        orders: { current: 2 },
        realizedOrders: { current: 1 },
        newCustomers: { current: expected.customers },
        activeCustomers: expected.customers,
        activeProducts: 1,
        archivedProducts: 1,
        inventoryUnits: expected.stock,
        lowStockItems: 1,
        outOfStockItems: 1,
        activeWarehouses: 2,
        inactiveWarehouses: 0,
      });
      expect(body.orderStatus.reduce((total, entry) => total + entry.count, 0)).toBe(2);
      expect(body.topProducts).toEqual([
        expect.objectContaining({ productId: own.pen.id, unitsSold: expected.units }),
      ]);
      expect(body.warehouses.map((warehouse) => warehouse.id).sort()).toEqual(
        [own.main.id, own.extra.id].sort(),
      );
      expect(body.timeSeries.points.reduce((total, point) => total + point.orders, 0)).toBe(2);
    };

    expectOnly(await read(a), a, { sales: '20.00', units: 2, customers: 1, stock: 5 });
    expectOnly(await read(b), b, { sales: '7000.00', units: 7, customers: 3, stock: 40 });
  });

  it("refuses B's dashboard to A's members with ORGANIZATION_NOT_FOUND", async () => {
    const a = await organizationWith('dash-a', {
      price: '10.00',
      quantity: 2,
      customers: 1,
      stock: 5,
    });
    const b = await organizationWith('dash-b', {
      price: '1.00',
      quantity: 1,
      customers: 1,
      stock: 1,
    });

    for (const member of [a.team.owner, a.team.admin, a.team.staff]) {
      const response = await request(app.getHttpServer())
        .get(`/organizations/${b.org}/dashboard/summary`)
        .set('Cookie', member.cookie)
        .expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    }
  });
});
