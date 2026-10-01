import type {
  DashboardSummaryResponse,
  InventoryReportResponse,
  OrdersReportResponse,
  SalesReportResponse,
} from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dashboardFixture } from './support/dashboard.js';
import { prisma } from './support/database.js';
import { createCategory, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, NON_EXISTENT_ID, type SignedInUser } from './support/organizations.js';

let app: INestApplication;

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const SEPTEMBER = { range: 'CUSTOM', from: '2025-09-01', to: '2025-09-30' };

type Report = 'sales' | 'orders' | 'inventory';

async function reportsFixture(slug?: string) {
  const f = await dashboardFixture(app, slug);
  const get = (path: string, query: Record<string, string>, who: SignedInUser) =>
    request(app.getHttpServer())
      .get(`/organizations/${f.org}/reports/${path}`)
      .query(query)
      .set('Cookie', who.cookie);
  const report = (
    type: Report,
    query: Record<string, string> = {},
    who: SignedInUser = f.team.owner,
  ) => get(type, query, who);
  const read = async <T>(type: Report, query: Record<string, string> = {}) =>
    (await report(type, query).expect(200)).body as T;
  const exportCsv = (
    type: Report,
    query: Record<string, string> = {},
    who: SignedInUser = f.team.owner,
  ) =>
    get(`${type}/export`, query, who)
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => done(null, text));
      });
  return { ...f, report, read, exportCsv };
}

/** CSV text → rows of cells (RFC 4180), without the BOM. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/^﻿/, '');
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && body[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else cell += char;
  }
  return rows;
}

/** A team with two warehouses, a category, customers, and orders in every status in September 2025. */
async function salesData(slug?: string) {
  const f = await reportsFixture(slug);
  const east = await createWarehouse(f.org, { name: 'East', code: 'EAST' });
  const office = await createCategory(f.org, { name: 'Office' });
  const pen = await f.product({ name: 'Blue Pen', sku: 'PEN-1', categoryId: office.id });
  const lamp = await f.product({ name: 'Desk Lamp', sku: 'LAMP-1' });
  const acme = await prisma.customer.create({
    data: { organizationId: f.org, name: 'Alice Acme', companyName: 'Acme, Inc.' },
  });
  const bolt = await prisma.customer.create({ data: { organizationId: f.org, name: 'Bob Bolt' } });

  const completed = await f.order(
    'COMPLETED',
    '2025-09-03T10:00:00Z',
    [
      [pen, 10, '1.50'],
      [lamp, 1, '40.00'],
    ],
    { customerId: acme.id },
  ); // 11 units, 55.00
  const shipped = await f.order('SHIPPED', '2025-09-10T10:00:00Z', [[lamp, 2, '39.99']], {
    customerId: bolt.id,
    warehouseId: east.id,
  }); // 2 units, 79.98
  const processing = await f.order('PROCESSING', '2025-09-20T10:00:00Z', [[pen, 4, '1.25']], {
    customerId: bolt.id,
  }); // 4 units, 5.00
  await f.order('DRAFT', '2025-09-05T10:00:00Z', [[lamp, 9, '40.00']], { customerId: acme.id });
  await f.order('CONFIRMED', '2025-09-06T10:00:00Z', [[lamp, 9, '40.00']], { customerId: acme.id });
  await f.order('CANCELLED', '2025-09-07T10:00:00Z', [[lamp, 9, '40.00']], { customerId: acme.id });
  await f.order('COMPLETED', '2025-10-01T00:00:00Z', [[lamp, 1, '40.00']]); // outside September
  return { ...f, east, office, pen, lamp, acme, bolt, completed, shipped, processing };
}

describe('report access', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s can read and export every report',
    async (who) => {
      const f = await reportsFixture();
      for (const type of ['sales', 'orders', 'inventory'] as const) {
        const read = await f.report(type, {}, f.team[who]).expect(200);
        expect(read.headers['cache-control']).toBe('no-store');
        const csv = await f.exportCsv(type, {}, f.team[who]).expect(200);
        expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
        expect(csv.headers['content-disposition']).toMatch(
          new RegExp(`^attachment; filename="${type}-report_[\\d_-]+\\.csv"$`),
        );
      }
    },
  );

  it('requires a session and membership (404 for others, same for unknown ids)', async () => {
    const f = await reportsFixture();
    const outsider = await createSignedInUser();
    for (const path of [
      'sales',
      'sales/export',
      'orders',
      'orders/export',
      'inventory',
      'inventory/export',
    ]) {
      const anonymous = await request(app.getHttpServer())
        .get(`/organizations/${f.org}/reports/${path}`)
        .expect(401);
      expect(anonymous.body.code).toBe('AUTH_UNAUTHENTICATED');
      for (const id of [f.org, NON_EXISTENT_ID]) {
        const response = await request(app.getHttpServer())
          .get(`/organizations/${id}/reports/${path}`)
          .set('Cookie', outsider.cookie)
          .expect(404);
        expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
      }
    }
  });

  it('never writes anything', async () => {
    const f = await salesData();
    const before = {
      logs: await prisma.activityLog.count(),
      movements: await prisma.stockMovement.count(),
      orders: await prisma.order.findMany({ orderBy: { id: 'asc' } }),
    };
    for (const type of ['sales', 'orders', 'inventory'] as const) {
      await f.report(type, SEPTEMBER_FOR(type)).expect(200);
      await f.exportCsv(type, SEPTEMBER_FOR(type)).expect(200);
    }
    expect(await prisma.activityLog.count()).toBe(before.logs);
    expect(await prisma.stockMovement.count()).toBe(before.movements);
    expect(await prisma.order.findMany({ orderBy: { id: 'asc' } })).toEqual(before.orders);
  });
});

const SEPTEMBER_FOR = (type: Report): Record<string, string> =>
  type === 'inventory' ? {} : SEPTEMBER;

describe('report validation', () => {
  it.each<[Report, Record<string, string>, string]>([
    ['sales', { sortBy: 'unit_price; DROP TABLE orders' }, 'sortBy'],
    ['sales', { sortBy: 'status' }, 'sortBy'],
    ['sales', { status: 'DRAFT' }, 'status'],
    ['sales', { status: 'CANCELLED' }, 'status'],
    ['sales', { pageSize: '101' }, 'pageSize'],
    ['sales', { page: '0' }, 'page'],
    ['sales', { range: 'CUSTOM', from: '2025-09-01' }, 'to'],
    ['sales', { productId: 'not-an-id' }, 'productId'],
    ['orders', { sortBy: 'units' }, 'sortBy'],
    ['orders', { status: 'LOST' }, 'status'],
    ['orders', { range: 'FOREVER' }, 'range'],
    ['inventory', { sortBy: 'revenue' }, 'sortBy'],
    ['inventory', { status: 'LOW' }, 'status'],
    ['inventory', { includeArchived: 'yes' }, 'includeArchived'],
    ['inventory', { range: 'TODAY' }, 'range'],
    ['inventory', { organizationId: NON_EXISTENT_ID }, 'organizationId'],
  ])('%s rejects %j with 400 VALIDATION_ERROR', async (type, query, field) => {
    const f = await reportsFixture();

    const response = await f.report(type, query).expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((detail: { field: string }) => detail.field)).toContain(field);
  });

  it('rejects unknown ids in filters with 422 REPORT_FILTER_NOT_FOUND', async () => {
    const f = await reportsFixture();
    for (const [type, field] of [
      ['sales', 'warehouseId'],
      ['sales', 'customerId'],
      ['sales', 'productId'],
      ['sales', 'categoryId'],
      ['orders', 'customerId'],
      ['inventory', 'categoryId'],
    ] as const) {
      const response = await f.report(type, { [field]: NON_EXISTENT_ID }).expect(422);
      expect(response.body).toMatchObject({
        code: 'REPORT_FILTER_NOT_FOUND',
        details: [{ field }],
      });
    }
  });
});

describe('sales report', () => {
  it('lists realized orders only, with units and revenue from line snapshots', async () => {
    const f = await salesData();
    await prisma.product.update({
      where: { id: f.lamp.id },
      data: { price: '999.00', name: 'Renamed' },
    });

    const body = await f.read<SalesReportResponse>('sales', SEPTEMBER);

    expect(body.items.map((row) => row.orderNumber)).toEqual([
      f.processing.orderNumber,
      f.shipped.orderNumber,
      f.completed.orderNumber,
    ]);
    expect(body.items[2]).toEqual({
      orderId: f.completed.id,
      orderNumber: f.completed.orderNumber,
      date: '2025-09-03T10:00:00.000Z',
      status: 'COMPLETED',
      customer: { id: f.acme.id, name: 'Alice Acme', companyName: 'Acme, Inc.' },
      warehouse: { id: f.main.id, name: 'Main', code: 'MAIN', isActive: true },
      units: 11,
      revenue: '55.00',
    });
    expect(body.totals).toEqual({ orders: 3, units: 17, revenue: '139.98' });
    expect(body.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 3, totalPages: 1 });
    expect(body.period).toMatchObject({ from: '2025-09-01', to: '2025-09-30' });
  });

  it('agrees with the dashboard sales KPI for the same period and time zone', async () => {
    const f = await salesData();
    for (const timeZone of ['UTC', 'Europe/Istanbul']) {
      const report = await f.read<SalesReportResponse>('sales', {
        ...SEPTEMBER,
        timeZone,
        pageSize: '1',
      });
      const dashboard = (await f.summary({ ...SEPTEMBER, timeZone }).expect(200))
        .body as DashboardSummaryResponse;
      expect(report.totals.revenue).toBe(dashboard.kpis.sales.current);
      expect(report.totals.orders).toBe(dashboard.kpis.realizedOrders.current);
    }
  });

  it('filters by status, warehouse, customer, and date', async () => {
    const f = await salesData();
    const numbers = async (query: Record<string, string>) =>
      (await f.read<SalesReportResponse>('sales', { ...SEPTEMBER, ...query })).items.map(
        (row) => row.orderNumber,
      );

    expect(await numbers({ status: 'SHIPPED' })).toEqual([f.shipped.orderNumber]);
    expect(await numbers({ warehouseId: f.east.id })).toEqual([f.shipped.orderNumber]);
    expect(await numbers({ customerId: f.acme.id })).toEqual([f.completed.orderNumber]);
    expect(await numbers({ from: '2025-09-10', to: '2025-09-10' })).toEqual([
      f.shipped.orderNumber,
    ]);
    expect(await numbers({ from: '2025-09-04', to: '2025-09-09' })).toEqual([]);
  });

  it('counts only the matching lines when filtering by product or category', async () => {
    const f = await salesData();

    const byProduct = await f.read<SalesReportResponse>('sales', {
      ...SEPTEMBER,
      productId: f.pen.id,
    });
    const byCategory = await f.read<SalesReportResponse>('sales', {
      ...SEPTEMBER,
      categoryId: f.office.id,
    });

    for (const body of [byProduct, byCategory]) {
      expect(body.items.map((row) => [row.orderNumber, row.units, row.revenue])).toEqual([
        [f.processing.orderNumber, 4, '5.00'],
        [f.completed.orderNumber, 10, '15.00'],
      ]);
      expect(body.totals).toEqual({ orders: 2, units: 14, revenue: '20.00' });
    }
  });

  it('searches order numbers, customers, companies, and products (escaping wildcards)', async () => {
    const f = await salesData();
    const search = async (term: string) =>
      (await f.read<SalesReportResponse>('sales', { ...SEPTEMBER, search: term })).items.map(
        (row) => row.orderNumber,
      );

    expect(await search(f.shipped.orderNumber)).toEqual([f.shipped.orderNumber]);
    expect(await search('bolt')).toEqual([f.processing.orderNumber, f.shipped.orderNumber]);
    expect(await search('acme, inc')).toEqual([f.completed.orderNumber]);
    expect(await search('desk lamp')).toEqual([f.shipped.orderNumber, f.completed.orderNumber]);
    expect(await search('PEN-1')).toEqual([f.processing.orderNumber, f.completed.orderNumber]);
    expect(await search('%')).toEqual([]);
    expect(await search('_')).toEqual([]);
  });

  it('sorts by whitelisted fields and paginates on the server', async () => {
    const f = await salesData();
    const sorted = async (sortBy: string, sortOrder: string) =>
      (await f.read<SalesReportResponse>('sales', { ...SEPTEMBER, sortBy, sortOrder })).items.map(
        (row) => row.orderNumber,
      );

    expect(await sorted('revenue', 'desc')).toEqual([
      f.shipped.orderNumber,
      f.completed.orderNumber,
      f.processing.orderNumber,
    ]);
    expect(await sorted('units', 'asc')).toEqual([
      f.shipped.orderNumber,
      f.processing.orderNumber,
      f.completed.orderNumber,
    ]);
    expect(await sorted('date', 'asc')).toEqual([
      f.completed.orderNumber,
      f.shipped.orderNumber,
      f.processing.orderNumber,
    ]);
    expect(await sorted('customer', 'asc')).toEqual([
      f.completed.orderNumber,
      f.processing.orderNumber,
      f.shipped.orderNumber,
    ]);

    const page2 = await f.read<SalesReportResponse>('sales', {
      ...SEPTEMBER,
      pageSize: '2',
      page: '2',
    });
    expect(page2.items.map((row) => row.orderNumber)).toEqual([f.completed.orderNumber]);
    expect(page2.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(page2.totals.orders).toBe(3);
  });

  it('is empty, not broken, for a workspace without sales', async () => {
    const f = await reportsFixture();

    const body = await f.read<SalesReportResponse>('sales');

    expect(body.items).toEqual([]);
    expect(body.totals).toEqual({ orders: 0, units: 0, revenue: '0.00' });
    expect(body.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 0, totalPages: 0 });
  });
});

describe('orders report', () => {
  it('lists orders of every status with totals', async () => {
    const f = await salesData();

    const body = await f.read<OrdersReportResponse>('orders', SEPTEMBER);

    expect(body.items.map((row) => row.status)).toEqual([
      'PROCESSING',
      'SHIPPED',
      'CANCELLED',
      'CONFIRMED',
      'DRAFT',
      'COMPLETED',
    ]);
    expect(body.items.find((row) => row.orderId === f.completed.id)).toEqual({
      orderId: f.completed.id,
      orderNumber: f.completed.orderNumber,
      status: 'COMPLETED',
      customer: { id: f.acme.id, name: 'Alice Acme', companyName: 'Acme, Inc.' },
      warehouse: { id: f.main.id, name: 'Main', code: 'MAIN', isActive: true },
      itemCount: 2,
      total: '0.00',
      createdAt: '2025-09-03T10:00:00.000Z',
    });
    expect(body.totals.orders).toBe(6);
  });

  it('filters by status, customer, warehouse, and search, and sorts on the server', async () => {
    const f = await salesData();
    const numbers = async (query: Record<string, string>) =>
      (await f.read<OrdersReportResponse>('orders', { ...SEPTEMBER, ...query })).items.map(
        (row) => row.orderNumber,
      );

    expect(await numbers({ status: 'SHIPPED' })).toEqual([f.shipped.orderNumber]);
    expect(await numbers({ warehouseId: f.east.id })).toEqual([f.shipped.orderNumber]);
    expect((await numbers({ customerId: f.bolt.id })).sort()).toEqual(
      [f.processing.orderNumber, f.shipped.orderNumber].sort(),
    );
    expect(await numbers({ search: 'acme, inc', status: 'COMPLETED' })).toEqual([
      f.completed.orderNumber,
    ]);
    expect(await numbers({ sortBy: 'createdAt', sortOrder: 'asc', pageSize: '1' })).toEqual([
      f.completed.orderNumber,
    ]);
  });
});

describe('inventory report', () => {
  async function stockData() {
    const f = await reportsFixture();
    const old = await createWarehouse(f.org, { name: 'Old', code: 'OLD', isActive: false });
    const tools = await createCategory(f.org, { name: 'Tools' });
    const plenty = await f.product({
      name: 'Hammer',
      sku: 'HAM',
      minimumStock: 5,
      categoryId: tools.id,
    });
    const exact = await f.product({ name: 'Saw', sku: 'SAW', minimumStock: 5 });
    const none = await f.product({ name: 'Drill', sku: 'DRL', minimumStock: 5 });
    const archived = await f.product({ name: 'Old Axe', sku: 'AXE', status: 'ARCHIVED' });
    await f.stock(f.main.id, plenty.id, 20);
    await f.stock(f.main.id, exact.id, 5);
    await f.stock(f.main.id, none.id, 0);
    await f.stock(f.main.id, archived.id, 3);
    await f.stock(old.id, plenty.id, 1);
    return { ...f, old, tools, plenty, exact, none, archived };
  }

  it('lists current stock with the Phase 6 status, sellable stock by default', async () => {
    const f = await stockData();

    const body = await f.read<InventoryReportResponse>('inventory');

    expect(
      body.items.map((row) => [row.product.name, row.warehouse.code, row.quantity, row.status]),
    ).toEqual([
      ['Drill', 'MAIN', 0, 'OUT_OF_STOCK'],
      ['Hammer', 'MAIN', 20, 'IN_STOCK'],
      ['Saw', 'MAIN', 5, 'LOW_STOCK'],
    ]);
    expect(body.items[1]).toMatchObject({
      category: { id: f.tools.id, name: 'Tools' },
      minimumStock: 5,
    });
    expect(body.totals).toEqual({ rows: 3, units: 25, inStock: 1, lowStock: 1, outOfStock: 1 });

    const dashboard = (await f.summary().expect(200)).body as DashboardSummaryResponse;
    expect([
      body.totals.inStock,
      body.totals.lowStock,
      body.totals.outOfStock,
      body.totals.units,
    ]).toEqual([
      dashboard.kpis.inStockItems,
      dashboard.kpis.lowStockItems,
      dashboard.kpis.outOfStockItems,
      dashboard.kpis.inventoryUnits,
    ]);
  });

  it('includes archived products and warehouses on request', async () => {
    const f = await stockData();

    const body = await f.read<InventoryReportResponse>('inventory', { includeArchived: 'true' });

    expect(body.totals.rows).toBe(5);
    expect(body.items.find((row) => row.warehouse.code === 'OLD')).toMatchObject({
      warehouse: { isActive: false },
      status: 'LOW_STOCK',
    });
    expect(body.items.find((row) => row.product.sku === 'AXE')?.product.status).toBe('ARCHIVED');
  });

  it('filters by status, warehouse, product, category, and search, and sorts', async () => {
    const f = await stockData();
    const names = async (query: Record<string, string>) =>
      (await f.read<InventoryReportResponse>('inventory', query)).items.map(
        (row) => row.product.sku,
      );

    expect(await names({ status: 'LOW_STOCK' })).toEqual(['SAW']);
    expect(await names({ status: 'OUT_OF_STOCK' })).toEqual(['DRL']);
    expect(await names({ categoryId: f.tools.id })).toEqual(['HAM']);
    expect(await names({ productId: f.exact.id })).toEqual(['SAW']);
    expect(await names({ warehouseId: f.old.id, includeArchived: 'true' })).toEqual(['HAM']);
    expect(await names({ search: 'dri' })).toEqual(['DRL']);
    expect(await names({ sortBy: 'quantity', sortOrder: 'desc' })).toEqual(['HAM', 'SAW', 'DRL']);
    expect(await names({ sortBy: 'category', sortOrder: 'asc' })).toEqual(['HAM', 'DRL', 'SAW']);
  });

  it('is empty for a workspace without stock', async () => {
    const f = await reportsFixture();
    const body = await f.read<InventoryReportResponse>('inventory');
    expect(body.totals).toEqual({ rows: 0, units: 0, inStock: 0, lowStock: 0, outOfStock: 0 });
  });
});

describe('CSV export', () => {
  it('exports exactly the filtered report, with readable headers and exact decimals', async () => {
    const f = await salesData();

    const response = await f
      .exportCsv('sales', { ...SEPTEMBER, warehouseId: f.main.id, timeZone: 'Europe/Istanbul' })
      .expect(200);

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="sales-report_2025-09-01_2025-09-30.csv"',
    );
    const text = response.body as string;
    expect(text.startsWith('﻿')).toBe(true);
    expect(text).toContain('\r\n');
    expect(parseCsv(text)).toEqual([
      [
        'Date (Europe/Istanbul)',
        'Order number',
        'Status',
        'Customer',
        'Company',
        'Warehouse code',
        'Warehouse',
        'Units',
        'Revenue',
      ],
      [
        '2025-09-20 13:00',
        f.processing.orderNumber,
        'Processing',
        'Bob Bolt',
        '',
        'MAIN',
        'Main',
        '4',
        '5.00',
      ],
      [
        '2025-09-03 13:00',
        f.completed.orderNumber,
        'Completed',
        'Alice Acme',
        'Acme, Inc.',
        'MAIN',
        'Main',
        '11',
        '55.00',
      ],
    ]);
  });

  it('exports the orders and inventory reports with their filters', async () => {
    const f = await salesData();
    await f.stock(f.main.id, f.pen.id, 2);
    await f.stock(f.east.id, f.lamp.id, 9);

    const orders = parseCsv(
      (await f.exportCsv('orders', { ...SEPTEMBER, status: 'DRAFT' }).expect(200)).body,
    );
    const stock = parseCsv(
      (await f.exportCsv('inventory', { warehouseId: f.east.id }).expect(200)).body,
    );

    expect(orders[0]).toEqual([
      'Order number',
      'Status',
      'Customer',
      'Company',
      'Warehouse code',
      'Warehouse',
      'Items',
      'Total',
      'Created (UTC)',
    ]);
    expect(orders.slice(1).map((row) => row[1])).toEqual(['Draft']);
    expect(orders[1]![8]).toBe('2025-09-05 10:00');
    expect(stock).toEqual([
      [
        'Product',
        'SKU',
        'Category',
        'Warehouse code',
        'Warehouse',
        'Quantity',
        'Minimum stock',
        'Status',
        'Product status',
        'Warehouse status',
      ],
      ['Desk Lamp', 'LAMP-1', '', 'EAST', 'East', '9', '0', 'In stock', 'Active', 'Active'],
    ]);
  });

  it('keeps hostile names inert: quotes, commas, line breaks, and formulas', async () => {
    const f = await reportsFixture();
    const product = await f.product({ name: 'Pen', sku: 'PEN' });
    const hostile = [
      '=HYPERLINK("http://evil.example","Click")',
      '+1+1',
      '-2+3',
      '@SUM(A1)',
      'Quote "Q" Ltd',
      'Comma, Inc.',
      'Line\nBreak',
    ];
    for (const [index, name] of hostile.entries()) {
      const customer = await prisma.customer.create({ data: { organizationId: f.org, name } });
      await f.order('COMPLETED', `2025-09-1${index}T10:00:00Z`, [[product, 1, '1.00']], {
        customerId: customer.id,
      });
    }

    const rows = parseCsv(
      (await f.exportCsv('sales', { ...SEPTEMBER, sortBy: 'date', sortOrder: 'asc' }).expect(200))
        .body,
    );

    expect(rows.slice(1).map((row) => row[3])).toEqual([
      '\'=HYPERLINK("http://evil.example","Click")',
      "'+1+1",
      "'-2+3",
      "'@SUM(A1)",
      'Quote "Q" Ltd',
      'Comma, Inc.',
      'Line\nBreak',
    ]);
    expect(rows.every((row) => row.length === 9)).toBe(true);
  });

  it('refuses exports above the limit and asks for narrower filters', async () => {
    const f = await reportsFixture();
    const products = await prisma.product.createManyAndReturn({
      data: Array.from({ length: 10_001 }, (_, index) => ({
        organizationId: f.org,
        name: `Bulk ${index}`,
        sku: `BULK-${index}`,
        price: '1.00',
      })),
      select: { id: true },
    });
    await prisma.inventory.createMany({
      data: products.map((product) => ({
        organizationId: f.org,
        warehouseId: f.main.id,
        productId: product.id,
        quantity: 1,
      })),
    });
    // Autovacuum would analyze these tables after such a bulk insert; without fresh
    // statistics the planner assumes 1 row and loops 10k × 10k (seconds).
    await prisma.$executeRawUnsafe('ANALYZE products, inventory');

    const tooLarge = await f.exportCsv('inventory').expect(422);
    const narrowed = await f.exportCsv('inventory', { search: 'Bulk 1000' }).expect(200);
    const page = await f.read<InventoryReportResponse>('inventory', { pageSize: '100' });

    expect(JSON.parse(tooLarge.body as string)).toMatchObject({
      code: 'REPORT_EXPORT_TOO_LARGE',
      message: expect.stringMatching(/10,001 rows; the maximum is 10,000\. Narrow the filters/),
    });
    expect(parseCsv(narrowed.body as string)).toHaveLength(1 + 2); // Bulk 1000 and Bulk 10000
    expect(page.items).toHaveLength(100);
    expect(page.totals.rows).toBe(10_001);
  });
});

describe('report tenant isolation', () => {
  it("never exposes organization B through A's reports, filters, or exports", async () => {
    const a = await salesData('rep-a');
    const b = await salesData('rep-b');
    await a.stock(a.main.id, a.pen.id, 3);
    await b.stock(b.main.id, b.pen.id, 30);

    const aSales = await a.read<SalesReportResponse>('sales', SEPTEMBER);
    const aOrders = await a.read<OrdersReportResponse>('orders', SEPTEMBER);
    const aStock = await a.read<InventoryReportResponse>('inventory');
    const bOrderIds = new Set(
      (await prisma.order.findMany({ where: { organizationId: b.org } })).map((order) => order.id),
    );

    expect(aSales.items.every((row) => !bOrderIds.has(row.orderId))).toBe(true);
    expect(aOrders.items.every((row) => !bOrderIds.has(row.orderId))).toBe(true);
    expect(aStock.items.map((row) => row.quantity)).toEqual([3]);
    expect(aSales.totals.revenue).toBe('139.98');

    // B's ids in A's report filters: 422, never B's rows.
    for (const [type, query] of [
      ['sales', { warehouseId: b.east.id }],
      ['sales', { customerId: b.acme.id }],
      ['sales', { productId: b.pen.id }],
      ['sales', { categoryId: b.office.id }],
      ['orders', { customerId: b.bolt.id }],
      ['inventory', { warehouseId: b.main.id }],
    ] as const) {
      const response = await a.report(type, query as Record<string, string>).expect(422);
      expect(response.body.code).toBe('REPORT_FILTER_NOT_FOUND');
      await a.exportCsv(type, query as Record<string, string>).expect(422);
    }

    // B's routes for A's members: 404, exports included.
    for (const path of ['sales', 'orders/export', 'inventory']) {
      const response = await request(app.getHttpServer())
        .get(`/organizations/${b.org}/reports/${path}`)
        .set('Cookie', a.team.staff.cookie)
        .expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    }
  });
});
