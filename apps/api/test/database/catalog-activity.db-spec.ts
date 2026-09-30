import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createCategory, createProduct } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createTeam } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const logsFor = (organizationId: string) =>
  prisma.activityLog.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

describe('catalog activity log', () => {
  it('records every catalog change with organization, actor, entity, and safe metadata', async () => {
    const team = await createTeam();
    const org = team.organization.id;
    const base = `/organizations/${org}`;

    const category = await api()
      .post(`${base}/categories`)
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Office', description: 'Desk items' })
      .expect(201);
    const categoryId = category.body.category.id;
    await api()
      .patch(`${base}/categories/${categoryId}`)
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Office supplies' })
      .expect(200);
    const product = await api()
      .post(`${base}/products`)
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Pen', sku: 'PEN-1', price: '1.50', cost: '0.40', minimumStock: 5 })
      .expect(201);
    const productId = product.body.product.id;
    await api()
      .patch(`${base}/products/${productId}`)
      .set('Cookie', team.staff.cookie)
      .send({ price: '1.75', description: 'Blue ink' })
      .expect(200);
    await api()
      .post(`${base}/products/${productId}/archive`)
      .set('Cookie', team.admin.cookie)
      .expect(200);
    await api()
      .post(`${base}/products/${productId}/restore`)
      .set('Cookie', team.owner.cookie)
      .expect(200);
    await api()
      .delete(`${base}/categories/${categoryId}`)
      .set('Cookie', team.owner.cookie)
      .expect(204);

    const logs = await logsFor(org);
    expect(logs.map((log) => [log.action, log.actorUserId, log.entityType, log.entityId])).toEqual([
      ['CATEGORY_CREATED', team.staff.user.id, 'Category', categoryId],
      ['CATEGORY_UPDATED', team.staff.user.id, 'Category', categoryId],
      ['PRODUCT_CREATED', team.staff.user.id, 'Product', productId],
      ['PRODUCT_UPDATED', team.staff.user.id, 'Product', productId],
      ['PRODUCT_ARCHIVED', team.admin.user.id, 'Product', productId],
      ['PRODUCT_RESTORED', team.owner.user.id, 'Product', productId],
      ['CATEGORY_DELETED', team.owner.user.id, 'Category', categoryId],
    ]);
    expect(logs.every((log) => log.organizationId === org)).toBe(true);
    expect(logs[3]?.metadata).toEqual({
      sku: 'PEN-1',
      changes: { price: { from: '1.50', to: '1.75' }, description: { changed: true } },
    });

    // No secrets or personal data in any metadata.
    const serialized = JSON.stringify(logs.map((log) => log.metadata));
    for (const member of [team.owner, team.admin, team.staff]) {
      expect(serialized).not.toContain(member.user.email);
      expect(serialized).not.toContain(member.cookie.split('=')[1]);
    }
    expect(serialized).not.toMatch(/password|token|cookie|session/i);
    expect(serialized).not.toContain('Blue ink'); // descriptions are only marked as changed
  });

  it('records nothing for rejected, forbidden, foreign, or no-op requests', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const base = `/organizations/${a.organization.id}`;
    const category = await createCategory(a.organization.id, { name: 'Office' });
    const used = await createProduct(a.organization.id, { categoryId: category.id, sku: 'USED' });
    const foreign = await createProduct(b.organization.id, { sku: 'THEIRS' });

    const attempts = [
      // Validation
      () => api().post(`${base}/categories`).set('Cookie', a.owner.cookie).send({ name: ' ' }),
      () =>
        api()
          .post(`${base}/products`)
          .set('Cookie', a.owner.cookie)
          .send({ name: 'X', sku: 'X', price: 1.5, cost: '1', minimumStock: 0 }),
      // Conflicts
      () => api().post(`${base}/categories`).set('Cookie', a.owner.cookie).send({ name: 'OFFICE' }),
      () =>
        api()
          .post(`${base}/products`)
          .set('Cookie', a.owner.cookie)
          .send({ name: 'Dup', sku: 'USED', price: '1', cost: '1', minimumStock: 0 }),
      () => api().delete(`${base}/categories/${category.id}`).set('Cookie', a.owner.cookie),
      // Forbidden for STAFF
      () => api().post(`${base}/products/${used.id}/archive`).set('Cookie', a.staff.cookie),
      () => api().delete(`${base}/categories/${category.id}`).set('Cookie', a.staff.cookie),
      // Another organization's product through this organization
      () =>
        api()
          .patch(`${base}/products/${foreign.id}`)
          .set('Cookie', a.owner.cookie)
          .send({ name: 'Hijacked' }),
      () => api().post(`${base}/products/${foreign.id}/archive`).set('Cookie', a.owner.cookie),
      // Non-member
      () =>
        api()
          .post(`/organizations/${b.organization.id}/categories`)
          .set('Cookie', a.owner.cookie)
          .send({ name: 'Intruder' }),
      // No-op changes
      () =>
        api()
          .patch(`${base}/products/${used.id}`)
          .set('Cookie', a.owner.cookie)
          .send({ price: '10.0' }),
      () => api().post(`${base}/products/${used.id}/restore`).set('Cookie', a.owner.cookie),
    ];
    const statuses: number[] = [];
    for (const attempt of attempts) {
      statuses.push((await attempt()).status);
    }

    expect(statuses).toEqual([400, 400, 409, 409, 409, 403, 403, 404, 404, 404, 200, 200]);
    expect(await logsFor(a.organization.id)).toEqual([]);
    expect(await logsFor(b.organization.id)).toEqual([]);
  });
});
