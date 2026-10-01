import { readFileSync, writeFileSync } from 'node:fs';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { SEED_FILE } from './config.js';
import { closeDb, sql } from './db.js';
import { apiAs, type SeedData } from './fixtures.js';

/**
 * Business data for the E2E suite, created through the REAL API as the owner
 * (so stock and orders follow every business rule), then five orders are
 * backdated to fixed instants around midnight for the time-zone tests:
 *
 *   SO-1001 2026-03-01T09:59Z  completed  Riverside   2 × Pen   =  3.00  (23:59 in Kiritimati)
 *   SO-1002 2026-03-01T23:30Z  completed  Northwind   3 × Pen   =  4.50
 *   SO-1003 2026-03-02T00:15Z  completed  Riverside   1 × Lamp  = 49.90
 *   SO-1004 2026-03-02T08:00Z  confirmed  Northwind   5 × Pen   =  7.50  (00:00 in Los Angeles)
 *   SO-1005 2026-03-15T12:00Z  shipped    =formula    1 × =HYP. =  3.00
 */

async function post<T>(api: APIRequestContext, path: string, data?: object): Promise<T> {
  const response = await api.post(path, data ? { data } : {});
  expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

test('seed business data through the API', async () => {
  test.setTimeout(120_000);
  const base = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Pick<
    SeedData,
    'users' | 'acme' | 'beta'
  >;
  const api = await apiAs('owner');
  const acme = `/organizations/${base.acme}`;
  const beta = `/organizations/${base.beta}`;

  const categories: Record<string, string> = {};
  for (const name of ['Office', 'Packaging']) {
    categories[name] = (
      await post<{ category: { id: string } }>(api, `${acme}/categories`, { name })
    ).category.id;
  }

  const products: Record<string, string> = {};
  const product = async (key: string, body: Record<string, unknown>) => {
    products[key] = (
      await post<{ product: { id: string } }>(api, `${acme}/products`, {
        cost: '0.50',
        minimumStock: 0,
        ...body,
      })
    ).product.id;
  };
  for (let n = 1; n <= 24; n += 1) {
    const nn = String(n).padStart(2, '0');
    await product(`item${nn}`, {
      name: `Catalog Item ${nn}`,
      sku: `CAT-${nn}`,
      price: `${n}.25`,
      categoryId: n % 2 === 0 ? categories.Packaging : categories.Office,
    });
  }
  await product('pen', {
    name: 'Ballpoint Pen',
    sku: 'PEN-1',
    price: '1.50',
    cost: '0.40',
    minimumStock: 20,
    categoryId: categories.Office,
  });
  await product('lamp', {
    name: 'Desk Lamp',
    sku: 'LAMP-1',
    price: '49.90',
    cost: '21.00',
    minimumStock: 5,
    categoryId: categories.Office,
  });
  await product('formula', {
    name: '=HYPERLINK("http://evil.test","Click")',
    sku: 'FORMULA-1',
    price: '3.00',
    categoryId: categories.Packaging,
  });
  await product('archived', { name: 'Archived Gadget', sku: 'ARCH-1', price: '9.99' });
  await post(api, `${acme}/products/${products.archived}/archive`);

  const warehouses: Record<string, string> = {};
  for (const [key, name, code] of [
    ['main', 'Main Warehouse', 'MAIN'],
    ['east', 'East Depot', 'EAST'],
  ] as const) {
    warehouses[key] = (
      await post<{ warehouse: { id: string } }>(api, `${acme}/warehouses`, { name, code })
    ).warehouse.id;
  }
  const receive = (warehouseId: string, productId: string, quantity: number) =>
    post(api, `${acme}/inventory/receive`, {
      warehouseId,
      productId,
      quantity,
      reason: 'Opening stock',
    });
  await receive(warehouses.main, products.pen, 100);
  await receive(warehouses.east, products.pen, 10);
  await receive(warehouses.main, products.lamp, 6); // 6 → 5 after SO-1003: low (≤ 5)
  await receive(warehouses.main, products.formula, 5);
  // One unit of every other catalog item in EAST: enough stock items (28) to paginate reports.
  for (let n = 2; n <= 24; n += 1) {
    await receive(warehouses.east, products[`item${String(n).padStart(2, '0')}`]!, 1);
  }
  await receive(warehouses.main, products.item01, 4);
  await post(api, `${acme}/inventory/issue`, {
    warehouseId: warehouses.main,
    productId: products.item01,
    quantity: 4,
    reason: 'Sold out',
  });

  const customers: Record<string, string> = {};
  for (const [key, body] of [
    [
      'riverside',
      { name: 'Riverside Dental', companyName: 'Riverside', email: 'office@riverside.example' },
    ],
    ['northwind', { name: 'Northwind Cafe', companyName: 'Northwind' }],
    ['formula', { name: "=cmd|' /C calc'!A0", companyName: '@SUM(1+1)' }],
    ['archivable', { name: 'Archivable Customer' }],
  ] as const) {
    customers[key] = (
      await post<{ customer: { id: string } }>(api, `${acme}/customers`, body)
    ).customer.id;
  }

  const orders: Record<string, { id: string; number: string }> = {};
  const order = async (
    key: string,
    customerId: string,
    items: { productId: string; quantity: number }[],
    steps: string[],
    createdAt: string,
  ) => {
    const created = await post<{ order: { id: string; orderNumber: string } }>(
      api,
      `${acme}/orders`,
      {
        customerId,
        warehouseId: warehouses.main,
        items,
      },
    );
    for (const step of steps) await post(api, `${acme}/orders/${created.order.id}/${step}`);
    await sql('UPDATE orders SET created_at = $1, updated_at = $1 WHERE id = $2', [
      createdAt,
      created.order.id,
    ]);
    orders[key] = { id: created.order.id, number: created.order.orderNumber };
  };
  const done = ['confirm', 'process', 'ship', 'complete'];
  await order(
    'o1',
    customers.riverside,
    [{ productId: products.pen, quantity: 2 }],
    done,
    '2026-03-01T09:59:00Z',
  );
  await order(
    'o2',
    customers.northwind,
    [{ productId: products.pen, quantity: 3 }],
    done,
    '2026-03-01T23:30:00Z',
  );
  await order(
    'o3',
    customers.riverside,
    [{ productId: products.lamp, quantity: 1 }],
    done,
    '2026-03-02T00:15:00Z',
  );
  await order(
    'o4',
    customers.northwind,
    [{ productId: products.pen, quantity: 5 }],
    ['confirm'],
    '2026-03-02T08:00:00Z',
  );
  await order(
    'o5',
    customers.formula,
    [{ productId: products.formula, quantity: 1 }],
    ['confirm', 'process', 'ship'],
    '2026-03-15T12:00:00Z',
  );

  // Beta: data that must never appear in Acme.
  const betaWarehouse = (
    await post<{ warehouse: { id: string } }>(api, `${beta}/warehouses`, {
      name: 'Beta Store',
      code: 'BETA',
    })
  ).warehouse.id;
  const betaProduct = (
    await post<{ product: { id: string } }>(api, `${beta}/products`, {
      name: 'Beta Secret Widget',
      sku: 'BETA-1',
      price: '7.00',
      cost: '1.00',
      minimumStock: 0,
    })
  ).product.id;
  const betaCustomer = (
    await post<{ customer: { id: string } }>(api, `${beta}/customers`, {
      name: 'Beta Only Customer',
    })
  ).customer.id;

  const data: SeedData = {
    ...base,
    products,
    categories,
    warehouses,
    customers,
    orders,
    betaIds: { product: betaProduct, customer: betaCustomer, warehouse: betaWarehouse },
  };
  writeFileSync(SEED_FILE, JSON.stringify(data, null, 2));
  await api.dispose();
  await closeDb();
});
