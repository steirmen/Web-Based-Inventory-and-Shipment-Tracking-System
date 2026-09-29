import { describe, expect, it } from 'vitest';
import { MemberRole, StockMovementType } from '../../src/generated/prisma/client.js';
import { prisma } from './support/database.js';
import { expectRestrictViolation } from './support/db-errors.js';
import {
  createCategory,
  createCustomer,
  createOrder,
  createOrganization,
  createProduct,
  createStockFixture,
  createUser,
} from './support/factories.js';

/** Verifies the delete strategy documented in docs/database-design.md. */

describe('restricted deletes protect business records', () => {
  it('an organization that owns business data cannot be deleted', async () => {
    const organization = await createOrganization();
    await createProduct(organization.id);

    await expectRestrictViolation(
      prisma.organization.delete({ where: { id: organization.id } }),
      'products_organization_id_fkey',
    );
  });

  it('a product with inventory, movements, or order lines cannot be deleted', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    await prisma.inventory.create({
      data: { organizationId: organization.id, warehouseId: warehouse.id, productId: product.id },
    });

    await expectRestrictViolation(prisma.product.delete({ where: { id: product.id } }));
  });

  it('a category in use cannot be deleted until its products are reassigned', async () => {
    const organization = await createOrganization();
    const category = await createCategory(organization.id);
    const product = await createProduct(organization.id, { categoryId: category.id });

    await expectRestrictViolation(
      prisma.category.delete({ where: { id: category.id } }),
      'products_organization_id_category_id_fkey',
    );

    await prisma.product.update({ where: { id: product.id }, data: { categoryId: null } });
    await prisma.category.delete({ where: { id: category.id } });
    expect(await prisma.category.count()).toBe(0);
  });

  it('a warehouse with stock history cannot be deleted', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    await prisma.stockMovement.create({
      data: {
        organizationId: organization.id,
        warehouseId: warehouse.id,
        productId: product.id,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: 1,
        quantityBefore: 0,
        quantityAfter: 1,
      },
    });

    await expectRestrictViolation(
      prisma.warehouse.delete({ where: { id: warehouse.id } }),
      'stock_movements_organization_id_warehouse_id_fkey',
    );
  });

  it('a customer with orders cannot be deleted', async () => {
    const { organization, warehouse } = await createStockFixture();
    const customer = await createCustomer(organization.id);
    await createOrder(organization.id, warehouse.id, { customerId: customer.id });

    await expectRestrictViolation(
      prisma.customer.delete({ where: { id: customer.id } }),
      'orders_organization_id_customer_id_fkey',
    );
  });
});

describe('cascading and nullifying deletes', () => {
  it('deleting an order deletes its items', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const order = await prisma.order.create({
      data: {
        organizationId: organization.id,
        warehouseId: warehouse.id,
        orderNumber: 'SO-DRAFT',
        items: {
          create: {
            productId: product.id,
            productNameSnapshot: product.name,
            skuSnapshot: product.sku,
            unitPrice: '1.00',
            quantity: 1,
            lineTotal: '1.00',
          },
        },
      },
    });

    await prisma.order.delete({ where: { id: order.id } });

    expect(await prisma.orderItem.count()).toBe(0);
    expect(await prisma.product.count()).toBe(1);
  });

  it('deleting a user removes memberships but keeps history with a null actor', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const user = await createUser();
    await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: user.id, role: MemberRole.ADMIN },
    });
    const movement = await prisma.stockMovement.create({
      data: {
        organizationId: organization.id,
        warehouseId: warehouse.id,
        productId: product.id,
        actorUserId: user.id,
        movementType: StockMovementType.ADJUSTMENT,
        quantityDelta: 2,
        quantityBefore: 0,
        quantityAfter: 2,
      },
    });
    const log = await prisma.activityLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: user.id,
        action: 'STOCK_ADJUSTED',
        entityType: 'Product',
        entityId: product.id,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.organizationMember.count()).toBe(0);
    const [movementAfter, logAfter] = await Promise.all([
      prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.id } }),
      prisma.activityLog.findUniqueOrThrow({ where: { id: log.id } }),
    ]);
    expect(movementAfter.actorUserId).toBeNull();
    expect(logAfter.actorUserId).toBeNull();
  });

  it('deleting an organization without business data removes its memberships', async () => {
    const organization = await createOrganization();
    const user = await createUser();
    await prisma.organizationMember.create({
      data: { organizationId: organization.id, userId: user.id, role: MemberRole.OWNER },
    });

    await prisma.organization.delete({ where: { id: organization.id } });

    expect(await prisma.organizationMember.count()).toBe(0);
    expect(await prisma.user.count()).toBe(1);
  });
});
