import type { Organization } from '@app/shared';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { customerPage, orderPage, riverside, testOrder, toListItem } from '@/test/sales-fixtures';

/**
 * Customer and order caches are keyed by organization: switching workspaces
 * never shows workspace A's customers, orders, or search state in workspace B,
 * even while B is still loading.
 */

const orgB: Organization = {
  ...testOrganization,
  id: '0198c0de-0000-7000-8000-00000000000b',
  name: 'Beta Retail',
  slug: 'beta-retail',
};
const a = testOrganization.id;

function twoWorkspaces(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /auth/me': signedIn(),
    'GET /organizations': organizationList([
      organizationSummary({ role: 'OWNER' }),
      organizationSummary({ id: orgB.id, name: orgB.name, slug: orgB.slug, role: 'STAFF' }),
    ]),
    [`GET /organizations/${a}`]: organizationDetail('OWNER'),
    [`GET /organizations/${orgB.id}`]: organizationDetail('STAFF', orgB),
    ...extra,
  });
}

describe('customer & order caches when switching workspaces', () => {
  it("never shows workspace A's customers or its search in workspace B", async () => {
    let release = () => {};
    const holdB = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = twoWorkspaces({
      [`GET /organizations/${a}/customers`]: (_init, url) =>
        Response.json(customerPage(url.searchParams.get('search') ? [riverside] : [])),
      [`GET /organizations/${orgB.id}/customers`]: async () => {
        await holdB;
        return Response.json(customerPage([]));
      },
    });
    const { user, router } = renderApp(`/org/${a}/customers`);
    await user.type(await screen.findByRole('searchbox', { name: 'Search customers' }), 'river');
    expect(await screen.findAllByText('Jamie Rivera')).not.toHaveLength(0);

    await act(() => router.navigate(`/org/${orgB.id}/customers`));

    expect(await screen.findByText('Loading customers')).toBeInTheDocument();
    expect(screen.queryByText('Jamie Rivera')).not.toBeInTheDocument();
    release();
    expect(await screen.findByText('No customers yet')).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search customers' })).toHaveValue('');
    const toB = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === `/organizations/${orgB.id}/customers`);
    expect(toB.every((url) => !url.searchParams.has('search'))).toBe(true);
  });

  it("never shows workspace A's orders or an A order detail in workspace B", async () => {
    const orderA = testOrder();
    twoWorkspaces({
      [`GET /organizations/${a}/warehouses`]: json(200, { warehouses: [] }),
      [`GET /organizations/${orgB.id}/warehouses`]: json(200, { warehouses: [] }),
      [`GET /organizations/${a}/orders`]: json(200, orderPage([toListItem(orderA)])),
      [`GET /organizations/${orgB.id}/orders`]: json(200, orderPage([])),
      [`GET /organizations/${a}/orders/${orderA.id}`]: json(200, { order: orderA }),
      // The same order id in B's routes is B's "not found" (the API never returns A's order).
      [`GET /organizations/${orgB.id}/orders/${orderA.id}`]: json(404, {
        statusCode: 404,
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      }),
    });
    const { router } = renderApp(`/org/${a}/orders`);
    expect(await screen.findAllByText('SO-1001')).not.toHaveLength(0);

    await act(() => router.navigate(`/org/${orgB.id}/orders`));
    expect(await screen.findByText('No orders yet')).toBeVisible();
    expect(screen.queryByText('SO-1001')).not.toBeInTheDocument();

    await act(() => router.navigate(`/org/${a}/orders/${orderA.id}`));
    expect(await screen.findByRole('heading', { name: /SO-1001/ })).toBeVisible();
    await act(() => router.navigate(`/org/${orgB.id}/orders/${orderA.id}`));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Order not found' })).toBeVisible(),
    );
    expect(screen.queryByText('Keyboard K2')).not.toBeInTheDocument();
  });
});
