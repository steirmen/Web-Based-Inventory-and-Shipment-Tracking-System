import type { Page } from '@playwright/test';
import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

/*
 * Phase 10.1 in the Beta workspace (the STAFF member "other"), so Acme's counts
 * used by other specs stay untouched: the category combobox (search, create,
 * case-insensitive duplicates, tenant isolation) and product currencies with
 * the one-currency-per-order rule.
 */

const categoryField = (page: Page) => page.getByRole('combobox', { name: 'Category' });

async function addToOrder(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Search products by name or SKU' }).fill(name);
  const select = page.getByLabel('Add a product');
  const option = select.locator('option', { hasText: name });
  await expect(option).toHaveCount(1);
  await select.selectOption((await option.getAttribute('value'))!);
  await page.getByRole('button', { name: 'Add to order' }).click();
}

test.describe('category combobox', () => {
  test('searches this workspace only, creates a category once, and works with the keyboard', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('other');
    await page.goto(orgPath(data.beta, '/products/new'));
    await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible();

    // Acme has an "Office" category; Beta does not, so it is offered for creation only.
    await categoryField(page).fill('Office');
    const create = page.getByRole('option', { name: 'Create “Office”' });
    await expect(create).toBeVisible();
    await expect(page.getByRole('option', { name: 'Office', exact: true })).toHaveCount(0);
    await create.click();
    await expect(categoryField(page)).toHaveValue('Office');
    await expect(categoryField(page)).toHaveAttribute('aria-expanded', 'false');

    // Another letter case finds the existing category instead of offering a duplicate.
    await page.getByRole('button', { name: 'Clear category' }).click();
    await categoryField(page).fill('OFFICE');
    await expect(page.getByRole('option', { name: 'Office', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: /^Create/ })).toHaveCount(0);

    // Keyboard: ↓ moves, Enter chooses (without submitting the form), Escape restores.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(categoryField(page)).toHaveValue('Office');
    await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible();
    await categoryField(page).fill('Zzz');
    await expect(
      page
        .getByText('No categories match “Zzz”.')
        .or(page.getByRole('option', { name: 'Create “Zzz”' })),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(categoryField(page)).toHaveValue('Office');

    const rows = await sql<{ name: string; organization_id: string }>(
      `SELECT name, organization_id::text FROM categories WHERE lower(name) = 'office'`,
    );
    expect(rows.filter((row) => row.organization_id === data.beta)).toHaveLength(1);
    expect(rows.filter((row) => row.organization_id === data.acme)).toHaveLength(1);
  });
});

test.describe('currency', () => {
  test('a product priced in EUR, and an order that never mixes currencies', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const page = await pageAs('other');
    await page.goto(orgPath(data.beta, '/products/new'));
    await page.getByLabel('Name').fill('E2E Euro Chair');
    await page.getByLabel('SKU').fill('EUR-CHAIR');
    await page.getByRole('combobox', { name: 'Currency' }).selectOption('EUR');
    await page.getByLabel('Price').fill('249.00');
    await page.getByLabel('Cost').fill('120.50');
    await page.getByLabel('Minimum stock').fill('0');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Product created.')).toBeVisible();
    await expect(page.getByText('€249.00')).toBeVisible();
    await expect(page.getByText('€120.50')).toBeVisible();
    const [chair] = await sql<{ id: string; currency: string; price: string }>(
      `SELECT id::text, currency::text, price::text FROM products WHERE sku = 'EUR-CHAIR' AND organization_id = $1`,
      [data.beta],
    );
    expect(chair).toMatchObject({ currency: 'EUR', price: '249.00' });

    // The order builder: the first line sets the currency; a TRY product is refused.
    await page.goto(orgPath(data.beta, '/orders/new'));
    await page.getByRole('searchbox', { name: 'Customer' }).click();
    await page
      .getByRole('list', { name: 'Matching customers' })
      .getByRole('button', { name: /Beta Only Customer/ })
      .click();
    await page.getByLabel('Warehouse').selectOption({ label: 'Beta Store (BETA)' });
    await addToOrder(page, 'E2E Euro Chair');
    await expect(page.getByLabel('Order total')).toContainText('€249.00');
    await addToOrder(page, 'Beta Secret Widget');
    await expect(
      page.getByText(
        "Beta Secret Widget is priced in TRY, but this order is in EUR. An order can't mix currencies.",
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^SO-/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /E2E Euro Chair/ })).toContainText('€249.00');
    await expect(
      page.locator('dt', { hasText: 'Subtotal' }).locator('xpath=following-sibling::dd[1]'),
    ).toHaveText('€249.00');

    // The API refuses mixing too, and validates currency codes.
    const api = await apiAs('other');
    const base = `/organizations/${data.beta}`;
    const mixed = await api.post(`${base}/orders`, {
      data: {
        customerId: data.betaIds.customer,
        warehouseId: data.betaIds.warehouse,
        items: [
          { productId: chair!.id, quantity: 1 },
          { productId: data.betaIds.product, quantity: 1 },
        ],
      },
    });
    expect(mixed.status()).toBe(422);
    expect((await mixed.json()).code).toBe('ORDER_CURRENCY_MISMATCH');
    for (const currency of ['BTC', 'abc', '<script>']) {
      const invalid = await api.patch(`${base}/products/${chair!.id}`, { data: { currency } });
      expect(invalid.status(), currency).toBe(400);
    }
    const [draft] = await sql<{ currency: string }>(
      `SELECT o.currency::text FROM orders o JOIN order_items i ON i.order_id = o.id
       WHERE i.product_id = $1::uuid`,
      [chair!.id],
    );
    expect(draft).toEqual({ currency: 'EUR' });
  });
});
