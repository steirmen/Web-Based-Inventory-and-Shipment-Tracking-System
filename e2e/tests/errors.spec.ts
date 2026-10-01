import type { Page, Route } from '@playwright/test';
import { API_URL } from '../support/config.js';
import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

/**
 * Failure handling as a user sees it: real conflicts where the backend can
 * produce them, network interception (page.route) for outages and server
 * errors. Every failure must end in a readable message (never raw details),
 * a way forward, and no fake success.
 */

const apiPath = (pattern: string) => `${API_URL}${pattern}`;
const errorBody = (statusCode: number, code: string, message: string) => ({
  status: statusCode,
  contentType: 'application/json',
  body: JSON.stringify({ statusCode, code, message }),
});

test.describe('error recovery', () => {
  test('API unavailable: a readable error with retry, then recovery', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    const products = apiPath(`/organizations/${data.acme}/products?**`);
    await page.route(products, (route) => route.abort('connectionrefused'));
    await page.goto(orgPath(data.acme, '/products'));
    await expect(page.getByText("We couldn't load products")).toBeVisible();
    await expect(
      page.getByText("We couldn't reach the server. Check your connection and try again."),
    ).toBeVisible();

    await page.unroute(products);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('link', { name: 'Ballpoint Pen' }).first()).toBeVisible();
  });

  test('slow API: a loading state, never a permanent one', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    await page.route(apiPath(`/organizations/${data.acme}/customers?**`), async (route: Route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await page.goto(orgPath(data.acme, '/customers'));
    await expect(page.getByText('Loading customers')).toBeAttached();
    await expect(page.getByRole('link', { name: 'Riverside Dental' }).first()).toBeVisible();
    await expect(page.getByText('Loading customers')).toHaveCount(0);
  });

  test('500: a generic message (no internals) with retry', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    const summary = apiPath(`/organizations/${data.acme}/dashboard/summary?**`);
    await page.route(summary, (route) =>
      route.fulfill(
        errorBody(500, 'INTERNAL_ERROR', 'TypeError at dashboard.service.ts:42 SELECT * FROM'),
      ),
    );
    await page.goto(orgPath(data.acme));
    await expect(page.getByText("We couldn't load the dashboard")).toBeVisible();
    await expect(
      page.getByText('Something went wrong on our side. Please try again.'),
    ).toBeVisible();
    await expect(page.getByText(/TypeError|SELECT|dashboard\.service/)).toHaveCount(0);

    await page.unroute(summary);
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 3, name: 'Total sales' })).toBeVisible();
  });

  test('409: a real conflict (someone else moved the order on) is explained and the page catches up', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const api = await apiAs('owner');
    const base = `/organizations/${data.acme}`;
    const created = await api.post(`${base}/orders`, {
      data: {
        customerId: data.customers.riverside,
        warehouseId: data.warehouses.main,
        items: [{ productId: data.products.pen, quantity: 1 }],
      },
    });
    const order = ((await created.json()) as { order: { id: string; orderNumber: string } }).order;

    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, `/orders/${order.id}`));
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
    // Meanwhile, in another tab: the order is confirmed and cancelled.
    await api.post(`${base}/orders/${order.id}/confirm`);
    await api.post(`${base}/orders/${order.id}/cancel`);

    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Confirm order?' });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      `Order ${order.orderNumber} is cancelled and can't be confirmed.`,
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    // No fake success; the page shows the real state.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cancelled');
    await expect(page.getByText('Order confirmed.')).toHaveCount(0);
  });

  test('403: a role revoked while the page is open is refused and explained', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const [{ id: adminMember }] = await sql<{ id: string }>(
      `SELECT m.id FROM organization_members m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND u.email = 'admin@e2e.test'`,
      [data.acme],
    );
    const owner = await apiAs('owner');
    const page = await pageAs('admin');
    await page.goto(orgPath(data.acme, '/warehouses'));
    await page.getByRole('button', { name: 'Create warehouse' }).click();
    const dialog = page.getByRole('dialog', { name: 'New warehouse' });
    await dialog.getByLabel('Name').fill('Revoked Depot');
    await dialog.getByLabel('Code').fill('REVOKED');

    await owner.patch(`/organizations/${data.acme}/members/${adminMember}/role`, {
      data: { role: 'STAFF' },
    });
    try {
      await dialog.getByRole('button', { name: 'Create warehouse' }).click();
      await expect(
        page.getByText("You don't have permission to perform this action."),
      ).toBeVisible();
      await expect(page.getByText('Revoked Depot created.')).toHaveCount(0);
      expect(await sql("SELECT 1 FROM warehouses WHERE code = 'REVOKED'")).toHaveLength(0);
    } finally {
      await owner.patch(`/organizations/${data.acme}/members/${adminMember}/role`, {
        data: { role: 'ADMIN' },
      });
    }
  });

  test('404 and 422: missing objects and rejected input are explained, input is kept', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/orders/0198c0de-0000-7000-8000-00000000beef'));
    await expect(page.getByRole('heading', { level: 1, name: 'Order not found' })).toBeVisible();

    await page.route(apiPath(`/organizations/${data.acme}/products/*`), (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill(
            errorBody(
              422,
              'PRODUCT_CATEGORY_NOT_FOUND',
              'The selected category does not exist in this workspace.',
            ),
          )
        : route.continue(),
    );
    await page.goto(orgPath(data.acme, `/products/${data.products.lamp}/edit`));
    await page.getByLabel('Price').fill('55.55');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      page.getByText('This category no longer exists. Choose another one.'),
    ).toBeVisible();
    await expect(page.getByRole('alert').first()).toContainText(
      'Please check the highlighted fields.',
    );
    await expect(page.getByLabel('Price')).toHaveValue('55.55');
    await expect(page.getByText('Changes saved.')).toHaveCount(0);
    const [{ price }] = await sql<{ price: string }>(
      'SELECT price::text FROM products WHERE id = $1',
      [data.products.lamp],
    );
    expect(price).toBe('49.90');
  });
});

test.describe('duplicate submission', () => {
  /** Holds every matching request for `ms`, and counts them. */
  async function slowDown(page: Page, url: string, method: string, ms: number) {
    const seen = { count: 0 };
    await page.route(url, async (route) => {
      if (route.request().method() !== method) return route.continue();
      seen.count += 1;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return route.continue();
    });
    return seen;
  }

  test('a double click on "Create draft" sends one request and creates one order', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    const before = (
      await sql<{ n: string }>('SELECT count(*) AS n FROM orders WHERE organization_id = $1', [
        data.acme,
      ])
    )[0]!.n;
    const posts = await slowDown(
      page,
      apiPath(`/organizations/${data.acme}/orders`),
      'POST',
      1_200,
    );
    await page.goto(orgPath(data.acme, '/orders/new'));
    await page.getByRole('searchbox', { name: 'Customer' }).click();
    await page
      .getByRole('list', { name: 'Matching customers' })
      .getByRole('button', { name: /Northwind Cafe/ })
      .click();
    await page.getByLabel('Warehouse').selectOption({ label: 'Main Warehouse (MAIN)' });
    await page.getByRole('button', { name: 'Create draft' }).dblclick();
    await expect(page.getByText(/^Draft SO-\d+ created\.$/)).toBeVisible();
    expect(posts.count).toBe(1);
    const after = (
      await sql<{ n: string }>('SELECT count(*) AS n FROM orders WHERE organization_id = $1', [
        data.acme,
      ])
    )[0]!.n;
    expect(Number(after)).toBe(Number(before) + 1);
  });

  test('a double click on "Receive" records the receipt once (stock operations are not idempotent)', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    const quantity = async () =>
      Number(
        (
          await sql<{ quantity: number }>(
            'SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2',
            [data.warehouses.east, data.products.item02],
          )
        )[0]!.quantity,
      );
    const before = await quantity();
    const posts = await slowDown(
      page,
      apiPath(`/organizations/${data.acme}/inventory/receive`),
      'POST',
      1_200,
    );
    await page.goto(orgPath(data.acme, '/inventory?search=Catalog%20Item%2002'));
    await page.getByRole('button', { name: 'Receive Catalog Item 02 in EAST' }).click();
    const dialog = page.getByRole('dialog', { name: 'Receive stock' });
    await dialog.getByLabel('Quantity to receive').fill('3');
    await dialog.getByRole('button', { name: 'Receive', exact: true }).dblclick();
    await expect(page.getByText(/^Received 3 × Catalog Item 02 into EAST/)).toBeVisible();
    expect(posts.count).toBe(1);
    expect(await quantity()).toBe(before + 3);
  });
});
