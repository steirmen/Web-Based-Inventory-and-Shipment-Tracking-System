import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createCustomer, createOrder, createWarehouse } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, createTeam, NON_EXISTENT_ID } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const base = (organizationId: string) => `/organizations/${organizationId}/customers`;

const logs = (organizationId: string, action?: string) =>
  prisma.activityLog.findMany({
    where: { organizationId, entityType: 'Customer', ...(action ? { action } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

describe('POST /organizations/:id/customers', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s creates a customer with normalized fields',
    async (who) => {
      const team = await createTeam();

      const response = await api()
        .post(base(team.organization.id))
        .set('Cookie', team[who].cookie)
        .send({
          name: '  Jamie   Rivera ',
          companyName: ' Riverside   Dental ',
          email: ' Purchasing@Riverside.EXAMPLE ',
          phone: ' +1 (555) 0101 ',
          address: '  12 Harbor Road  ',
          notes: '   ',
        })
        .expect(201);

      expect(response.body.customer).toEqual({
        id: expect.any(String),
        name: 'Jamie Rivera',
        companyName: 'Riverside Dental',
        email: 'purchasing@riverside.example',
        phone: '+1 (555) 0101',
        address: '12 Harbor Road',
        notes: null,
        isActive: true,
        orderCount: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const [log] = await logs(team.organization.id, 'CUSTOMER_CREATED');
      expect(log).toMatchObject({
        actorUserId: team[who].user.id,
        entityId: response.body.customer.id,
        metadata: { name: 'Jamie Rivera' },
      });
      // Contact details stay out of the activity log.
      expect(JSON.stringify(log?.metadata)).not.toContain('riverside.example');
    },
  );

  it.each([
    ['a missing name', { name: '   ' }, 'name'],
    ['a too long name', { name: 'n'.repeat(201) }, 'name'],
    ['an invalid email', { name: 'A', email: 'not-an-email' }, 'email'],
    ['an invalid phone', { name: 'A', phone: 'call me' }, 'phone'],
    ['too long notes', { name: 'A', notes: 'x'.repeat(2001) }, 'notes'],
    [
      'organizationId in the body',
      { name: 'A', organizationId: NON_EXISTENT_ID },
      'organizationId',
    ],
    ['an id in the body', { name: 'A', id: NON_EXISTENT_ID }, 'id'],
    ['isActive in the body', { name: 'A', isActive: false }, 'isActive'],
  ])('rejects %s', async (_case, body, field) => {
    const team = await createTeam();

    const response = await api()
      .post(base(team.organization.id))
      .set('Cookie', team.owner.cookie)
      .send(body)
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await prisma.customer.count()).toBe(0);
  });
});

describe('GET /organizations/:id/customers', () => {
  async function customers() {
    const team = await createTeam();
    const org = team.organization.id;
    const warehouse = await createWarehouse(org);
    const clinic = await createCustomer(org, {
      name: 'Jamie Rivera',
      companyName: 'Riverside Dental',
      email: 'purchasing@riverside.example',
    });
    const studio = await createCustomer(org, {
      name: 'Sam Patel',
      companyName: 'Brightline Studio',
      phone: '+1 555 0102',
    });
    const archived = await createCustomer(org, { name: 'Alex Old', isActive: false });
    const percent = await createCustomer(org, { name: '100% Organic' });
    await createOrder(org, warehouse.id, { customerId: clinic.id });
    await createOrder(org, warehouse.id, { customerId: clinic.id });
    const list = (query = '') =>
      api()
        .get(`${base(org)}${query}`)
        .set('Cookie', team.staff.cookie)
        .expect(200);
    return { team, org, clinic, studio, archived, percent, list };
  }

  const names = (body: { items: { name: string }[] }) => body.items.map((item) => item.name);

  it('lists by name with order counts, and filters, searches, sorts, and paginates on the server', async () => {
    const { list } = await customers();

    const all = await list();
    const active = await list('?status=ACTIVE');
    const archivedOnly = await list('?status=ARCHIVED');
    const byCompany = await list('?search=brightline');
    const byEmail = await list('?search=RIVERSIDE.example');
    const byPhone = await list('?search=0102');
    const literal = await list('?search=100%25');
    const byCompanyDesc = await list('?sortBy=companyName&sortOrder=desc');
    const page2 = await list('?pageSize=2&page=2');

    expect(names(all.body)).toEqual(['100% Organic', 'Alex Old', 'Jamie Rivera', 'Sam Patel']);
    expect(all.body.items.find((c: { name: string }) => c.name === 'Jamie Rivera').orderCount).toBe(
      2,
    );
    expect(names(active.body)).toEqual(['100% Organic', 'Jamie Rivera', 'Sam Patel']);
    expect(names(archivedOnly.body)).toEqual(['Alex Old']);
    expect(names(byCompany.body)).toEqual(['Sam Patel']);
    expect(names(byEmail.body)).toEqual(['Jamie Rivera']);
    expect(names(byPhone.body)).toEqual(['Sam Patel']);
    expect(names(literal.body)).toEqual(['100% Organic']);
    // Customers without a company sort last.
    expect(names(byCompanyDesc.body).slice(0, 2)).toEqual(['Jamie Rivera', 'Sam Patel']);
    expect(page2.body).toMatchObject({
      items: [expect.objectContaining({ name: 'Jamie Rivera' }), expect.anything()],
      pagination: { page: 2, pageSize: 2, totalItems: 4, totalPages: 2 },
    });
  });

  it('validates the query (whitelisted sort, status, page size)', async () => {
    const team = await createTeam();
    const get = (query: string) =>
      api()
        .get(`${base(team.organization.id)}${query}`)
        .set('Cookie', team.owner.cookie);

    for (const query of ['?sortBy=email', '?status=DELETED', '?pageSize=101', '?page=0']) {
      const response = await get(query).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('is not available to non-members, and requires a session', async () => {
    const team = await createTeam();
    const outsider = await createSignedInUser();

    const response = await api()
      .get(base(team.organization.id))
      .set('Cookie', outsider.cookie)
      .expect(404);
    await api().get(base(team.organization.id)).expect(401);

    expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });
});

describe('GET/PATCH /organizations/:id/customers/:customerId', () => {
  it('returns one customer; unknown, malformed, and foreign ids are CUSTOMER_NOT_FOUND', async () => {
    const team = await createTeam();
    const other = await createTeam('other');
    const customer = await createCustomer(team.organization.id, { name: 'Jamie' });
    const foreign = await createCustomer(other.organization.id, { name: 'Foreign' });
    const get = (id: string) =>
      api()
        .get(`${base(team.organization.id)}/${id}`)
        .set('Cookie', team.staff.cookie);

    const found = await get(customer.id).expect(200);
    expect(found.body.customer).toMatchObject({ id: customer.id, name: 'Jamie' });
    for (const id of [NON_EXISTENT_ID, 'nope', foreign.id]) {
      const response = await get(id).expect(404);
      expect(response.body.code).toBe('CUSTOMER_NOT_FOUND');
    }
  });

  it.each(['owner', 'admin', 'staff'] as const)(
    '%s updates contact fields; only real changes are logged, by field name',
    async (who) => {
      const team = await createTeam();
      const customer = await createCustomer(team.organization.id, {
        name: 'Jamie',
        email: 'old@clinic.example',
      });
      const patch = (body: object) =>
        api()
          .patch(`${base(team.organization.id)}/${customer.id}`)
          .set('Cookie', team[who].cookie)
          .send(body);

      const updated = await patch({ email: 'New@Clinic.example', phone: '555 0101' }).expect(200);
      await patch({ email: 'new@clinic.example', name: 'Jamie' }).expect(200);
      const cleared = await patch({ phone: '  ' }).expect(200);

      expect(updated.body.customer).toMatchObject({
        email: 'new@clinic.example',
        phone: '555 0101',
      });
      expect(cleared.body.customer.phone).toBeNull();
      const events = await logs(team.organization.id, 'CUSTOMER_UPDATED');
      expect(events.map((log) => log.metadata)).toEqual([
        { name: 'Jamie', changedFields: ['email', 'phone'] },
        { name: 'Jamie', changedFields: ['phone'] },
      ]);
      expect(JSON.stringify(events)).not.toContain('clinic.example');
    },
  );

  it('keeps the status out of reach of PATCH and rejects ownership fields', async () => {
    const team = await createTeam();
    const customer = await createCustomer(team.organization.id);
    const patch = (body: object) =>
      api()
        .patch(`${base(team.organization.id)}/${customer.id}`)
        .set('Cookie', team.owner.cookie)
        .send(body);

    const status = await patch({ isActive: false }).expect(400);
    const organization = await patch({ organizationId: NON_EXISTENT_ID }).expect(400);
    const nullName = await patch({ name: null }).expect(400);

    expect(status.body.code).toBe('CUSTOMER_STATUS_INVALID');
    expect(organization.body.code).toBe('VALIDATION_ERROR');
    expect(nullName.body.details[0].field).toBe('name');
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({
      isActive: true,
      organizationId: team.organization.id,
    });
  });
});

describe('archive and restore', () => {
  it.each(['owner', 'admin'] as const)(
    '%s archives and restores idempotently, logging only real transitions',
    async (who) => {
      const team = await createTeam();
      const customer = await createCustomer(team.organization.id, { name: 'Jamie' });
      const post = (action: 'archive' | 'restore') =>
        api()
          .post(`${base(team.organization.id)}/${customer.id}/${action}`)
          .set('Cookie', team[who].cookie)
          .expect(200);

      const archived = await post('archive');
      await post('archive');
      const restored = await post('restore');
      await post('restore');

      expect(archived.body.customer.isActive).toBe(false);
      expect(restored.body.customer.isActive).toBe(true);
      expect((await logs(team.organization.id)).map((log) => log.action)).toEqual([
        'CUSTOMER_ARCHIVED',
        'CUSTOMER_RESTORED',
      ]);
    },
  );

  it('forbids STAFF from archiving and restoring', async () => {
    const team = await createTeam();
    const customer = await createCustomer(team.organization.id);

    for (const action of ['archive', 'restore']) {
      const response = await api()
        .post(`${base(team.organization.id)}/${customer.id}/${action}`)
        .set('Cookie', team.staff.cookie)
        .expect(403);
      expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    }
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).isActive).toBe(
      true,
    );
  });

  it('keeps an archived customer on its orders, and has no delete route', async () => {
    const team = await createTeam();
    const warehouse = await createWarehouse(team.organization.id);
    const customer = await createCustomer(team.organization.id, { name: 'Jamie' });
    const order = await createOrder(team.organization.id, warehouse.id, {
      customerId: customer.id,
    });

    await api()
      .post(`${base(team.organization.id)}/${customer.id}/archive`)
      .set('Cookie', team.owner.cookie)
      .expect(200);
    await api()
      .delete(`${base(team.organization.id)}/${customer.id}`)
      .set('Cookie', team.owner.cookie)
      .expect(404);
    const detail = await api()
      .get(`/organizations/${team.organization.id}/orders/${order.id}`)
      .set('Cookie', team.owner.cookie)
      .expect(200);

    expect(detail.body.order.customer).toEqual({
      id: customer.id,
      name: 'Jamie',
      companyName: null,
      isActive: false,
    });
    expect(await prisma.customer.count({ where: { id: customer.id } })).toBe(1);
  });
});
