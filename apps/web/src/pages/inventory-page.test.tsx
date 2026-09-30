import type { InventoryItem, MemberRole } from '@app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog, sentBodies } from '@/test/catalog-fixtures';
import {
  closedWarehouse,
  eastWarehouse,
  inventoryPage,
  keyboard,
  keyboardInEast,
  keyboardInMain,
  mainWarehouse,
  testInventory,
  testMovement,
} from '@/test/inventory-fixtures';
import { apiError, json, pending } from '@/test/mock-api';

const INVENTORY_APP = `${ORG_APP}/inventory`;
const INVENTORY_API = `${ORG_API}/inventory`;

/**
 * Inventory page as `role`. `rows` answers the page's list request; the
 * dialogs' per-product stock request (productId + pageSize=100) is answered
 * from `stock`.
 */
async function openInventory(
  role: MemberRole,
  rows: InventoryItem[] = [keyboardInMain, keyboardInEast],
  extra: Parameters<typeof renderCatalog>[2] = {},
  { path = INVENTORY_APP, stock = rows }: { path?: string; stock?: InventoryItem[] } = {},
) {
  const app = await renderCatalog(
    path,
    role,
    {
      [`GET ${ORG_API}/warehouses`]: json(200, {
        warehouses: [mainWarehouse, eastWarehouse, closedWarehouse],
      }),
      [`GET ${INVENTORY_API}`]: (_init, url) =>
        Response.json(
          inventoryPage(
            url.searchParams.get('pageSize') === '100'
              ? stock.filter((item) => item.product.id === url.searchParams.get('productId'))
              : rows,
          ),
        ),
      ...extra,
    },
    { waitForHeading: 'Inventory' },
  );
  return app;
}

const listRequests = (fetchMock: Awaited<ReturnType<typeof openInventory>>['fetchMock']) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === INVENTORY_API && url.searchParams.get('pageSize') !== '100')
    .map((url) => url.searchParams);

const table = () => screen.findByRole('table');

describe('InventoryPage', () => {
  it('shows stock per warehouse with quantity, minimum, and status', async () => {
    await openInventory('STAFF');

    const [, mainRow, eastRow] = within(await table()).getAllByRole('row');
    expect(within(mainRow).getByRole('link', { name: 'Keyboard K2' })).toHaveAttribute(
      'href',
      `${ORG_APP}/products/${keyboard.id}`,
    );
    expect(within(mainRow).getByText('KEY-002')).toBeInTheDocument();
    expect(within(mainRow).getByText('12')).toBeInTheDocument();
    expect(within(mainRow).getByText('In stock')).toBeInTheDocument();
    expect(within(eastRow).getByText('Low stock')).toBeInTheDocument();
  });

  it('sends URL filters to the server and writes filter changes back to the URL', async () => {
    const { user, fetchMock, router } = await openInventory(
      'OWNER',
      [keyboardInMain],
      {},
      {
        path: `${INVENTORY_APP}?status=LOW_STOCK&page=2`,
      },
    );
    await table();

    expect(Object.fromEntries(listRequests(fetchMock)[0]!)).toEqual({
      status: 'LOW_STOCK',
      sortBy: 'productName',
      sortOrder: 'asc',
      page: '2',
      pageSize: '20',
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Warehouse' }), 'East Depot');
    expect(router.state.location.search).toBe(`?warehouseId=${eastWarehouse.id}&status=LOW_STOCK`);
    await user.type(screen.getByRole('searchbox', { name: 'Search inventory' }), 'key');
    await waitFor(() =>
      expect(listRequests(fetchMock).some((params) => params.get('search') === 'key')).toBe(true),
    );
    const last = listRequests(fetchMock).at(-1)!;
    expect(last.get('warehouseId')).toBe(eastWarehouse.id);
    expect(last.get('page')).toBe('1');
  });

  it('offers Receive, Issue, and Damage to STAFF — not Adjust or Transfer', async () => {
    await openInventory('STAFF');
    const row = within(await table()).getAllByRole('row')[1]!;

    expect(within(row).getByRole('button', { name: /^Receive Keyboard K2/ })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^Issue Keyboard K2/ })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^Damage Keyboard K2/ })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Adjust/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Transfer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transfer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive stock' })).toBeInTheDocument();
  });

  it('offers every operation to ADMIN and explains archived rows instead', async () => {
    const archivedProduct = testInventory({
      id: '0198c0de-0000-7000-8000-0000000000e3',
      product: { ...keyboard, status: 'ARCHIVED' },
    });
    const inClosed = testInventory({
      id: '0198c0de-0000-7000-8000-0000000000e4',
      warehouse: { ...closedWarehouse },
    });
    await openInventory('ADMIN', [keyboardInMain, archivedProduct, inClosed]);
    const [, active, archived, closed] = within(await table()).getAllByRole('row');

    for (const label of ['Receive', 'Issue', 'Damage', 'Adjust', 'Transfer']) {
      expect(within(active!).getByRole('button', { name: new RegExp(`^${label} `) })).toBeVisible();
    }
    expect(within(archived!).getByText('Product archived: no stock changes.')).toBeVisible();
    expect(within(archived!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(closed!).getByText('Warehouse archived: no stock changes.')).toBeVisible();
    expect(
      within(active!).getByRole('link', { name: /History of Keyboard K2 in MAIN/ }),
    ).toHaveAttribute(
      'href',
      `${ORG_APP}/stock-movements?warehouseId=${mainWarehouse.id}&productId=${keyboard.id}`,
    );
  });

  it('issues stock with a current/remaining preview and refreshes the list', async () => {
    const after = { ...keyboardInMain, quantity: 7 };
    const { user, fetchMock } = await openInventory('STAFF', [keyboardInMain], {
      [`POST ${INVENTORY_API}/issue`]: json(200, {
        inventory: after,
        movement: testMovement({
          movementType: 'SALE',
          quantityDelta: -5,
          quantityBefore: 12,
          quantityAfter: 7,
        }),
      }),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Issue Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Issue stock' });
    expect(within(dialog).getByLabelText('Warehouse')).toHaveValue(mainWarehouse.id);
    await user.type(within(dialog).getByLabelText('Quantity to remove'), '5');

    await waitFor(() => expect(within(dialog).getByText('Current stock')).toBeVisible());
    const previewList = within(dialog).getByLabelText('Preview');
    expect(previewList).toHaveTextContent('Current stock12');
    expect(previewList).toHaveTextContent('Quantity to remove5');
    expect(previewList).toHaveTextContent('Remaining stock7');

    const listsBefore = listRequests(fetchMock).length;
    await user.click(within(dialog).getByRole('button', { name: 'Issue' }));

    expect(
      await screen.findByText(/Issued 5 × Keyboard K2 from MAIN\. Remaining: 7\./),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/issue`)).toEqual([
      { warehouseId: mainWarehouse.id, productId: keyboard.id, quantity: 5, reason: null },
    ]);
    await waitFor(() => expect(listRequests(fetchMock).length).toBeGreaterThan(listsBefore));
  });

  it('blocks more than the known stock and shows the server answer on the quantity field', async () => {
    const { user, fetchMock } = await openInventory('OWNER', [keyboardInMain], {
      [`POST ${INVENTORY_API}/damage`]: apiError(
        409,
        'INVENTORY_INSUFFICIENT_STOCK',
        'Not enough stock: 2 units available in MAIN.',
      ),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Damage Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Record damage' });
    await waitFor(() => expect(within(dialog).getByText('Current stock')).toBeVisible());
    await user.type(within(dialog).getByLabelText('Quantity to write off'), '13');
    await user.type(within(dialog).getByLabelText('Reason'), 'Water');
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));

    expect(within(dialog).getByLabelText('Quantity to write off')).toHaveAccessibleDescription(
      'Only 12 units are available.',
    );
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/damage`)).toHaveLength(0);

    // Someone else removed stock meanwhile: the server has the final word.
    await user.clear(within(dialog).getByLabelText('Quantity to write off'));
    await user.type(within(dialog).getByLabelText('Quantity to write off'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Quantity to write off')).toHaveAccessibleDescription(
        'Not enough stock: 2 units available in MAIN.',
      ),
    );
  });

  it('requires a reason for damage and rejects fractional units', async () => {
    const { user, fetchMock } = await openInventory('STAFF', [keyboardInMain]);

    await user.click(within(await table()).getByRole('button', { name: /^Damage Keyboard K2/ }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Quantity to write off'), '1.5');
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));

    expect(within(dialog).getByLabelText('Quantity to write off')).toHaveAccessibleDescription(
      'Enter a whole number of units greater than 0.',
    );
    expect(within(dialog).getByLabelText('Reason')).toHaveAccessibleDescription(
      'Describe what happened to the stock.',
    );
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/damage`)).toHaveLength(0);
  });

  it('adjusts to a counted quantity and says so when nothing changed', async () => {
    const { user, fetchMock } = await openInventory('ADMIN', [keyboardInMain], {
      [`POST ${INVENTORY_API}/adjust`]: json(200, { inventory: keyboardInMain, movement: null }),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Adjust Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust stock' });
    await user.type(within(dialog).getByLabelText('New quantity'), '9');
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Preview')).toHaveTextContent('Adjustment−3'),
    );
    await user.clear(within(dialog).getByLabelText('New quantity'));
    await user.type(within(dialog).getByLabelText('New quantity'), '12');
    expect(within(dialog).getByLabelText('Preview')).toHaveTextContent('AdjustmentNo change');
    await user.type(within(dialog).getByLabelText('Reason'), 'Cycle count');
    await user.click(within(dialog).getByRole('button', { name: 'Save count' }));

    expect(
      await screen.findByText('No changes were made: the count matches the current quantity.'),
    ).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/adjust`)).toEqual([
      {
        warehouseId: mainWarehouse.id,
        productId: keyboard.id,
        newQuantity: 12,
        reason: 'Cycle count',
      },
    ]);
  });

  it('transfers between two different warehouses with a before/after preview', async () => {
    const { user, fetchMock } = await openInventory('OWNER', [keyboardInMain, keyboardInEast], {
      [`POST ${INVENTORY_API}/transfer`]: json(200, {
        transferGroupId: '0198c0de-0000-7000-8000-0000000000b1',
        source: { ...keyboardInMain, quantity: 7 },
        destination: { ...keyboardInEast, quantity: 8 },
        movements: [
          testMovement({ movementType: 'TRANSFER_OUT', quantityDelta: -5 }),
          testMovement({ movementType: 'TRANSFER_IN', quantityDelta: 5 }),
        ],
      }),
    });

    await user.click(
      within(await table()).getAllByRole('button', { name: /^Transfer Keyboard K2/ })[0]!,
    );
    const dialog = screen.getByRole('dialog', { name: 'Transfer stock' });
    const to = within(dialog).getByLabelText('To warehouse');
    // The source and archived warehouses are not offered as destinations.
    expect(within(to).queryByRole('option', { name: /MAIN/ })).not.toBeInTheDocument();
    expect(within(to).queryByRole('option', { name: /OLD/ })).not.toBeInTheDocument();
    await user.selectOptions(to, 'East Depot (EAST)');
    await user.type(within(dialog).getByLabelText('Quantity to transfer'), '5');

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Preview')).toHaveTextContent(
        'East Depot (EAST)3 units',
      ),
    );
    expect(within(dialog).getByLabelText('Preview')).toHaveTextContent(
      'Main Warehouse (MAIN)12 units',
    );
    expect(within(dialog).getByLabelText('Preview')).toHaveTextContent('AfterMAIN 7EAST 8');
    const listsBefore = listRequests(fetchMock).length;
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }));

    expect(
      await screen.findByText(/Transferred 5 × Keyboard K2 from MAIN \(now 7\) to EAST \(now 8\)/),
    ).toBeVisible();
    // One refetch of the list refreshes both rows (source and destination).
    await waitFor(() => expect(listRequests(fetchMock).length).toBeGreaterThan(listsBefore));
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/transfer`)).toEqual([
      {
        sourceWarehouseId: mainWarehouse.id,
        destinationWarehouseId: eastWarehouse.id,
        productId: keyboard.id,
        quantity: 5,
        reason: null,
      },
    ]);
  });

  it('prevents duplicate submissions while a request runs', async () => {
    const { user, fetchMock } = await openInventory('STAFF', [keyboardInMain], {
      [`POST ${INVENTORY_API}/receive`]: pending(),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Receive Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Receive stock' });
    await user.type(within(dialog).getByLabelText('Quantity to receive'), '4');
    const submit = within(dialog).getByRole('button', { name: 'Receive' });
    await user.click(submit);
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/receive`)).toHaveLength(1);
  });

  it('shows the product picker when receiving from the page header', async () => {
    const { user } = await openInventory('STAFF', [], {
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
        pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
      }),
    });

    expect(await screen.findByText('No stock recorded yet')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Receive stock' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Receive stock' });
    await user.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Product' }),
      'Keyboard K2 (KEY-002)',
    );
    expect(within(dialog).getByRole('combobox', { name: 'Warehouse' })).toHaveValue('');
    expect(
      within(within(dialog).getByRole('combobox', { name: 'Warehouse' })).queryByRole('option', {
        name: /Old Store/,
      }),
    ).not.toBeInTheDocument();
  });
});

describe('InventoryPage states', () => {
  it('shows a loading state, then a safe error with a working retry', async () => {
    let fail = true;
    let release = () => {};
    const firstAnswer = new Promise<void>((resolve) => (release = resolve));
    const { user } = await openInventory('STAFF', [], {
      [`GET ${INVENTORY_API}`]: async () => {
        await firstAnswer;
        return fail
          ? Response.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
              { status: 500 },
            )
          : Response.json(inventoryPage([keyboardInMain]));
      },
    });

    expect(screen.getByText('Loading inventory')).toBeInTheDocument();
    release();
    expect(await screen.findByText("We couldn't load inventory")).toBeVisible();
    expect(screen.getByText('Something went wrong on our side. Please try again.')).toBeVisible();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await table()).toBeVisible();
  });

  it('shows an empty state for filters without matches, and clears them', async () => {
    const { user, router } = await openInventory(
      'STAFF',
      [],
      {},
      { path: `${INVENTORY_APP}?search=nothing&status=OUT_OF_STOCK` },
    );

    expect(await screen.findByText('No stock matches your filters.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search inventory' })).toHaveValue('');
  });

  it('paginates on the server and keeps the page in the URL', async () => {
    const { user, router, fetchMock } = await openInventory('STAFF', [], {
      [`GET ${INVENTORY_API}`]: (_init, url) =>
        Response.json({
          items: [keyboardInMain],
          pagination: {
            page: Number(url.searchParams.get('page')),
            pageSize: 20,
            totalItems: 45,
            totalPages: 3,
          },
        }),
    });
    await table();
    expect(screen.getByText(/Page 1 of 3/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(router.state.location.search).toBe('?page=2');
    await waitFor(() => expect(listRequests(fetchMock).at(-1)?.get('page')).toBe('2'));
    expect(await screen.findByText(/Page 2 of 3/)).toBeVisible();
  });

  it('labels low and out-of-stock rows in text (not only by color) and blocks removals from empty stock', async () => {
    const empty = testInventory({
      id: '0198c0de-0000-7000-8000-0000000000e5',
      quantity: 0,
      status: 'OUT_OF_STOCK',
    });
    await openInventory('OWNER', [empty, keyboardInEast]);
    const [, emptyRow, lowRow] = within(await table()).getAllByRole('row');

    expect(within(emptyRow!).getByText('Out of stock')).toBeVisible();
    expect(within(lowRow!).getByText('Low stock')).toBeVisible();
    for (const label of ['Issue', 'Damage', 'Transfer']) {
      expect(
        within(emptyRow!).getByRole('button', { name: new RegExp(`^${label} `) }),
      ).toBeDisabled();
    }
    expect(within(emptyRow!).getByRole('button', { name: /^Receive / })).toBeEnabled();
    expect(within(emptyRow!).getByRole('button', { name: /^Adjust / })).toBeEnabled();
  });
});

describe('InventoryPage stock operations', () => {
  it('receives stock: validates, submits once, reports the result, and refreshes stock and totals', async () => {
    const { user, fetchMock } = await openInventory('STAFF', [keyboardInMain], {
      [`POST ${INVENTORY_API}/receive`]: json(200, {
        inventory: { ...keyboardInMain, quantity: 16 },
        movement: testMovement({ quantityDelta: 4, quantityBefore: 12, quantityAfter: 16 }),
      }),
    });
    const warehouseRequests = () =>
      fetchMock.mock.calls.filter(
        ([input]) => new URL(String(input)).pathname === `${ORG_API}/warehouses`,
      ).length;

    await user.click(within(await table()).getByRole('button', { name: /^Receive Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Receive stock' });
    await user.click(within(dialog).getByRole('button', { name: 'Receive' }));
    expect(within(dialog).getByLabelText('Quantity to receive')).toHaveAccessibleDescription(
      'Enter a whole number of units greater than 0.',
    );
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/receive`)).toHaveLength(0);

    await user.type(within(dialog).getByLabelText('Quantity to receive'), '4');
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Preview')).toHaveTextContent('New stock16'),
    );
    const listsBefore = listRequests(fetchMock).length;
    const warehousesBefore = warehouseRequests();
    await user.click(within(dialog).getByRole('button', { name: 'Receive' }));

    expect(
      await screen.findByText('Received 4 × Keyboard K2 into MAIN. New stock: 16.'),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/receive`)).toEqual([
      { warehouseId: mainWarehouse.id, productId: keyboard.id, quantity: 4, reason: null },
    ]);
    await waitFor(() => expect(listRequests(fetchMock).length).toBeGreaterThan(listsBefore));
    await waitFor(() => expect(warehouseRequests()).toBeGreaterThan(warehousesBefore));
  });

  it.each([
    [
      'INVENTORY_WAREHOUSE_INACTIVE',
      'Warehouse MAIN is archived. Restore it before moving stock in or out of it.',
    ],
    [
      'INVENTORY_CONCURRENCY_CONFLICT',
      'Another stock change for the same items was in progress. Nothing was changed; please try again.',
    ],
  ] as const)('keeps the dialog open and shows %s from the server', async (code, message) => {
    const { user } = await openInventory('STAFF', [keyboardInMain], {
      [`POST ${INVENTORY_API}/receive`]: apiError(409, code, message),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Receive Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Receive stock' });
    await user.type(within(dialog).getByLabelText('Quantity to receive'), '4');
    await user.click(within(dialog).getByRole('button', { name: 'Receive' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(within(dialog).getByRole('button', { name: 'Receive' })).toBeEnabled();
  });

  it('records damage with a reason and refreshes the list', async () => {
    const { user, fetchMock } = await openInventory('STAFF', [keyboardInMain], {
      [`POST ${INVENTORY_API}/damage`]: json(200, {
        inventory: { ...keyboardInMain, quantity: 10 },
        movement: testMovement({
          movementType: 'DAMAGE',
          quantityDelta: -2,
          quantityBefore: 12,
          quantityAfter: 10,
          reason: 'Dropped pallet',
        }),
      }),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Damage Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Record damage' });
    await user.type(within(dialog).getByLabelText('Quantity to write off'), '2');
    await user.type(within(dialog).getByLabelText('Reason'), '  Dropped pallet ');
    const listsBefore = listRequests(fetchMock).length;
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));

    expect(
      await screen.findByText('Wrote off 2 × Keyboard K2 from MAIN. Remaining: 10.'),
    ).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', `${INVENTORY_API}/damage`)).toEqual([
      {
        warehouseId: mainWarehouse.id,
        productId: keyboard.id,
        quantity: 2,
        reason: 'Dropped pallet',
      },
    ]);
    await waitFor(() => expect(listRequests(fetchMock).length).toBeGreaterThan(listsBefore));
  });

  it('adjusts with a current/new/delta preview and refreshes the list after a real change', async () => {
    const { user, fetchMock } = await openInventory('OWNER', [keyboardInMain], {
      [`POST ${INVENTORY_API}/adjust`]: json(200, {
        inventory: { ...keyboardInMain, quantity: 15 },
        movement: testMovement({
          movementType: 'ADJUSTMENT',
          quantityDelta: 3,
          quantityBefore: 12,
          quantityAfter: 15,
        }),
      }),
    });

    await user.click(within(await table()).getByRole('button', { name: /^Adjust Keyboard K2/ }));
    const dialog = screen.getByRole('dialog', { name: 'Adjust stock' });
    await user.type(within(dialog).getByLabelText('New quantity'), '15');
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Preview')).toHaveTextContent(
        'Current12New15Adjustment+3',
      ),
    );
    await user.type(within(dialog).getByLabelText('Reason'), 'Recount');
    const listsBefore = listRequests(fetchMock).length;
    await user.click(within(dialog).getByRole('button', { name: 'Save count' }));

    expect(await screen.findByText('Adjusted Keyboard K2 in MAIN by +3 to 15.')).toBeVisible();
    await waitFor(() => expect(listRequests(fetchMock).length).toBeGreaterThan(listsBefore));
  });
});
