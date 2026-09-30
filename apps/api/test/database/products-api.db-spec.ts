import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createProduct } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, createTeam, type TeamMember } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const base = (organizationId: string) => `/organizations/${organizationId}/products`;

const validProduct = (overrides: Record<string, unknown> = {}) => ({
  name: 'Wireless Mouse',
  sku: 'ELE-MOUSE-01',
  description: 'Two-button mouse',
  price: '24.99',
  cost: '11.40',
  minimumStock: 10,
  ...overrides,
});

const create = (organizationId: string, actor: TeamMember, body: Record<string, unknown>) =>
  api().post(base(organizationId)).set('Cookie', actor.cookie).send(body);

const list = (organizationId: string, actor: TeamMember, query = '') =>
  api()
    .get(`${base(organizationId)}${query}`)
    .set('Cookie', actor.cookie);

describe('POST /organizations/:id/products', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s can create a product; money is exact decimal strings',
    async (who) => {
      const team = await createTeam();
      const category = await prisma.category.create({
        data: { organizationId: team.organization.id, name: 'Electronics' },
      });

      const response = await create(
        team.organization.id,
        team[who],
        validProduct({
          name: '  Wireless   Mouse ',
          sku: ' ELE-Mouse-01 ',
          categoryId: category.id,
          price: '0.1',
          cost: '1234567890.99',
        }),
      ).expect(201);

      expect(response.body.product).toEqual({
        id: expect.any(String),
        name: 'Wireless Mouse',
        sku: 'ELE-Mouse-01',
        description: 'Two-button mouse',
        price: '0.10',
        cost: '1234567890.99',
        minimumStock: 10,
        status: 'ACTIVE',
        category: { id: category.id, name: 'Electronics' },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const log = await prisma.activityLog.findFirstOrThrow({
        where: { action: 'PRODUCT_CREATED' },
      });
      expect(log).toMatchObject({
        actorUserId: team[who].user.id,
        entityType: 'Product',
        entityId: response.body.product.id,
        metadata: { name: 'Wireless Mouse', sku: 'ELE-Mouse-01' },
      });
    },
  );

  it('creates a product without a category', async () => {
    const team = await createTeam();

    const response = await create(
      team.organization.id,
      team.owner,
      validProduct({ categoryId: null }),
    ).expect(201);

    expect(response.body.product.category).toBeNull();
  });

  it('rejects a duplicate SKU in the same organization, but not across organizations', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    await create(a.organization.id, a.owner, validProduct()).expect(201);

    const duplicate = await create(
      a.organization.id,
      a.admin,
      validProduct({ name: 'Other' }),
    ).expect(409);
    await create(b.organization.id, b.owner, validProduct()).expect(201);

    expect(duplicate.body.code).toBe('PRODUCT_SKU_TAKEN');
  });

  it('rejects a category from another organization', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await prisma.category.create({
      data: { organizationId: b.organization.id, name: 'Theirs' },
    });

    const response = await create(
      a.organization.id,
      a.owner,
      validProduct({ categoryId: foreign.id }),
    ).expect(422);

    expect(response.body.code).toBe('PRODUCT_CATEGORY_NOT_FOUND');
    expect(await prisma.product.count()).toBe(0);
  });

  it.each([
    ['a numeric price (floats are not accepted)', { price: 24.99 }, 'price'],
    ['a negative price', { price: '-1.00' }, 'price'],
    ['three decimals', { price: '1.999' }, 'price'],
    ['a price too large for NUMERIC(12,2)', { price: '12345678901' }, 'price'],
    ['a negative cost', { cost: '-0.01' }, 'cost'],
    ['a missing cost', { cost: undefined }, 'cost'],
    ['a negative minimum stock', { minimumStock: -1 }, 'minimumStock'],
    ['a fractional minimum stock', { minimumStock: 1.5 }, 'minimumStock'],
    ['a blank name', { name: '  ' }, 'name'],
    ['an overly long name', { name: 'n'.repeat(201) }, 'name'],
    ['a SKU with spaces', { sku: 'ABC 123' }, 'sku'],
    ['an overly long SKU', { sku: 'S'.repeat(65) }, 'sku'],
    ['an overly long description', { description: 'd'.repeat(2001) }, 'description'],
    ['a malformed categoryId', { categoryId: 'nope' }, 'categoryId'],
  ])('rejects %s', async (_case, overrides, field) => {
    const team = await createTeam();

    const response = await create(team.organization.id, team.owner, validProduct(overrides)).expect(
      400,
    );

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it('rejects an organizationId in the body (never trusted)', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');

    await create(
      a.organization.id,
      a.owner,
      validProduct({ organizationId: b.organization.id }),
    ).expect(400);

    expect(await prisma.product.count()).toBe(0);
  });
});

describe('GET /organizations/:id/products/:productId', () => {
  it('returns the product with its category', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Office' },
    });
    const product = await createProduct(team.organization.id, {
      categoryId: category.id,
      description: 'Blue ink',
      price: '8.5',
      cost: null,
    });

    const response = await api()
      .get(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.staff.cookie)
      .expect(200);

    expect(response.body.product).toMatchObject({
      id: product.id,
      description: 'Blue ink',
      price: '8.50',
      cost: null,
      category: { id: category.id, name: 'Office' },
    });
    expect(Object.keys(response.body.product)).not.toContain('organizationId');
  });

  it('returns PRODUCT_NOT_FOUND for unknown, malformed, and other organizations’ products', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await createProduct(b.organization.id);

    for (const id of [foreign.id, '01900000-0000-7000-8000-000000000000', 'x']) {
      const response = await api()
        .get(`${base(a.organization.id)}/${id}`)
        .set('Cookie', a.owner.cookie)
        .expect(404);
      expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
    }
  });

  it('is not available to non-members', async () => {
    const team = await createTeam();
    const product = await createProduct(team.organization.id);
    const outsider = await createSignedInUser();

    const response = await api()
      .get(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', outsider.cookie)
      .expect(404);

    expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });
});

describe('PATCH /organizations/:id/products/:productId', () => {
  it('updates fields, moves between categories, and logs the changes', async () => {
    const team = await createTeam();
    const office = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Office' },
    });
    const product = await createProduct(team.organization.id, {
      price: '10.00',
      cost: '4.00',
      categoryId: office.id,
    });

    const moved = await api()
      .patch(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Renamed', price: '12.5', categoryId: null, minimumStock: 3 })
      .expect(200);

    expect(moved.body.product).toMatchObject({
      name: 'Renamed',
      price: '12.50',
      cost: '4.00',
      category: null,
      minimumStock: 3,
    });
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: 'PRODUCT_UPDATED' } });
    expect(log.metadata).toEqual({
      sku: product.sku,
      changes: {
        name: { from: product.name, to: 'Renamed' },
        price: { from: '10.00', to: '12.50' },
        categoryId: { from: office.id, to: null },
        minimumStock: { from: 0, to: 3 },
      },
    });
  });

  it('treats equal decimal values as unchanged', async () => {
    const team = await createTeam();
    const product = await createProduct(team.organization.id, { price: '10.00' });

    await api()
      .patch(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ price: '10' })
      .expect(200);

    expect(await prisma.activityLog.count()).toBe(0);
  });

  it('rejects a SKU used by another product', async () => {
    const team = await createTeam();
    await createProduct(team.organization.id, { sku: 'TAKEN-1' });
    const product = await createProduct(team.organization.id, { sku: 'FREE-1' });

    const response = await api()
      .patch(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ sku: 'TAKEN-1' })
      .expect(409);

    expect(response.body.code).toBe('PRODUCT_SKU_TAKEN');
  });

  it('rejects a category from another organization', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await prisma.category.create({
      data: { organizationId: b.organization.id, name: 'Theirs' },
    });
    const product = await createProduct(a.organization.id);

    const response = await api()
      .patch(`${base(a.organization.id)}/${product.id}`)
      .set('Cookie', a.owner.cookie)
      .send({ categoryId: foreign.id })
      .expect(422);

    expect(response.body.code).toBe('PRODUCT_CATEGORY_NOT_FOUND');
  });

  it('does not change status (PRODUCT_STATUS_INVALID) or accept id/organizationId/createdAt', async () => {
    const team = await createTeam();
    const product = await createProduct(team.organization.id);
    const patch = (body: Record<string, unknown>) =>
      api()
        .patch(`${base(team.organization.id)}/${product.id}`)
        .set('Cookie', team.owner.cookie)
        .send(body);

    const statusResponse = await patch({ status: 'ARCHIVED' }).expect(400);
    expect(statusResponse.body.code).toBe('PRODUCT_STATUS_INVALID');
    for (const body of [
      { id: product.id },
      { organizationId: team.organization.id },
      { createdAt: new Date().toISOString() },
    ]) {
      const response = await patch(body).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).status).toBe(
      'ACTIVE',
    );
  });

  it('rejects null for required fields', async () => {
    const team = await createTeam();
    const product = await createProduct(team.organization.id);

    const response = await api()
      .patch(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ price: null })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('refuses to edit an archived product', async () => {
    const team = await createTeam();
    const product = await createProduct(team.organization.id, { status: 'ARCHIVED' });

    const response = await api()
      .patch(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ name: 'Nope' })
      .expect(409);

    expect(response.body.code).toBe('PRODUCT_ARCHIVED');
  });
});

describe('archive and restore', () => {
  const post = (organizationId: string, productId: string, action: string, actor: TeamMember) =>
    api()
      .post(`${base(organizationId)}/${productId}/${action}`)
      .set('Cookie', actor.cookie);

  it.each(['owner', 'admin'] as const)(
    '%s archives and restores; repeats are safe and logged once',
    async (who) => {
      const team = await createTeam();
      const product = await createProduct(team.organization.id);

      const archived = await post(team.organization.id, product.id, 'archive', team[who]).expect(
        200,
      );
      await post(team.organization.id, product.id, 'archive', team[who]).expect(200);
      const restored = await post(team.organization.id, product.id, 'restore', team[who]).expect(
        200,
      );
      await post(team.organization.id, product.id, 'restore', team[who]).expect(200);

      expect(archived.body.product.status).toBe('ARCHIVED');
      expect(restored.body.product.status).toBe('ACTIVE');
      const logs = await prisma.activityLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(logs.map((log) => log.action)).toEqual(['PRODUCT_ARCHIVED', 'PRODUCT_RESTORED']);
      expect(logs[0]).toMatchObject({ entityId: product.id, actorUserId: team[who].user.id });
    },
  );

  it('forbids STAFF from archiving or restoring', async () => {
    const team = await createTeam();
    const active = await createProduct(team.organization.id);
    const archived = await createProduct(team.organization.id, { status: 'ARCHIVED' });

    for (const [id, action] of [
      [active.id, 'archive'],
      [archived.id, 'restore'],
    ]) {
      const response = await post(team.organization.id, id, action, team.staff).expect(403);
      expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    }
    expect((await prisma.product.findUniqueOrThrow({ where: { id: active.id } })).status).toBe(
      'ACTIVE',
    );
  });

  it('has no hard-delete endpoint', async () => {
    const team = await createTeam();
    const product = await createProduct(team.organization.id);

    await api()
      .delete(`${base(team.organization.id)}/${product.id}`)
      .set('Cookie', team.owner.cookie)
      .expect(404);

    expect(await prisma.product.count()).toBe(1);
  });
});

describe('GET /organizations/:id/products (list)', () => {
  async function catalog() {
    const team = await createTeam();
    const other = await createTeam('other-org');
    const office = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Office' },
    });
    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
    const rows = [
      {
        name: 'Ballpoint Pen',
        sku: 'OFF-PEN',
        price: '1.50',
        cost: '0.40',
        categoryId: office.id,
        createdAt: at(1),
      },
      {
        name: 'Copy Paper',
        sku: 'OFF-PAPER',
        price: '6.90',
        cost: null,
        categoryId: office.id,
        createdAt: at(2),
      },
      { name: 'Wireless Mouse', sku: 'ELE-MOUSE', price: '24.99', cost: '11.40', createdAt: at(3) },
      {
        name: 'Mouse Pad',
        sku: 'ELE-PAD',
        price: '4.00',
        cost: '1.00',
        status: 'ARCHIVED' as const,
        createdAt: at(4),
      },
      { name: 'Promo 50% Pack', sku: 'PRM_50', price: '9.00', cost: '3.00', createdAt: at(5) },
    ];
    for (const row of rows) await createProduct(team.organization.id, row);
    await createProduct(other.organization.id, { name: 'Foreign Mouse', sku: 'ELE-MOUSE' });
    return { team, office, other };
  }

  const names = (body: { items: { name: string }[] }) => body.items.map((item) => item.name);

  it('returns only this organization’s products, newest first, with pagination metadata', async () => {
    const { team } = await catalog();

    const response = await list(team.organization.id, team.staff).expect(200);

    expect(names(response.body)).toEqual([
      'Promo 50% Pack',
      'Mouse Pad',
      'Wireless Mouse',
      'Copy Paper',
      'Ballpoint Pen',
    ]);
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 5,
      totalPages: 1,
    });
    expect(response.body.items[0]).not.toHaveProperty('description');
  });

  it('searches name and SKU case-insensitively', async () => {
    const { team } = await catalog();

    const byName = await list(team.organization.id, team.owner, '?search=mOuSe').expect(200);
    const bySku = await list(team.organization.id, team.owner, '?search=off-p').expect(200);

    expect(names(byName.body)).toEqual(['Mouse Pad', 'Wireless Mouse']);
    expect(names(bySku.body)).toEqual(['Copy Paper', 'Ballpoint Pen']);
  });

  it('treats LIKE wildcards in the search literally', async () => {
    const { team } = await catalog();

    const percent = await list(
      team.organization.id,
      team.owner,
      `?search=${encodeURIComponent('50%')}`,
    ).expect(200);
    const underscore = await list(team.organization.id, team.owner, '?search=_').expect(200);
    const nothing = await list(
      team.organization.id,
      team.owner,
      `?search=${encodeURIComponent('%')}`,
    ).expect(200);

    expect(names(percent.body)).toEqual(['Promo 50% Pack']);
    expect(names(underscore.body)).toEqual(['Promo 50% Pack']);
    expect(names(nothing.body)).toEqual(['Promo 50% Pack']);
  });

  it('filters by category and status', async () => {
    const { team, office } = await catalog();

    const inOffice = await list(
      team.organization.id,
      team.owner,
      `?categoryId=${office.id}`,
    ).expect(200);
    const archived = await list(team.organization.id, team.owner, '?status=ARCHIVED').expect(200);
    const combined = await list(
      team.organization.id,
      team.owner,
      `?status=ACTIVE&search=mouse`,
    ).expect(200);

    expect(names(inOffice.body)).toEqual(['Copy Paper', 'Ballpoint Pen']);
    expect(names(archived.body)).toEqual(['Mouse Pad']);
    expect(names(combined.body)).toEqual(['Wireless Mouse']);
  });

  it('rejects a category filter from another organization', async () => {
    const { team, other } = await catalog();
    const foreign = await prisma.category.create({
      data: { organizationId: other.organization.id, name: 'Theirs' },
    });

    const response = await list(
      team.organization.id,
      team.owner,
      `?categoryId=${foreign.id}`,
    ).expect(422);

    expect(response.body.code).toBe('PRODUCT_CATEGORY_NOT_FOUND');
  });

  it.each([
    [
      'name',
      'asc',
      ['Ballpoint Pen', 'Copy Paper', 'Mouse Pad', 'Promo 50% Pack', 'Wireless Mouse'],
    ],
    [
      'price',
      'desc',
      ['Wireless Mouse', 'Promo 50% Pack', 'Copy Paper', 'Mouse Pad', 'Ballpoint Pen'],
    ],
    [
      'cost',
      'asc',
      ['Ballpoint Pen', 'Mouse Pad', 'Promo 50% Pack', 'Wireless Mouse', 'Copy Paper'],
    ],
    [
      'sku',
      'asc',
      ['Wireless Mouse', 'Mouse Pad', 'Copy Paper', 'Ballpoint Pen', 'Promo 50% Pack'],
    ],
    [
      'createdAt',
      'asc',
      ['Ballpoint Pen', 'Copy Paper', 'Wireless Mouse', 'Mouse Pad', 'Promo 50% Pack'],
    ],
  ])('sorts by %s %s (unknown cost last)', async (sortBy, sortOrder, expected) => {
    const { team } = await catalog();

    const response = await list(
      team.organization.id,
      team.owner,
      `?sortBy=${sortBy}&sortOrder=${sortOrder}`,
    ).expect(200);

    expect(names(response.body)).toEqual(expected);
  });

  it('only allows whitelisted sort fields', async () => {
    const { team } = await catalog();

    for (const sortBy of ['organizationId', 'description', 'name;DROP TABLE products']) {
      const response = await list(
        team.organization.id,
        team.owner,
        `?sortBy=${encodeURIComponent(sortBy)}`,
      ).expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('paginates without overlap and caps the page size', async () => {
    const { team } = await catalog();

    const first = await list(
      team.organization.id,
      team.owner,
      '?sortBy=name&sortOrder=asc&page=1&pageSize=2',
    ).expect(200);
    const third = await list(
      team.organization.id,
      team.owner,
      '?sortBy=name&sortOrder=asc&page=3&pageSize=2',
    ).expect(200);
    const beyond = await list(team.organization.id, team.owner, '?page=9&pageSize=2').expect(200);

    expect(names(first.body)).toEqual(['Ballpoint Pen', 'Copy Paper']);
    expect(names(third.body)).toEqual(['Wireless Mouse']);
    expect(third.body.pagination).toEqual({ page: 3, pageSize: 2, totalItems: 5, totalPages: 3 });
    expect(beyond.body.items).toEqual([]);
    for (const query of ['?pageSize=101', '?pageSize=0', '?page=0', '?page=abc']) {
      await list(team.organization.id, team.owner, query).expect(400);
    }
  });

  it('is not available to non-members, whatever the query', async () => {
    const { team } = await catalog();
    const outsider = await createSignedInUser();

    const response = await api()
      .get(`${base(team.organization.id)}?search=mouse`)
      .set('Cookie', outsider.cookie)
      .expect(404);

    expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });
});
