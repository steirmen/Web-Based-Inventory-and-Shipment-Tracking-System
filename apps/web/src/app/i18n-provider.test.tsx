import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog, sentBodies } from '@/test/catalog-fixtures';
import { json, mockApi, signedIn, signedOut, testUser } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const switchTo = async (
  user: ReturnType<typeof renderApp>['user'],
  language: 'English' | 'Türkçe',
) => user.click(screen.getByRole('radio', { name: language }));

describe('interface language', () => {
  it('defaults to English on the sign-in page, without any saved preference', async () => {
    mockApi({ 'GET /auth/me': signedOut });
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: /^Sign in to / })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches a guest immediately, keeps typed input, and remembers it on this device only', async () => {
    const fetchMock = mockApi({ 'GET /auth/me': signedOut });
    const { user } = renderApp('/login');
    await screen.findByRole('heading', { name: /^Sign in to / });
    await user.type(screen.getByLabelText('Email'), 'ada@test.example');

    await switchTo(user, 'Türkçe');

    expect(screen.getByRole('heading', { name: /hesabınıza giriş yapın$/ })).toBeVisible();
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@test.example');
    expect(document.documentElement.lang).toBe('tr');
    expect(localStorage.getItem('app:language')).toBe('tr');
    // A guest has no account to save it to.
    expect(sentBodies(fetchMock, 'PATCH', '/me/preferences')).toEqual([]);
  });

  it('starts in the language last used on this device', async () => {
    localStorage.setItem('app:language', 'tr');
    mockApi({ 'GET /auth/me': signedOut });
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: /hesabınıza giriş yapın$/ })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Türkçe' })).toHaveAttribute('aria-checked', 'true');
  });

  it('ignores an unknown stored value', async () => {
    localStorage.setItem('app:language', 'de');
    mockApi({ 'GET /auth/me': signedOut });
    renderApp('/login');

    expect(await screen.findByRole('heading', { name: /^Sign in to / })).toBeVisible();
  });

  it('uses a signed-in user’s saved language over the device’s', async () => {
    localStorage.setItem('app:language', 'en');
    await renderCatalog(
      ORG_APP,
      'OWNER',
      { 'GET /auth/me': signedIn({ ...testUser, language: 'tr' }) },
      { waitForHeading: 'Genel bakış' },
    );

    expect(document.documentElement.lang).toBe('tr');
    await waitFor(() => expect(localStorage.getItem('app:language')).toBe('tr'));
  });

  it('switches a signed-in user in place and saves the choice for the user', async () => {
    const { user, fetchMock, router } = await renderCatalog(
      `${ORG_APP}/products?search=pen`,
      'STAFF',
      {
        [`GET ${ORG_API}/products`]: json(200, {
          items: [],
          pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
        }),
      },
      { waitForHeading: 'Products' },
    );

    await switchTo(user, 'Türkçe');

    expect(await screen.findByRole('heading', { level: 1, name: 'Ürünler' })).toBeVisible();
    // Same route, same filters: nothing was reloaded or reset.
    expect(router.state.location.pathname).toBe(`${ORG_APP}/products`);
    expect(router.state.location.search).toBe('?search=pen');
    await waitFor(() =>
      expect(sentBodies(fetchMock, 'PATCH', '/me/preferences')).toEqual([{ language: 'tr' }]),
    );

    await switchTo(user, 'English');
    expect(await screen.findByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
  });
});
