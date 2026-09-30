import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authQueryKeys } from '@/api/auth';
import {
  apiError,
  json,
  mockApi,
  noOrganizations,
  pending,
  signedOut,
  testUser,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const PASSWORD = 'Correct-Horse-Battery-9';

async function openLoginPage(handlers: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({ 'GET /auth/me': signedOut, ...handlers });
  const app = renderApp('/login');
  await screen.findByRole('heading', { name: /sign in to/i });
  return { ...app, fetchMock };
}

async function fillAndSubmit(user: ReturnType<typeof renderApp>['user']) {
  await user.type(screen.getByLabelText('Email'), testUser.email);
  await user.type(screen.getByLabelText('Password'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('renders the sign-in form', async () => {
    await openLoginPage();

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register');
  });

  it('validates required fields before calling the API', async () => {
    const { user, fetchMock } = await openLoginPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial GET /auth/me
  });

  it('rejects a malformed email', async () => {
    const { user } = await openLoginPage();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('shows a loading state and prevents duplicate submissions', async () => {
    const { user, fetchMock } = await openLoginPage({ 'POST /auth/login': pending() });

    await fillAndSubmit(user);

    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('shows a generic message for invalid credentials', async () => {
    const { user } = await openLoginPage({
      'POST /auth/login': apiError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.'),
    });

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('shows a server failure message', async () => {
    const { user } = await openLoginPage({
      'POST /auth/login': apiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'),
    });

    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
  });

  it('signs in, updates the auth state, and enters the app', async () => {
    const { user, fetchMock, router, queryClient } = await openLoginPage({
      'POST /auth/login': json(200, { user: testUser }),
      'GET /organizations': noOrganizations,
    });

    await fillAndSubmit(user);

    // A new user without workspaces lands on onboarding.
    expect(await screen.findByRole('heading', { name: 'Create your workspace' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/onboarding');
    expect(queryClient.getQueryData(authQueryKeys.me)).toEqual(testUser);

    const [, init] = fetchMock.mock.calls.find(([, call]) => call?.method === 'POST')!;
    expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toEqual({ email: testUser.email, password: PASSWORD });
  });

  it('returns to the originally requested page after signing in', async () => {
    mockApi({
      'GET /auth/me': signedOut,
      'POST /auth/login': json(200, { user: testUser }),
      'GET /organizations': noOrganizations,
    });
    const { user, router } = renderApp('/organizations');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    await fillAndSubmit(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizations'));
  });
});
