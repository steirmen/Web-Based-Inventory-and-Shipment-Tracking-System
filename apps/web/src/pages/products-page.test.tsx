import type { MemberRole, ProductListItem, ProductListResponse } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/money';
import {
  apiError,
  json,
  mockApi,
  organizationDetail,
  organizationList,
  organizationSummary,
  signedIn,
  testOrganization,
} from '@/test/mock-api';
import { renderApp } from '@/test/render-app';

const ORG = `/organizations/${testOrganization.id}`;
const PRODUCTS_PATH = `/org/${testOrganization.id}/products`;
const office = { id: '0198c0de-0000-7000-8000-0000000000c1', name: 'Office' };

const product = (overrides: Partial<ProductListItem>): ProductListItem => ({
  id: '0198c0de-0000-7000-8000-0000000000d1',
  name: 'Ballpoint Pen',
  sku: 'OFF-PEN',
  price: '1234.50',
  cost: '0.40',
  minimumStock: 20,
  status: 'ACTIVE',
  category: office,
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
  ...overrides,
});

const pen = product({});
const archivedPad = product({
  id: '0198c0de-0000-7000-8000-0000000000d2',
  name: 'Mouse Pad',
  sku: 'ELE-PAD',
  price: '4.00',
  cost: null,
  status: 'ARCHIVED',
  category: null,
});

const page = (
  items: ProductListItem[],
  pagination: Partial<ProductListResponse['pagination']> = {},
): ProductListResponse => ({
  items,
  pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1, ...pagination },
});

/**
 * Renders /org/:id/products as `role`. `respond` decides the product list for
 * each request's query string (all filtering happens "on the server").
 */
async function openProducts(
  role: MemberRole,
  respond: (params: URLSearchParams) => ProductListResponse | Response,
  extra: Parameters<typeof mockApi>[0] = {},
  path = PRODUCTS_PATH,
) {
  const fetchMock = mockApi({
    'GET /auth/me': signedIn(),
    'GET /organizations': organizationList([organizationSummary({ role })]),
    [`GET ${ORG}`]: organizationDetail(role),
    [`GET ${ORG}/categories`]: json(200, {
      categories: [
        {
          ...office,
          description: null,
          productCount: 1,
          createdAt: pen.createdAt,
          updatedAt: pen.updatedAt,
        },
      ],
    }),
    [`GET ${ORG}/products`]: (_init, url) => {
      const result = respond(url.searchParams);
      return result instanceof Response ? result : Response.json(result);
    },
    ...extra,
  });
  const app = renderApp(path);
  await screen.findByRole('heading', { name: 'Products' });
  return { ...app, fetchMock };
}

/** Query strings of every product-list request made so far. */
const listRequests = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === `${ORG}/products`)
    .map((url) => url.searchParams);

describe('ProductsPage', () => {
  it('shows products with category, exact money, stock, and status', async () => {
    await openProducts('OWNER', () => page([pen, archivedPad]));

    const table = await screen.findByRole('table');
    const [, penRow, padRow] = within(table).getAllByRole('row');
    expect(within(penRow).getByRole('link', { name: 'Ballpoint Pen' })).toHaveAttribute(
      'href',
      `${PRODUCTS_PATH}/${pen.id}`,
    );
    expect(within(penRow).getByText('OFF-PEN')).toBeInTheDocument();
    expect(within(penRow).getByText('Office')).toBeInTheDocument();
    expect(within(penRow).getByText(formatMoney('1234.50'))).toBeInTheDocument();
    expect(within(penRow).getByText('Active')).toBeInTheDocument();
    expect(within(padRow).getByText('Archived')).toBeInTheDocument();
    expect(within(padRow).getByText('—', { selector: 'td' })).toBeInTheDocument(); // unknown cost
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('requests the first page sorted newest first by default', async () => {
    const { fetchMock } = await openProducts('OWNER', () => page([pen]));

    await screen.findByRole('table');
    const [params] = listRequests(fetchMock);
    expect(Object.fromEntries(params)).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: '1',
      pageSize: '20',
    });
  });

  it('shows archive/restore only to roles that may use them', async () => {
    await openProducts('STAFF', () => page([pen, archivedPad]));
    const table = await screen.findByRole('table');

    expect(within(table).getByRole('link', { name: 'Edit Ballpoint Pen' })).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'Edit Mouse Pad' })).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /Archive|Restore/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Add product' })[0]).toBeVisible();
  });

  it('archives after confirmation, then restores without one, refreshing the list', async () => {
    let status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
    const { user, fetchMock } = await openProducts('ADMIN', () => page([{ ...pen, status }]), {
      [`POST ${ORG}/products/${pen.id}/archive`]: () => {
        status = 'ARCHIVED';
        return Response.json({ product: { ...pen, status, description: null } });
      },
      [`POST ${ORG}/products/${pen.id}/restore`]: () => {
        status = 'ACTIVE';
        return Response.json({ product: { ...pen, status, description: null } });
      },
    });
    const table = await screen.findByRole('table');
    const archiveCalls = () =>
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(`/products/${pen.id}/archive`) && init?.method === 'POST',
      );

    await user.click(within(table).getByRole('button', { name: 'Archive Ballpoint Pen' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive product?' });
    expect(dialog).toHaveTextContent('It can be restored later.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    // Cancel: nothing is sent.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(archiveCalls()).toHaveLength(0);

    await user.click(within(table).getByRole('button', { name: 'Archive Ballpoint Pen' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Ballpoint Pen archived.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(archiveCalls()).toHaveLength(1);

    await user.click(await within(table).findByRole('button', { name: 'Restore Ballpoint Pen' }));
    expect(await screen.findByText('Ballpoint Pen restored.')).toBeVisible();
    expect(
      await within(table).findByRole('button', { name: 'Archive Ballpoint Pen' }),
    ).toBeVisible();
  });

  it('closes the archive dialog with Escape without archiving', async () => {
    const { user, fetchMock } = await openProducts('OWNER', () => page([pen]));
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Archive Ballpoint Pen' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('searches on the server after typing stops, starting from page 1', async () => {
    const { user, fetchMock, router } = await openProducts(
      'OWNER',
      (params) => page(params.get('search') === 'pen' ? [pen] : [pen, archivedPad]),
      {},
      `${PRODUCTS_PATH}?page=2`,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'pen');

    await waitFor(() =>
      expect(listRequests(fetchMock).some((params) => params.get('search') === 'pen')).toBe(true),
    );
    const searched = listRequests(fetchMock).find((params) => params.get('search') === 'pen');
    expect(searched?.get('page')).toBe('1');
    // Typing is debounced: no request per keystroke.
    expect(listRequests(fetchMock).filter((params) => params.has('search'))).toHaveLength(1);
    expect(router.state.location.search).toBe('?search=pen');
  });

  it('sends category, status, and sort filters to the server', async () => {
    const { user, fetchMock } = await openProducts('OWNER', () => page([pen]));
    await screen.findByRole('table');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Office');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'ARCHIVED');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'price:asc');

    await waitFor(() => {
      const last = listRequests(fetchMock).at(-1);
      expect(Object.fromEntries(last ?? [])).toEqual({
        categoryId: office.id,
        status: 'ARCHIVED',
        sortBy: 'price',
        sortOrder: 'asc',
        page: '1',
        pageSize: '20',
      });
    });
  });

  it('shows the empty catalog state', async () => {
    await openProducts('OWNER', () => page([]));

    expect(await screen.findByText('No products yet')).toBeVisible();
    expect(screen.getByText('Create your first product.')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows "no matches" for filtered results and clears the filters', async () => {
    const { user, router } = await openProducts(
      'OWNER',
      (params) => page(params.has('search') ? [] : [pen]),
      {},
      `${PRODUCTS_PATH}?search=zzz&status=ACTIVE`,
    );

    expect(await screen.findByText('No products match your filters.')).toBeVisible();
    const [clear] = screen.getAllByRole('button', { name: /Clear filters/ });
    await user.click(clear);

    expect(await screen.findByRole('table')).toBeVisible();
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search products' })).toHaveValue('');
  });

  it('paginates on the server with Previous / Next', async () => {
    const { user, fetchMock } = await openProducts('OWNER', (params) =>
      page([params.get('page') === '2' ? archivedPad : pen], {
        page: Number(params.get('page')),
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
      }),
    );

    expect(await screen.findByText('Page 1 of 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page 2 of 2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(listRequests(fetchMock).some((params) => params.get('page') === '2')).toBe(true);
  });

  it('shows a safe error state with retry', async () => {
    await openProducts('OWNER', () => apiError(500, 'INTERNAL_ERROR', 'boom')());

    expect(await screen.findByText("We couldn't load products")).toBeVisible();
    expect(screen.getByText('Something went wrong on our side. Please try again.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('is reachable from the workspace navigation', async () => {
    await openProducts('STAFF', () => page([]), {}, `/org/${testOrganization.id}/products`);

    const tabs = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(tabs).getByRole('link', { name: 'Products' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Categories' })).toHaveAttribute(
      'href',
      `/org/${testOrganization.id}/categories`,
    );
  });
});
