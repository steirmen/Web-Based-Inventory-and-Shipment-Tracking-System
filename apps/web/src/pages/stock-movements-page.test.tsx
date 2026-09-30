import type { Organization } from '@app/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog } from '@/test/catalog-fixtures';
import {
  eastWarehouse,
  inventoryPage,
  keyboard,
  keyboardInMain,
  mainWarehouse,
  movementPage,
  testMovement,
} from '@/test/inventory-fixtures';
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

const MOVEMENTS_APP = `${ORG_APP}/stock-movements`;
const MOVEMENTS_API = `${ORG_API}/stock-movements`;

const ledger = [
  testMovement(),
  testMovement({
    id: '0198c0de-0000-7000-8000-0000000000f2',
    movementType: 'SALE',
    quantityDelta: -10,
    quantityBefore: 50,
    quantityAfter: 40,
    reason: null,
  }),
  testMovement({
    id: '0198c0de-0000-7000-8000-0000000000f3',
    movementType: 'TRANSFER_OUT',
    quantityDelta: -20,
    quantityBefore: 40,
    quantityAfter: 20,
    reason: null,
    actor: null,
  }),
];

async function openMovements(path = MOVEMENTS_APP, respond = () => movementPage(ledger)) {
  return renderCatalog(
    path,
    'STAFF',
    {
      [`GET ${ORG_API}/warehouses`]: json(200, { warehouses: [mainWarehouse, eastWarehouse] }),
      [`GET ${ORG_API}/products`]: json(200, {
        items: [
          {
            ...keyboard,
            price: '10.00',
            cost: '5.00',
            minimumStock: 5,
            category: null,
            createdAt: '2026-09-01T08:00:00.000Z',
            updatedAt: '2026-09-01T08:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      }),
      [`GET ${MOVEMENTS_API}`]: () => Response.json(respond()),
    },
    { waitForHeading: 'Stock movements' },
  );
}

const movementRequests = (fetchMock: Awaited<ReturnType<typeof openMovements>>['fetchMock']) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === MOVEMENTS_API)
    .map((url) => Object.fromEntries(url.searchParams));

describe('StockMovementsPage', () => {
  it('shows a read-only ledger with readable types and signed changes', async () => {
    await openMovements();

    const table = await screen.findByRole('table');
    const [, purchase, sale, transfer] = within(table).getAllByRole('row');
    expect(within(purchase!).getByText('Purchase')).toBeInTheDocument();
    expect(within(purchase!).getByText('+50')).toBeInTheDocument();
    expect(within(purchase!).getByText('Supplier delivery')).toBeInTheDocument();
    expect(within(purchase!).getByText('Ada Example')).toBeInTheDocument();
    expect(within(sale!).getByText('Sale')).toBeInTheDocument();
    expect(within(sale!).getByText('−10')).toBeInTheDocument();
    expect(within(sale!).getByText('40')).toBeInTheDocument();
    expect(within(transfer!).getByText('Transfer out')).toBeInTheDocument();
    expect(within(transfer!).getByText('System')).toBeInTheDocument();
    expect(within(table).queryByRole('button')).not.toBeInTheDocument();
  });

  it('applies URL filters on the server (never in the browser)', async () => {
    const { fetchMock } = await openMovements(
      `${MOVEMENTS_APP}?warehouseId=${mainWarehouse.id}&movementType=DAMAGE&from=2026-09-01&to=2026-09-30&page=2`,
    );
    await screen.findByRole('table');

    expect(movementRequests(fetchMock)[0]).toEqual({
      warehouseId: mainWarehouse.id,
      movementType: 'DAMAGE',
      from: '2026-09-01',
      to: '2026-09-30',
      sortOrder: 'desc',
      page: '2',
      pageSize: '20',
    });
    expect(screen.getByLabelText('Warehouse')).toHaveValue(mainWarehouse.id);
    expect(screen.getByLabelText('Type')).toHaveValue('DAMAGE');
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
  });

  it('writes filter changes to the URL as history entries (back restores them)', async () => {
    const { user, router, fetchMock } = await openMovements(`${MOVEMENTS_APP}?page=3`);
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Type'), 'Damage');
    expect(router.state.location.search).toBe('?movementType=DAMAGE');
    await user.selectOptions(screen.getByLabelText('Product'), 'Keyboard K2 (KEY-002)');
    expect(router.state.location.search).toBe(`?productId=${keyboard.id}&movementType=DAMAGE`);

    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?movementType=DAMAGE');
    await waitFor(() => expect(screen.getByLabelText('Product')).toHaveValue(''));
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe('?page=3');
    await waitFor(() => expect(screen.getByLabelText('Type')).toHaveValue(''));
    // Each filter state was requested from the server once.
    expect(movementRequests(fetchMock).map((query) => query.movementType ?? '')).toEqual([
      '',
      'DAMAGE',
      'DAMAGE',
    ]);
  });

  it('does not send an inverted date range', async () => {
    const { fetchMock } = await openMovements(`${MOVEMENTS_APP}?from=2026-09-10&to=2026-09-01`);
    await screen.findByRole('table');

    expect(screen.getByLabelText('To')).toHaveAccessibleDescription('Must not be before “From”.');
    expect(movementRequests(fetchMock)[0]).not.toHaveProperty('to');
  });

  it('paginates on the server', async () => {
    const { user, router } = await openMovements(MOVEMENTS_APP, () =>
      movementPage(ledger, { totalItems: 45, totalPages: 3 }),
    );
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(router.state.location.search).toBe('?page=2');
  });

  it('links the two legs of a transfer and shows just that transfer on click', async () => {
    const transferGroupId = '0198c0de-0000-7000-8000-00000000abcd';
    const legs = [
      testMovement({
        id: '0198c0de-0000-7000-8000-0000000000f4',
        movementType: 'TRANSFER_IN',
        warehouse: { ...eastWarehouse },
        quantityDelta: 5,
        quantityBefore: 0,
        quantityAfter: 5,
        transferGroupId,
      }),
      testMovement({
        id: '0198c0de-0000-7000-8000-0000000000f5',
        movementType: 'TRANSFER_OUT',
        quantityDelta: -5,
        quantityBefore: 20,
        quantityAfter: 15,
        transferGroupId,
      }),
    ];
    const { user, router, fetchMock } = await openMovements(MOVEMENTS_APP, () =>
      movementPage([testMovement(), ...legs]),
    );
    const table = await screen.findByRole('table');

    const links = within(table).getAllByRole('link', {
      name: 'Show both movements of transfer #00ABCD',
    });
    expect(links).toHaveLength(2);
    expect(within(table).getAllByText('Transfer #00ABCD')).toHaveLength(2);

    await user.click(links[0]!);

    expect(router.state.location.search).toBe(`?transferGroupId=${transferGroupId}`);
    await waitFor(() =>
      expect(movementRequests(fetchMock).at(-1)).toMatchObject({ transferGroupId }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing the two movements of transfer #00ABCD',
    );
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(router.state.location.search).toBe('');
  });

  it('shows the empty state and clears filters', async () => {
    const { user, router } = await openMovements(`${MOVEMENTS_APP}?movementType=DAMAGE`, () =>
      movementPage([]),
    );

    expect(await screen.findByText('No movements match your filters.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(router.state.location.search).toBe('');
  });
});

describe('inventory caches when switching workspaces', () => {
  const orgB: Organization = {
    ...testOrganization,
    id: '0198c0de-0000-7000-8000-00000000000b',
    name: 'Beta Retail',
    slug: 'beta-retail',
  };

  it("never shows workspace A's stock, warehouses, or movements in workspace B", async () => {
    let release = () => {};
    const holdB = new Promise<void>((resolve) => (release = resolve));
    const a = testOrganization.id;
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([
        organizationSummary({ role: 'OWNER' }),
        organizationSummary({ id: orgB.id, name: orgB.name, slug: orgB.slug, role: 'STAFF' }),
      ]),
      [`GET /organizations/${a}`]: organizationDetail('OWNER'),
      [`GET /organizations/${orgB.id}`]: organizationDetail('STAFF', orgB),
      [`GET /organizations/${a}/warehouses`]: json(200, { warehouses: [mainWarehouse] }),
      [`GET /organizations/${orgB.id}/warehouses`]: json(200, { warehouses: [] }),
      [`GET /organizations/${a}/inventory`]: json(200, inventoryPage([keyboardInMain])),
      [`GET /organizations/${orgB.id}/inventory`]: async () => {
        await holdB;
        return Response.json(inventoryPage([]));
      },
      [`GET /organizations/${a}/stock-movements`]: json(200, movementPage(ledger)),
      [`GET /organizations/${orgB.id}/stock-movements`]: json(200, movementPage([])),
    });
    const { router } = renderApp(`/org/${a}/inventory`);
    expect(await screen.findAllByText('Keyboard K2')).not.toHaveLength(0);
    expect(screen.getByRole('option', { name: 'Main Warehouse' })).toBeInTheDocument();

    await act(() => router.navigate(`/org/${orgB.id}/inventory`));
    expect(await screen.findByText('Loading inventory')).toBeInTheDocument();
    expect(screen.queryByText('Keyboard K2')).not.toBeInTheDocument();
    release();
    expect(await screen.findByText('No stock recorded yet')).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Main Warehouse' })).not.toBeInTheDocument();
    // B's role is STAFF: no transfer.
    expect(screen.queryByRole('button', { name: 'Transfer' })).not.toBeInTheDocument();

    await act(() => router.navigate(`/org/${orgB.id}/stock-movements`));
    expect(await screen.findByText('No stock movements yet')).toBeVisible();
    expect(screen.queryByText('Supplier delivery')).not.toBeInTheDocument();
  });

  it("does not carry workspace A's inventory search into workspace B", async () => {
    const a = testOrganization.id;
    const mouseInA = { ...keyboardInMain, product: { ...keyboard, name: 'Wireless Mouse A' } };
    const fetchMock = mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([
        organizationSummary({ role: 'OWNER' }),
        organizationSummary({ id: orgB.id, name: orgB.name, slug: orgB.slug, role: 'OWNER' }),
      ]),
      [`GET /organizations/${a}`]: organizationDetail('OWNER'),
      [`GET /organizations/${orgB.id}`]: organizationDetail('OWNER', orgB),
      [`GET /organizations/${a}/warehouses`]: json(200, { warehouses: [mainWarehouse] }),
      [`GET /organizations/${orgB.id}/warehouses`]: json(200, { warehouses: [eastWarehouse] }),
      [`GET /organizations/${a}/inventory`]: (_init, url) =>
        Response.json(inventoryPage(url.searchParams.get('search') ? [mouseInA] : [])),
      [`GET /organizations/${orgB.id}/inventory`]: json(
        200,
        inventoryPage([{ ...keyboardInMain, id: '0198c0de-0000-7000-8000-0000000000e9' }]),
      ),
    });
    const { user, router } = renderApp(`/org/${a}/inventory`);
    await user.type(await screen.findByRole('searchbox', { name: 'Search inventory' }), 'mouse');
    expect(await screen.findAllByText('Wireless Mouse A')).not.toHaveLength(0);
    expect(router.state.location.search).toBe('?search=mouse');

    await act(() => router.navigate(`/org/${orgB.id}/inventory`));

    expect(await screen.findAllByText('Keyboard K2')).not.toHaveLength(0);
    expect(screen.queryByText('Wireless Mouse A')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search inventory' })).toHaveValue('');
    expect(router.state.location.search).toBe('');
    const requestsToB = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === `/organizations/${orgB.id}/inventory`);
    expect(requestsToB.length).toBeGreaterThan(0);
    expect(requestsToB.every((url) => !url.searchParams.has('search'))).toBe(true);
  });
});
