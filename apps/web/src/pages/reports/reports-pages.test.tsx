import type { Organization } from '@app/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog } from '@/test/catalog-fixtures';
import { dashboardSummary } from '@/test/dashboard-fixtures';
import { mainWarehouse } from '@/test/inventory-fixtures';
import {
  apiError,
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  pending,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import {
  inventoryReport,
  inventoryRow,
  ordersReport,
  salesReport,
  salesRow,
} from '@/test/report-fixtures';
import { customerPage, riverside } from '@/test/sales-fixtures';
import { renderApp } from '@/test/render-app';
import { money } from '@/test/format';

const REPORTS = `${ORG_API}/reports`;

type Handlers = Parameters<typeof mockApi>[0];

async function openReport(path: string, handlers: Handlers = {}, heading?: string) {
  const app = await renderCatalog(`${ORG_APP}/reports${path}`, 'OWNER', {
    [`GET ${ORG_API}/warehouses`]: json(200, { warehouses: [mainWarehouse] }),
    [`GET ${ORG_API}/customers`]: json(200, customerPage([riverside])),
    [`GET ${REPORTS}/sales`]: json(200, salesReport()),
    [`GET ${REPORTS}/orders`]: json(200, ordersReport()),
    [`GET ${REPORTS}/inventory`]: json(200, inventoryReport()),
    ...handlers,
  });
  if (heading) await screen.findByRole('heading', { level: 1, name: heading });
  return app;
}

const requestsTo = (fetchMock: ReturnType<typeof mockApi>, path: string) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === path)
    .map((url) => Object.fromEntries(url.searchParams));

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('reports area', () => {
  it('opens the sales report from the workspace navigation', async () => {
    const { router } = await openReport('', {}, 'Sales report');

    expect(router.state.location.pathname).toBe(`${ORG_APP}/reports/sales`);
    const workspaceNav = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(workspaceNav).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const reportNav = screen.getByRole('navigation', { name: 'Reports' });
    expect(
      within(reportNav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Sales', 'Orders', 'Inventory']);
  });
});

describe('SalesReportPage', () => {
  it('lists realized sales with totals, from the default query', async () => {
    const { fetchMock } = await openReport('/sales', {}, 'Sales report');

    const table = await screen.findByRole('table', { name: 'Realized sales' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first!).getByRole('link', { name: 'SO-2001' })).toHaveAttribute(
      'href',
      `${ORG_APP}/orders/0198c0de-0000-7000-8000-0000000000d1`,
    );
    expect(within(first!).getByText('Acme, Inc.')).toBeVisible();
    expect(within(first!).getByText(money('55.00'))).toBeVisible();
    expect(within(second!).getByText('No customer')).toBeVisible();
    expect(screen.getByText(money('134.98'))).toBeVisible();
    expect(requestsTo(fetchMock, `${REPORTS}/sales`)[0]).toEqual({
      range: 'LAST_30_DAYS',
      timeZone: TIME_ZONE,
      sortBy: 'date',
      sortOrder: 'desc',
      page: '1',
      pageSize: '25',
    });
  });

  it('filters on the server and keeps the filters in the URL', async () => {
    const { fetchMock, router, user } = await openReport('/sales', {}, 'Sales report');
    await screen.findByRole('table', { name: 'Realized sales' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Warehouse' }), mainWarehouse.id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'SHIPPED');
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'acme');

    await waitFor(() =>
      expect(requestsTo(fetchMock, `${REPORTS}/sales`).at(-1)).toMatchObject({
        warehouseId: mainWarehouse.id,
        status: 'SHIPPED',
        search: 'acme',
      }),
    );
    expect(router.state.location.search).toContain(`warehouseId=${mainWarehouse.id}`);
    expect(router.state.location.search).toContain('status=SHIPPED');
    expect(router.state.location.search).toContain('search=acme');
  });

  it('filters by any customer through the customer search (archived included)', async () => {
    const { fetchMock, router, user } = await openReport('/sales', {}, 'Sales report');
    await screen.findByRole('table', { name: 'Realized sales' });

    await user.click(screen.getByRole('searchbox', { name: 'Customer' }));
    const list = await screen.findByRole('list', { name: 'Matching customers' });
    await user.click(within(list).getByRole('button', { name: /Jamie Rivera/ }));

    await waitFor(() =>
      expect(router.state.location.search).toContain(`customerId=${riverside.id}`),
    );
    expect(requestsTo(fetchMock, `${REPORTS}/sales`).at(-1)).toMatchObject({
      customerId: riverside.id,
    });
    const customerSearch = requestsTo(fetchMock, `${ORG_API}/customers`)[0]!;
    expect(customerSearch).not.toHaveProperty('status');
  });

  it('sorts by clicking a column header, with aria-sort', async () => {
    const { fetchMock, router, user } = await openReport('/sales', {}, 'Sales report');
    const table = await screen.findByRole('table', { name: 'Realized sales' });

    expect(within(table).getByRole('columnheader', { name: /Date/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await user.click(within(table).getByRole('button', { name: 'Revenue' }));
    await waitFor(() => expect(router.state.location.search).toContain('sort=revenue%3Adesc'));
    expect(
      within(screen.getByRole('table', { name: 'Realized sales' })).getByRole('columnheader', {
        name: /Revenue/,
      }),
    ).toHaveAttribute('aria-sort', 'descending');

    await user.click(
      within(screen.getByRole('table', { name: 'Realized sales' })).getByRole('button', {
        name: 'Revenue',
      }),
    );
    await waitFor(() =>
      expect(requestsTo(fetchMock, `${REPORTS}/sales`).at(-1)).toMatchObject({
        sortBy: 'revenue',
        sortOrder: 'asc',
      }),
    );
  });

  it('paginates on the server', async () => {
    const { fetchMock, user } = await openReport(
      '/sales',
      {
        [`GET ${REPORTS}/sales`]: json(
          200,
          salesReport(undefined, { totalItems: 60, totalPages: 3 }),
        ),
      },
      'Sales report',
    );
    await screen.findByRole('table', { name: 'Realized sales' });

    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(requestsTo(fetchMock, `${REPORTS}/sales`).at(-1)).toMatchObject({ page: '2' }),
    );
  });

  it('distinguishes "no sales yet" from "no matches", and clears filters', async () => {
    const { router, user } = await openReport(
      '/sales?status=COMPLETED',
      { [`GET ${REPORTS}/sales`]: json(200, salesReport([])) },
      'Sales report',
    );

    expect(await screen.findByText('Nothing matches these filters.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByText('No sales in this period.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows loading, then a safe error with retry', async () => {
    let fail = true;
    const { user } = await openReport(
      '/sales',
      {
        [`GET ${REPORTS}/sales`]: () =>
          fail
            ? Response.json(
                { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' },
                { status: 500 },
              )
            : Response.json(salesReport()),
      },
      'Sales report',
    );

    expect(await screen.findByText("We couldn't load the sales report")).toBeVisible();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Realized sales' })).toBeVisible();
  });

  it('shows a loading state first', async () => {
    await openReport('/sales', { [`GET ${REPORTS}/sales`]: pending() }, 'Sales report');
    expect(screen.getByText('Loading the sales report')).toBeInTheDocument();
  });

  it('shows the product filter from a dashboard link, with its name', async () => {
    const productId = '0198c0de-0000-7000-8000-0000000000b1';
    const { fetchMock } = await openReport(
      `/sales?productId=${productId}`,
      {
        [`GET ${ORG_API}/products/${productId}`]: json(200, {
          product: { id: productId, name: 'Copy Paper A4' },
        }),
      },
      'Sales report',
    );

    expect(await screen.findByText('Product: Copy Paper A4')).toBeVisible();
    expect(requestsTo(fetchMock, `${REPORTS}/sales`)[0]).toMatchObject({ productId });
    expect(screen.getByText(/count only the lines of the selected product/)).toBeVisible();
  });
});

describe('CSV export', () => {
  let saved: { name: string; text: string }[];

  beforeEach(() => {
    saved = [];
    // jsdom has no object URLs; the anchor click (the actual download) is captured below.
    URL.createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:report');
    URL.revokeObjectURL = vi.fn<(url: string) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download, text: this.href });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports with the active filters and sort (no paging), and saves the file', async () => {
    const { fetchMock, user } = await openReport(
      `/sales?status=SHIPPED&sort=units%3Aasc&page=2`,
      {
        [`GET ${REPORTS}/sales/export`]: () =>
          new Response('﻿Date,Order\r\n', {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition':
                'attachment; filename="sales-report_2025-09-01_2025-09-30.csv"',
            },
          }),
      },
      'Sales report',
    );
    await screen.findByRole('table', { name: 'Realized sales' });

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV (.csv)' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe('sales-report_2025-09-01_2025-09-30.csv');
    expect(requestsTo(fetchMock, `${REPORTS}/sales/export`)).toEqual([
      {
        range: 'LAST_30_DAYS',
        timeZone: TIME_ZONE,
        status: 'SHIPPED',
        sortBy: 'units',
        sortOrder: 'asc',
        // The report's own currency, so the file holds exactly the rows shown.
        currency: 'TRY',
        format: 'csv',
        lang: 'en',
      },
    ]);
  });

  it('exports an Excel workbook in the interface language', async () => {
    const { fetchMock, user } = await openReport(
      '/orders',
      {
        [`GET ${REPORTS}/orders/export`]: () =>
          new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition':
                'attachment; filename="siparis-raporu_2025-09-01_2025-09-30.xlsx"',
            },
          }),
      },
      'Orders report',
    );
    await screen.findByRole('table', { name: 'Orders' });
    await user.click(screen.getByRole('radio', { name: 'Türkçe' }));
    await screen.findByRole('heading', { name: 'Sipariş raporu' });

    await user.click(screen.getByRole('button', { name: 'Dışa aktar' }));
    await user.click(screen.getByRole('menuitem', { name: 'Excel (.xlsx)' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe('siparis-raporu_2025-09-01_2025-09-30.xlsx');
    expect(requestsTo(fetchMock, `${REPORTS}/orders/export`)).toEqual([
      {
        range: 'LAST_30_DAYS',
        timeZone: TIME_ZONE,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        format: 'xlsx',
        lang: 'tr',
      },
    ]);
  });

  it('explains when the export is too large', async () => {
    const { user } = await openReport(
      '/orders',
      {
        [`GET ${REPORTS}/orders/export`]: apiError(
          422,
          'REPORT_EXPORT_TOO_LARGE',
          'This export would contain 12,000 rows; the maximum is 10,000. Narrow the filters and export again.',
        ),
      },
      'Orders report',
    );
    await screen.findByRole('table', { name: 'Orders' });

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'CSV (.csv)' }));

    expect(await screen.findByText(/the maximum is 10,000\. Narrow the filters/)).toBeVisible();
    expect(saved).toHaveLength(0);
  });

  it('is disabled when there is nothing to export', async () => {
    await openReport(
      '/inventory',
      { [`GET ${REPORTS}/inventory`]: json(200, inventoryReport([])) },
      'Inventory report',
    );
    expect(await screen.findByText('No stock recorded yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});

describe('OrdersReportPage', () => {
  it('lists orders of every status and filters by status', async () => {
    const { fetchMock, user } = await openReport('/orders', {}, 'Orders report');
    const table = await screen.findByRole('table', { name: 'Orders' });

    expect(within(table).getByText('SO-3001')).toBeVisible();
    expect(within(table).getByText('Draft')).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'CANCELLED');

    await waitFor(() =>
      expect(requestsTo(fetchMock, `${REPORTS}/orders`).at(-1)).toMatchObject({
        status: 'CANCELLED',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    );
  });
});

describe('InventoryReportPage', () => {
  it('shows current stock with its status as text, and filters', async () => {
    const { fetchMock, user } = await openReport(
      '/inventory',
      {
        [`GET ${REPORTS}/inventory`]: json(
          200,
          inventoryReport([
            inventoryRow(),
            inventoryRow({
              inventoryId: 'x2',
              quantity: 0,
              status: 'OUT_OF_STOCK',
              product: { id: 'p2', name: 'Saw', sku: 'SAW', status: 'ARCHIVED' },
            }),
          ]),
        ),
      },
      'Inventory report',
    );
    const table = await screen.findByRole('table', { name: 'Stock per product and warehouse' });

    expect(within(table).getByText('Low stock')).toBeVisible();
    expect(within(table).getByText('Out of stock')).toBeVisible();
    expect(within(table).getByText('Archived')).toBeVisible();
    expect(requestsTo(fetchMock, `${REPORTS}/inventory`)[0]).toEqual({
      sortBy: 'productName',
      sortOrder: 'asc',
      page: '1',
      pageSize: '25',
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Stock status' }), 'LOW_STOCK');
    await user.click(
      screen.getByRole('checkbox', { name: 'Include archived products and warehouses' }),
    );

    await waitFor(() =>
      expect(requestsTo(fetchMock, `${REPORTS}/inventory`).at(-1)).toMatchObject({
        status: 'LOW_STOCK',
        includeArchived: 'true',
      }),
    );
  });
});

describe('reports and workspace switching', () => {
  const orgB: Organization = {
    ...testOrganization,
    id: '0198c0de-0000-7000-8000-00000000000b',
    name: 'Beta Retail',
    slug: 'beta-retail',
  };

  it("never shows workspace A's report rows in workspace B", async () => {
    let releaseB = () => {};
    const holdB = new Promise<void>((resolve) => (releaseB = resolve));
    mockApi({
      'GET /auth/me': signedIn(),
      'GET /organizations': organizationList([
        organizationSummary(),
        organizationSummary({ id: orgB.id, name: orgB.name, slug: orgB.slug }),
      ]),
      [`GET ${ORG_API}`]: organizationDetail('OWNER'),
      [`GET /organizations/${orgB.id}`]: organizationDetail('OWNER', orgB),
      [`GET ${ORG_API}/warehouses`]: json(200, { warehouses: [] }),
      [`GET /organizations/${orgB.id}/warehouses`]: json(200, { warehouses: [] }),
      [`GET ${ORG_API}/categories`]: json(200, { categories: [] }),
      [`GET /organizations/${orgB.id}/categories`]: json(200, { categories: [] }),
      [`GET ${ORG_API}/customers`]: json(200, customerPage([])),
      [`GET /organizations/${orgB.id}/customers`]: json(200, customerPage([])),
      [`GET ${REPORTS}/sales`]: json(200, salesReport([salesRow({ orderNumber: 'SO-A-1' })])),
      [`GET /organizations/${orgB.id}/reports/sales`]: async () => {
        await holdB;
        return Response.json(salesReport([salesRow({ orderNumber: 'SO-B-1' })]));
      },
    });
    const { router } = renderApp(`${ORG_APP}/reports/sales`);
    expect(await screen.findByText('SO-A-1')).toBeVisible();

    await act(() => router.navigate(`/org/${orgB.id}/reports/sales`));

    expect(await screen.findByText('Loading the sales report')).toBeInTheDocument();
    expect(screen.queryByText('SO-A-1')).not.toBeInTheDocument();
    releaseB();
    expect(await screen.findByText('SO-B-1')).toBeVisible();
  });
});

describe('dashboard → reports', () => {
  it('links the top products to the sales report of the same range', async () => {
    await renderCatalog(`${ORG_APP}?range=THIS_YEAR`, 'OWNER', {
      [`GET ${ORG_API}/dashboard/summary`]: json(
        200,
        dashboardSummary({ period: { ...dashboardSummary().period, range: 'THIS_YEAR' } }),
      ),
    });

    expect(await screen.findByRole('link', { name: 'Sales report' })).toHaveAttribute(
      'href',
      `${ORG_APP}/reports/sales?range=THIS_YEAR&currency=TRY`,
    );
  });
});
