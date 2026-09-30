import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ORG_API, ORG_APP, renderCatalog, sentBodies } from '@/test/catalog-fixtures';
import {
  closedWarehouse,
  eastWarehouse,
  mainWarehouse,
  testWarehouse,
} from '@/test/inventory-fixtures';
import { apiError, json, pending } from '@/test/mock-api';

const WAREHOUSES_APP = `${ORG_APP}/warehouses`;
const WAREHOUSES_API = `${ORG_API}/warehouses`;

describe('WarehousesPage', () => {
  it('lists warehouses with code, address, status, and stock totals', async () => {
    await renderCatalog(
      WAREHOUSES_APP,
      'STAFF',
      { [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [mainWarehouse, closedWarehouse] }) },
      { waitForHeading: 'Warehouses' },
    );

    const table = await screen.findByRole('table');
    const [, mainRow, oldRow] = within(table).getAllByRole('row');
    expect(within(mainRow).getByRole('link', { name: 'Main Warehouse' })).toHaveAttribute(
      'href',
      `${WAREHOUSES_APP}/${mainWarehouse.id}`,
    );
    expect(within(mainRow).getByText('MAIN')).toBeInTheDocument();
    expect(within(mainRow).getByText('1 Harbour Road')).toBeInTheDocument();
    expect(within(mainRow).getByText('Active')).toBeInTheDocument();
    expect(within(mainRow).getByText('120')).toBeInTheDocument();
    expect(within(oldRow).getByText('Archived')).toBeInTheDocument();
  });

  it('hides management actions from STAFF', async () => {
    await renderCatalog(
      WAREHOUSES_APP,
      'STAFF',
      { [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [mainWarehouse, closedWarehouse] }) },
      { waitForHeading: 'Warehouses' },
    );
    const table = await screen.findByRole('table');

    expect(screen.queryByRole('button', { name: 'Create warehouse' })).not.toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'View Main Warehouse' })).toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: /Edit|Archive|Restore/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the empty, loading, and error states', async () => {
    await renderCatalog(
      WAREHOUSES_APP,
      'ADMIN',
      { [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [] }) },
      { waitForHeading: 'Warehouses' },
    );
    expect(await screen.findByText('No warehouses yet')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Create warehouse' }).length).toBeGreaterThan(0);
  });

  it('shows a safe error with retry', async () => {
    await renderCatalog(WAREHOUSES_APP, 'OWNER', {
      [`GET ${WAREHOUSES_API}`]: apiError(500, 'INTERNAL_ERROR', 'stack'),
    });

    expect(await screen.findByText("We couldn't load warehouses")).toBeVisible();
    expect(screen.queryByText('stack')).not.toBeInTheDocument();
  });

  it('creates a warehouse; the code is normalized and a duplicate lands on the code field', async () => {
    let attempts = 0;
    const created = testWarehouse({
      id: '0198c0de-0000-7000-8000-0000000000a9',
      name: 'North Hub',
      code: 'NORTH-1',
      address: null,
      productCount: 0,
      totalUnits: 0,
    });
    const { user, fetchMock } = await renderCatalog(
      WAREHOUSES_APP,
      'ADMIN',
      {
        [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [mainWarehouse] }),
        [`POST ${WAREHOUSES_API}`]: () =>
          ++attempts === 1
            ? apiError(409, 'WAREHOUSE_CODE_TAKEN', 'Another warehouse already uses this code.')()
            : Response.json({ warehouse: created }, { status: 201 }),
      },
      { waitForHeading: 'Warehouses' },
    );

    await user.click(screen.getByRole('button', { name: 'Create warehouse' }));
    const dialog = screen.getByRole('dialog', { name: 'New warehouse' });
    await user.type(within(dialog).getByLabelText('Name'), ' North   Hub ');
    await user.type(within(dialog).getByLabelText('Code'), 'north-1 ');
    await user.click(within(dialog).getByRole('button', { name: 'Create warehouse' }));

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Code')).toHaveAccessibleDescription(
        'Another warehouse already uses this code.',
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create warehouse' }));

    expect(await screen.findByText('North Hub created.')).toBeVisible();
    expect(sentBodies(fetchMock, 'POST', WAREHOUSES_API)[0]).toEqual({
      name: 'North Hub',
      code: 'NORTH-1',
      address: null,
    });
  });

  it('validates the code before sending', async () => {
    const { user, fetchMock } = await renderCatalog(
      WAREHOUSES_APP,
      'OWNER',
      { [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [] }) },
      { waitForHeading: 'Warehouses' },
    );

    await user.click(screen.getAllByRole('button', { name: 'Create warehouse' })[0]!);
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Depot');
    await user.type(within(dialog).getByLabelText('Code'), 'east 1');
    await user.click(within(dialog).getByRole('button', { name: 'Create warehouse' }));

    expect(within(dialog).getByLabelText('Code')).toHaveAccessibleDescription(
      /letters, numbers, - and _/,
    );
    expect(sentBodies(fetchMock, 'POST', WAREHOUSES_API)).toHaveLength(0);
  });

  it('edits name and address; the code is read-only', async () => {
    const { user, fetchMock } = await renderCatalog(
      WAREHOUSES_APP,
      'ADMIN',
      {
        [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [mainWarehouse] }),
        [`PATCH ${WAREHOUSES_API}/${mainWarehouse.id}`]: json(200, {
          warehouse: { ...mainWarehouse, name: 'Main Hub' },
        }),
      },
      { waitForHeading: 'Warehouses' },
    );
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Edit Main Warehouse' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit warehouse' });
    expect(within(dialog).getByLabelText('Code')).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Main Hub');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Warehouse saved.')).toBeVisible();
    expect(sentBodies(fetchMock, 'PATCH', `${WAREHOUSES_API}/${mainWarehouse.id}`)).toEqual([
      { name: 'Main Hub' },
    ]);
  });

  it('archives after confirmation and restores directly', async () => {
    const { user, fetchMock } = await renderCatalog(
      WAREHOUSES_APP,
      'OWNER',
      {
        [`GET ${WAREHOUSES_API}`]: json(200, { warehouses: [mainWarehouse, closedWarehouse] }),
        [`POST ${WAREHOUSES_API}/${mainWarehouse.id}/archive`]: json(200, {
          warehouse: { ...mainWarehouse, isActive: false },
        }),
        [`POST ${WAREHOUSES_API}/${closedWarehouse.id}/restore`]: json(200, {
          warehouse: { ...closedWarehouse, isActive: true },
        }),
      },
      { waitForHeading: 'Warehouses' },
    );
    const table = await screen.findByRole('table');

    await user.click(within(table).getByRole('button', { name: 'Archive Main Warehouse' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive warehouse?' });
    expect(dialog).toHaveTextContent('keeps its stock and history');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Main Warehouse archived.')).toBeVisible();

    await user.click(within(table).getByRole('button', { name: 'Restore Old Store' }));
    expect(await screen.findByText('Old Store restored.')).toBeVisible();
    expect(
      sentBodies(fetchMock, 'POST', `${WAREHOUSES_API}/${mainWarehouse.id}/archive`),
    ).toHaveLength(1);
  });
});

describe('WarehouseDetailPage', () => {
  const DETAIL_APP = `${WAREHOUSES_APP}/${mainWarehouse.id}`;
  const DETAIL_API = `${WAREHOUSES_API}/${mainWarehouse.id}`;

  it('shows the warehouse with totals and links to its inventory and movements', async () => {
    await renderCatalog(
      DETAIL_APP,
      'STAFF',
      { [`GET ${DETAIL_API}`]: json(200, { warehouse: mainWarehouse }) },
      { waitForHeading: 'Main Warehouse' },
    );

    expect(screen.getAllByText('MAIN').length).toBeGreaterThan(0);
    expect(screen.getByText('1 Harbour Road')).toBeVisible();
    expect(screen.getByText('120')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View inventory' })).toHaveAttribute(
      'href',
      `${ORG_APP}/inventory?warehouseId=${mainWarehouse.id}`,
    );
    expect(screen.getByRole('link', { name: 'View stock movements' })).toHaveAttribute(
      'href',
      `${ORG_APP}/stock-movements?warehouseId=${mainWarehouse.id}`,
    );
    expect(screen.queryByRole('button', { name: /Edit|Archive/ })).not.toBeInTheDocument();
  });

  it('explains the archived state and offers restore to admins', async () => {
    await renderCatalog(
      `${WAREHOUSES_APP}/${closedWarehouse.id}`,
      'ADMIN',
      {
        [`GET ${WAREHOUSES_API}/${closedWarehouse.id}`]: json(200, { warehouse: closedWarehouse }),
      },
      { waitForHeading: 'Old Store' },
    );

    expect(screen.getByText('This warehouse is archived')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeVisible();
  });

  it('shows "not found" for unknown or foreign warehouses', async () => {
    await renderCatalog(
      `${WAREHOUSES_APP}/${eastWarehouse.id}`,
      'OWNER',
      {
        [`GET ${WAREHOUSES_API}/${eastWarehouse.id}`]: apiError(
          404,
          'WAREHOUSE_NOT_FOUND',
          'Warehouse not found.',
        ),
      },
      { waitForHeading: 'Warehouse not found' },
    );

    expect(screen.getByRole('link', { name: 'View all warehouses' })).toBeVisible();
  });

  it('shows a loading state', async () => {
    await renderCatalog(DETAIL_APP, 'OWNER', { [`GET ${DETAIL_API}`]: pending() });

    expect(await screen.findByText('Loading warehouse')).toBeVisible();
  });
});
