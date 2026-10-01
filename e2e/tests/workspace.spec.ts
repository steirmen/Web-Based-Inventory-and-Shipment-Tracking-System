import { ORGS } from '../support/config.js';
import { expect, orgPath, test } from '../support/fixtures.js';

test.describe('workspaces', () => {
  test('lists, opens, and switches workspaces: URL, header, and data always agree', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    await page.goto('/organizations');
    await expect(page.getByRole('heading', { level: 1, name: 'Your workspaces' })).toBeVisible();
    await expect(page.getByText(ORGS.acme.name, { exact: true })).toBeVisible();
    await expect(page.getByText(ORGS.beta.name, { exact: true })).toBeVisible();

    await page.goto(orgPath(data.acme, '/products'));
    const header = page.getByRole('banner');
    await expect(header.getByRole('button', { name: ORGS.acme.name })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ballpoint Pen' }).first()).toBeVisible();

    // Switch through the workspace menu.
    await header.getByRole('button', { name: ORGS.acme.name }).click();
    const menu = page.getByRole('menu', { name: 'Switch workspace' });
    await expect(menu.getByRole('menuitem', { name: new RegExp(ORGS.acme.name) })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu.getByRole('menuitem', { name: new RegExp(ORGS.beta.name) }).click();

    await expect(page).toHaveURL(new RegExp(`/org/${data.beta}$`));
    await expect(header.getByRole('button', { name: ORGS.beta.name })).toBeVisible();
    await expect(page).toHaveTitle(`Overview · ${ORGS.beta.name} · Nexora`);
    await page
      .getByRole('navigation', { name: 'Workspace' })
      .getByRole('link', { name: 'Products' })
      .click();
    await expect(page.getByRole('link', { name: 'Beta Secret Widget' }).first()).toBeVisible();
    await expect(page.getByText('Ballpoint Pen')).toHaveCount(0);
  });

  test('unknown and foreign workspaces look the same: not found', async ({ pageAs, data }) => {
    const owner = await pageAs('owner');
    await owner.goto(orgPath('0198c0de-0000-7000-8000-00000000dead'));
    await expect(owner.getByRole('heading', { name: 'Workspace not found' })).toBeVisible();

    // A Beta-only member can't open Acme, and gets the very same page.
    const other = await pageAs('other');
    await other.goto(orgPath(data.acme, '/products'));
    await expect(other.getByRole('heading', { name: 'Workspace not found' })).toBeVisible();
    await expect(other.getByText('Ballpoint Pen')).toHaveCount(0);

    // Objects of one workspace can't be opened through the other's URL.
    await owner.goto(orgPath(data.beta, `/products/${data.products.pen}`));
    await expect(owner.getByRole('heading', { level: 1, name: 'Product not found' })).toBeVisible();
    await owner.goto(orgPath(data.acme, `/customers/${data.betaIds.customer}`));
    await expect(
      owner.getByRole('heading', { level: 1, name: 'Customer not found' }),
    ).toBeVisible();
  });
});
