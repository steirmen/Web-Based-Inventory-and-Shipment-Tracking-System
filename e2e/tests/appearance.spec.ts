import type { Page } from '@playwright/test';
import { ORGS, PASSWORD, USERS } from '../support/config.js';
import { expect, orgPath, test } from '../support/fixtures.js';

const html = (page: Page) => page.locator('html');
const choose = (page: Page, group: string, option: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option }).click();

test.describe('appearance', () => {
  test('every setting previews, saves, survives a reload, and Cancel discards a preview', async ({
    pageAs,
  }) => {
    const page = await pageAs('styleA');
    await page.goto('/settings/appearance');
    await expect(page.getByRole('heading', { level: 1, name: 'Appearance' })).toBeVisible();

    await choose(page, 'Mode', 'Dark');
    await choose(page, 'Theme', 'Ocean theme');
    await choose(page, 'Background effect', 'Snow background');
    await choose(page, 'Density', 'Compact');
    await choose(page, 'Corners', 'Round');
    await choose(page, 'Text size', 'Large');
    // Previewed immediately, not saved yet.
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');
    await expect(html(page)).toHaveAttribute('data-theme', 'ocean');
    await expect(page.getByText('Unsaved changes — you are seeing a preview.')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1); // the one background-effect layer

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Appearance saved.')).toBeVisible();

    await page.reload();
    for (const [name, value] of [
      ['data-mode', 'dark'],
      ['data-theme', 'ocean'],
      ['data-density', 'compact'],
      ['data-radius', 'round'],
      ['data-font-scale', 'large'],
    ]) {
      await expect(html(page)).toHaveAttribute(name, value);
    }
    await expect(
      page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Ocean theme' }),
    ).toHaveAttribute('aria-checked', 'true');

    // Cancel returns to the saved look.
    await choose(page, 'Mode', 'Light');
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');
    await expect(page.getByText('All changes saved.')).toBeVisible();

    // A custom accent recolors the primary tokens.
    const primaryBefore = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary'),
    );
    await choose(page, 'Theme', 'Custom theme');
    await page.getByLabel('Hex value').fill('#e11d48');
    await expect(html(page)).toHaveAttribute('data-theme', 'custom');
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--primary'),
        ),
      )
      .not.toBe(primaryBefore);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Appearance saved.')).toBeVisible();
  });

  test('profiles: save, apply, rename, delete; then reset to default', async ({ pageAs }) => {
    const page = await pageAs('styleA');
    await page.goto('/settings/appearance');
    await expect(html(page)).toHaveAttribute('data-theme', 'custom');

    await page.getByLabel('Profile name').fill('Night shift');
    await page.getByRole('button', { name: 'Save current look' }).click();
    await expect(page.getByText('Saved “Night shift”.')).toBeVisible();

    await choose(page, 'Mode', 'Light');
    await choose(page, 'Theme', 'Forest theme');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(html(page)).toHaveAttribute('data-theme', 'forest');

    await page.getByRole('button', { name: 'Apply Night shift' }).click();
    await expect(page.getByText('Applied “Night shift”.')).toBeVisible();
    await expect(html(page)).toHaveAttribute('data-theme', 'custom');
    await expect(html(page)).toHaveAttribute('data-mode', 'dark');

    await page.getByRole('button', { name: 'Rename Night shift' }).click();
    const rename = page.getByRole('dialog', { name: 'Rename profile' });
    await rename.getByLabel('Name').fill('Night work');
    await rename.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByText('Renamed to “Night work”.')).toBeVisible();

    await page.getByRole('button', { name: 'Delete Night work' }).click();
    await page
      .getByRole('dialog', { name: 'Delete profile?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByText('Deleted “Night work”.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Apply Night/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect(page.getByText('Appearance reset to the default.')).toBeVisible();
    await expect(html(page)).toHaveAttribute('data-theme', 'default');
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
  });

  test('appearance is personal: same in every workspace, never leaks to the next user', async ({
    page,
    apiAs,
    data,
  }) => {
    // styleA saves a distinctive look.
    const api = await apiAs('styleA');
    const saved = await api.put('/me/appearance', {
      data: {
        mode: 'dark',
        theme: 'plum',
        customAccent: '#4f46e5',
        customTone: 'neutral',
        backgroundEffect: 'none',
        animationIntensity: 'medium',
        density: 'comfortable',
        radius: 'medium',
        fontScale: 'default',
      },
    });
    expect(saved.ok()).toBe(true);

    // Sign in as styleA in this browser through the form.
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.styleA.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    for (const organization of [data.acme, data.beta]) {
      await page.goto(orgPath(organization));
      await expect(page.getByRole('banner')).toContainText(
        organization === data.acme ? ORGS.acme.name : ORGS.beta.name,
      );
      await expect(html(page)).toHaveAttribute('data-theme', 'plum');
      await expect(html(page)).toHaveAttribute('data-mode', 'dark');
    }

    // Sign out and sign in as styleB in the same browser: styleB's (default) look, nothing of A's.
    await page.getByRole('button', { name: `Account: ${USERS.styleA.name}` }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(html(page)).not.toHaveAttribute('data-theme', 'plum');
    await page.getByLabel('Email').fill(USERS.styleB.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: `Account: ${USERS.styleB.name}` })).toBeVisible();
    await expect(html(page)).toHaveAttribute('data-theme', 'default');
    await expect(html(page)).toHaveAttribute('data-mode', 'light');
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'default');
  });
});
