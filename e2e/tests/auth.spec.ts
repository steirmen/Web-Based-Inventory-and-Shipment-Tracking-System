import { PASSWORD, USERS } from '../support/config.js';
import { expect, test } from '../support/fixtures.js';

/**
 * Authentication through the real UI and cookies. The session cookie is only
 * observed through browser behavior and its attributes — its value is never read.
 */

test.describe('authentication', () => {
  test('a protected page sends a guest to sign-in, and back after signing in', async ({ page }) => {
    await page.goto('/organizations');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: /sign in to/i })).toBeVisible();

    await page.getByLabel('Email').fill(USERS.login.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/organizations$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Your workspaces' })).toBeVisible();

    // The session lives in an HttpOnly, SameSite=Lax cookie that scripts cannot read.
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === 'app_session');
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('app_session');
    // Nothing auth-related is kept in web storage.
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).not.toMatch(/session|token|password/i);

    // A signed-in user is sent away from the guest pages.
    await page.goto('/login');
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto('/register');
    await expect(page).not.toHaveURL(/\/register$/);
  });

  test('a wrong password is refused with a generic message and no session', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.login.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password-123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).some((c) => c.name === 'app_session')).toBe(false);

    // An unknown account gets exactly the same answer.
    await page.getByLabel('Email').fill('nobody@e2e.test');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
  });

  test('registration validates input, then signs the new user in', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill('Nina New');
    await page.getByLabel('Email').fill('nina.new@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Long-enough-pass-1');
    await page.getByLabel('Confirm password').fill('Different-pass-1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);

    await page.getByLabel('Confirm password').fill('Long-enough-pass-1');
    await page.getByRole('button', { name: 'Create account' }).click();
    // No workspace yet: the new user is asked to create one.
    await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('signing out ends the session for good', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.login.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login$/);

    await page.getByRole('button', { name: `Account: ${USERS.login.name}` }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Back/forward and reloads don't bring the session back.
    await page.goto('/organizations');
    await expect(page).toHaveURL(/\/login$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: /sign in to/i })).toBeVisible();
  });
});
