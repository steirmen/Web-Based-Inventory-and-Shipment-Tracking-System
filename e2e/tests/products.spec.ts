import { expect, orgPath, test } from '../support/fixtures.js';

test.describe('products', () => {
  test('create (with validation), edit, archive, and restore a product', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/products/new'));
    await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible();

    // Client-side validation, next to each field.
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Enter a product name.')).toBeVisible();
    await expect(page.getByText('Enter a SKU.')).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');

    // Server-side validation: the SKU is taken in this workspace.
    await page.getByLabel('Name').fill('E2E Stapler');
    await page.getByLabel('SKU').fill('PEN-1');
    await page.getByRole('combobox', { name: 'Category' }).fill('Off');
    await page.getByRole('option', { name: 'Office', exact: true }).click();
    await page.getByLabel('Price').fill('12.40');
    await page.getByLabel('Cost').fill('5.10');
    await page.getByLabel('Minimum stock').fill('3');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByLabel('SKU')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Name')).toHaveValue('E2E Stapler'); // values are kept

    await page.getByLabel('SKU').fill('STAPLE-1');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E Stapler' })).toBeVisible();
    await expect(page.getByText('Product created.')).toBeVisible();
    await expect(page.getByText('12.40').first()).toBeVisible();

    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Price').fill('13.00');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    await expect(page.getByText('13.00').first()).toBeVisible();

    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Archive product?' });
    await expect(dialog).toContainText('E2E Stapler');
    await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Product archived.')).toBeVisible();
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByText('Product restored.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
  });

  test('search, filter, sort, and paginate on the server; state lives in the URL', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/products?sort=name:asc'));
    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pagination).toContainText(/Showing\s*1\s*–\s*20\s*of(?!d)/);
    await expect(pagination).toContainText('Page 1 of 2');
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2(?!d)/);
    await expect(pagination).toContainText('Page 2 of 2');

    await page.getByRole('searchbox', { name: 'Search products' }).fill('Catalog Item 1');
    await expect(page).toHaveURL(/search=Catalog(?!d)/);
    await expect(pagination).toContainText(/of\s*10(?!\d)/); // 10–19 ("01" is zero-padded)
    await expect(page.getByRole('link', { name: 'Catalog Item 10' }).first()).toBeVisible();

    await page.getByLabel('Category').selectOption({ label: 'Packaging' });
    await expect(pagination).toContainText(/of\s*5(?!\d)/); // 10, 12, 14, 16, 18
    await page.reload();
    await expect(page.getByLabel('Category')).toHaveValue(data.categories.Packaging);
    await expect(page.getByRole('searchbox', { name: 'Search products' })).toHaveValue(
      'Catalog Item 1',
    );

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await page.getByLabel('Status').selectOption({ label: 'Archived' });
    await expect(page.getByRole('link', { name: 'Archived Gadget' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ballpoint Pen' })).toHaveCount(0);

    // Another workspace's products never appear.
    await page.getByLabel('Status').selectOption({ label: 'All statuses' });
    await page.getByRole('searchbox', { name: 'Search products' }).fill('Beta Secret');
    await expect(page.getByText('No products match your filters.')).toBeVisible();
  });

  test('categories show their usage and lead to the filtered product list', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/categories'));
    const row = page.getByRole('row', { name: /Packaging/ });
    await expect(row).toBeVisible();
    await row.getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`category=${data.categories.Packaging}`));
    await expect(page.getByRole('link', { name: 'Catalog Item 02' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Catalog Item 01' })).toHaveCount(0);
  });
});
