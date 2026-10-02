import type { MemberRole } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { eastWarehouse, mainWarehouse } from '@/test/inventory-fixtures';
import { ORG_API, ORG_APP, renderCatalog } from '@/test/catalog-fixtures';
import { money } from '@/test/format';
import { json } from '@/test/mock-api';
import { confirmedOrder, orderPage, riverside, testOrder, toListItem } from '@/test/sales-fixtures';

const ORDERS_APP = `${ORG_APP}/orders`;
const ORDERS_API = `${ORG_API}/orders`;

async function openOrders(
  role: MemberRole,
  handlers: Parameters<typeof renderCatalog>[2] = {},
  path = ORDERS_APP,
) {
  return renderCatalog(
    path,
    role,
    {
      [`GET ${ORG_API}/warehouses`]: json(200, { warehouses: [mainWarehouse, eastWarehouse] }),
      [`GET ${ORDERS_API}`]: json(200, orderPage([testOrder(), confirmedOrder].map(toListItem))),
      ...handlers,
    },
    { waitForHeading: 'Orders' },
  );
}

const listRequests = (fetchMock: Awaited<ReturnType<typeof openOrders>>['fetchMock']) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === ORDERS_API)
    .map((url) => Object.fromEntries(url.searchParams));

describe('OrdersPage dates', () => {
  it('counts a dashboard link’s days in the dashboard’s time zone', async () => {
    const { fetchMock } = await openOrders(
      'OWNER',
      {},
      `${ORDERS_APP}?from=2026-09-30&to=2026-09-30&timeZone=Europe%2FIstanbul`,
    );
    await screen.findByRole('table');

    expect(listRequests(fetchMock)[0]).toMatchObject({
      from: '2026-09-30',
      to: '2026-09-30',
      timeZone: 'Europe/Istanbul',
    });
    expect(screen.getByText('Days in Europe/Istanbul.')).toBeVisible();
  });

  it('counts typed dates in the viewer’s time zone, and sends none without dates', async () => {
    const { fetchMock } = await openOrders('OWNER', {}, `${ORDERS_APP}?from=2026-09-01`);
    await screen.findByRole('table');
    const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(listRequests(fetchMock)[0]).toMatchObject({ from: '2026-09-01', timeZone: viewer });
    expect(screen.getByText(`Days in ${viewer}.`)).toBeVisible();
  });

  it('ignores a malformed time zone in the URL', async () => {
    const { fetchMock } = await openOrders(
      'OWNER',
      {},
      `${ORDERS_APP}?from=2026-09-01&timeZone=%2B03%3A00`,
    );
    await screen.findByRole('table');

    expect(listRequests(fetchMock)[0]!.timeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});

describe('OrdersPage', () => {
  it('lists orders with customer, warehouse, status text, lines, total, and date', async () => {
    await openOrders('STAFF');

    const table = await screen.findByRole('table');
    const [, draft, confirmed] = within(table).getAllByRole('row');
    expect(within(draft!).getByRole('link', { name: 'SO-1001' })).toHaveAttribute(
      'href',
      `${ORDERS_APP}/${testOrder().id}`,
    );
    expect(within(draft!).getByText('Riverside Dental')).toBeInTheDocument();
    expect(within(draft!).getByText('Draft')).toBeInTheDocument();
    expect(within(draft!).getByText(money('49.98'))).toBeInTheDocument();
    expect(within(confirmed!).getByText('Confirmed')).toBeInTheDocument();
    expect(within(confirmed!).getByText('EAST')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New order' })).toHaveAttribute(
      'href',
      `${ORDERS_APP}/new`,
    );
  });

  it('shows loading, error, and empty states', async () => {
    let answer: () => Response = () => new Response(null, { status: 500 });
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { user } = await openOrders('STAFF', {
      [`GET ${ORDERS_API}`]: async () => {
        await gate;
        return answer();
      },
    });

    expect(screen.getByText('Loading orders')).toBeInTheDocument();
    release();
    expect(await screen.findByText("We couldn't load orders")).toBeVisible();
    answer = () => Response.json(orderPage([]));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No orders yet')).toBeVisible();
  });

  it('sends filters to the server and keeps them in the URL', async () => {
    const { user, router, fetchMock } = await openOrders(
      'OWNER',
      {},
      `${ORDERS_APP}?status=CONFIRMED&page=2`,
    );
    await screen.findByRole('table');
    expect(listRequests(fetchMock)[0]).toEqual({
      status: 'CONFIRMED',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: '2',
      pageSize: '20',
    });

    await user.selectOptions(screen.getByLabelText('Warehouse'), 'East Depot');
    expect(router.state.location.search).toBe(`?status=CONFIRMED&warehouseId=${eastWarehouse.id}`);
    await user.selectOptions(screen.getByLabelText('Sort'), 'Total (high to low)');
    await user.type(screen.getByLabelText('Search'), 'SO-10');
    await waitFor(() =>
      expect(listRequests(fetchMock).at(-1)).toMatchObject({
        search: 'SO-10',
        status: 'CONFIRMED',
        warehouseId: eastWarehouse.id,
        sortBy: 'total',
        sortOrder: 'desc',
        page: '1',
      }),
    );
  });

  it('filters by customer from the URL, names the customer, and can remove the filter', async () => {
    const { user, router, fetchMock } = await openOrders(
      'STAFF',
      { [`GET ${ORG_API}/customers/${riverside.id}`]: json(200, { customer: riverside }) },
      `${ORDERS_APP}?customerId=${riverside.id}`,
    );

    expect(await screen.findByText(/Customer: Jamie Rivera/)).toBeVisible();
    expect(listRequests(fetchMock)[0]).toMatchObject({ customerId: riverside.id });
    await user.click(screen.getByRole('button', { name: 'Remove the customer filter' }));
    expect(router.state.location.search).toBe('');
  });

  it('shows the filtered empty state and does not send an inverted date range', async () => {
    const { fetchMock } = await openOrders(
      'STAFF',
      { [`GET ${ORDERS_API}`]: json(200, orderPage([])) },
      `${ORDERS_APP}?from=2026-09-10&to=2026-09-01`,
    );

    expect(await screen.findByText('No orders match your filters.')).toBeVisible();
    expect(screen.getByLabelText('Created to')).toHaveAccessibleDescription(
      'Must not be before “from”.',
    );
    expect(listRequests(fetchMock)[0]).not.toHaveProperty('to');
  });

  it('offers "New order" to STAFF', async () => {
    await openOrders('STAFF');
    expect(await screen.findByRole('link', { name: 'New order' })).toBeVisible();
  });
});
