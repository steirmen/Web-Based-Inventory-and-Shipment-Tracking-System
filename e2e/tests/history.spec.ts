import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

/**
 * History is not recalculated from current data: order lines keep their
 * name/SKU/price snapshots, and stock movements are immutable rows.
 */
test('orders and movements stay as they were after products, customers, and warehouses change', async ({
  pageAs,
  apiAs,
  data,
}) => {
  const api = await apiAs('owner');
  const base = `/organizations/${data.acme}`;
  const post = async <T>(path: string, body?: object) =>
    (await (await api.post(`${base}${path}`, body ? { data: body } : {})).json()) as T;

  const warehouse = (
    await post<{ warehouse: { id: string } }>('/warehouses', {
      name: 'History Depot',
      code: 'HIST',
    })
  ).warehouse.id;
  const product = (
    await post<{ product: { id: string } }>('/products', {
      name: 'History Widget',
      sku: 'HIST-1',
      price: '10.00',
      cost: '4.00',
      minimumStock: 0,
    })
  ).product.id;
  const customer = (
    await post<{ customer: { id: string } }>('/customers', { name: 'History Customer' })
  ).customer.id;
  await post('/inventory/receive', { warehouseId: warehouse, productId: product, quantity: 10 });
  const order = (
    await post<{ order: { id: string } }>('/orders', {
      customerId: customer,
      warehouseId: warehouse,
      items: [{ productId: product, quantity: 2 }],
    })
  ).order.id;
  for (const step of ['confirm', 'process', 'ship', 'complete'])
    await post(`/orders/${order}/${step}`);
  await post('/inventory/issue', { warehouseId: warehouse, productId: product, quantity: 8 }); // empty it

  const movementsBefore = await sql(
    'SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at, id',
    [product],
  );
  const orderBefore = await sql('SELECT total, subtotal, status FROM orders WHERE id = $1', [
    order,
  ]);

  // Everything around the order changes afterwards.
  await api.patch(`${base}/products/${product}`, {
    data: { name: 'History Widget v2', sku: 'HIST-2', price: '99.00' },
  });
  await api.patch(`${base}/customers/${customer}`, { data: { name: 'History Customer Renamed' } });
  await api.patch(`${base}/warehouses/${warehouse}`, { data: { name: 'History Depot (old)' } });
  expect((await api.post(`${base}/products/${product}/archive`)).ok()).toBe(true);
  expect((await api.post(`${base}/warehouses/${warehouse}/archive`)).ok()).toBe(true);

  const page = await pageAs('owner');
  await page.goto(orgPath(data.acme, `/orders/${order}`));
  const lines = page.getByRole('table');
  await expect(lines).toContainText('History Widget'); // the name it was sold under
  await expect(lines).toContainText('HIST-1');
  await expect(lines).not.toContainText('History Widget v2');
  await expect(lines).toContainText('10.00');
  await expect(lines).not.toContainText('99.00');
  await expect(page.getByText('20.00').first()).toBeVisible();
  // The customer link follows the customer (current name); the amounts don't.
  await expect(page.getByRole('link', { name: /History Customer Renamed/ })).toBeVisible();

  expect(await sql('SELECT total, subtotal, status FROM orders WHERE id = $1', [order])).toEqual(
    orderBefore,
  );
  expect(
    await sql('SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at, id', [
      product,
    ]),
  ).toEqual(movementsBefore);

  // The archived product and warehouse keep their readable history.
  await page.goto(orgPath(data.acme, `/stock-movements?productId=${product}`));
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3); // purchase, sale, issue
});
