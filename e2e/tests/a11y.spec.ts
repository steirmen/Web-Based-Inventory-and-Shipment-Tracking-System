import type { Page } from '@playwright/test';
import { expect, orgPath, test } from '../support/fixtures.js';

/** Interactive elements without an accessible name, and form controls without a label. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const named = (element: Element) =>
      Boolean(
        element.getAttribute('aria-label')?.trim() ||
        element.getAttribute('aria-labelledby') ||
        element.getAttribute('title')?.trim() ||
        (element as HTMLElement).innerText?.trim() ||
        ('labels' in element && (element as HTMLInputElement).labels?.length),
      );
    const visible = (element: Element) => (element as HTMLElement).offsetParent !== null;
    return [
      ...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea'),
    ]
      .filter((element) => visible(element) && !element.closest('[inert], [aria-hidden="true"]'))
      .filter((element) => !named(element))
      .map((element) => element.outerHTML.slice(0, 120));
  });
}

test.describe('accessibility', () => {
  test('every visible control has an accessible name, on the main pages', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    for (const path of [
      '',
      '/products',
      '/inventory',
      '/orders',
      '/orders/new',
      '/customers',
      '/reports/sales',
      '/team',
    ]) {
      await page.goto(orgPath(data.acme, path));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await unnamedControls(page), path || '/').toEqual([]);
    }
    await page.goto('/settings/appearance');
    await expect(page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible();
    expect(await unnamedControls(page)).toEqual([]);
  });

  test('keyboard: skip link, visible focus, menus with arrows and Escape', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/products'));
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible(); // it appears when focused
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    // Keyboard focus is visible (2px ring outline).
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline).toEqual({ style: 'solid', width: '2px' });

    // The account menu: Enter opens, arrows move, Escape closes and returns focus.
    const account = page.getByRole('button', { name: /^Account: / });
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Appearance' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Your workspaces' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(account).toBeFocused();
  });

  test('dialogs trap Tab, close with Escape, and give focus back', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, `/products/${data.products.pen}`));
    const archive = page.getByRole('button', { name: 'Archive', exact: true });
    await archive.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Archive product?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused(); // safe default
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
    }
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(archive).toBeFocused();
    await expect(page.getByText('Archived', { exact: true })).toHaveCount(0); // nothing happened
  });

  test('the customer selector works with the keyboard alone', async ({ pageAs, data }) => {
    const page = await pageAs('owner');
    await page.goto(orgPath(data.acme, '/orders/new'));
    const search = page.getByRole('searchbox', { name: 'Customer' });
    await search.focus();
    await page.keyboard.type('North');
    await expect(page.getByRole('list', { name: 'Matching customers' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: /Northwind Cafe/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: /^Change customer \(Northwind Cafe/ }),
    ).toBeVisible();
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('animations stop, background effects become a still image, everything still works', async ({
      pageAs,
    }) => {
      const page = await pageAs('styleA');
      await page.goto('/settings/appearance');
      await page
        .getByRole('radiogroup', { name: 'Background effect' })
        .getByRole('radio', { name: 'Snow background' })
        .click();
      await expect(
        page.getByText(
          /Your device asks for reduced motion, so background effects are shown as a still/,
        ),
      ).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(1);

      // Transitions and animations are effectively off (global reduced-motion rule).
      const durations = await page.evaluate(() => {
        const button = document.querySelector('main button')!;
        const style = getComputedStyle(button);
        return { transition: style.transitionDuration, animation: style.animationDuration };
      });
      expect(parseFloat(durations.transition)).toBeLessThan(0.001);

      // Interaction is unaffected: Cancel still discards the preview.
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByText('All changes saved.')).toBeVisible();
    });
  });
});
