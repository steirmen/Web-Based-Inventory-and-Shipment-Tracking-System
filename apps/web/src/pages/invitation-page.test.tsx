import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  signedIn,
  signedOut,
  testOrganization,
  testUser,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const TOKEN = 'k'.repeat(43);
const INVITE = `/invite/${TOKEN}`;

const invitation = (email = testUser.email) =>
  json(200, {
    invitation: {
      organization: { id: testOrganization.id, name: testOrganization.name },
      email,
      role: 'STAFF',
      expiresAt: '2026-10-08T08:00:00.000Z',
      status: 'PENDING',
    },
  });

describe('InvitationPage', () => {
  it('shows the invitation and asks visitors to sign in with the invited email', async () => {
    mockApi({ 'GET /auth/me': signedOut, [`GET /invitations/${TOKEN}`]: invitation() });
    renderApp(INVITE);

    expect(
      await screen.findByRole('heading', { name: `Join ${testOrganization.name}` }),
    ).toBeVisible();
    expect(screen.getByText(testUser.email)).toBeVisible();
    expect(screen.getByText('Staff')).toBeVisible();
    expect(screen.getByText('Please sign in with the invited email to accept.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
  });

  it('keeps the invitation through sign-in and returns to it afterwards', async () => {
    let signedInNow = false;
    mockApi({
      'GET /auth/me': () => (signedInNow ? signedIn()() : signedOut()),
      'POST /auth/login': () => {
        signedInNow = true;
        return json(200, { user: testUser })();
      },
      [`GET /invitations/${TOKEN}`]: invitation(),
    });
    const { user, router } = renderApp(INVITE);

    await user.click(await screen.findByRole('link', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    // The invited email is prefilled.
    expect(screen.getByLabelText('Email')).toHaveValue(testUser.email);
    await user.type(screen.getByLabelText('Password'), 'Correct-Horse-Battery-9');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(INVITE));
    expect(await screen.findByRole('button', { name: 'Accept invitation' })).toBeEnabled();
  });

  it('accepts the invitation and opens the workspace', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': signedIn(),
      [`GET /invitations/${TOKEN}`]: invitation(),
      [`POST /invitations/${TOKEN}/accept`]: json(200, {
        organization: {
          id: testOrganization.id,
          name: testOrganization.name,
          slug: testOrganization.slug,
        },
        membership: { role: 'STAFF' },
      }),
      'GET /organizations': organizationList([organizationSummary({ role: 'STAFF' })]),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail('STAFF'),
    });
    const { user, router } = renderApp(INVITE);

    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/org/${testOrganization.id}`));
    expect(
      await screen.findByText(`Invitation accepted. Welcome to ${testOrganization.name}!`),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.test/invitations/${TOKEN}/accept`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('explains an email mismatch instead of offering to accept', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      [`GET /invitations/${TOKEN}`]: invitation('someone.else@test.example'),
    });
    renderApp(INVITE);

    expect(
      await screen.findByText('This invitation was sent to another email address.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out and switch account' })).toBeEnabled();
  });

  it('shows a clear message for an expired invitation', async () => {
    mockApi({
      'GET /auth/me': signedOut,
      [`GET /invitations/${TOKEN}`]: apiError(
        410,
        'INVITATION_EXPIRED',
        'This invitation has expired. Ask for a new one.',
      ),
    });
    renderApp(INVITE);

    expect(
      await screen.findByRole('heading', { name: 'This invitation has expired' }),
    ).toBeVisible();
    expect(screen.getByText('This invitation has expired. Ask for a new one.')).toBeVisible();
  });
});
