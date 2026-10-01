import type { APIRequestContext, Page } from '@playwright/test';
import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

const stockOf = async (warehouseId: string, productId: string) =>
  Number(
    (
      await sql<{ quantity: number }>(
        'SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2',
        [warehouseId, productId],
      )
    )[0]?.quantity ?? 0,
  );
const salesOf = (orderId: string) =>
  sql<{ product_id: string; quantity_delta: number }>(
    `SELECT product_id, quantity_delta FROM stock_movements
     WHERE reference_type = 'ORDER' AND reference_id = $1 AND movement_type = 'SALE'`,
    [orderId],
  );

/** Runs a lifecycle action from the order page through its confirmation dialog. */
async function act(page: Page, button: string, dialogTitle: string, confirm = button) {
  await page.getByRole('button', { name: button, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: dialogTitle });
  await dialog.getByRole('button', { name: confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function addProduct(page: Page, name: string, quantity: string) {
  await page.getByRole('searchbox', { name: 'Search products by name or SKU' }).fill(name);
  const select = page.getByLabel('Add a product');
  await expect(select.locator('option', { hasText: name })).toHaveCount(1);
  await select.selectOption(
    (await select.locator('option', { hasText: name }).getAttribute('value'))!,
  );
  await page.getByRole('button', { name: 'Add to order' }).click();
  await page.getByLabel(`Quantity of ${name}`).fill(quantity);
}

/** A confirmed order created through the API. */
async function confirmedOrder(api: APIRequestContext, base: string, body: object) {
  const created = (await (await api.post(`${base}/orders`, { data: body })).json()) as {
    order: { id: string; orderNumber: string };
  };
  await api.post(`${base}/orders/${created.order.id}/confirm`);
  return created.order;
}

test.describe('orders', () => {
  test('full lifecycle in the UI: draft → edit → confirm → process (stock) → ship → complete', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const { main } = data.warehouses;
    const { pen, lamp } = data.products;
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/orders/new'));

    await page.getByRole('searchbox', { name: 'Customer' }).click();
    await page
      .getByRole('list', { name: 'Matching customers' })
      .getByRole('button', { name: /Riverside Dental/ })
      .click();
    await page.getByLabel('Warehouse').selectOption({ label: 'Main Warehouse (MAIN)' });
    await addProduct(page, 'Ballpoint Pen', '4');
    await addProduct(page, 'Desk Lamp', '1');
    await expect(page.getByLabel('Order total')).toContainText('55.90'); // 4 × 1.50 + 49.90
    await page.getByRole('button', { name: 'Create draft' }).click();

    await expect(page.getByText(/^Draft SO-\d+ created\.$/)).toBeVisible();
    const orderId = page.url().split('/').at(-1)!;
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Draft');

    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Quantity of Ballpoint Pen').fill('6');
    await expect(page.getByLabel('Order total')).toContainText('58.90');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible();

    await act(page, 'Confirm', 'Confirm order?');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Confirmed');
    expect(await salesOf(orderId)).toEqual([]); // confirming reserves nothing

    const before = { pen: await stockOf(main, pen), lamp: await stockOf(main, lamp) };
    await act(page, 'Process', 'Process order?', 'Process order');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Processing');
    expect({ pen: await stockOf(main, pen), lamp: await stockOf(main, lamp) }).toEqual({
      pen: before.pen - 6,
      lamp: before.lamp - 1,
    });
    const sales = await salesOf(orderId);
    expect(sales.map((s) => [s.product_id, s.quantity_delta]).sort()).toEqual(
      [
        [pen, -6],
        [lamp, -1],
      ].sort(),
    );
    const activity = await sql('SELECT 1 FROM activity_logs WHERE entity_id = $1 AND action = $2', [
      orderId,
      'ORDER_PROCESSING',
    ]);
    expect(activity).toHaveLength(1);

    await act(page, 'Mark as shipped', 'Mark as shipped?');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Shipped');
    await act(page, 'Complete', 'Complete order?');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Completed');
    for (const action of [
      'Edit',
      'Confirm',
      'Process',
      'Mark as shipped',
      'Complete',
      'Cancel order',
    ]) {
      await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0);
    }
    // Shipping and completing never touched stock again.
    expect(await stockOf(main, pen)).toBe(before.pen - 6);

    // Invalid transitions are refused by the API without side effects.
    const api = await apiAs('owner');
    const base = `/organizations/${data.acme}/orders/${orderId}`;
    const invalid: [string, number, string][] = [];
    for (const step of ['process', 'cancel', 'confirm', 'ship']) {
      const response = await api.post(`${base}/${step}`);
      invalid.push([step, response.status(), ((await response.json()) as { code: string }).code]);
    }
    expect(invalid).toEqual(
      ['process', 'cancel', 'confirm', 'ship'].map((step) => [
        step,
        409,
        'ORDER_INVALID_TRANSITION',
      ]),
    );
    expect(await salesOf(orderId)).toHaveLength(2);
  });

  test('cancel a draft and a confirmed order: stock never changes', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const api = await apiAs('owner');
    const base = `/organizations/${data.acme}`;
    const body = {
      customerId: data.customers.northwind,
      warehouseId: data.warehouses.main,
      items: [{ productId: data.products.pen, quantity: 2 }],
    };
    const draft = (
      (await (await api.post(`${base}/orders`, { data: body })).json()) as { order: { id: string } }
    ).order;
    const confirmed = await confirmedOrder(api, base, body);
    const stock = await stockOf(data.warehouses.main, data.products.pen);

    const page = await pageAs('owner');
    for (const order of [draft, confirmed]) {
      await page.goto(orgPath(data.acme, `/orders/${order.id}`));
      await act(page, 'Cancel order', 'Cancel order?');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Cancelled');
      expect(await salesOf(order.id)).toEqual([]);
    }
    expect(await stockOf(data.warehouses.main, data.products.pen)).toBe(stock);
  });

  test('insufficient stock: the order stays CONFIRMED, nothing is deducted, the reason is clear', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const api = await apiAs('owner');
    const base = `/organizations/${data.acme}`;
    const scarce = (
      (await (
        await api.post(`${base}/products`, {
          data: {
            name: 'Scarce Item',
            sku: 'SCARCE-1',
            price: '5.00',
            cost: '1.00',
            minimumStock: 0,
          },
        })
      ).json()) as { product: { id: string } }
    ).product.id;
    await api.post(`${base}/inventory/receive`, {
      data: { warehouseId: data.warehouses.main, productId: scarce, quantity: 2 },
    });
    const order = await confirmedOrder(api, base, {
      customerId: data.customers.riverside,
      warehouseId: data.warehouses.main,
      items: [{ productId: scarce, quantity: 5 }],
    });

    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, `/orders/${order.id}`));
    await page.getByRole('button', { name: 'Process', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Process order?' });
    await dialog.getByRole('button', { name: 'Process order' }).click();
    await expect(dialog.getByText('The order was not processed')).toBeVisible();
    await expect(dialog).toContainText('5 needed, 2 available');
    await expect(dialog).toContainText('Nothing was deducted');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Confirmed');
    expect(await stockOf(data.warehouses.main, scarce)).toBe(2);
    expect(await salesOf(order.id)).toEqual([]);
    const [{ status }] = await sql<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      order.id,
    ]);
    expect(status).toBe('CONFIRMED');
  });
});
