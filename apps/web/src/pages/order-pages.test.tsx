import type { MemberRole, Order, OrderAction } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog, sentBodies } from '@/test/catalog-fixtures';
import {
  eastWarehouse,
  inventoryPage,
  keyboardInMain,
  mainWarehouse,
} from '@/test/inventory-fixtures';
import { formatMoney } from '@/lib/money';
import { apiError, json, pending } from '@/test/mock-api';
import {
  customerPage,
  keyboardProduct,
  penProduct,
  riverside,
  testOrder,
  testOrderItem,
} from '@/test/sales-fixtures';

type Handler = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>;

const ORDERS_API = `${ORG_API}/orders`;
const ORDERS_APP = `${ORG_APP}/orders`;

/** Chooses a customer with the customer search (type, then pick the result). */
async function pickCustomer(user: ReturnType<typeof userEvent.setup>, name: string) {
  const search = await screen.findByRole('searchbox', { name: 'Customer' });
  await user.click(search);
  const results = await screen.findByRole('list', { name: 'Matching customers' });
  await user.click(await within(results).findByRole('button', { name: new RegExp(name) }));
}

/** Shared API answers for the builder: customers, warehouses, products, and per-line stock. */
function builderApi(extra: Parameters<typeof renderCatalog>[2] = {}) {
  return {
    [`GET ${ORG_API}/customers`]: json(200, customerPage([riverside])),
    [`GET ${ORG_API}/warehouses`]: json(200, { warehouses: [mainWarehouse, eastWarehouse] }),
    [`GET ${ORG_API}/products`]: json(200, {
      items: [keyboardProduct, penProduct],
      pagination: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 },
    }),
    // Stock: 12 keyboards in MAIN, none in EAST, 5 pens anywhere.
    [`GET ${ORG_API}/inventory`]: (_init: RequestInit | undefined, url: URL) => {
      const productId = url.searchParams.get('productId');
      const warehouseId = url.searchParams.get('warehouseId');
      const quantity =
        productId === keyboardProduct.id ? (warehouseId === mainWarehouse.id ? 12 : 0) : 5;
      return Response.json(inventoryPage([{ ...keyboardInMain, quantity }]));
    },
    ...extra,
  };
}

const addProduct = async (
  user: Awaited<ReturnType<typeof renderCatalog>>['user'],
  label: string,
) => {
  await user.selectOptions(await screen.findByRole('combobox', { name: 'Add a product' }), label);
  await user.click(screen.getByRole('button', { name: 'Add to order' }));
};

describe('New order (builder)', () => {
  it('creates a draft: customer, warehouse, lines with stock, exact totals, then opens it', async () => {
    const created = testOrder({
      id: '0198c0de-0000-7000-8000-0000000001b1',
      orderNumber: 'SO-1003',
    });
    const { user, router, fetchMock } = await renderCatalog(
      `${ORDERS_APP}/new`,
      'STAFF',
      builderApi({
        [`POST ${ORDERS_API}`]: json(201, { order: created }),
        [`GET ${ORDERS_API}/${created.id}`]: json(200, { order: created }),
      }),
      { waitForHeading: 'New order' },
    );

    await pickCustomer(user, 'Jamie Rivera');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Warehouse' }),
      'Main Warehouse (MAIN)',
    );
    await addProduct(user, 'Keyboard K2 (KEY-002)');
    await addProduct(user, 'Ballpoint Pen (PEN-1)');
    const lines = screen.getByRole('list', { name: 'Order lines' });
    expect(await within(lines).findByText('12 in stock in MAIN')).toBeVisible();

    await user.clear(within(lines).getByLabelText('Quantity of Keyboard K2'));
    await user.type(within(lines).getByLabelText('Quantity of Keyboard K2'), '2');
    await user.clear(within(lines).getByLabelText('Quantity of Ballpoint Pen'));
    await user.type(within(lines).getByLabelText('Quantity of Ballpoint Pen'), '3');
    // 2 × 24.99 + 3 × 0.10 = 49.98 + 0.30 (exact, no float drift)
    expect(screen.getByLabelText('Order total')).toHaveTextContent(formatMoney('50.28'));

    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`${ORDERS_APP}/${created.id}`));
    expect(sentBodies(fetchMock, 'POST', ORDERS_API)).toEqual([
      {
        customerId: riverside.id,
        warehouseId: mainWarehouse.id,
        notes: null,
        items: [
          { productId: keyboardProduct.id, quantity: 2 },
          { productId: penProduct.id, quantity: 3 },
        ],
      },
    ]);
    expect(await screen.findByText('Draft SO-1003 created.')).toBeVisible();
  });

  it('warns about stock per warehouse, blocks invalid quantities, and removes lines', async () => {
    const { user, fetchMock } = await renderCatalog(`${ORDERS_APP}/new`, 'OWNER', builderApi(), {
      waitForHeading: 'New order',
    });

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Warehouse' }),
      'East Depot (EAST)',
    );
    await addProduct(user, 'Keyboard K2 (KEY-002)');
    const lines = screen.getByRole('list', { name: 'Order lines' });
    expect(await within(lines).findByText('0 in stock in EAST')).toBeVisible();
    expect(within(lines).getByText('More than the 0 in stock')).toBeVisible();

    await addProduct(user, 'Keyboard K2 (KEY-002)');
    expect(screen.getByText(/already on the order/)).toBeVisible();

    await user.clear(within(lines).getByLabelText('Quantity of Keyboard K2'));
    await user.type(within(lines).getByLabelText('Quantity of Keyboard K2'), '1.5');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(within(lines).getByLabelText('Quantity of Keyboard K2')).toHaveAccessibleDescription(
      `Enter a whole number from 1 to ${(1_000_000).toLocaleString()}.`,
    );
    expect(screen.getByRole('searchbox', { name: 'Customer' })).toHaveAccessibleDescription(
      'Choose a customer.',
    );
    expect(sentBodies(fetchMock, 'POST', ORDERS_API)).toHaveLength(0);

    await user.click(within(lines).getByRole('button', { name: 'Remove Keyboard K2' }));
    expect(screen.queryByRole('list', { name: 'Order lines' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Order total')).toHaveTextContent(formatMoney('0.00'));
  });

  /** Opens the builder and picks the customer and the MAIN warehouse. */
  async function readyBuilder(post: Handler) {
    const app = await renderCatalog(
      `${ORDERS_APP}/new`,
      'STAFF',
      builderApi({ [`POST ${ORDERS_API}`]: post }),
      { waitForHeading: 'New order' },
    );
    await pickCustomer(app.user, 'Jamie Rivera');
    await app.user.selectOptions(
      screen.getByRole('combobox', { name: 'Warehouse' }),
      'Main Warehouse (MAIN)',
    );
    return app;
  }

  it('sends one request even when "Create draft" is clicked twice', async () => {
    const { user, fetchMock } = await readyBuilder(pending());
    const submit = screen.getByRole('button', { name: 'Create draft' });

    await user.click(submit);
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(sentBodies(fetchMock, 'POST', ORDERS_API)).toHaveLength(1);
  });

  it('shows a server rejection on the field it belongs to', async () => {
    const { user } = await readyBuilder(
      apiError(
        409,
        'ORDER_CUSTOMER_INACTIVE',
        'Customer Jamie Rivera is archived. Restore the customer or choose another one.',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Change customer/ })).toHaveAccessibleDescription(
        'Customer Jamie Rivera is archived. Restore the customer or choose another one.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeEnabled();
  });
});

describe('New order (layout)', () => {
  it('reads as numbered steps that end with the total and the save actions', async () => {
    await renderCatalog(`${ORDERS_APP}/new`, 'STAFF', builderApi(), {
      waitForHeading: 'New order',
    });

    const steps = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(steps).toEqual(['1Customer and warehouse', '2Products', '3Review and save']);
    const review = screen
      .getByRole('heading', { level: 2, name: 'Review and save' })
      .closest('.rounded-card') as HTMLElement;
    expect(within(review).getByLabelText('Order total')).toHaveTextContent(formatMoney('0.00'));
    expect(within(review).getByRole('button', { name: 'Create draft' })).toBeVisible();
    // Back to the list, above the page header.
    expect(screen.getByRole('link', { name: 'Orders', current: false })).toHaveAttribute(
      'href',
      ORDERS_APP,
    );
  });
});

describe('Edit order (builder)', () => {
  it('keeps the saved price, sends only the changed lines, and returns to the order', async () => {
    const draft = testOrder({
      items: [testOrderItem({ unitPrice: '20.00', lineTotal: '40.00', quantity: 2 })],
      total: '40.00',
      subtotal: '40.00',
    });
    const saved = { ...draft, items: [{ ...draft.items[0]!, quantity: 5, lineTotal: '100.00' }] };
    const { user, router, fetchMock } = await renderCatalog(
      `${ORDERS_APP}/${draft.id}/edit`,
      'STAFF',
      builderApi({
        [`GET ${ORDERS_API}/${draft.id}`]: json(200, { order: draft }),
        [`PATCH ${ORDERS_API}/${draft.id}`]: json(200, { order: saved }),
      }),
      { waitForHeading: 'Edit SO-1001' },
    );
    const lines = await screen.findByRole('list', { name: 'Order lines' });

    // The saved snapshot price (20.00), not the product's current price (24.99).
    expect(within(lines).getByText(formatMoney('20.00'))).toBeVisible();
    await user.clear(within(lines).getByLabelText('Quantity of Keyboard K2'));
    await user.type(within(lines).getByLabelText('Quantity of Keyboard K2'), '5');
    expect(screen.getByLabelText('Order total')).toHaveTextContent(formatMoney('100.00'));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`${ORDERS_APP}/${draft.id}`));
    expect(sentBodies(fetchMock, 'PATCH', `${ORDERS_API}/${draft.id}`)).toEqual([
      { items: [{ productId: keyboardProduct.id, quantity: 5 }] },
    ]);
  });

  it('explains that non-draft orders can no longer be edited', async () => {
    const shipped = testOrder({ status: 'SHIPPED' });
    await renderCatalog(`${ORDERS_APP}/${shipped.id}/edit`, 'OWNER', {
      [`GET ${ORDERS_API}/${shipped.id}`]: json(200, { order: shipped }),
    });

    expect(
      await screen.findByText('This order is shipped and can no longer be edited.'),
    ).toBeVisible();
  });
});

/**
 * Order detail as `role`. The order GET answers the CURRENT state: an action
 * given as an order moves the order to it (like the server would), an action
 * given as a handler answers with that handler.
 */
async function openOrder(
  role: MemberRole,
  order: Order,
  actions: Partial<Record<OrderAction, Order | Handler>> = {},
) {
  let current = order;
  const handlers: Record<string, Handler> = {
    [`GET ${ORDERS_API}/${order.id}`]: () => Response.json({ order: current }),
  };
  for (const [action, result] of Object.entries(actions)) {
    handlers[`POST ${ORDERS_API}/${order.id}/${action}`] =
      typeof result === 'function'
        ? result
        : () => {
            current = result;
            return Response.json({ order: result });
          };
  }
  return renderCatalog(`${ORDERS_APP}/${order.id}`, role, handlers, {
    waitForHeading: /SO-1001/,
  });
}

const actionButtons = () =>
  screen
    .queryAllByRole('button')
    .map((button) => button.textContent?.trim())
    .filter((label) =>
      ['Confirm', 'Process', 'Mark as shipped', 'Complete', 'Cancel order'].includes(label ?? ''),
    );

describe('Order detail', () => {
  it('renders lines from the snapshot, totals, stock, details, and history', async () => {
    await openOrder('STAFF', testOrder({ notes: 'Deliver before noon' }));

    const table = screen.getByRole('table');
    const [, line] = within(table).getAllByRole('row');
    expect(within(line!).getByText('Keyboard K2')).toBeInTheDocument();
    expect(within(line!).getByText('KEY-002')).toBeInTheDocument();
    expect(within(line!).getByText(formatMoney('24.99'))).toBeInTheDocument();
    expect(within(line!).getByText(formatMoney('49.98'))).toBeInTheDocument();
    expect(within(line!).getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeVisible();
    expect(screen.getByText('Deliver before noon')).toBeVisible();
    expect(screen.getByRole('link', { name: /Main Warehouse \(MAIN\)/ })).toBeVisible();
    expect(screen.getByText('Created', { selector: 'span' })).toBeVisible();
  });

  it.each([
    ['OWNER', 'DRAFT', ['Confirm', 'Cancel order']],
    ['STAFF', 'DRAFT', ['Confirm']],
    ['ADMIN', 'CONFIRMED', ['Process', 'Cancel order']],
    ['STAFF', 'CONFIRMED', []],
    ['OWNER', 'PROCESSING', ['Mark as shipped']],
    ['OWNER', 'SHIPPED', ['Complete']],
    ['OWNER', 'COMPLETED', []],
    ['OWNER', 'CANCELLED', []],
  ] as const)('%s on a %s order sees %j', async (role, status, expected) => {
    await openOrder(role, testOrder({ status }));

    expect(actionButtons()).toEqual(expected);
    // Drafts can be edited by every role here (all have ORDERS_UPDATE).
    expect(Boolean(screen.queryByRole('link', { name: 'Edit' }))).toBe(status === 'DRAFT');
  });

  it('confirms after a confirmation step and shows the new status', async () => {
    const order = testOrder();
    const { user, fetchMock } = await openOrder('STAFF', order, {
      confirm: { ...order, status: 'CONFIRMED' },
    });

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm order?' });
    expect(within(dialog).getByText(/Stock is not deducted yet/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Order confirmed.')).toBeVisible();
    expect(screen.getByText('Confirmed')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${ORDERS_API}/${order.id}/confirm`)).toHaveLength(1);
  });

  it('processes with a stock preview and refreshes stock afterwards', async () => {
    const order = testOrder({ status: 'CONFIRMED' });
    const { user, fetchMock } = await openOrder('ADMIN', order, {
      process: {
        ...order,
        status: 'PROCESSING',
        items: [{ ...order.items[0]!, availableQuantity: null }],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Process' }));
    const dialog = screen.getByRole('dialog', { name: 'Process order?' });
    expect(within(dialog).getByText('Main Warehouse (MAIN)')).toBeVisible();
    const [, row] = within(within(dialog).getByRole('table')).getAllByRole('row');
    expect(row).toHaveTextContent('Keyboard K2KEY-002212');
    await user.click(within(dialog).getByRole('button', { name: 'Process order' }));

    expect(await screen.findByText('Order processed: stock was deducted.')).toBeVisible();
    expect(screen.getByText('Processing')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${ORDERS_API}/${order.id}/process`)).toHaveLength(1);
  });

  it('explains every short line when processing fails, keeps the order, and reloads it', async () => {
    const order = testOrder({
      status: 'CONFIRMED',
      items: [
        testOrderItem(),
        testOrderItem({
          id: '0198c0de-0000-7000-8000-0000000001e2',
          productId: penProduct.id,
          productName: 'Ballpoint Pen',
          sku: 'PEN-1',
          quantity: 9,
          availableQuantity: 3,
        }),
      ],
    });
    const { user, fetchMock } = await openOrder('OWNER', order, {
      process: apiError(
        409,
        'INVENTORY_INSUFFICIENT_STOCK',
        'Not enough stock in MAIN for 2 lines. Nothing was deducted.',
        [
          { field: 'items.a', messages: ['Keyboard K2 (KEY-002): 2 needed, 1 available in MAIN.'] },
          { field: 'items.b', messages: ['Ballpoint Pen (PEN-1): 9 needed, 3 available in MAIN.'] },
        ],
      ),
    });

    await user.click(screen.getByRole('button', { name: 'Process' }));
    const dialog = screen.getByRole('dialog', { name: 'Process order?' });
    // Known before sending: the pen line is short right now.
    expect(within(dialog).getByText(/One line has less stock than needed/)).toBeVisible();
    const getsBefore = fetchMock.mock.calls.filter(
      ([input, init]) =>
        (init?.method ?? 'GET') === 'GET' &&
        new URL(String(input)).pathname === `${ORDERS_API}/${order.id}`,
    ).length;
    await user.click(within(dialog).getByRole('button', { name: 'Process order' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Not enough stock in MAIN for 2 lines. Nothing was deducted.');
    expect(alert).toHaveTextContent('Ballpoint Pen (PEN-1): 9 needed, 3 available in MAIN.');
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            (init?.method ?? 'GET') === 'GET' &&
            new URL(String(input)).pathname === `${ORDERS_API}/${order.id}`,
        ).length,
      ).toBeGreaterThan(getsBefore),
    );
  });

  it.each([
    ['PROCESSING', 'Mark as shipped', 'ship', 'SHIPPED', 'Order marked as shipped.'],
    ['SHIPPED', 'Complete', 'complete', 'COMPLETED', 'Order completed.'],
    ['CONFIRMED', 'Cancel order', 'cancel', 'CANCELLED', 'Order cancelled.'],
  ] as const)('%s: "%s" runs %s after confirmation', async (status, label, action, next, done) => {
    const order = testOrder({ status });
    const { user, fetchMock } = await openOrder('OWNER', order, {
      [action]: { ...order, status: next },
    });

    await user.click(screen.getByRole('button', { name: label }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: label }));

    expect(await screen.findByText(done)).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${ORDERS_API}/${order.id}/${action}`)).toHaveLength(1);
    expect(actionButtons()).not.toContain(label);
  });

  it('shows the server answer when a transition is no longer allowed', async () => {
    const order = testOrder({ status: 'CONFIRMED' });
    const { user } = await openOrder('OWNER', order, {
      cancel: apiError(
        409,
        'ORDER_INVALID_TRANSITION',
        "Order SO-1001 is processing and can't be cancelled.",
      ),
    });

    await user.click(screen.getByRole('button', { name: 'Cancel order' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel order?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));

    expect(
      await within(dialog).findByText("Order SO-1001 is processing and can't be cancelled."),
    ).toBeVisible();
  });

  it('shows "not found" for unknown or foreign orders, and a loading state', async () => {
    const order = testOrder();
    await renderCatalog(`${ORDERS_APP}/${order.id}`, 'OWNER', {
      [`GET ${ORDERS_API}/${order.id}`]: apiError(404, 'ORDER_NOT_FOUND', 'Order not found.'),
    });
    expect(await screen.findByRole('heading', { name: 'Order not found' })).toBeVisible();
  });

  it('shows a loading state while the order loads', async () => {
    const order = testOrder();
    await renderCatalog(`${ORDERS_APP}/${order.id}`, 'OWNER', {
      [`GET ${ORDERS_API}/${order.id}`]: pending(),
    });
    expect(await screen.findByText('Loading order')).toBeInTheDocument();
  });
});
