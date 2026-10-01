import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  apiError,
  json,
  mockApi,
  noOrganizations,
  organizationDetail,
  organizationList,
  organizationSummary,
  pending,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const second = organizationSummary({
  id: '0198c0de-0000-7000-8000-00000000000b',
  name: 'Warehouse Labs',
  slug: 'warehouse-labs',
  role: 'STAFF',
  memberCount: 7,
});

afterEach(() => {
  window.localStorage.clear();
});

describe('home redirect (/)', () => {
  it('sends users without workspaces to onboarding', async () => {
    mockApi({ 'GET /auth/me': signedIn(), 'GET /organizations': noOrganizations });
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
  });

  it('opens the only workspace directly', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary()]),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail(),
    });
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe(`/org/${testOrganization.id}`));
  });

  it('shows the workspace list when there are several', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary(), second]),
    });
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizations'));
  });

  it('reopens the last workspace if it is still a membership, and ignores stale values', async () => {
    window.localStorage.setItem('app:lastOrganizationId', second.id);
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary(), second]),
      [`GET /organizations/${second.id}`]: json(200, {
        organization: { ...testOrganization, id: second.id, name: second.name },
        membership: { role: 'STAFF' },
      }),
    });
    const first = renderApp('/');
    await waitFor(() => expect(first.router.state.location.pathname).toBe(`/org/${second.id}`));
    first.router.dispose();
  });

  it('does not trust a remembered workspace the user no longer belongs to', async () => {
    window.localStorage.setItem('app:lastOrganizationId', 'someone-elses-org');
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary(), second]),
    });
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/organizations'));
  });
});

describe('/organizations', () => {
  it('lists workspaces with role and member count, and opens one', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary(), second]),
      [`GET /organizations/${second.id}`]: json(200, {
        organization: { ...testOrganization, id: second.id, name: second.name },
        membership: { role: 'STAFF' },
      }),
    });
    const { user, router } = renderApp('/organizations');

    const list = await screen.findByRole('list');
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText(testOrganization.name)).toBeInTheDocument();
    expect(within(cards[0]).getByText('Owner')).toBeInTheDocument();
    expect(within(cards[0]).getByText('3 members')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Staff')).toBeInTheDocument();
    expect(within(cards[1]).getByText('warehouse-labs')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open workspace Warehouse Labs' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/org/${second.id}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    expect(document.title).toBe(`Overview · ${'Warehouse Labs'} · Nexora`);
  });

  it('shows an error state with retry', async () => {
    mockApi({ 'GET /auth/me': signedIn(), 'GET /organizations': apiError(500, 'INTERNAL_ERROR') });
    renderApp('/organizations');

    expect(await screen.findByText("We couldn't load your workspaces")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });
});

describe('workspace switcher', () => {
  it('lists the user’s workspaces and navigates to the selected one', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([organizationSummary(), second]),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail(),
      [`GET /organizations/${second.id}`]: json(200, {
        organization: { ...testOrganization, id: second.id, name: second.name },
        membership: { role: 'STAFF' },
      }),
    });
    const { user, router } = renderApp(`/org/${testOrganization.id}`);
    const header = (await screen.findAllByRole('banner'))[0];

    await user.click(await within(header).findByRole('button', { name: testOrganization.name }));
    const menu = screen.getByRole('menu', { name: 'Switch workspace' });
    expect(within(menu).getByRole('menuitem', { name: /Demo Trading Co\./ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await user.click(within(menu).getByRole('menuitem', { name: /Warehouse Labs/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/org/${second.id}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    expect(document.title).toBe(`Overview · ${'Warehouse Labs'} · Nexora`);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('/org/:organizationId', () => {
  it('shows the overview (dashboard) of the workspace from the route', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([
        organizationSummary({ role: 'ADMIN', memberCount: 4 }),
      ]),
      [`GET /organizations/${testOrganization.id}`]: organizationDetail('ADMIN'),
    });
    renderApp(`/org/${testOrganization.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    expect(document.title).toBe(`Overview · ${testOrganization.name} · Nexora`);
    expect(await screen.findByRole('heading', { name: 'Total sales' })).toBeVisible();
    const tabs = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(tabs).getByRole('link', { name: 'Team' })).toHaveAttribute(
      'href',
      `/org/${testOrganization.id}/team`,
    );
  });

  it('shows "workspace not found" for a workspace the API refuses', async () => {
    const foreignId = '0198c0de-0000-7000-8000-0000000000ff';
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      [`GET /organizations/${foreignId}`]: apiError(404, 'ORGANIZATION_NOT_FOUND', 'Not found'),
    });
    renderApp(`/org/${foreignId}/team`);

    expect(await screen.findByRole('heading', { name: 'Workspace not found' })).toBeVisible();
    expect(screen.getByText("Workspace not found or you don't have access to it.")).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Team' })).not.toBeInTheDocument();
  });

  it('shows a loading state while the workspace loads', async () => {
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': noOrganizations,
      [`GET /organizations/${testOrganization.id}`]: pending(),
    });
    renderApp(`/org/${testOrganization.id}`);

    expect(await screen.findByText('Loading workspace')).toBeInTheDocument();
  });
});
