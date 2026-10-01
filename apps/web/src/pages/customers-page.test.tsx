import type { MemberRole } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog, sentBodies } from '@/test/catalog-fixtures';
import { apiError, json, pending } from '@/test/mock-api';
import {
  brightline,
  customerPage,
  orderPage,
  riverside,
  testCustomer,
  testOrder,
  toListItem,
} from '@/test/sales-fixtures';

const CUSTOMERS_APP = `${ORG_APP}/customers`;
const CUSTOMERS_API = `${ORG_API}/customers`;

async function openCustomers(
  role: MemberRole,
  handlers: Parameters<typeof renderCatalog>[2] = {},
  path = CUSTOMERS_APP,
) {
  return renderCatalog(
    path,
    role,
    {
      [`GET ${CUSTOMERS_API}`]: json(200, customerPage([riverside, brightline])),
      ...handlers,
    },
    { waitForHeading: 'Customers' },
  );
}

const listRequests = (fetchMock: Awaited<ReturnType<typeof openCustomers>>['fetchMock']) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === CUSTOMERS_API)
    .map((url) => Object.fromEntries(url.searchParams));

describe('CustomersPage', () => {
  it('lists customers with company, contact, order count, and status (as text)', async () => {
    await openCustomers('STAFF');

    const table = await screen.findByRole('table');
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first!).getByRole('link', { name: 'Jamie Rivera' })).toHaveAttribute(
      'href',
      `${CUSTOMERS_APP}/${riverside.id}`,
    );
    expect(within(first!).getByText('Riverside Dental')).toBeInTheDocument();
    expect(within(first!).getByText('purchasing@riverside.example')).toBeInTheDocument();
    expect(within(first!).getByText('Active')).toBeInTheDocument();
    expect(within(second!).getByText('Brightline Studio')).toBeInTheDocument();
  });

  it('shows loading, then a safe error with retry, then the list', async () => {
    let fail = true;
    let release = () => {};
    const firstAnswer = new Promise<void>((resolve) => (release = resolve));
    const { user } = await openCustomers('STAFF', {
      [`GET ${CUSTOMERS_API}`]: async () => {
        await firstAnswer;
        return fail
          ? Response.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Boom' },
              { status: 500 },
            )
          : Response.json(customerPage([riverside]));
      },
    });

    expect(screen.getByText('Loading customers')).toBeInTheDocument();
    release();
    expect(await screen.findByText("We couldn't load customers")).toBeVisible();
    expect(screen.queryByText('Boom')).not.toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('shows the empty state and the filtered empty state', async () => {
    const { user, router } = await openCustomers(
      'OWNER',
      { [`GET ${CUSTOMERS_API}`]: json(200, customerPage([])) },
      `${CUSTOMERS_APP}?search=zzz`,
    );

    expect(await screen.findByText('No customers match your filters.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('No customers yet')).toBeVisible();
  });

  it('searches, filters, sorts, and paginates on the server with the state in the URL', async () => {
    const { user, router, fetchMock } = await openCustomers('STAFF', {
      [`GET ${CUSTOMERS_API}`]: (_init, url) =>
        Response.json(
          customerPage([riverside], {
            page: Number(url.searchParams.get('page')),
            totalItems: 41,
            totalPages: 3,
          }),
        ),
    });
    await screen.findByRole('table');
    expect(listRequests(fetchMock)[0]).toEqual({
      status: 'ACTIVE',
      sortBy: 'name',
      sortOrder: 'asc',
      page: '1',
      pageSize: '20',
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Archived');
    expect(router.state.location.search).toBe('?status=ARCHIVED');
    await user.type(screen.getByRole('searchbox', { name: 'Search customers' }), 'river');
    await waitFor(() => expect(listRequests(fetchMock).at(-1)).toMatchObject({ search: 'river' }));
    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(router.state.location.search).toBe('?search=river&status=ARCHIVED&page=2');
    await waitFor(() =>
      expect(listRequests(fetchMock).at(-1)).toMatchObject({
        search: 'river',
        status: 'ARCHIVED',
        page: '2',
      }),
    );
  });

  it('creates a customer: validates first, then sends normalized values', async () => {
    const created = testCustomer({
      id: '0198c0de-0000-7000-8000-0000000000c9',
      name: 'Alex Morgan',
    });
    const { user, fetchMock } = await openCustomers('STAFF', {
      [`POST ${CUSTOMERS_API}`]: json(201, { customer: created }),
    });

    await user.click(screen.getByRole('button', { name: 'Add customer' }));
    const dialog = screen.getByRole('dialog', { name: 'New customer' });
    await user.type(within(dialog).getByLabelText('Email'), 'not-an-email');
    await user.click(within(dialog).getByRole('button', { name: 'Add customer' }));
    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
      'Enter the customer’s name.',
    );
    expect(sentBodies(fetchMock, 'POST', CUSTOMERS_API)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Name'), '  Alex   Morgan ');
    await user.clear(within(dialog).getByLabelText('Email'));
    await user.type(within(dialog).getByLabelText('Email'), 'Alex@Cafe.EXAMPLE');
    await user.click(within(dialog).getByRole('button', { name: 'Add customer' }));

    expect(await screen.findByText('Alex Morgan added.')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', CUSTOMERS_API)).toEqual([
      {
        name: 'Alex Morgan',
        companyName: null,
        email: 'alex@cafe.example',
        phone: null,
        address: null,
        notes: null,
      },
    ]);
  });

  it('edits only the changed fields', async () => {
    const { user, fetchMock } = await openCustomers('STAFF', {
      [`PATCH ${CUSTOMERS_API}/${riverside.id}`]: json(200, {
        customer: { ...riverside, phone: '+1 555 0199' },
      }),
    });

    await user.click(
      within(await screen.findByRole('table')).getByRole('button', { name: 'Edit Jamie Rivera' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit customer' });
    await user.clear(within(dialog).getByLabelText('Phone'));
    await user.type(within(dialog).getByLabelText('Phone'), '+1 555 0199');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Customer saved.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', `${CUSTOMERS_API}/${riverside.id}`)).toEqual([
      { phone: '+1 555 0199' },
    ]);
  });

  it('archives after confirmation and restores directly (ADMIN)', async () => {
    const archived = { ...brightline, isActive: false };
    const { user, fetchMock } = await openCustomers('ADMIN', {
      [`GET ${CUSTOMERS_API}`]: json(200, customerPage([riverside, archived])),
      [`POST ${CUSTOMERS_API}/${riverside.id}/archive`]: json(200, {
        customer: { ...riverside, isActive: false },
      }),
      [`POST ${CUSTOMERS_API}/${archived.id}/restore`]: json(200, {
        customer: { ...archived, isActive: true },
      }),
    });

    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Archive Jamie Rivera' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive customer?' });
    expect(within(dialog).getByText(/stays on their existing orders/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Jamie Rivera archived.')).toBeVisible();
    await user.click(within(table).getByRole('button', { name: 'Restore Sam Patel' }));
    expect(await screen.findByText('Sam Patel restored.')).toBeVisible();

    expect(sentBodies(fetchMock, 'POST', `${CUSTOMERS_API}/${riverside.id}/archive`)).toHaveLength(
      1,
    );
  });

  it('hides archive and restore from STAFF', async () => {
    await openCustomers('STAFF', {
      [`GET ${CUSTOMERS_API}`]: json(
        200,
        customerPage([riverside, { ...brightline, isActive: false }]),
      ),
    });
    await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: /^Archive / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Restore / })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Edit / }).length).toBeGreaterThan(0);
  });
});

describe('CustomerDetailPage', () => {
  it('shows contact details and recent orders, linking to all of them', async () => {
    const orders = [
      testOrder(),
      testOrder({ id: '0198c0de-0000-7000-8000-0000000001a9', orderNumber: 'SO-1009' }),
    ];
    await renderCatalog(
      `${CUSTOMERS_APP}/${riverside.id}`,
      'STAFF',
      {
        [`GET ${CUSTOMERS_API}/${riverside.id}`]: json(200, {
          customer: { ...riverside, orderCount: 7 },
        }),
        [`GET ${ORG_API}/orders`]: json(200, orderPage(orders.map(toListItem), { totalItems: 7 })),
      },
      { waitForHeading: /Jamie Rivera/ },
    );

    expect(screen.getByText('purchasing@riverside.example')).toBeVisible();
    const recent = await screen.findByRole('list', { name: 'Recent orders' });
    expect(within(recent).getByRole('link', { name: 'SO-1001' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'All 7 orders' })).toHaveAttribute(
      'href',
      `${ORG_APP}/orders?customerId=${riverside.id}`,
    );
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('shows "not found" for unknown or foreign customers', async () => {
    await renderCatalog(`${CUSTOMERS_APP}/${riverside.id}`, 'OWNER', {
      [`GET ${CUSTOMERS_API}/${riverside.id}`]: apiError(
        404,
        'CUSTOMER_NOT_FOUND',
        'Customer not found.',
      ),
    });

    expect(await screen.findByRole('heading', { name: 'Customer not found' })).toBeVisible();
  });

  it('shows a loading state', async () => {
    await renderCatalog(`${CUSTOMERS_APP}/${riverside.id}`, 'OWNER', {
      [`GET ${CUSTOMERS_API}/${riverside.id}`]: pending(),
    });

    expect(await screen.findByText('Loading customer')).toBeInTheDocument();
  });
});
