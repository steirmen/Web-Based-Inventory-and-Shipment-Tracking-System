import type { Customer } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog } from '@/test/catalog-fixtures';
import { mainWarehouse } from '@/test/inventory-fixtures';
import { json, type mockApi, pending } from '@/test/mock-api';

type Handler = Parameters<typeof mockApi>[0][string];
import { customerPage, testCustomer } from '@/test/sales-fixtures';

/** 150 customers ("Customer 001" … "Customer 150"), served page by page like the API. */
const CUSTOMERS: Customer[] = Array.from({ length: 150 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0');
  return testCustomer({
    id: `0198c0de-0000-7000-8000-000000${number.padStart(6, '0')}`,
    name: `Customer ${number}`,
    companyName: index === 136 ? 'Far Down Trading' : null,
    email: `c${number}@test.example`,
  });
});

function pagedCustomers(_init: RequestInit | undefined, url: URL) {
  const search = (url.searchParams.get('search') ?? '').toLowerCase();
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
  const matches = CUSTOMERS.filter(
    (customer) =>
      !search ||
      customer.name.toLowerCase().includes(search) ||
      (customer.companyName ?? '').toLowerCase().includes(search),
  );
  return Response.json(
    customerPage(matches.slice((page - 1) * pageSize, page * pageSize), {
      page,
      pageSize,
      totalItems: matches.length,
      totalPages: Math.ceil(matches.length / pageSize),
    }),
  );
}

async function openBuilder(customers: Handler = pagedCustomers) {
  const app = await renderCatalog(
    `${ORG_APP}/orders/new`,
    'OWNER',
    {
      [`GET ${ORG_API}/customers`]: customers,
      [`GET ${ORG_API}/warehouses`]: json(200, { warehouses: [mainWarehouse] }),
      [`GET ${ORG_API}/products`]: json(200, {
        items: [],
        pagination: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 },
      }),
    },
    { waitForHeading: 'New order' },
  );
  const search = await screen.findByRole('searchbox', { name: 'Customer' });
  await app.user.click(search);
  return { ...app, search };
}

const customerRequests = (fetchMock: Awaited<ReturnType<typeof openBuilder>>['fetchMock']) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/customers'))
    .map((url) => ({ path: url.pathname, ...Object.fromEntries(url.searchParams) }));

const results = () => screen.findByRole('list', { name: 'Matching customers' });

describe('CustomerPicker', () => {
  it('opens with the first page of active customers by name', async () => {
    const { fetchMock } = await openBuilder();

    const list = await results();
    expect(within(list).getAllByRole('button')).toHaveLength(20);
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('Customer 001');
    expect(screen.getByText('Showing 20 of 150')).toBeInTheDocument();
    expect(customerRequests(fetchMock)[0]).toEqual({
      path: `${ORG_API}/customers`,
      status: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc',
      page: '1',
      pageSize: '20',
    });
  });

  it('searches on the server and finds customers far beyond the first page', async () => {
    const { fetchMock, user, search } = await openBuilder();
    await results();

    await user.type(search, 'far down');

    const list = await waitFor(async () => {
      const found = await results();
      expect(within(found).getAllByRole('button')).toHaveLength(1);
      return found;
    });
    expect(within(list).getByRole('button')).toHaveTextContent('Customer 137');
    expect(customerRequests(fetchMock).at(-1)).toMatchObject({ search: 'far down', page: '1' });

    await user.click(within(list).getByRole('button'));
    expect(screen.getByRole('button', { name: /^Change customer \(Customer 137/ })).toBeVisible();
  });

  it('loads more customers on demand, so #101 and later are reachable without searching', async () => {
    const { user } = await openBuilder();
    await results();

    for (let loaded = 20; loaded < 120; loaded += 20) {
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      await waitFor(() =>
        expect(screen.getByText(`Showing ${loaded + 20} of 150`)).toBeInTheDocument(),
      );
    }
    const list = await results();
    await user.click(within(list).getByRole('button', { name: /Customer 101/ }));

    expect(screen.getByRole('button', { name: /^Change customer \(Customer 101/ })).toBeVisible();
  });

  it('says when nothing matches, and returns to the first results when the search is cleared', async () => {
    const { user, search } = await openBuilder();
    await results();

    await user.type(search, 'zzz');
    expect(await screen.findByText('No active customers match “zzz”.')).toBeVisible();

    await user.clear(search);
    await waitFor(async () =>
      expect(within(await results()).getAllByRole('button')).toHaveLength(20),
    );
  });

  it('shows a loading state, then an error with retry', async () => {
    let fail = true;
    const { user } = await openBuilder((init, url) =>
      fail
        ? Response.json(
            { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' },
            { status: 500 },
          )
        : pagedCustomers(init, url),
    );

    expect(await screen.findByText(/couldn't|Something went wrong|unexpected/i)).toBeVisible();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(within(await results()).getAllByRole('button')).toHaveLength(20);
  });

  it('shows loading while the first page is on its way', async () => {
    await openBuilder(pending());
    expect(await screen.findByText('Loading customers…')).toBeVisible();
  });

  it('supports the keyboard: ↓ into the results, Enter chooses, Escape closes', async () => {
    const { user, search } = await openBuilder();
    await results();

    search.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('button', { name: /Customer 001/ })).toHaveFocus());
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByRole('button', { name: /^Change customer \(Customer 002/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Change customer/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Matching customers' })).not.toBeInTheDocument();
  });

  it('only ever asks the current workspace for customers', async () => {
    const { fetchMock, user, search } = await openBuilder();
    await results();
    await user.type(search, '15');
    await waitFor(() => expect(customerRequests(fetchMock).at(-1)).toMatchObject({ search: '15' }));

    expect(
      customerRequests(fetchMock).every((request) => request.path === `${ORG_API}/customers`),
    ).toBe(true);
  });
});
