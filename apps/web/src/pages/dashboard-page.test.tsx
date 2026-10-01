import type { MemberRole, Organization } from '@app/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog } from '@/test/catalog-fixtures';
import { dashboardSummary, emptyDashboardSummary } from '@/test/dashboard-fixtures';
import {
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  pending,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';
import { orderPage, testOrder, toListItem } from '@/test/sales-fixtures';
import { formatCount } from '@/lib/dashboard-params';
import { formatMoney } from '@/lib/money';

const SUMMARY_API = `${ORG_API}/dashboard/summary`;
const ORDERS_API = `${ORG_API}/orders`;

async function openDashboard(
  options: {
    role?: MemberRole;
    summary?: Parameters<typeof mockApi>[0][string];
    orders?: Parameters<typeof mockApi>[0][string];
    path?: string;
    wait?: boolean;
  } = {},
) {
  const app = await renderCatalog(
    options.path ?? ORG_APP,
    options.role ?? 'OWNER',
    {
      [`GET ${SUMMARY_API}`]: options.summary ?? json(200, dashboardSummary()),
      [`GET ${ORDERS_API}`]: options.orders ?? json(200, orderPage([toListItem(testOrder())])),
    },
    { waitForHeading: 'Overview' },
  );
  if (options.wait !== false) await screen.findByRole('heading', { name: 'Total sales' });
  return app;
}

const summaryRequests = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === SUMMARY_API)
    .map((url) => Object.fromEntries(url.searchParams));

const kpiCard = (label: string) =>
  screen.getByRole('heading', { name: label, level: 3 }).closest('div.rounded-card') as HTMLElement;

describe('DashboardPage', () => {
  it('is the workspace overview: header, period, and every section', async () => {
    await openDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    expect(document.title).toBe(`Overview · ${testOrganization.name} · Nexora`);
    expect(screen.getByRole('combobox', { name: 'Date range' })).toHaveValue('LAST_30_DAYS');
    expect(screen.getByText(/compared with/)).toBeVisible();
    for (const title of [
      'Sales over time',
      'Orders by status',
      'Inventory',
      'Warehouses',
      'Top products',
      'Recent orders',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the KPI values from the API, formatted', async () => {
    await openDashboard();

    expect(within(kpiCard('Total sales')).getByText(formatMoney('200.50'))).toBeVisible();
    expect(within(kpiCard('Orders')).getByText('4')).toBeVisible();
    expect(within(kpiCard('Customers')).getByText('17')).toBeVisible();
    expect(within(kpiCard('Customers')).getByText(/3 new in this period/)).toBeVisible();
    expect(within(kpiCard('Products')).getByText('23')).toBeVisible();
    expect(within(kpiCard('Products')).getByText(/4 archived/)).toBeVisible();
    expect(within(kpiCard('Inventory units')).getByText(formatCount(4321))).toBeVisible();
    expect(within(kpiCard('Inventory units')).getByText('units')).toBeVisible();
    expect(within(kpiCard('Low stock')).getByText('7')).toBeVisible();
    expect(within(kpiCard('Low stock')).getByText('5 out of stock')).toBeVisible();
  });

  it('states changes neutrally, with text and not color alone', async () => {
    await openDashboard();

    const sales = kpiCard('Total sales');
    expect(within(sales).getByText('+100%')).toBeVisible();
    expect(within(sales).getByText(/Up 100% from the previous period/)).toBeInTheDocument();
    const orders = kpiCard('Orders');
    expect(within(orders).getByText('-50%')).toBeVisible();
    expect(within(orders).getByText(/Down 50% from the previous period/)).toBeInTheDocument();
    // Same muted styling whatever the direction: no "good/bad" colors.
    expect(sales.querySelector('.text-success, .text-danger')).toBeNull();
    expect(orders.querySelector('.text-success, .text-danger')).toBeNull();
  });

  it('says when there is nothing to compare with instead of a percentage', async () => {
    await openDashboard({
      summary: json(
        200,
        dashboardSummary({
          kpis: {
            sales: {
              current: '10.00',
              previous: '0.00',
              absoluteChange: '10.00',
              percentageChange: null,
            },
          },
        }),
      ),
    });

    expect(
      within(kpiCard('Total sales')).getByText('No activity in the previous period'),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('shows skeletons while loading, with the header and range picker usable', async () => {
    await openDashboard({ summary: pending(), wait: false });

    expect(screen.getByText('Loading the dashboard')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Date range' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Total sales' })).not.toBeInTheDocument();
  });

  it('shows a safe error with retry, never zeros', async () => {
    let fail = true;
    const { user } = await openDashboard({
      wait: false,
      summary: () =>
        fail
          ? Response.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' },
              { status: 500 },
            )
          : Response.json(dashboardSummary()),
    });

    expect(await screen.findByText("We couldn't load the dashboard")).toBeVisible();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Total sales' })).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Total sales' })).toBeVisible();
  });

  it('guides a new workspace with empty states instead of a broken dashboard', async () => {
    await openDashboard({
      summary: json(200, emptyDashboardSummary()),
      orders: json(200, orderPage([])),
    });

    expect(screen.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
    expect(screen.getByText('No sales data for this period.')).toBeVisible();
    expect(screen.getByText('No products sold in this period.')).toBeVisible();
    expect(screen.getByText('No stock recorded yet.')).toBeVisible();
    expect(screen.getByText('No active warehouses.')).toBeVisible();
    expect(await screen.findByText('No orders yet.')).toBeVisible();
    expect(screen.getByText('No orders were created in this period.')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Create order' })[0]).toHaveAttribute(
      'href',
      `${ORG_APP}/orders/new`,
    );
    expect(screen.getByRole('link', { name: 'Add product' })).toHaveAttribute(
      'href',
      `${ORG_APP}/products/new`,
    );
    expect(document.querySelectorAll('[data-testid="chart-bar"]')).toHaveLength(0);
  });

  it('hides create actions the role cannot use (UX only)', async () => {
    await openDashboard({
      role: 'STAFF',
      summary: json(200, emptyDashboardSummary()),
      orders: json(200, orderPage([])),
    });

    // STAFF may create orders and products, but not warehouses.
    expect(screen.queryByRole('link', { name: 'Add warehouse' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add product' })).toBeVisible();
  });
});

describe('dashboard date range', () => {
  it('requests the default range in the viewer time zone', async () => {
    const { fetchMock } = await openDashboard();

    const [request] = summaryRequests(fetchMock);
    expect(request).toEqual({
      range: 'LAST_30_DAYS',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it('switches presets through the URL and refetches', async () => {
    const { fetchMock, user, router } = await openDashboard();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'THIS_YEAR');

    await waitFor(() => expect(router.state.location.search).toBe('?range=THIS_YEAR'));
    await waitFor(() =>
      expect(summaryRequests(fetchMock).map((request) => request.range)).toContain('THIS_YEAR'),
    );
  });

  it('applies a custom range only when it is valid', async () => {
    const { fetchMock, user, router } = await openDashboard();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'CUSTOM');
    const form = screen.getByRole('form', { name: 'Custom date range' });
    // Prefilled with the period on screen.
    expect(within(form).getByLabelText('From')).toHaveValue('2025-09-01');
    expect(within(form).getByLabelText('To')).toHaveValue('2025-09-07');

    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2025-09-10' } });
    await user.click(within(form).getByRole('button', { name: 'Apply' }));
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'The end date must not be before the start date.',
    );
    expect(router.state.location.search).toBe('');

    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2025-09-02' } });
    await user.click(within(form).getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(router.state.location.search).toBe('?range=CUSTOM&from=2025-09-02&to=2025-09-07'),
    );
    await waitFor(() =>
      expect(summaryRequests(fetchMock).at(-1)).toMatchObject({
        range: 'CUSTOM',
        from: '2025-09-02',
        to: '2025-09-07',
      }),
    );
  });

  it('reads the range from a shared link and ignores invalid ones', async () => {
    const { fetchMock } = await openDashboard({
      path: `${ORG_APP}?range=CUSTOM&from=2025-01-01&to=2025-03-31`,
    });
    expect(summaryRequests(fetchMock)[0]).toMatchObject({
      range: 'CUSTOM',
      from: '2025-01-01',
      to: '2025-03-31',
    });
    expect(screen.getByRole('combobox', { name: 'Date range' })).toHaveValue('CUSTOM');
  });

  it('falls back to the default range for an invalid link', async () => {
    const { fetchMock } = await openDashboard({
      path: `${ORG_APP}?range=CUSTOM&from=2025-02-30&to=2025-03-31`,
    });
    expect(summaryRequests(fetchMock)[0]).toMatchObject({ range: 'LAST_30_DAYS' });
    expect(summaryRequests(fetchMock)[0]).not.toHaveProperty('from');
  });

  it('keeps the previous range visible (dimmed) while a new range loads', async () => {
    let releaseYear = () => {};
    const year = new Promise<void>((resolve) => (releaseYear = resolve));
    const { user } = await openDashboard({
      summary: async (_init, url) => {
        if (url.searchParams.get('range') === 'THIS_YEAR') {
          await year;
          return Response.json(dashboardSummary({ kpis: { activeProducts: 99 } }));
        }
        return Response.json(dashboardSummary());
      },
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'THIS_YEAR');

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Total sales' }).closest('[aria-busy]'),
      ).not.toBeNull(),
    );
    expect(within(kpiCard('Products')).getByText('23')).toBeVisible();
    releaseYear();
    expect(await within(kpiCard('Products')).findByText('99')).toBeVisible();
  });
});

describe('dashboard sections', () => {
  it('maps the time series to one bar per period, by revenue or by orders', async () => {
    const { user } = await openDashboard();
    const bars = () =>
      [...document.querySelectorAll('[data-testid="chart-bar"]')].map((bar) =>
        Number(bar.getAttribute('data-value')),
      );

    // Revenue in cents (exact), one bar per day.
    expect(bars()).toEqual([0, 15000, 0, 0, 5050, 0, 0]);

    await user.click(screen.getByRole('radio', { name: 'Orders' }));
    expect(bars()).toEqual([0, 2, 0, 0, 1, 1, 0]);
  });

  it('describes the selected bar to keyboard and screen reader users', async () => {
    await openDashboard();
    const slider = screen.getByRole('slider', { name: /choose a period/ });

    fireEvent.change(slider, { target: { value: '1' } });

    expect(slider).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining(`Revenue ${formatMoney('150.00')}`),
    );
    expect(slider.getAttribute('aria-valuetext')).toMatch(/2 orders \(1 realized\)/);
  });

  it('offers the chart data as a table', async () => {
    const { user } = await openDashboard();

    await user.click(screen.getByRole('button', { name: 'Show data table' }));

    const table = screen.getByRole('table', { name: 'Sales per day' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(8);
    expect(within(rows[2]!).getByText(formatMoney('150.00'))).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide data table' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('lists every order status with count and share, linking to the filtered orders', async () => {
    await openDashboard();
    const list = screen.getByRole('list', { name: 'Orders by status' });

    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      'Draft: 1 order, 25%. View these orders',
      'Confirmed: 0 orders, 0%. View these orders',
      'Processing: 1 order, 25%. View these orders',
      'Shipped: 0 orders, 0%. View these orders',
      'Completed: 1 order, 25%. View these orders',
      'Cancelled: 1 order, 25%. View these orders',
    ]);
    expect(links[0]).toHaveAttribute(
      'href',
      `${ORG_APP}/orders?status=DRAFT&from=2025-09-01&to=2025-09-07`,
    );
  });

  it('summarizes inventory with the stock statuses and links to filtered inventory', async () => {
    await openDashboard();
    const tiles = screen.getByRole('list', { name: 'Stock items by status' });

    const links = within(tiles).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('In stock31'),
      expect.stringContaining('Low stock7'),
      expect.stringContaining('Out of stock5'),
    ]);
    expect(links[1]).toHaveAttribute('href', `${ORG_APP}/inventory?status=LOW_STOCK`);
    expect(screen.getByRole('link', { name: 'View low stock' })).toHaveAttribute(
      'href',
      `${ORG_APP}/inventory?status=LOW_STOCK`,
    );
    // Units are counts, never formatted as money.
    expect(screen.getByText(`${formatCount(4321)} units on hand.`, { exact: false })).toBeVisible();
  });

  it('shows active warehouses only, linking to their details', async () => {
    await openDashboard();
    const table = screen.getByRole('table', { name: 'Stock per active warehouse' });

    expect(within(table).getByRole('link', { name: 'Main Warehouse' })).toHaveAttribute(
      'href',
      `${ORG_APP}/warehouses/0198c0de-0000-7000-8000-0000000000c1`,
    );
    expect(within(table).queryByText('Closed depot')).not.toBeInTheDocument();
    expect(screen.getByText(/1 archived not shown/)).toBeVisible();
  });

  it('lists top products with SKU, units sold, and revenue', async () => {
    await openDashboard();
    const table = screen.getByRole('table', { name: 'Top products by units sold' });
    const [, first, second] = within(table).getAllByRole('row');

    expect(within(first!).getByRole('link', { name: 'Copy Paper A4' })).toHaveAttribute(
      'href',
      `${ORG_APP}/products/0198c0de-0000-7000-8000-0000000000b1`,
    );
    expect(within(first!).getByText('PAP-A4')).toBeVisible();
    expect(within(first!).getByText('30')).toBeVisible();
    expect(within(first!).getByText(formatMoney('207.00'))).toBeVisible();
    expect(within(second!).getByText('Archived')).toBeVisible();
  });

  it('shows the five newest orders from the orders list', async () => {
    const order = testOrder();
    const { fetchMock } = await openDashboard({
      orders: json(200, orderPage([toListItem(order)])),
    });
    const table = await screen.findByRole('table', { name: 'Five newest orders' });

    expect(within(table).getByRole('link', { name: order.orderNumber })).toHaveAttribute(
      'href',
      `${ORG_APP}/orders/${order.id}`,
    );
    const ordersRequest = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === ORDERS_API)!;
    expect(Object.fromEntries(ordersRequest.searchParams)).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: '1',
      pageSize: '5',
    });
  });

  it('never changes data: only GET requests', async () => {
    const { fetchMock, user } = await openDashboard();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'TODAY');
    await user.click(screen.getByRole('radio', { name: 'Orders' }));

    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
  });

  it('uses theme tokens only: no hard-coded colors in the markup', async () => {
    await openDashboard();
    const main = screen.getByRole('main');

    expect(main.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    const classes = [...main.querySelectorAll('[class]')].map((element) =>
      element.getAttribute('class'),
    );
    expect(classes.join(' ')).not.toMatch(
      /\b(?:bg|text|fill|stroke|border)-(?:slate|gray|red|green|blue|indigo|emerald|amber|white|black)\b/,
    );
  });
});

describe('dashboard and workspace switching', () => {
  const orgB: Organization = {
    ...testOrganization,
    id: '0198c0de-0000-7000-8000-00000000000b',
    name: 'Beta Retail',
    slug: 'beta-retail',
  };

  it("never shows workspace A's numbers in workspace B, and refetches for B", async () => {
    let releaseB = () => {};
    const holdB = new Promise<void>((resolve) => (releaseB = resolve));
    const fetchMock = mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([
        organizationSummary(),
        organizationSummary({ id: orgB.id, name: orgB.name, slug: orgB.slug, role: 'STAFF' }),
      ]),
      [`GET ${ORG_API}`]: organizationDetail('OWNER'),
      [`GET /organizations/${orgB.id}`]: organizationDetail('STAFF', orgB),
      [`GET ${SUMMARY_API}`]: json(200, dashboardSummary({ kpis: { activeProducts: 111 } })),
      [`GET ${ORDERS_API}`]: json(200, orderPage([])),
      [`GET /organizations/${orgB.id}/dashboard/summary`]: async () => {
        await holdB;
        return Response.json(dashboardSummary({ kpis: { activeProducts: 222 } }));
      },
      [`GET /organizations/${orgB.id}/orders`]: json(200, orderPage([])),
    });
    const { router } = renderApp(ORG_APP);
    expect(await within(await findKpi('Products')).findByText('111')).toBeVisible();

    await act(() => router.navigate(`/org/${orgB.id}`));

    expect(await screen.findByText('Loading the dashboard')).toBeInTheDocument();
    expect(screen.queryByText('111')).not.toBeInTheDocument();
    releaseB();
    expect(await within(await findKpi('Products')).findByText('222')).toBeVisible();
    expect(screen.queryByText('111')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes(`/organizations/${orgB.id}/dashboard/summary`),
      ),
    ).toBe(true);
  });
});

async function findKpi(label: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name: label, level: 3 });
  return heading.closest('div.rounded-card') as HTMLElement;
}
