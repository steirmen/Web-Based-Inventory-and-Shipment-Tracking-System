import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StockMovementType } from '../../src/generated/prisma/client.js';
import { prisma } from './support/database.js';
import { expectForeignKeyViolation, expectUniqueViolation } from './support/db-errors.js';
import {
  createCategory,
  createCustomer,
  createOrder,
  createOrganization,
  createProduct,
  createWarehouse,
} from './support/factories.js';

/**
 * Proves the schema models tenant boundaries:
 * 1. Business identifiers are unique per organization, not globally.
 * 2. Composite foreign keys make it impossible for a row in one organization
 *    to reference another organization's data.
 */

async function twoOrganizations() {
  const orgA = await createOrganization({ slug: 'org-a' });
  const orgB = await createOrganization({ slug: 'org-b' });
  return { orgA, orgB };
}

describe('organization-scoped uniqueness', () => {
  const cases = [
    {
      identifier: 'product SKU',
      constraint: 'products_organization_id_sku_key',
      create: (organizationId: string) => createProduct(organizationId, { sku: 'SKU-001' }),
    },
    {
      identifier: 'category name',
      constraint: 'categories_organization_id_name_key',
      create: (organizationId: string) => createCategory(organizationId, { name: 'Electronics' }),
    },
    {
      identifier: 'warehouse code',
      constraint: 'warehouses_organization_id_code_key',
      create: (organizationId: string) => createWarehouse(organizationId, { code: 'MAIN' }),
    },
    {
      identifier: 'order number',
      constraint: 'orders_organization_id_order_number_key',
      create: async (organizationId: string) => {
        const warehouse =
          (await prisma.warehouse.findFirst({ where: { organizationId } })) ??
          (await createWarehouse(organizationId));
        return createOrder(organizationId, warehouse.id, { orderNumber: 'SO-1001' });
      },
    },
  ];

  it.each(cases)('allows the same $identifier in different organizations', async ({ create }) => {
    const { orgA, orgB } = await twoOrganizations();

    const [inA, inB] = [await create(orgA.id), await create(orgB.id)];

    expect(inA.organizationId).toBe(orgA.id);
    expect(inB.organizationId).toBe(orgB.id);
  });

  it.each(cases)(
    'rejects a duplicate $identifier within one organization',
    async ({ create, constraint }) => {
      const { orgA } = await twoOrganizations();
      await create(orgA.id);

      await expectUniqueViolation(create(orgA.id), constraint);
    },
  );
});

describe('cross-tenant references are rejected by composite foreign keys', () => {
  it('product → category of another organization', async () => {
    const { orgA, orgB } = await twoOrganizations();
    const foreignCategory = await createCategory(orgB.id);

    await expectForeignKeyViolation(
      createProduct(orgA.id, { categoryId: foreignCategory.id }),
      'products_organization_id_category_id_fkey',
    );
  });

  it('inventory → warehouse or product of another organization', async () => {
    const { orgA, orgB } = await twoOrganizations();
    const ownWarehouse = await createWarehouse(orgA.id);
    const ownProduct = await createProduct(orgA.id);
    const foreignWarehouse = await createWarehouse(orgB.id);
    const foreignProduct = await createProduct(orgB.id);

    await expectForeignKeyViolation(
      prisma.inventory.create({
        data: {
          organizationId: orgA.id,
          warehouseId: foreignWarehouse.id,
          productId: ownProduct.id,
        },
      }),
      'inventory_organization_id_warehouse_id_fkey',
    );
    await expectForeignKeyViolation(
      prisma.inventory.create({
        data: {
          organizationId: orgA.id,
          warehouseId: ownWarehouse.id,
          productId: foreignProduct.id,
        },
      }),
      'inventory_organization_id_product_id_fkey',
    );
  });

  it('stock movement → warehouse of another organization', async () => {
    const { orgA, orgB } = await twoOrganizations();
    const ownProduct = await createProduct(orgA.id);
    const foreignWarehouse = await createWarehouse(orgB.id);

    await expectForeignKeyViolation(
      prisma.stockMovement.create({
        data: {
          organizationId: orgA.id,
          warehouseId: foreignWarehouse.id,
          productId: ownProduct.id,
          movementType: StockMovementType.PURCHASE,
          quantityDelta: 1,
          quantityBefore: 0,
          quantityAfter: 1,
          referenceType: 'PURCHASE_ORDER',
          referenceId: randomUUID(),
        },
      }),
      'stock_movements_organization_id_warehouse_id_fkey',
    );
  });

  it('order → customer or warehouse of another organization', async () => {
    const { orgA, orgB } = await twoOrganizations();
    const ownWarehouse = await createWarehouse(orgA.id);
    const foreignWarehouse = await createWarehouse(orgB.id);
    const foreignCustomer = await createCustomer(orgB.id);

    await expectForeignKeyViolation(
      createOrder(orgA.id, foreignWarehouse.id),
      'orders_organization_id_warehouse_id_fkey',
    );
    await expectForeignKeyViolation(
      createOrder(orgA.id, ownWarehouse.id, { customerId: foreignCustomer.id }),
      'orders_organization_id_customer_id_fkey',
    );
  });

  it('order item → product of another organization', async () => {
    const { orgA, orgB } = await twoOrganizations();
    const order = await createOrder(orgA.id, (await createWarehouse(orgA.id)).id);
    const foreignProduct = await createProduct(orgB.id);

    await expectForeignKeyViolation(
      prisma.orderItem.create({
        data: {
          organizationId: orgA.id,
          orderId: order.id,
          productId: foreignProduct.id,
          productNameSnapshot: foreignProduct.name,
          skuSnapshot: foreignProduct.sku,
          unitPrice: '1.00',
          quantity: 1,
          lineTotal: '1.00',
        },
      }),
      'order_items_organization_id_product_id_fkey',
    );
  });

  it('order item → order of another organization', async () => {
    const { orgA, orgB } = await twoOrganizations();
    const foreignOrder = await createOrder(orgB.id, (await createWarehouse(orgB.id)).id);
    const ownProduct = await createProduct(orgA.id);

    await expectForeignKeyViolation(
      prisma.orderItem.create({
        data: {
          organizationId: orgA.id,
          orderId: foreignOrder.id,
          productId: ownProduct.id,
          productNameSnapshot: ownProduct.name,
          skuSnapshot: ownProduct.sku,
          unitPrice: '1.00',
          quantity: 1,
          lineTotal: '1.00',
        },
      }),
      'order_items_organization_id_order_id_fkey',
    );
  });
});

describe('tenant-scoped queries', () => {
  it('returns only the requested organization’s rows', async () => {
    const { orgA, orgB } = await twoOrganizations();
    await createProduct(orgA.id, { sku: 'A-1' });
    await createProduct(orgA.id, { sku: 'A-2' });
    await createProduct(orgB.id, { sku: 'B-1' });

    const productsOfA = await prisma.product.findMany({
      where: { organizationId: orgA.id },
      orderBy: { sku: 'asc' },
    });

    expect(productsOfA.map((product) => product.sku)).toEqual(['A-1', 'A-2']);
  });
});
