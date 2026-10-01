import { sql } from '../support/db.js';
import { expect, orgPath, test } from '../support/fixtures.js';

/**
 * Role restrictions, both ways: the UI hides what a role may not do, AND the
 * API refuses it when called directly with that user's session.
 */

test.describe('RBAC', () => {
  test('STAFF sees no restricted actions in the UI', async ({ pageAs, data }) => {
    const page = await pageAs('staff');

    await page.goto(orgPath(data.acme, '/warehouses'));
    await expect(page.getByRole('heading', { level: 1, name: 'Warehouses' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Main Warehouse' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create warehouse' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Edit|Archive) / })).toHaveCount(0);

    await page.goto(orgPath(data.acme, '/inventory'));
    await expect(
      page.getByRole('button', { name: /^Receive Ballpoint Pen/ }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Issue Ballpoint Pen/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Adjust|Transfer)\b/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toHaveCount(0);

    await page.goto(orgPath(data.acme, `/orders/${data.orders.o4.id}`));
    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(data.orders.o4.number) }),
    ).toBeVisible();
    for (const action of ['Process', 'Cancel order', 'Mark as shipped', 'Complete']) {
      await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0);
    }
    await page.goto(orgPath(data.acme, `/orders/${data.orders.o5.id}`));
    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(data.orders.o5.number) }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete', exact: true })).toHaveCount(0);

    await page.goto(orgPath(data.acme, '/customers'));
    await expect(page.getByRole('link', { name: 'Riverside Dental' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Archive / })).toHaveCount(0);

    await page.goto(orgPath(data.acme, '/team'));
    await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
    await expect(page.getByText('Invite a member')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /^Role for / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove|Make owner/ })).toHaveCount(0);
  });

  test('STAFF is refused by the API for every restricted mutation, and nothing changes', async ({
    apiAs,
    data,
  }) => {
    const api = await apiAs('staff');
    const base = `/organizations/${data.acme}`;
    const { main, east } = data.warehouses;
    const [{ id: staffMember }] = await sql<{ id: string }>(
      'SELECT id FROM organization_members WHERE organization_id = $1 AND role = $2 LIMIT 1',
      [data.acme, 'ADMIN'],
    );
    const before = await sql(
      `SELECT (SELECT count(*) FROM warehouses WHERE organization_id = $1) AS warehouses,
              (SELECT count(*) FROM stock_movements WHERE organization_id = $1) AS movements,
              (SELECT string_agg(status::text, ',' ORDER BY order_number) FROM orders WHERE organization_id = $1) AS statuses,
              (SELECT count(*) FROM customers WHERE organization_id = $1 AND is_active) AS active_customers,
              (SELECT count(*) FROM organization_invitations WHERE organization_id = $1) AS invitations,
              (SELECT string_agg(role::text, ',' ORDER BY id) FROM organization_members WHERE organization_id = $1) AS roles`,
      [data.acme],
    );

    const attempts: [
      string,
      () => Promise<{ status(): number; json(): Promise<{ code?: string }> }>,
    ][] = [
      [
        'create warehouse',
        () => api.post(`${base}/warehouses`, { data: { name: 'Nope', code: 'NOPE' } }),
      ],
      [
        'edit warehouse',
        () => api.patch(`${base}/warehouses/${east}`, { data: { name: 'Renamed' } }),
      ],
      ['archive warehouse', () => api.post(`${base}/warehouses/${east}/archive`)],
      [
        'adjust stock',
        () =>
          api.post(`${base}/inventory/adjust`, {
            data: { warehouseId: main, productId: data.products.pen, newQuantity: 1, reason: 'x' },
          }),
      ],
      [
        'transfer stock',
        () =>
          api.post(`${base}/inventory/transfer`, {
            data: {
              sourceWarehouseId: main,
              destinationWarehouseId: east,
              productId: data.products.pen,
              quantity: 1,
            },
          }),
      ],
      ['process order', () => api.post(`${base}/orders/${data.orders.o4.id}/process`)],
      ['cancel order', () => api.post(`${base}/orders/${data.orders.o4.id}/cancel`)],
      ['complete order', () => api.post(`${base}/orders/${data.orders.o5.id}/complete`)],
      [
        'archive customer',
        () => api.post(`${base}/customers/${data.customers.archivable}/archive`),
      ],
      [
        'invite member',
        () => api.post(`${base}/invitations`, { data: { email: 'x@e2e.test', role: 'STAFF' } }),
      ],
      [
        'change a role',
        () => api.patch(`${base}/members/${staffMember}/role`, { data: { role: 'STAFF' } }),
      ],
      ['remove member', () => api.delete(`${base}/members/${staffMember}`)],
      [
        'transfer ownership',
        () => api.post(`${base}/ownership/transfer`, { data: { targetMemberId: staffMember } }),
      ],
    ];
    const results: [string, number, string | undefined][] = [];
    for (const [name, attempt] of attempts) {
      const response = await attempt();
      results.push([name, response.status(), (await response.json()).code]);
    }
    expect(results).toEqual(attempts.map(([name]) => [name, 403, 'ORGANIZATION_FORBIDDEN']));

    const after = await sql(
      `SELECT (SELECT count(*) FROM warehouses WHERE organization_id = $1) AS warehouses,
              (SELECT count(*) FROM stock_movements WHERE organization_id = $1) AS movements,
              (SELECT string_agg(status::text, ',' ORDER BY order_number) FROM orders WHERE organization_id = $1) AS statuses,
              (SELECT count(*) FROM customers WHERE organization_id = $1 AND is_active) AS active_customers,
              (SELECT count(*) FROM organization_invitations WHERE organization_id = $1) AS invitations,
              (SELECT string_agg(role::text, ',' ORDER BY id) FROM organization_members WHERE organization_id = $1) AS roles`,
      [data.acme],
    );
    expect(after).toEqual(before);
  });

  test('ADMIN manages operations but cannot transfer ownership (UI and API)', async ({
    pageAs,
    apiAs,
    data,
  }) => {
    const page = await pageAs('admin');
    await page.goto(orgPath(data.acme, '/warehouses'));
    await expect(page.getByRole('button', { name: 'Create warehouse' })).toBeVisible();
    await page.goto(orgPath(data.acme, '/inventory'));
    await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible();
    await page.goto(orgPath(data.acme, `/orders/${data.orders.o4.id}`));
    await expect(page.getByRole('button', { name: 'Process', exact: true })).toBeVisible();
    await page.goto(orgPath(data.acme, '/team'));
    await expect(page.getByText('Invite a member')).toBeVisible();
    await expect(page.getByRole('button', { name: /Make owner/ })).toHaveCount(0);

    const [{ id: staffMember }] = await sql<{ id: string }>(
      `SELECT m.id FROM organization_members m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND u.email = 'staff@e2e.test'`,
      [data.acme],
    );
    const api = await apiAs('admin');
    const response = await api.post(`/organizations/${data.acme}/ownership/transfer`, {
      data: { targetMemberId: staffMember },
    });
    expect([response.status(), (await response.json()).code]).toEqual([
      403,
      'ORGANIZATION_FORBIDDEN',
    ]);

    // The OWNER sees the ownership action.
    const owner = await pageAs('owner');
    await owner.goto(orgPath(data.acme, '/team'));
    await expect(owner.getByRole('button', { name: /Make owner/ }).first()).toBeVisible();
  });
});
