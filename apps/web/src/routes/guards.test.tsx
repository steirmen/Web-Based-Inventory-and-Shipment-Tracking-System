import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authQueryKeys } from '@/api/auth';
import {
  apiError,
  mockApi,
  noContent,
  noOrganizations,
  organizationDetail,
  organizationList,
  organizationSummary,
  pending,
  signedIn,
  signedOut,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { signOutFromMenu } from '@/test/shell';

describe('protected routes', () => {
  it('redirects unauthenticated visitors to /login', async () => {
    mockApi({ 'GET /auth/me': signedOut });
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: /sign in to/i })).toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('lets signed-in users in', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary()]),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail('OWNER'),
    });
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    expect(document.title).toBe(`Overview · ${testOrganization.name} · Nexora`);
    expect(router.state.location.pathname).toBe(`/org/${testOrganization.id}`);
  });

  it('waits for the session check instead of redirecting early', async () => {
    mockApi({ 'GET /auth/me': pending() });
    const { router } = renderApp('/');

    expect(await screen.findByText('Checking your session')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('heading', { name: /sign in to/i })).not.toBeInTheDocument();
  });

  it('offers a retry instead of redirecting when the session check fails', async () => {
    mockApi({ 'GET /auth/me': apiError(500, 'INTERNAL_ERROR') });
    const { router } = renderApp('/');

    expect(await screen.findByText("We couldn't verify your session")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('guest-only routes', () => {
  it.each(['/login', '/register'])('redirects signed-in users away from %s', async (path) => {
    mockApi({ 'GET /auth/me': signedIn(), 'GET /organizations': noOrganizations });
    const { router } = renderApp(path);

    expect(await screen.findByRole('heading', { name: 'Create your workspace' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/onboarding');
  });

  it('does not show the login form while the session check is pending', async () => {
    mockApi({ 'GET /auth/me': pending() });
    const { router } = renderApp('/login');

    expect(await screen.findByText('Checking your session')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('logout', () => {
  it('clears the auth state and redirects to /login', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      'POST /auth/logout': noContent(),
    });
    const { user, router, queryClient } = renderApp('/onboarding');

    await signOutFromMenu(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: /sign in to/i })).toBeVisible();
    expect(queryClient.getQueryData(authQueryKeys.me)).toBeNull();
    // Organization data belonging to the previous user is dropped from the cache.
    expect(queryClient.getQueryData(['organizations', 'list'])).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('signs out from a public page as well', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      'GET /health': pending(),
      'POST /auth/logout': noContent(),
    });
    const { user, router } = renderApp('/health-check');

    await signOutFromMenu(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('treats a 401 from any request as signed out', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      'POST /auth/logout': apiError(401, 'AUTH_SESSION_EXPIRED', 'Expired'),
    });
    const { user, router, queryClient } = renderApp('/onboarding');

    await signOutFromMenu(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(queryClient.getQueryData(authQueryKeys.me)).toBeNull();
  });
});
