import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { authQueryKeys } from '@/api/auth';
import { apiError, json, mockApi, pending, signedOut, testUser } from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const PASSWORD = 'Correct-Horse-Battery-9';

async function openRegisterPage(handlers: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({ 'GET /auth/me': signedOut, ...handlers });
  const app = renderApp('/register');
  await screen.findByRole('heading', { name: 'Create your account' });
  return { ...app, fetchMock };
}

async function fillForm(
  user: ReturnType<typeof renderApp>['user'],
  overrides: Partial<Record<'name' | 'email' | 'password' | 'confirm', string>> = {},
) {
  const values = {
    name: testUser.name,
    email: testUser.email,
    password: PASSWORD,
    confirm: PASSWORD,
    ...overrides,
  };
  await user.type(screen.getByLabelText('Name'), values.name);
  await user.type(screen.getByLabelText('Email'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  await user.type(screen.getByLabelText('Confirm password'), values.confirm);
}

const submit = (user: ReturnType<typeof renderApp>['user']) =>
  user.click(screen.getByRole('button', { name: 'Create account' }));

describe('RegisterPage', () => {
  it('renders the registration form', async () => {
    await openRegisterPage();

    for (const label of ['Name', 'Email', 'Password', 'Confirm password']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('At least 12 characters.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('validates fields and password confirmation on the client', async () => {
    const { user, fetchMock } = await openRegisterPage();

    await fillForm(user, { name: '   ', password: 'short', confirm: 'different' });
    await submit(user);

    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /auth/me
  });

  it('requires the confirmation to match exactly', async () => {
    const { user } = await openRegisterPage();

    await fillForm(user, { confirm: `${PASSWORD} ` });
    await submit(user);

    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('shows a loading state while submitting', async () => {
    const { user } = await openRegisterPage({ 'POST /auth/register': pending() });

    await fillForm(user);
    await submit(user);

    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeDisabled();
  });

  it('shows server validation errors on the matching fields', async () => {
    const { user } = await openRegisterPage({
      'POST /auth/register': apiError(400, 'VALIDATION_ERROR', 'Invalid', [
        { field: 'email', messages: ['Enter a valid email address.'] },
      ]),
    });

    await fillForm(user, { email: 'user@localhost.test' });
    await submit(user);

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('flags a duplicate email', async () => {
    const { user } = await openRegisterPage({
      'POST /auth/register': apiError(409, 'AUTH_EMAIL_TAKEN', 'Taken'),
    });

    await fillForm(user);
    await submit(user);

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument();
  });

  it('shows a server failure message', async () => {
    const { user } = await openRegisterPage({
      'POST /auth/register': apiError(500, 'INTERNAL_ERROR'),
    });

    await fillForm(user);
    await submit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
  });

  it('registers, signs the user in, and enters the app', async () => {
    const { user, fetchMock, queryClient } = await openRegisterPage({
      'POST /auth/register': json(201, { user: testUser }),
    });

    await fillForm(user);
    await submit(user);

    expect(await screen.findByRole('heading', { name: `Welcome, ${testUser.name}` })).toBeVisible();
    expect(queryClient.getQueryData(authQueryKeys.me)).toEqual(testUser);
    const [, init] = fetchMock.mock.calls.find(([, call]) => call?.method === 'POST')!;
    // confirmPassword never leaves the browser.
    expect(JSON.parse(String(init?.body))).toEqual({
      name: testUser.name,
      email: testUser.email,
      password: PASSWORD,
    });
  });
});
