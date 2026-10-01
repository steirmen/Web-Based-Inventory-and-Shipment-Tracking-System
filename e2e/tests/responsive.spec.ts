import type { Locator, Page } from '@playwright/test';
import { expect, horizontalOverflow, orgPath, test } from '../support/fixtures.js';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 820, height: 1180 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];

const WORKSPACE_PAGES = [
  '',
  '/products',
  '/categories',
  '/inventory',
  '/warehouses',
  '/stock-movements',
  '/customers',
  '/orders',
  '/orders/new',
  '/reports/sales?range=THIS_YEAR',
  '/reports/orders?range=THIS_YEAR',
  '/reports/inventory',
  '/team',
  '/settings',
];

/** The element lies fully inside the viewport (horizontally, and vertically when asked). */
async function fits(page: Page, locator: Locator, vertical = false) {
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  if (vertical) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    test('no page scrolls sideways (guest, account, and workspace pages)', async ({
      page,
      pageAs,
      data,
    }) => {
      for (const path of ['/login', '/register']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(page), path).toBe(0);
      }
      const owner = await pageAs('owner');
      for (const path of ['/organizations', '/settings/appearance']) {
        await owner.goto(path);
        await expect(owner.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(owner), path).toBe(0);
      }
      for (const path of WORKSPACE_PAGES) {
        await owner.goto(orgPath(data.acme, path));
        await expect(owner.getByRole('heading', { level: 1 })).toBeVisible();
        await owner.waitForLoadState('networkidle');
        expect(await horizontalOverflow(owner), path || 'overview').toBe(0);
      }
    });

    test('actions stay reachable, dialogs fit, lists switch between table and cards', async ({
      pageAs,
      data,
    }) => {
      const page = await pageAs('owner');
      await page.goto(orgPath(data.acme, '/products?search=Ballpoint'));
      await fits(page, page.getByRole('link', { name: 'Add product' }));

      const table = page.locator('main table');
      const cards = page.getByRole('list', { name: 'Products' });
      if (viewport.width < 1024) {
        await expect(cards).toBeVisible();
        await expect(table).toBeHidden();
      } else {
        await expect(table).toBeVisible();
        await expect(cards).toBeHidden();
      }

      await page
        .getByRole('button', { name: 'Archive Ballpoint Pen' })
        .locator('visible=true')
        .click();
      const dialog = page.getByRole('dialog', { name: 'Archive product?' });
      await expect(dialog).toBeVisible();
      await fits(page, dialog, true);
      await fits(page, dialog.getByRole('button', { name: 'Archive', exact: true }), true);
      await dialog.getByRole('button', { name: 'Cancel' }).click();

      // The customer selector opens inside the screen and can be used.
      await page.goto(orgPath(data.acme, '/orders/new'));
      await page.getByRole('searchbox', { name: 'Customer' }).click();
      const results = page.getByRole('list', { name: 'Matching customers' });
      await expect(results).toBeVisible();
      await fits(page, results);
      await results.getByRole('button', { name: /Riverside Dental/ }).click();
      await expect(page.getByRole('button', { name: /^Change customer/ })).toBeVisible();
      await fits(page, page.getByRole('button', { name: 'Create draft' }));
    });
  });
}
