import type { DashboardSummaryResponse, OrderListResponse, SalesReportResponse } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dashboardFixture } from './support/dashboard.js';
import { prisma } from './support/database.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser } from './support/organizations.js';

/**
 * Timestamps are real UTC instants everywhere (docs/timezone.md): what the API
 * writes, what PostgreSQL stores and generates itself, what the API returns,
 * and how local days are cut for the dashboard, reports, and list filters.
 */

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const epochOf = async (table: string, id: string, column = 'created_at') => {
  const [row] = await prisma.$queryRawUnsafe<{ epoch: number }[]>(
    `SELECT extract(epoch FROM ${column})::float8 AS epoch FROM ${table} WHERE id = $1::uuid`,
    id,
  );
  return row!.epoch * 1000;
};

describe('stored instants', () => {
  it('runs every database session in UTC (the Prisma adapter requires it)', async () => {
    const [row] = await prisma.$queryRaw<
      { zone: string }[]
    >`SELECT current_setting('TimeZone') AS zone`;
    expect(row!.zone).toBe('UTC');
  });

  it('stores, compares, and returns exactly the instant the application writes', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    const instant = '2026-03-01T23:30:00.000Z';
    const order = await f.order('COMPLETED', instant, [[pen, 1, '1.00']]);

    expect(await epochOf('orders', order.id)).toBe(Date.parse(instant));
    const [match] = await prisma.$queryRaw<{ same: boolean }[]>`
      SELECT created_at = ${instant}::timestamptz AS same FROM orders WHERE id = ${order.id}::uuid`;
    expect(match!.same).toBe(true);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).createdAt.toISOString(),
    ).toBe(instant);
  });

  it('agrees with PostgreSQL now() for values written by the API and by the database', async () => {
    const f = await dashboardFixture(app);
    const before = Date.now();
    const created = await request(app.getHttpServer())
      .post(`/organizations/${f.org}/customers`)
      .set('Cookie', f.team.owner.cookie)
      .send({ name: 'Clock Check' })
      .expect(201);
    const after = Date.now();
    const [databaseNow] = await prisma.$queryRaw<{ epoch: number }[]>`
      SELECT extract(epoch FROM now())::float8 AS epoch`;

    // Written by the application (Prisma fills @default(now())).
    const apiCreatedAt = Date.parse(created.body.customer.createdAt);
    expect(apiCreatedAt).toBeGreaterThanOrEqual(before - 1);
    expect(apiCreatedAt).toBeLessThanOrEqual(after + 1);
    expect(await epochOf('customers', created.body.customer.id)).toBe(apiCreatedAt);
    expect(Math.abs(databaseNow!.epoch * 1000 - after)).toBeLessThan(5_000);

    // Written by PostgreSQL itself (column default), read through Prisma.
    const [row] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO categories (id, organization_id, name)
      VALUES (gen_random_uuid(), ${f.org}::uuid, 'Defaulted') RETURNING id`;
    const category = await prisma.category.findUniqueOrThrow({ where: { id: row!.id } });
    expect(Math.abs(category.createdAt.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('records activity at the real instant', async () => {
    const f = await dashboardFixture(app);
    const before = Date.now();
    await request(app.getHttpServer())
      .post(`/organizations/${f.org}/customers`)
      .set('Cookie', f.team.owner.cookie)
      .send({ name: 'Logged' })
      .expect(201);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { organizationId: f.org, action: 'CUSTOMER_CREATED' },
    });

    const stored = await epochOf('activity_logs', log.id);
    expect(stored).toBe(log.createdAt.getTime());
    expect(stored).toBeGreaterThanOrEqual(before - 1);
    expect(stored).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('expires sessions at the stored instant, not hours later or earlier', async () => {
    const user = await createSignedInUser();
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.user.id } });
    const [compare] = await prisma.$queryRaw<{ seconds: number }[]>`
      SELECT extract(epoch FROM expires_at - now())::float8 AS seconds FROM sessions WHERE id = ${session.id}::uuid`;
    // createSignedInUser sets a 24 h expiry.
    expect(Math.abs(compare!.seconds - 86_400)).toBeLessThan(60);
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', user.cookie).expect(200);

    // Expired one minute ago (not 3 hours in the future or past).
    await prisma.session.update({
      where: { id: session.id },
      // (created earlier too: the CHECK requires expires_at > created_at)
      data: {
        createdAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', user.cookie).expect(401);
  });
});

describe('local day boundaries (dashboard, reports, order and stock movement lists)', () => {
  /**
   * 2026-03-01T21:30Z is 2026-03-02 00:30 in Istanbul (UTC+3) but still March 1 in UTC.
   * 2026-03-02T02:30Z is 2026-03-02 in UTC but 2026-03-01 21:30 in New York (UTC−5).
   */
  async function nearMidnight() {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    const lateUtc = await f.order('COMPLETED', '2026-03-01T21:30:00.000Z', [[pen, 1, '10.00']]);
    const earlyUtc = await f.order('COMPLETED', '2026-03-02T02:30:00.000Z', [[pen, 1, '20.00']]);
    const get = (path: string, query: Record<string, string>) =>
      request(app.getHttpServer())
        .get(`/organizations/${f.org}/${path}`)
        .query(query)
        .set('Cookie', f.team.owner.cookie)
        .expect(200);
    return { f, pen, lateUtc, earlyUtc, get };
  }

  const MARCH_2 = { from: '2026-03-02', to: '2026-03-02' };

  it.each([
    ['UTC', ['earlyUtc']],
    ['Europe/Istanbul', ['lateUtc', 'earlyUtc']],
    ['America/New_York', []],
  ] as const)(
    'assigns orders to March 2 in %s consistently everywhere',
    async (timeZone, expected) => {
      const { lateUtc, earlyUtc, get } = await nearMidnight();
      const ids = { lateUtc: lateUtc.id, earlyUtc: earlyUtc.id };
      const expectedIds = expected.map((key) => ids[key]).sort();

      const dashboard = (await get('dashboard/summary', { range: 'CUSTOM', ...MARCH_2, timeZone }))
        .body as DashboardSummaryResponse;
      const sales = (await get('reports/sales', { range: 'CUSTOM', ...MARCH_2, timeZone }))
        .body as SalesReportResponse;
      const orders = (await get('orders', { ...MARCH_2, timeZone })).body as OrderListResponse;

      expect(dashboard.kpis.orders.current).toBe(expected.length);
      expect(dashboard.recentOrders.map((order) => order.id).sort()).toEqual(expectedIds);
      expect(sales.items.map((row) => row.orderId).sort()).toEqual(expectedIds);
      expect(orders.items.map((order) => order.id).sort()).toEqual(expectedIds);
    },
  );

  it('keeps UTC days as the default when no time zone is given', async () => {
    const { earlyUtc, get } = await nearMidnight();
    const orders = (await get('orders', MARCH_2)).body as OrderListResponse;
    expect(orders.items.map((order) => order.id)).toEqual([earlyUtc.id]);
  });

  it('includes the whole last local day and nothing after it', async () => {
    const { f, pen, get } = await nearMidnight();
    // Istanbul: March 2 ends at 2026-03-02T21:00Z.
    const lastMoment = await f.order('DRAFT', '2026-03-02T20:59:59.999Z', [[pen, 1, '1.00']]);
    await f.order('DRAFT', '2026-03-02T21:00:00.000Z', [[pen, 1, '1.00']]);

    const orders = (await get('orders', { ...MARCH_2, timeZone: 'Europe/Istanbul' }))
      .body as OrderListResponse;
    expect(orders.items.map((order) => order.id)).toContain(lastMoment.id);
    expect(orders.pagination.totalItems).toBe(3);
  });

  it('filters stock movements by the same local days', async () => {
    const { f, get } = await nearMidnight();
    const product = await f.product();
    const movement = await prisma.stockMovement.create({
      data: {
        organizationId: f.org,
        warehouseId: f.main.id,
        productId: product.id,
        movementType: 'PURCHASE',
        quantityDelta: 5,
        quantityBefore: 0,
        quantityAfter: 5,
        createdAt: new Date('2026-03-01T21:30:00.000Z'),
      },
    });

    const inIstanbul = await get('stock-movements', { ...MARCH_2, timeZone: 'Europe/Istanbul' });
    const inUtc = await get('stock-movements', MARCH_2);

    expect(inIstanbul.body.items.map((item: { id: string }) => item.id)).toEqual([movement.id]);
    expect(inUtc.body.items).toEqual([]);
  });

  it('rejects unknown time zones and reversed ranges on list filters', async () => {
    const { f } = await nearMidnight();
    const list = (query: Record<string, string>) =>
      request(app.getHttpServer())
        .get(`/organizations/${f.org}/orders`)
        .query(query)
        .set('Cookie', f.team.owner.cookie);

    const zone = await list({ ...MARCH_2, timeZone: 'Mars/Olympus' }).expect(400);
    const reversed = await list({ from: '2026-03-03', to: '2026-03-02', timeZone: 'UTC' }).expect(
      400,
    );

    expect(zone.body.details).toEqual([expect.objectContaining({ field: 'timeZone' })]);
    expect(reversed.body.details).toEqual([expect.objectContaining({ field: 'to' })]);
  });
});

describe('dashboard recent orders', () => {
  it('lists only the newest orders of the selected period, at most five', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    const september = [];
    for (let day = 1; day <= 7; day += 1) {
      september.push(
        await f.order(day % 2 ? 'DRAFT' : 'COMPLETED', `2025-09-0${day}T10:00:00.000Z`, [
          [pen, 1, '2.50'],
        ]),
      );
    }
    await f.order('COMPLETED', '2025-08-31T23:59:59.999Z', [[pen, 1, '9.00']]); // before
    await f.order('COMPLETED', '2025-10-01T00:00:00.000Z', [[pen, 1, '9.00']]); // after

    const body = await f.custom('2025-09-01', '2025-09-30');

    expect(body.recentOrders.map((order) => order.id)).toEqual(
      september
        .slice(2)
        .reverse()
        .map((order) => order.id),
    );
    expect(body.recentOrders[0]).toMatchObject({
      status: 'DRAFT',
      total: '0.00',
      createdAt: '2025-09-07T10:00:00.000Z',
    });
  });

  it('is empty when the period has no orders (never older, unrelated orders)', async () => {
    const f = await dashboardFixture(app);
    const pen = await f.product();
    await f.order('COMPLETED', '2025-08-15T10:00:00.000Z', [[pen, 1, '1.00']]);

    const body = await f.custom('2025-09-01', '2025-09-30');

    expect(body.recentOrders).toEqual([]);
  });
});
