import type { Page } from '@playwright/test';
import { USERS } from '../support/config.js';
import { sql } from '../support/db.js';
import { expect, horizontalOverflow, orgPath, test } from '../support/fixtures.js';

/** The TR | EN switch (top bar, or the sign-in pages). */
const language = (page: Page, name: 'English' | 'Türkçe') =>
  page.getByRole('radiogroup', { name: /^(Language|Dil)$/ }).getByRole('radio', { name });

test.describe('interface language', () => {
  // Signed-in choices are saved for the user: never leave Turkish behind for other specs.
  test.afterEach(async () => {
    await sql('UPDATE users SET language = NULL WHERE email = $1', [USERS.other.email]);
  });

  test('guests: English by default, Turkish at once, kept on this device across reloads', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /^Sign in to / })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(language(page, 'English')).toHaveAttribute('aria-checked', 'true');

    // Typed input survives the switch (no reload, no remount).
    await page.getByLabel('Email').fill('someone@example.test');
    await language(page, 'Türkçe').click();
    await expect(page.getByRole('heading', { name: /hesabınıza giriş yapın$/ })).toBeVisible();
    await expect(page.getByLabel('E-posta')).toHaveValue('someone@example.test');
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr');

    // Client-side validation speaks Turkish too.
    await page.getByLabel('E-posta').fill('');
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
    await expect(page.getByText('E-posta adresinizi girin.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /hesabınıza giriş yapın$/ })).toBeVisible();
    await page.getByRole('link', { name: 'Hesap oluşturun' }).click();
    await expect(page.getByRole('heading', { name: 'Hesabınızı oluşturun' })).toBeVisible();
    // Only the language code is stored; nothing else.
    expect(await page.evaluate(() => localStorage.getItem('app:language'))).toBe('tr');

    await language(page, 'English').click();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  });

  test('signed in: switches in place, keeps the route and filters, and is saved for the user', async ({
    pageAs,
    data,
  }) => {
    const page = await pageAs('other');
    await page.goto(orgPath(data.beta, '/products?search=Widget'));
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();

    await language(page, 'Türkçe').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ürünler' })).toBeVisible();
    await expect(page).toHaveURL(/\/products\?search=Widget$/);
    await expect(page.getByRole('searchbox', { name: 'Ürün ara' })).toHaveValue('Widget');
    await expect(page.getByRole('navigation', { name: 'Çalışma alanı' })).toBeVisible();
    await expect
      .poll(
        async () =>
          (await sql('SELECT language FROM users WHERE email = $1', [USERS.other.email]))[0]
            ?.language,
      )
      .toBe('tr');

    // The saved language follows the user to another browser (fresh device storage).
    const elsewhere = await pageAs('other');
    await elsewhere.goto(orgPath(data.beta));
    await expect(elsewhere.getByRole('heading', { level: 1, name: 'Genel bakış' })).toBeVisible();
    // Dates, numbers, and money use the Turkish locale.
    await expect(elsewhere.getByText(/ile karşılaştırıldı/)).toBeVisible();

    await language(page, 'English').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  });

  test('Turkish layout holds at phone, tablet, and desktop widths', async ({ pageAs, data }) => {
    const page = await pageAs('other');
    await page.goto(orgPath(data.beta, '/orders'));
    await language(page, 'Türkçe').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Siparişler' })).toBeVisible();
    for (const width of [375, 820, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['', '/orders', '/products/new', '/reports/sales']) {
        await page.goto(orgPath(data.beta, path));
        await expect(page.locator('h1')).toBeVisible();
        expect(await horizontalOverflow(page), `${width}px ${path || '/'}`).toBeLessThanOrEqual(0);
      }
    }
  });
});
