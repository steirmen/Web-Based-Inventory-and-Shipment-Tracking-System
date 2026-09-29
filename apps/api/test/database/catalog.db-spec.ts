import { describe, expect, it } from 'vitest';
import { ProductStatus } from '../../src/generated/prisma/client.js';
import { prisma } from './support/database.js';
import { expectCheckViolation, expectUniqueViolation } from './support/db-errors.js';
import { createCategory, createOrganization, createProduct } from './support/factories.js';

describe('Category', () => {
  it('creates a category with an optional description', async () => {
    const organization = await createOrganization();

    const category = await prisma.category.create({
      data: { organizationId: organization.id, name: 'Packaging' },
    });

    expect(category).toMatchObject({ name: 'Packaging', description: null });
  });

  it('rejects a duplicate name within the same organization', async () => {
    const organization = await createOrganization();
    await createCategory(organization.id, { name: 'Packaging' });

    await expectUniqueViolation(
      createCategory(organization.id, { name: 'Packaging' }),
      'categories_organization_id_name_key',
    );
  });
});

describe('Product', () => {
  it('stores money as exact decimals and applies defaults', async () => {
    const organization = await createOrganization();

    const product = await prisma.product.create({
      data: {
        organizationId: organization.id,
        name: 'Widget',
        sku: 'WID-001',
        price: '19.99',
        cost: '7.35',
      },
    });

    expect(product.price.toString()).toBe('19.99');
    expect(product.cost?.toString()).toBe('7.35');
    expect(product.minimumStock).toBe(0);
    expect(product.status).toBe(ProductStatus.ACTIVE);
    expect(product.categoryId).toBeNull();
  });

  it('rounds money to two decimal places (NUMERIC(12,2))', async () => {
    const organization = await createOrganization();

    const product = await createProduct(organization.id, { price: '0.105' });

    expect(product.price.toString()).toBe('0.11');
  });

  it('can belong to a category of the same organization', async () => {
    const organization = await createOrganization();
    const category = await createCategory(organization.id);

    const product = await createProduct(organization.id, { categoryId: category.id });

    const loaded = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { category: true },
    });
    expect(loaded.category?.id).toBe(category.id);
  });

  it('rejects a duplicate SKU within the same organization', async () => {
    const organization = await createOrganization();
    await createProduct(organization.id, { sku: 'SKU-001' });

    await expectUniqueViolation(
      createProduct(organization.id, { sku: 'SKU-001' }),
      'products_organization_id_sku_key',
    );
  });

  it.each([
    ['price', { price: '-0.01' }, 'products_price_non_negative_check'],
    ['cost', { cost: '-1.00' }, 'products_cost_non_negative_check'],
    ['minimumStock', { minimumStock: -1 }, 'products_minimum_stock_non_negative_check'],
  ])('rejects a negative %s', async (_field, data, constraint) => {
    const organization = await createOrganization();

    await expectCheckViolation(createProduct(organization.id, data), constraint);
  });

  it('rejects a negative price on update as well', async () => {
    const organization = await createOrganization();
    const product = await createProduct(organization.id);

    await expectCheckViolation(
      prisma.product.update({ where: { id: product.id }, data: { price: '-5.00' } }),
      'products_price_non_negative_check',
    );
  });

  it('accepts zero price and unknown (null) cost', async () => {
    const organization = await createOrganization();

    const product = await createProduct(organization.id, { price: '0.00', cost: null });

    expect(product.price.toString()).toBe('0');
    expect(product.cost).toBeNull();
  });

  it('rejects a blank SKU', async () => {
    const organization = await createOrganization();

    await expectCheckViolation(
      createProduct(organization.id, { sku: '   ' }),
      'products_sku_not_blank_check',
    );
  });
});
