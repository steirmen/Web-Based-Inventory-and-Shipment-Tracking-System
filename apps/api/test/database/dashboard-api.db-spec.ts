import type { DashboardSummaryResponse } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dashboardFixture } from './support/dashboard.js';
import { prisma } from './support/database.js';
import { createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, NON_EXISTENT_ID } from './support/organizations.js';

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const SEPTEMBER = ['2025-09-01', '2025-09-30'] as const;

describe('GET /organizations/:id/dashboard/summary — access', () => {
  it.each(['owner', 'admin', 'staff'] as const)('%s can read the dashboard', async (who) => {
    const f = await dashboardFixture(app);

    const response = await f.summary({}, f.team[who]).expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'comparisonPeriod',
        'generatedAt',
        'kpis',
        'orderStatus',
        'period',
        'recentOrders',
        'timeSeries',
        'topProducts',
        'warehouses',
      ].sort(),
    );
  });

  it('requires a session', async () => {
    const f = await dashboardFixture(app);

    const response = await request(app.getHttpServer())
      .get(`/organizations/${f.org}/dashboard/summary`)
      .expect(401);

    expect(response.body.code).toBe('AUTH_UNAUTHENTICATED');
  });

  it('answers non-members, unknown, and malformed organizations with the same 404', async () => {
    const f = await dashboardFixture(app);
    const outsider = await createSignedInUser();
    const get = (organizationId: string) =>
      request(app.getHttpServer())
        .get(`/organizations/${organizationId}/dashboard/summary`)
        .set('Cookie', outsider.cookie);

    for (const id of [f.org, NON_EXISTENT_ID, 'not-an-id']) {
      const response = await get(id).expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    }
  });

  it('is read-only: nothing is written', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    await f.order('COMPLETED', '2025-09-10T10:00:00Z', [[pen, 1, '1.00']]);
    const before = await prisma.activityLog.count();

    await f.custom(...SEPTEMBER);

    expect(await prisma.activityLog.count()).toBe(before);
  });
});

describe('dashboard query validation', () => {
  it.each<[string, Record<string, string>, string]>([
    ['unknown range', { range: 'YESTERDAY' }, 'range'],
    ['CUSTOM without to', { range: 'CUSTOM', from: '2025-09-01' }, 'to'],
    ['impossible from', { range: 'CUSTOM', from: '2025-02-30', to: '2025-03-01' }, 'from'],
    ['malformed to', { range: 'CUSTOM', from: '2025-09-01', to: '2025-9-30' }, 'to'],
    ['from after to', { range: 'CUSTOM', from: '2025-09-30', to: '2025-09-01' }, 'to'],
    ['range over 366 days', { range: 'CUSTOM', from: '2024-01-01', to: '2025-01-01' }, 'to'],
    ['from with a preset', { range: 'LAST_7_DAYS', from: '2025-09-01' }, 'from'],
    ['unknown time zone', { timeZone: 'Atlantis/Lost' }, 'timeZone'],
    ['numeric time zone offset', { timeZone: '+03:00' }, 'timeZone'],
    ['an organization id in the query', { organizationId: NON_EXISTENT_ID }, 'organizationId'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, query, field) => {
    const f = await dashboardFixture(app);

    const response = await f.summary(query).expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(response.body.details.map((detail: { field: string }) => detail.field)).toContain(field);
  });

  it('accepts a 366-day custom range and time zone names in any letter case', async () => {
    const f = await dashboardFixture(app);

    const body = await f.custom('2024-01-01', '2024-12-31', { timeZone: 'europe/istanbul' });

    expect(body.period).toMatchObject({ days: 366, timeZone: 'europe/istanbul' });
    expect(body.timeSeries.bucket).toBe('MONTH');
  });
});

describe('realized sales', () => {
  async function everyStatus() {
    const f = await dashboardFixture(app);
    const pen = await f.product({ name: 'Pen', sku: 'PEN', price: '19.99' });
    const cable = await f.product({ name: 'Cable', sku: 'CABLE', price: '0.10' });
    const at = '2025-09-15T12:00:00Z';
    await f.order('DRAFT', at, [[pen, 50, '19.99']]);
    await f.order('CONFIRMED', at, [[pen, 40, '19.99']]);
    await f.order('CANCELLED', at, [[cable, 1000, '0.10']]);
    await f.order('PROCESSING', at, [[pen, 3, '19.99']]); // 59.97
    await f.order('SHIPPED', at, [
      [cable, 3, '0.10'],
      [pen, 1, '0.01'],
    ]); // 0.31
    await f.order('COMPLETED', at, [[cable, 7, '1.43']]); // 10.01
    return { f, pen, cable };
  }

  it('counts only PROCESSING, SHIPPED, and COMPLETED orders, to the cent', async () => {
    const { f } = await everyStatus();

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis.sales.current).toBe('70.29');
    expect(body.kpis.realizedOrders.current).toBe(3);
    expect(body.kpis.orders.current).toBe(6);
  });

  it('reports every status in lifecycle order, including empty ones', async () => {
    const { f } = await everyStatus();
    await f.order('COMPLETED', '2025-09-16T08:00:00Z', []);

    const body = await f.custom(...SEPTEMBER);

    expect(body.orderStatus).toEqual([
      { status: 'DRAFT', count: 1 },
      { status: 'CONFIRMED', count: 1 },
      { status: 'PROCESSING', count: 1 },
      { status: 'SHIPPED', count: 1 },
      { status: 'COMPLETED', count: 2 },
      { status: 'CANCELLED', count: 1 },
    ]);
    // An order without lines is realized but adds no revenue.
    expect(body.kpis.sales.current).toBe('70.29');

    const empty = await f.custom('2025-10-01', '2025-10-31');
    expect(empty.orderStatus.map((entry) => entry.count)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(empty.kpis.sales.current).toBe('0.00');
  });

  it('uses the price snapshot of each line, not the current product price', async () => {
    const { f, pen, cable } = await everyStatus();
    await prisma.product.update({ where: { id: pen.id }, data: { price: '999.99' } });
    await prisma.product.update({ where: { id: cable.id }, data: { price: '0.01' } });

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis.sales.current).toBe('70.29');
  });
});

describe('customers and products', () => {
  it('counts active, archived, and new customers', async () => {
    const f = await dashboardFixture(app);
    await f.customer('2025-09-05T09:00:00Z'); // new, active
    await f.customer('2025-09-10T09:00:00Z', false); // new, archived
    await f.customer('2025-06-01T09:00:00Z'); // older, active
    await f.customer('2025-08-15T09:00:00Z'); // new in the comparison period (Aug 2–31)
    await f.customer('2025-10-01T00:00:00Z'); // after the period

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis).toMatchObject({
      activeCustomers: 4,
      archivedCustomers: 1,
      newCustomers: { current: 2, previous: 1, absoluteChange: 1, percentageChange: 100 },
    });
  });

  it('counts active and archived products', async () => {
    const f = await dashboardFixture(app);
    await f.product();
    await f.product();
    await f.product({ status: 'ARCHIVED' });

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis).toMatchObject({ activeProducts: 2, archivedProducts: 1 });
  });
});

describe('inventory and warehouses', () => {
  it('uses the Phase 6 stock status per row, for active products in active warehouses', async () => {
    const f = await dashboardFixture(app);
    const east = await createWarehouse(f.org, { name: 'East', code: 'EAST' });
    const old = await createWarehouse(f.org, { name: 'Old depot', code: 'OLD', isActive: false });
    const plenty = await f.product({ minimumStock: 10 });
    const exact = await f.product({ minimumStock: 10 });
    const few = await f.product({ minimumStock: 5 });
    const none = await f.product({ minimumStock: 5 });
    const noMinimum = await f.product({ minimumStock: 0 });
    const archived = await f.product({ minimumStock: 5, status: 'ARCHIVED' });
    await f.product(); // no inventory rows: no status at all

    await f.stock(f.main.id, plenty.id, 15); // IN_STOCK
    await f.stock(f.main.id, exact.id, 10); // LOW_STOCK (exactly the minimum)
    await f.stock(f.main.id, few.id, 3); // LOW_STOCK
    await f.stock(f.main.id, none.id, 0); // OUT_OF_STOCK
    await f.stock(f.main.id, noMinimum.id, 1); // IN_STOCK (minimum 0)
    await f.stock(f.main.id, archived.id, 2); // archived product: not counted
    await f.stock(east.id, plenty.id, 0); // OUT_OF_STOCK
    await f.stock(old.id, plenty.id, 4); // inactive warehouse: listed, not in totals
    await f.stock(old.id, exact.id, 0);

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis).toMatchObject({
      inventoryUnits: 29,
      inStockItems: 2,
      lowStockItems: 2,
      outOfStockItems: 2,
      activeWarehouses: 2,
      inactiveWarehouses: 1,
    });
    expect(body.warehouses).toEqual([
      {
        id: east.id,
        name: 'East',
        code: 'EAST',
        isActive: true,
        totalUnits: 0,
        inStockItems: 0,
        lowStockItems: 0,
        outOfStockItems: 1,
      },
      {
        id: f.main.id,
        name: 'Main',
        code: 'MAIN',
        isActive: true,
        totalUnits: 29,
        inStockItems: 2,
        lowStockItems: 2,
        outOfStockItems: 1,
      },
      {
        id: old.id,
        name: 'Old depot',
        code: 'OLD',
        isActive: false,
        totalUnits: 4,
        inStockItems: 0,
        lowStockItems: 1,
        outOfStockItems: 1,
      },
    ]);
  });

  it('agrees with the inventory list filter on the same rows', async () => {
    const f = await dashboardFixture(app);
    for (const [minimumStock, quantity] of [
      [10, 15],
      [10, 10],
      [5, 3],
      [5, 0],
      [0, 0],
    ] as const) {
      await f.stock(f.main.id, (await f.product({ minimumStock })).id, quantity);
    }
    const listed = async (status: string) =>
      (
        await request(app.getHttpServer())
          .get(`/organizations/${f.org}/inventory`)
          .query({ status })
          .set('Cookie', f.team.owner.cookie)
          .expect(200)
      ).body.pagination.totalItems as number;

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis.inStockItems).toBe(await listed('IN_STOCK'));
    expect(body.kpis.lowStockItems).toBe(await listed('LOW_STOCK'));
    expect(body.kpis.outOfStockItems).toBe(await listed('OUT_OF_STOCK'));
  });
});

describe('top products', () => {
  it('ranks realized units sold with revenue from the line snapshots', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product({ name: 'Pen', sku: 'PEN' });
    const mouse = await f.product({ name: 'Mouse', sku: 'MOUSE' });
    const cable = await f.product({ name: 'Cable', sku: 'CABLE' });
    const at = '2025-09-20T10:00:00Z';
    await f.order('COMPLETED', at, [
      [pen, 5, '1.00'],
      [mouse, 1, '20.00'],
    ]);
    await f.order('SHIPPED', at, [
      [pen, 3, '1.20'],
      [cable, 4, '5.00'],
    ]);
    await f.order('PROCESSING', at, [[mouse, 2, '18.00']]);
    await f.order('CANCELLED', at, [[cable, 100, '5.00']]);
    await f.order('DRAFT', at, [[mouse, 50, '20.00']]);
    await f.order('CONFIRMED', at, [[pen, 40, '1.00']]);
    await f.order('COMPLETED', '2025-08-20T10:00:00Z', [[cable, 70, '5.00']]); // previous period
    // Renaming the product later changes its label, not its history.
    await prisma.product.update({
      where: { id: pen.id },
      data: { name: 'Pen (blue)', price: '9.00' },
    });

    const body = await f.custom(...SEPTEMBER);

    expect(body.topProducts).toEqual([
      {
        productId: pen.id,
        name: 'Pen (blue)',
        sku: 'PEN',
        status: 'ACTIVE',
        unitsSold: 8,
        revenue: '8.60',
      },
      {
        productId: cable.id,
        name: 'Cable',
        sku: 'CABLE',
        status: 'ACTIVE',
        unitsSold: 4,
        revenue: '20.00',
      },
      {
        productId: mouse.id,
        name: 'Mouse',
        sku: 'MOUSE',
        status: 'ACTIVE',
        unitsSold: 3,
        revenue: '56.00',
      },
    ]);
  });

  it('returns at most five products, ties broken by revenue', async () => {
    const f = await dashboardFixture(app);
    const products = await Promise.all(
      Array.from({ length: 7 }, (_, index) => f.product({ name: `P${index}` })),
    );
    await f.order(
      'COMPLETED',
      '2025-09-10T10:00:00Z',
      products.map((item, index): [typeof item, number, string] => [item, 2, `${index + 1}.00`]),
    );

    const body = await f.custom(...SEPTEMBER);

    expect(body.topProducts.map((entry) => entry.name)).toEqual(['P6', 'P5', 'P4', 'P3', 'P2']);
    expect(body.topProducts.every((entry) => entry.unitsSold === 2)).toBe(true);
  });
});

describe('time series', () => {
  it('fills every day with zeros and respects the period boundaries', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    await f.order('COMPLETED', '2025-08-31T23:59:59.999Z', [[pen, 1, '100.00']]); // day before
    await f.order('COMPLETED', '2025-09-01T00:00:00.000Z', [[pen, 1, '1.00']]); // first instant
    await f.order('SHIPPED', '2025-09-03T12:00:00Z', [[pen, 2, '5.00']]);
    await f.order('DRAFT', '2025-09-03T13:00:00Z', [[pen, 9, '5.00']]);
    await f.order('PROCESSING', '2025-09-07T23:59:59.999Z', [[pen, 1, '0.50']]); // last instant
    await f.order('COMPLETED', '2025-09-08T00:00:00.000Z', [[pen, 1, '100.00']]); // day after

    const body = await f.custom('2025-09-01', '2025-09-07');

    expect(body.timeSeries.bucket).toBe('DAY');
    expect(body.timeSeries.points).toEqual([
      {
        period: '2025-09-01',
        periodEnd: '2025-09-01',
        orders: 1,
        realizedOrders: 1,
        revenue: '1.00',
      },
      {
        period: '2025-09-02',
        periodEnd: '2025-09-02',
        orders: 0,
        realizedOrders: 0,
        revenue: '0.00',
      },
      {
        period: '2025-09-03',
        periodEnd: '2025-09-03',
        orders: 2,
        realizedOrders: 1,
        revenue: '10.00',
      },
      {
        period: '2025-09-04',
        periodEnd: '2025-09-04',
        orders: 0,
        realizedOrders: 0,
        revenue: '0.00',
      },
      {
        period: '2025-09-05',
        periodEnd: '2025-09-05',
        orders: 0,
        realizedOrders: 0,
        revenue: '0.00',
      },
      {
        period: '2025-09-06',
        periodEnd: '2025-09-06',
        orders: 0,
        realizedOrders: 0,
        revenue: '0.00',
      },
      {
        period: '2025-09-07',
        periodEnd: '2025-09-07',
        orders: 1,
        realizedOrders: 1,
        revenue: '0.50',
      },
    ]);
    expect(body.kpis.sales.current).toBe('11.50');
    expect(body.kpis.orders.current).toBe(4);
    expect(body.period).toMatchObject({
      start: '2025-09-01T00:00:00.000Z',
      end: '2025-09-08T00:00:00.000Z',
    });
  });

  it('assigns days in the requested time zone', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    // Istanbul is UTC+3: 21:00 UTC is already the next local day.
    await f.order('COMPLETED', '2025-08-31T21:00:00.000Z', [[pen, 1, '1.00']]); // Sep 1, 00:00 local
    await f.order('COMPLETED', '2025-09-01T20:59:59.999Z', [[pen, 1, '2.00']]); // Sep 1, 23:59 local
    await f.order('COMPLETED', '2025-09-01T21:30:00.000Z', [[pen, 1, '4.00']]); // Sep 2, 00:30 local
    await f.order('COMPLETED', '2025-09-02T21:00:00.000Z', [[pen, 1, '8.00']]); // Sep 3: outside

    const istanbul = await f.custom('2025-09-01', '2025-09-02', { timeZone: 'Europe/Istanbul' });
    const utc = await f.custom('2025-09-01', '2025-09-02');

    expect(istanbul.timeSeries.points.map((point) => [point.period, point.revenue])).toEqual([
      ['2025-09-01', '3.00'],
      ['2025-09-02', '4.00'],
    ]);
    expect(istanbul.kpis.sales.current).toBe('7.00');
    expect(utc.timeSeries.points.map((point) => [point.period, point.revenue])).toEqual([
      ['2025-09-01', '6.00'],
      ['2025-09-02', '8.00'],
    ]);
  });

  it('uses Monday weeks for ranges up to 92 days', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    await f.order('COMPLETED', '2025-09-07T23:00:00Z', [[pen, 1, '1.00']]); // Sunday: week 1
    await f.order('COMPLETED', '2025-09-08T01:00:00Z', [[pen, 1, '2.00']]); // Monday: week 2
    await f.order('DRAFT', '2025-10-14T10:00:00Z', [[pen, 1, '2.00']]); // last, partial week

    const body = await f.custom('2025-09-03', '2025-10-15');

    expect(body.timeSeries.bucket).toBe('WEEK');
    const points = body.timeSeries.points;
    expect(points[0]).toEqual({
      period: '2025-09-03',
      periodEnd: '2025-09-07',
      orders: 1,
      realizedOrders: 1,
      revenue: '1.00',
    });
    expect(points[1]).toMatchObject({
      period: '2025-09-08',
      periodEnd: '2025-09-14',
      revenue: '2.00',
    });
    expect(points.at(-1)).toMatchObject({
      period: '2025-10-13',
      periodEnd: '2025-10-15',
      orders: 1,
      realizedOrders: 0,
    });
    expect(points).toHaveLength(7);
  });

  it('uses calendar months for longer ranges', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    await f.order('COMPLETED', '2025-01-20T10:00:00Z', [[pen, 1, '1.00']]);
    await f.order('SHIPPED', '2025-02-28T23:59:59Z', [[pen, 1, '2.00']]);
    await f.order('COMPLETED', '2025-03-01T00:00:00Z', [[pen, 1, '4.00']]);

    const body = await f.custom('2025-01-15', '2025-06-30');

    expect(body.timeSeries.bucket).toBe('MONTH');
    expect(
      body.timeSeries.points.map((point) => [point.period, point.periodEnd, point.revenue]),
    ).toEqual([
      ['2025-01-15', '2025-01-31', '1.00'],
      ['2025-02-01', '2025-02-28', '2.00'],
      ['2025-03-01', '2025-03-31', '4.00'],
      ['2025-04-01', '2025-04-30', '0.00'],
      ['2025-05-01', '2025-05-31', '0.00'],
      ['2025-06-01', '2025-06-30', '0.00'],
    ]);
  });
});

describe('comparison with the previous period', () => {
  it('reports increases, decreases, equal values, and a zero baseline without Infinity/NaN', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    // Previous period of September 2025 = Aug 2–31.
    await f.order('COMPLETED', '2025-08-02T00:00:00Z', [[pen, 1, '100.00']]);
    await f.order('DRAFT', '2025-08-10T00:00:00Z', [[pen, 1, '1.00']]);
    await f.order('DRAFT', '2025-08-11T00:00:00Z', [[pen, 1, '1.00']]);
    await f.order('DRAFT', '2025-08-12T00:00:00Z', [[pen, 1, '1.00']]);
    await f.order('COMPLETED', '2025-08-01T23:59:59Z', [[pen, 1, '999.00']]); // before both
    await f.order('SHIPPED', '2025-09-10T00:00:00Z', [[pen, 3, '50.00']]); // current: 150.00
    await f.customer('2025-09-12T00:00:00Z');

    const body = await f.custom(...SEPTEMBER);

    expect(body.comparisonPeriod).toMatchObject({ from: '2025-08-02', to: '2025-08-31', days: 30 });
    expect(body.kpis.sales).toEqual({
      current: '150.00',
      previous: '100.00',
      absoluteChange: '50.00',
      percentageChange: 50,
    });
    expect(body.kpis.orders).toEqual({
      current: 1,
      previous: 4,
      absoluteChange: -3,
      percentageChange: -75,
    });
    expect(body.kpis.realizedOrders).toEqual({
      current: 1,
      previous: 1,
      absoluteChange: 0,
      percentageChange: 0,
    });
    expect(body.kpis.newCustomers).toEqual({
      current: 1,
      previous: 0,
      absoluteChange: 1,
      percentageChange: null,
    });

    const quiet = await f.custom('2025-12-01', '2025-12-31');
    expect(quiet.kpis.sales).toEqual({
      current: '0.00',
      previous: '0.00',
      absoluteChange: '0.00',
      percentageChange: null,
    });
    expect(JSON.stringify(quiet)).not.toMatch(/Infinity|NaN/);
  });

  it('rounds percentages to one decimal and keeps money exact', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    await f.order('COMPLETED', '2025-08-15T00:00:00Z', [[pen, 3, '0.10']]); // 0.30
    await f.order('COMPLETED', '2025-09-15T00:00:00Z', [[pen, 1, '0.10']]); // 0.10

    const body = await f.custom(...SEPTEMBER);

    expect(body.kpis.sales).toEqual({
      current: '0.10',
      previous: '0.30',
      absoluteChange: '-0.20',
      percentageChange: -66.7,
    });
  });
});

describe('date range presets', () => {
  const DAY = 86_400_000;
  const utcDay = (date: Date) => date.toISOString().slice(0, 10);

  it('TODAY, LAST_7_DAYS, and LAST_30_DAYS include today and stop at their first day', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * DAY).toISOString();
    await f.order('COMPLETED', ago(0), [[pen, 1, '1.00']]);
    await f.order('COMPLETED', ago(2), [[pen, 1, '2.00']]);
    await f.order('COMPLETED', ago(6), [[pen, 1, '4.00']]);
    await f.order('COMPLETED', ago(8), [[pen, 1, '8.00']]);
    await f.order('COMPLETED', ago(29), [[pen, 1, '16.00']]);
    await f.order('COMPLETED', ago(31), [[pen, 1, '32.00']]);
    const read = async (range: string) =>
      (await f.summary({ range }).expect(200)).body as DashboardSummaryResponse;

    const today = await read('TODAY');
    const week = await read('LAST_7_DAYS');
    const month = await read('LAST_30_DAYS');
    const fallback = (await f.summary().expect(200)).body as DashboardSummaryResponse;

    expect(today.period).toMatchObject({ range: 'TODAY', days: 1, to: utcDay(new Date(now)) });
    expect(today.kpis.sales.current).toBe('1.00');
    expect(week.period).toMatchObject({ days: 7, from: utcDay(new Date(now - 6 * DAY)) });
    expect(week.kpis.sales.current).toBe('7.00');
    expect(month.period).toMatchObject({ days: 30, from: utcDay(new Date(now - 29 * DAY)) });
    expect(month.kpis.sales.current).toBe('31.00');
    expect(month.timeSeries.points).toHaveLength(30);
    expect(fallback.period.range).toBe('LAST_30_DAYS');
    expect(fallback.kpis.sales.current).toBe('31.00');
  });

  it('THIS_MONTH, PREVIOUS_MONTH, and THIS_YEAR follow calendar boundaries', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    const now = new Date();
    const [year, month] = [now.getUTCFullYear(), now.getUTCMonth()];
    const at = (y: number, m: number, d: number, ms = 0) =>
      new Date(Date.UTC(y, m, d) + ms).toISOString();
    await f.order('COMPLETED', at(year, month, 1), [[pen, 1, '1.00']]); // first instant of this month
    await f.order('COMPLETED', at(year, month, 1, -1), [[pen, 1, '2.00']]); // last ms of previous month
    await f.order('COMPLETED', at(year, month - 1, 1), [[pen, 1, '4.00']]); // first of previous month
    await f.order('COMPLETED', at(year, 0, 1), [[pen, 1, '8.00']]); // Jan 1
    await f.order('COMPLETED', at(year, 0, 1, -1), [[pen, 1, '16.00']]); // last ms of last year
    const read = async (range: string) =>
      (await f.summary({ range }).expect(200)).body as DashboardSummaryResponse;

    const thisMonth = await read('THIS_MONTH');
    const previousMonth = await read('PREVIOUS_MONTH');
    const thisYear = await read('THIS_YEAR');

    expect(thisMonth.period).toMatchObject({
      from: at(year, month, 1).slice(0, 10),
      to: utcDay(now),
    });
    expect(thisMonth.kpis.sales.current).toBe(month === 0 ? '9.00' : '1.00');
    expect(previousMonth.period).toMatchObject({
      from: at(year, month - 1, 1).slice(0, 10),
      to: at(year, month, 0).slice(0, 10),
    });
    // In January the previous month is last December (B, C, E); in February it holds Jan 1 (D) too.
    expect(previousMonth.kpis.sales.current).toBe(
      month === 0 ? '22.00' : month === 1 ? '14.00' : '6.00',
    );
    expect(thisYear.period).toMatchObject({ from: `${year}-01-01`, to: utcDay(now) });
    // A + D in January; from February on, the previous month (B, C) is in this year too.
    expect(thisYear.kpis.sales.current).toBe(month === 0 ? '9.00' : '15.00');
  });
});
