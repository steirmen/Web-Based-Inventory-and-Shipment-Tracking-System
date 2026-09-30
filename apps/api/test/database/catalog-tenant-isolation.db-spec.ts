import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createCategory, createProduct } from './support/factories.js';
import { createHttpApp } from './support/http-app.js';
import { createTeam } from './support/organizations.js';

/**
 * A member of organization A must not be able to see or change anything in
 * organization B's catalog: not through B's routes (not a member), and not by
 * putting B's ids into A's routes.
 */

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

async function twoCatalogs() {
  const a = await createTeam('org-a');
  const b = await createTeam('org-b');
  const categoryA = await createCategory(a.organization.id, { name: 'Shared name' });
  const categoryB = await createCategory(b.organization.id, { name: 'Shared name' });
  const productA = await createProduct(a.organization.id, {
    name: 'Alpha',
    sku: 'SAME-SKU',
    categoryId: categoryA.id,
  });
  const productB = await createProduct(b.organization.id, {
    name: 'Beta',
    sku: 'SAME-SKU',
    categoryId: categoryB.id,
  });
  // More products in B's category: must never count toward A's category.
  await createProduct(b.organization.id, { categoryId: categoryB.id });
  await createProduct(b.organization.id, { categoryId: categoryB.id, status: 'ARCHIVED' });
  return { a, b, categoryA, categoryB, productA, productB };
}

describe('catalog tenant isolation', () => {
  it("lists only the caller's organization, with counts from that organization only", async () => {
    const { a, categoryA, productA } = await twoCatalogs();

    const products = await api()
      .get(`/organizations/${a.organization.id}/products?search=SAME`)
      .set('Cookie', a.staff.cookie)
      .expect(200);
    const categories = await api()
      .get(`/organizations/${a.organization.id}/categories`)
      .set('Cookie', a.staff.cookie)
      .expect(200);

    expect(products.body.items.map((item: { id: string }) => item.id)).toEqual([productA.id]);
    expect(products.body.pagination.totalItems).toBe(1);
    expect(categories.body.categories).toEqual([
      expect.objectContaining({ id: categoryA.id, productCount: 1 }),
    ]);
  });

  it("refuses B's routes to A's members with ORGANIZATION_NOT_FOUND", async () => {
    const { a, b, categoryB, productB } = await twoCatalogs();
    const base = `/organizations/${b.organization.id}`;
    const attempts = [
      () => api().get(`${base}/products`),
      () => api().get(`${base}/products/${productB.id}`),
      () => api().patch(`${base}/products/${productB.id}`).send({ name: 'Hijacked' }),
      () => api().post(`${base}/products/${productB.id}/archive`),
      () => api().get(`${base}/categories`),
      () => api().patch(`${base}/categories/${categoryB.id}`).send({ name: 'Hijacked' }),
      () => api().delete(`${base}/categories/${categoryB.id}`),
    ];

    for (const attempt of attempts) {
      const response = await attempt().set('Cookie', a.owner.cookie).expect(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
    }
  });

  it("does not find B's product or category through A's routes", async () => {
    const { a, categoryB, productB } = await twoCatalogs();
    const base = `/organizations/${a.organization.id}`;
    const productAttempts = [
      () => api().get(`${base}/products/${productB.id}`),
      () => api().patch(`${base}/products/${productB.id}`).send({ name: 'Hijacked' }),
      () => api().post(`${base}/products/${productB.id}/archive`),
      () => api().post(`${base}/products/${productB.id}/restore`),
    ];
    const categoryAttempts = [
      () => api().patch(`${base}/categories/${categoryB.id}`).send({ name: 'Hijacked' }),
      () => api().delete(`${base}/categories/${categoryB.id}`),
    ];

    for (const attempt of productAttempts) {
      const response = await attempt().set('Cookie', a.owner.cookie).expect(404);
      expect(response.body.code).toBe('PRODUCT_NOT_FOUND');
    }
    for (const attempt of categoryAttempts) {
      const response = await attempt().set('Cookie', a.owner.cookie).expect(404);
      expect(response.body.code).toBe('CATEGORY_NOT_FOUND');
    }

    const untouchedProduct = await prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
    expect(untouchedProduct).toMatchObject({ name: 'Beta', status: 'ACTIVE' });
    expect(await prisma.category.findUnique({ where: { id: categoryB.id } })).toMatchObject({
      name: 'Shared name',
    });
  });

  it("can't use B's category in A, neither to assign nor to filter", async () => {
    const { a, categoryB, productA } = await twoCatalogs();
    const base = `/organizations/${a.organization.id}`;

    const created = await api()
      .post(`${base}/products`)
      .set('Cookie', a.owner.cookie)
      .send({
        name: 'New',
        sku: 'NEW-1',
        price: '1.00',
        cost: '0.50',
        minimumStock: 0,
        categoryId: categoryB.id,
      })
      .expect(422);
    const updated = await api()
      .patch(`${base}/products/${productA.id}`)
      .set('Cookie', a.owner.cookie)
      .send({ categoryId: categoryB.id })
      .expect(422);
    const filtered = await api()
      .get(`${base}/products?categoryId=${categoryB.id}`)
      .set('Cookie', a.owner.cookie)
      .expect(422);

    expect([created.body.code, updated.body.code, filtered.body.code]).toEqual([
      'PRODUCT_CATEGORY_NOT_FOUND',
      'PRODUCT_CATEGORY_NOT_FOUND',
      'PRODUCT_CATEGORY_NOT_FOUND',
    ]);
    expect(await prisma.product.count({ where: { sku: 'NEW-1' } })).toBe(0);
    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: productA.id } });
    expect(unchanged.categoryId).not.toBe(categoryB.id);
  });

  it('rejects an organizationId in the body instead of writing to another organization', async () => {
    const { a, b } = await twoCatalogs();

    const response = await api()
      .post(`/organizations/${a.organization.id}/categories`)
      .set('Cookie', a.owner.cookie)
      .send({ name: 'Sneaky', organizationId: b.organization.id })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.category.count({ where: { name: 'Sneaky' } })).toBe(0);
  });
});
