import type { Page } from '@playwright/test';
import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

const quantity = async (warehouseId: string, productId: string) =>
  Number(
    (
      await sql<{ quantity: number }>(
        'SELECT quantity FROM inventory WHERE warehouse_id = $1 AND product_id = $2',
        [warehouseId, productId],
      )
    )[0]?.quantity ?? 0,
  );

/** Opens a stock operation from the product's inventory row, fills it, and submits. */
async function operate(
  page: Page,
  action: 'Receive' | 'Issue' | 'Damage' | 'Adjust' | 'Transfer',
  fields: Record<string, string>,
  submit: string,
) {
  await page.getByRole('button', { name: `${action} Ledger Probe in MAIN` }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries(fields)) {
    const field = dialog.getByLabel(label, { exact: true });
    if ((await field.evaluate((element) => element.tagName)) === 'SELECT') {
      await field.selectOption({ label: value });
    } else {
      await field.fill(value);
    }
  }
  await dialog.getByRole('button', { name: submit, exact: true }).click();
  return dialog;
}

test.describe('warehouses and inventory', () => {
  test('create, edit, archive, and restore a warehouse', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/warehouses'));
    await page.getByRole('button', { name: 'Create warehouse' }).click();
    const dialog = page.getByRole('dialog', { name: 'New warehouse' });
    await dialog.getByLabel('Name').fill('North Hub');
    await dialog.getByLabel('Code').fill('NORTH');
    await dialog.getByRole('button', { name: 'Create warehouse' }).click();
    await expect(page.getByText('North Hub created.')).toBeVisible();

    await page.getByRole('button', { name: 'Edit North Hub' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit warehouse' });
    await expect(edit.getByLabel('Code')).toBeDisabled(); // codes are immutable
    await edit.getByLabel('Name').fill('North Hub 2');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Warehouse saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Archive North Hub 2' }).click();
    await page
      .getByRole('dialog', { name: 'Archive warehouse?' })
      .getByRole('button', { name: 'Archive', exact: true })
      .click();
    await expect(page.getByText('North Hub 2 archived.')).toBeVisible();
    await page.getByRole('button', { name: 'Restore North Hub 2' }).click();
    await expect(page.getByText('North Hub 2 restored.')).toBeVisible();
  });

  test('receive, issue, damage, adjust, and transfer through the UI; history and low stock follow', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const { main, east } = data.warehouses;
    const owner = await apiAs('owner');
    const created = await owner.post(`/organizations/${data.acme}/products`, {
      data: { name: 'Ledger Probe', sku: 'LEDGER-1', price: '4.00', cost: '1.00', minimumStock: 4 },
    });
    const productId = ((await created.json()) as { product: { id: string } }).product.id;
    await owner.post(`/organizations/${data.acme}/inventory/receive`, {
      data: { warehouseId: main, productId, quantity: 10 },
    });

    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/inventory?search=Ledger'));
    await expect(page.getByRole('button', { name: 'Receive Ledger Probe in MAIN' })).toBeVisible();

    await operate(page, 'Receive', { 'Quantity to receive': '5', Reason: 'Delivery' }, 'Receive');
    await expect(
      page.getByText('Received 5 × Ledger Probe into MAIN. New stock: 15.'),
    ).toBeVisible();
    expect(await quantity(main, productId)).toBe(15);

    await operate(page, 'Issue', { 'Quantity to remove': '3' }, 'Issue');
    await expect(page.getByText('Issued 3 × Ledger Probe from MAIN. Remaining: 12.')).toBeVisible();

    await operate(
      page,
      'Damage',
      { 'Quantity to write off': '2', Reason: 'Water damage' },
      'Write off',
    );
    await expect(
      page.getByText('Wrote off 2 × Ledger Probe from MAIN. Remaining: 10.'),
    ).toBeVisible();

    await operate(page, 'Adjust', { 'New quantity': '7', Reason: 'Cycle count' }, 'Save count');
    await expect(page.getByText(/Adjusted Ledger Probe in MAIN by .3 to 7\./)).toBeVisible();
    expect(await quantity(main, productId)).toBe(7);

    // Over-issuing is refused with an understandable message and changes nothing.
    const refused = await operate(page, 'Issue', { 'Quantity to remove': '99' }, 'Issue');
    await expect(refused.getByText('Only 7 units are available.')).toBeVisible();
    await refused.getByRole('button', { name: 'Cancel' }).click();
    expect(await quantity(main, productId)).toBe(7);
    // The UI check is a convenience; the server refuses on its own as well.
    const direct = await owner.post(`/organizations/${data.acme}/inventory/issue`, {
      data: { warehouseId: main, productId, quantity: 99 },
    });
    expect([direct.status(), ((await direct.json()) as { code: string }).code]).toEqual([
      409,
      'INVENTORY_INSUFFICIENT_STOCK',
    ]);
    expect(await quantity(main, productId)).toBe(7);

    // The ADMIN transfers (STAFF can't; see rbac.spec.ts).
    const admin = await pageAs('admin');
    await admin.goto(orgPath(data.acme, '/inventory?search=Ledger'));
    await operate(
      admin,
      'Transfer',
      { 'To warehouse': 'East Depot (EAST)', 'Quantity to transfer': '3' },
      'Transfer',
    );
    await expect(
      admin.getByText('Transferred 3 × Ledger Probe from MAIN (now 4) to EAST (now 3).'),
    ).toBeVisible();
    expect([await quantity(main, productId), await quantity(east, productId)]).toEqual([4, 3]);

    // 4 on hand with a reorder level of 4: low stock.
    await page.reload();
    const row = page.getByRole('row', { name: /Ledger Probe.*MAIN/ });
    await expect(row).toContainText('Low stock');

    // The movement history explains every step (newest first).
    await page.getByRole('link', { name: 'History of Ledger Probe in MAIN' }).click();
    await expect(page).toHaveURL(/stock-movements/);
    const rows = page.getByRole('table').getByRole('row');
    await expect(rows).toHaveCount(7); // header + 6 movements
    const types = await page.getByRole('table').locator('tbody tr td:nth-child(4)').allInnerTexts();
    // First line of each cell (a transfer also shows its transfer-group link).
    expect(types.map((type) => type.split('\n')[0]!.trim())).toEqual([
      'Transfer out',
      'Adjustment',
      'Damage',
      'Sale',
      'Purchase',
      'Purchase',
    ]);
  });
});
