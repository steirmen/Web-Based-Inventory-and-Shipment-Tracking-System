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

const url = (organizationId: string, categoryId?: string) =>
  `/organizations/${organizationId}/categories${categoryId ? `/${categoryId}` : ''}`;

const createCategory = (organizationId: string, actor: TeamMember, body: Record<string, unknown>) =>
  api().post(url(organizationId)).set('Cookie', actor.cookie).send(body);

describe('GET /organizations/:id/categories', () => {
  it('lists only this organization’s categories with product counts, newest first', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const older = await prisma.category.create({
      data: {
        organizationId: a.organization.id,
        name: 'Older',
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    const newer = await prisma.category.create({
      data: { organizationId: a.organization.id, name: 'Newer', description: 'Recent' },
    });
    await prisma.category.create({ data: { organizationId: b.organization.id, name: 'Foreign' } });
    await createProduct(a.organization.id, { categoryId: newer.id });
    await createProduct(a.organization.id, { categoryId: newer.id, status: 'ARCHIVED' });

    const response = await api()
      .get(url(a.organization.id))
      .set('Cookie', a.staff.cookie)
      .expect(200);

    expect(response.body).toEqual({
      categories: [
        {
          id: newer.id,
          name: 'Newer',
          description: 'Recent',
          productCount: 2,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
        expect.objectContaining({ id: older.id, productCount: 0, description: null }),
      ],
    });
  });

  it('is not available to non-members', async () => {
    const team = await createTeam();
    const outsider = await createSignedInUser();

    const response = await api()
      .get(url(team.organization.id))
      .set('Cookie', outsider.cookie)
      .expect(404);

    expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
  });
});

describe('POST /organizations/:id/categories', () => {
  it.each(['owner', 'admin', 'staff'] as const)(
    '%s can create a category (normalized input)',
    async (who) => {
      const team = await createTeam();

      const response = await createCategory(team.organization.id, team[who], {
        name: '  Office   Supplies ',
        description: '  Pens and paper  ',
      }).expect(201);

      expect(response.body.category).toMatchObject({
        name: 'Office Supplies',
        description: 'Pens and paper',
        productCount: 0,
      });
      const log = await prisma.activityLog.findFirstOrThrow({
        where: { action: 'CATEGORY_CREATED' },
      });
      expect(log).toMatchObject({
        organizationId: team.organization.id,
        actorUserId: team[who].user.id,
        entityType: 'Category',
        entityId: response.body.category.id,
        metadata: { name: 'Office Supplies' },
      });
    },
  );

  it('stores a blank description as null', async () => {
    const team = await createTeam();

    const response = await createCategory(team.organization.id, team.owner, {
      name: 'Tools',
      description: '   ',
    }).expect(201);

    expect(response.body.category.description).toBeNull();
  });

  it('rejects a duplicate name in the same organization, case-insensitively', async () => {
    const team = await createTeam();
    await createCategory(team.organization.id, team.owner, { name: 'Packaging' }).expect(201);

    const response = await createCategory(team.organization.id, team.admin, {
      name: 'PACKAGING',
    }).expect(409);

    expect(response.body.code).toBe('CATEGORY_NAME_TAKEN');
    expect(await prisma.category.count()).toBe(1);
  });

  it('allows the same name in another organization', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');

    await createCategory(a.organization.id, a.owner, { name: 'Packaging' }).expect(201);
    await createCategory(b.organization.id, b.owner, { name: 'Packaging' }).expect(201);

    expect(await prisma.category.count({ where: { name: 'Packaging' } })).toBe(2);
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['an overly long name', { name: 'n'.repeat(101) }],
    ['an overly long description', { name: 'Ok', description: 'd'.repeat(501) }],
    [
      'an organizationId in the body',
      { name: 'Ok', organizationId: '01900000-0000-7000-8000-000000000000' },
    ],
  ])('rejects %s', async (_case, body) => {
    const team = await createTeam();

    const response = await createCategory(team.organization.id, team.owner, body).expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /organizations/:id/categories/:categoryId', () => {
  it('renames and re-describes a category and logs the change', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Electronics' },
    });

    const response = await api()
      .patch(url(team.organization.id, category.id))
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Electronics & Cables', description: 'Cables and adapters' })
      .expect(200);

    expect(response.body.category).toMatchObject({
      id: category.id,
      name: 'Electronics & Cables',
      description: 'Cables and adapters',
    });
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { action: 'CATEGORY_UPDATED' },
    });
    expect(log.metadata).toEqual({
      changes: {
        name: { from: 'Electronics', to: 'Electronics & Cables' },
        description: { changed: true },
      },
    });
  });

  it('allows changing only the capitalization of its own name', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'electronics' },
    });

    await api()
      .patch(url(team.organization.id, category.id))
      .set('Cookie', team.owner.cookie)
      .send({ name: 'Electronics' })
      .expect(200);
  });

  it('rejects a name taken by another category', async () => {
    const team = await createTeam();
    await prisma.category.create({ data: { organizationId: team.organization.id, name: 'Tools' } });
    const other = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Hardware' },
    });

    const response = await api()
      .patch(url(team.organization.id, other.id))
      .set('Cookie', team.owner.cookie)
      .send({ name: 'tools' })
      .expect(409);

    expect(response.body.code).toBe('CATEGORY_NAME_TAKEN');
  });

  it('writes nothing when nothing changes', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Same' },
    });

    await api()
      .patch(url(team.organization.id, category.id))
      .set('Cookie', team.owner.cookie)
      .send({ name: 'Same' })
      .expect(200);

    expect(await prisma.activityLog.count()).toBe(0);
  });

  it('rejects id and organizationId changes', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Fixed' },
    });

    for (const body of [
      { id: '01900000-0000-7000-8000-000000000000' },
      { organizationId: team.organization.id },
    ]) {
      const response = await api()
        .patch(url(team.organization.id, category.id))
        .set('Cookie', team.owner.cookie)
        .send(body)
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns CATEGORY_NOT_FOUND for another organization’s category', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await prisma.category.create({
      data: { organizationId: b.organization.id, name: 'Theirs' },
    });

    const response = await api()
      .patch(url(a.organization.id, foreign.id))
      .set('Cookie', a.owner.cookie)
      .send({ name: 'Mine now' })
      .expect(404);

    expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    expect((await prisma.category.findUniqueOrThrow({ where: { id: foreign.id } })).name).toBe(
      'Theirs',
    );
  });
});

describe('DELETE /organizations/:id/categories/:categoryId', () => {
  it.each(['owner', 'admin'] as const)('%s can delete an unused category', async (who) => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Unused' },
    });

    await api()
      .delete(url(team.organization.id, category.id))
      .set('Cookie', team[who].cookie)
      .expect(204);

    expect(await prisma.category.count()).toBe(0);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { action: 'CATEGORY_DELETED' },
    });
    expect(log).toMatchObject({ entityId: category.id, metadata: { name: 'Unused' } });
  });

  it('forbids STAFF from deleting', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Keep' },
    });

    const response = await api()
      .delete(url(team.organization.id, category.id))
      .set('Cookie', team.staff.cookie)
      .expect(403);

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    expect(await prisma.category.count()).toBe(1);
  });

  it('refuses to delete a category that products use, without touching the products', async () => {
    const team = await createTeam();
    const category = await prisma.category.create({
      data: { organizationId: team.organization.id, name: 'Used' },
    });
    const product = await createProduct(team.organization.id, {
      categoryId: category.id,
      status: 'ARCHIVED',
    });

    const response = await api()
      .delete(url(team.organization.id, category.id))
      .set('Cookie', team.owner.cookie)
      .expect(409);

    expect(response.body).toMatchObject({ code: 'CATEGORY_IN_USE' });
    expect(response.body.message).toContain('1 product');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).categoryId).toBe(
      category.id,
    );
    expect(await prisma.activityLog.count()).toBe(0);
  });

  it('returns CATEGORY_NOT_FOUND for unknown, malformed, and foreign ids', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await prisma.category.create({
      data: { organizationId: b.organization.id, name: 'Theirs' },
    });

    for (const id of [foreign.id, '01900000-0000-7000-8000-000000000000', 'nope']) {
      const response = await api()
        .delete(url(a.organization.id, id))
        .set('Cookie', a.owner.cookie)
        .expect(404);
      expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    }
    expect(await prisma.category.count()).toBe(1);
  });
});
