import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  json,
  mockApi,
  noOrganizations,
  organizationDetail,
  pending,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

async function openOnboarding(handlers: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({
    'GET /auth/me': signedIn(),
    'GET /organizations': noOrganizations,
    ...handlers,
  });
  const app = renderApp('/onboarding');
  await screen.findByRole('heading', { name: 'Create your workspace' });
  return { ...app, fetchMock };
}

const postBodies = (fetchMock: Awaited<ReturnType<typeof openOnboarding>>['fetchMock']) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)));

describe('OnboardingPage', () => {
  it('suggests a slug from the name until the slug is edited', async () => {
    const { user } = await openOnboarding();

    await user.type(screen.getByLabelText('Organization name'), 'Şirin Café & Co');
    expect(screen.getByLabelText('Organization slug')).toHaveValue('sirin-cafe-co');

    await user.clear(screen.getByLabelText('Organization slug'));
    await user.type(screen.getByLabelText('Organization slug'), 'custom');
    await user.type(screen.getByLabelText('Organization name'), ' Ltd');
    expect(screen.getByLabelText('Organization slug')).toHaveValue('custom');
  });

  it('validates before submitting', async () => {
    const { user, fetchMock } = await openOnboarding();

    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(screen.getByText('Enter a workspace name.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Organization name'), 'Acme');
    await user.clear(screen.getByLabelText('Organization slug'));
    await user.type(screen.getByLabelText('Organization slug'), 'Bad Slug');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(
      screen.getByText('Use lowercase letters, numbers, and single hyphens.'),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toHaveLength(0);
  });

  it('shows a duplicate slug on the slug field', async () => {
    const { user } = await openOnboarding({
      'POST /organizations': apiError(409, 'ORGANIZATION_SLUG_TAKEN', 'Taken'),
    });

    await user.type(screen.getByLabelText('Organization name'), 'Demo Trading');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByText('This slug is already taken. Try another one.')).toBeVisible();
    expect(screen.getByLabelText('Organization slug')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a loading state, then a server error', async () => {
    const { user } = await openOnboarding({ 'POST /organizations': pending() });

    await user.type(screen.getByLabelText('Organization name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(screen.getByRole('button', { name: 'Creating workspace…' })).toBeDisabled();
  });

  it('shows a server failure message', async () => {
    const { user } = await openOnboarding({
      'POST /organizations': apiError(500, 'INTERNAL_ERROR'),
    });

    await user.type(screen.getByLabelText('Organization name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.');
  });

  it('creates the workspace and opens it', async () => {
    const { user, router, fetchMock } = await openOnboarding({
      'POST /organizations': json(201, {
        organization: testOrganization,
        membership: { role: 'OWNER' },
      }),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail('OWNER'),
    });

    await user.type(screen.getByLabelText('Organization name'), '  Demo Trading Co.');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/org/${testOrganization.id}`));
    expect(await screen.findByRole('heading', { name: testOrganization.name })).toBeVisible();
    expect(postBodies(fetchMock)).toEqual([{ name: 'Demo Trading Co.', slug: 'demo-trading-co' }]);
  });
});
