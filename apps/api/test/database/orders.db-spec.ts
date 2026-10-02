import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../../src/generated/prisma/client.js';
import { prisma } from './support/database.js';
import {
  expectCheckViolation,
  expectInvalidEnumValue,
  expectUniqueViolation,
} from './support/db-errors.js';
import { createCustomer, createOrder, createStockFixture } from './support/factories.js';

describe('Customer', () => {
  it('creates an active customer with optional contact fields', async () => {
    const { organization } = await createStockFixture();

    const customer = await prisma.customer.create({
      data: { organizationId: organization.id, name: 'Jane Test' },
    });

    expect(customer).toMatchObject({ isActive: true, email: null, phone: null });
  });

  it('allows the same email on several customers', async () => {
    const { organization } = await createStockFixture();

    await createCustomer(organization.id, { email: 'shared@test.example' });
    await createCustomer(organization.id, { email: 'shared@test.example' });

    expect(await prisma.customer.count({ where: { email: 'shared@test.example' } })).toBe(2);
  });
});

describe('Order', () => {
  it('creates a DRAFT order with zero totals, without a customer', async () => {
    const { organization, warehouse } = await createStockFixture();

    const order = await prisma.order.create({
      data: { organizationId: organization.id, warehouseId: warehouse.id, orderNumber: 'SO-1' },
    });

    expect(order.status).toBe(OrderStatus.DRAFT);
    expect(order.customerId).toBeNull();
    expect(order.subtotal.toString()).toBe('0');
    expect(order.total.toString()).toBe('0');
  });

  it('rejects a duplicate order number within the same organization', async () => {
    const { organization, warehouse } = await createStockFixture();
    await createOrder(organization.id, warehouse.id, { orderNumber: 'SO-1001' });

    await expectUniqueViolation(
      createOrder(organization.id, warehouse.id, { orderNumber: 'SO-1001' }),
      'orders_organization_id_order_number_key',
    );
  });

  it.each([
    ['subtotal', { subtotal: '-1.00' }, 'orders_subtotal_non_negative_check'],
    ['total', { total: '-0.01' }, 'orders_total_non_negative_check'],
  ])('rejects a negative %s', async (_field, data, constraint) => {
    const { organization, warehouse } = await createStockFixture();

    await expectCheckViolation(createOrder(organization.id, warehouse.id, data), constraint);
  });
});

describe('OrderItem', () => {
  it('belongs to an order and references a product', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const customer = await createCustomer(organization.id);

    const order = await prisma.order.create({
      data: {
        organizationId: organization.id,
        warehouseId: warehouse.id,
        customerId: customer.id,
        orderNumber: 'SO-2001',
        subtotal: '30.00',
        total: '30.00',
        currency: 'TRY',
        items: {
          create: {
            productId: product.id,
            productNameSnapshot: product.name,
            skuSnapshot: product.sku,
            unitPrice: '10.00',
            currency: 'TRY',
            quantity: 3,
            lineTotal: '30.00',
          },
        },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    expect(order.customer?.id).toBe(customer.id);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].organizationId).toBe(organization.id);
    expect(order.items[0].product.id).toBe(product.id);
  });

  it('keeps product snapshots when the product later changes', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const order = await createOrder(organization.id, warehouse.id);
    const item = await prisma.orderItem.create({
      data: {
        organizationId: organization.id,
        orderId: order.id,
        productId: product.id,
        productNameSnapshot: 'Original Name',
        skuSnapshot: 'ORIG-SKU',
        unitPrice: '12.50',
        currency: 'TRY',
        quantity: 2,
        lineTotal: '25.00',
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Renamed Product', sku: 'NEW-SKU', price: '99.00' },
    });

    const reloaded = await prisma.orderItem.findUniqueOrThrow({
      where: { id: item.id },
      include: { product: true },
    });
    expect(reloaded).toMatchObject({
      productNameSnapshot: 'Original Name',
      skuSnapshot: 'ORIG-SKU',
    });
    expect(reloaded.unitPrice.toString()).toBe('12.5');
    expect(reloaded.product.name).toBe('Renamed Product');
  });

  it.each([
    ['a zero quantity', { quantity: 0 }, 'order_items_quantity_positive_check'],
    ['a negative quantity', { quantity: -1 }, 'order_items_quantity_positive_check'],
    ['a negative unit price', { unitPrice: '-1.00' }, 'order_items_unit_price_non_negative_check'],
    ['a negative line total', { lineTotal: '-1.00' }, 'order_items_line_total_non_negative_check'],
  ])('rejects %s', async (_case, data, constraint) => {
    const { organization, warehouse, product } = await createStockFixture();
    const order = await createOrder(organization.id, warehouse.id);

    await expectCheckViolation(
      prisma.orderItem.create({
        data: {
          organizationId: organization.id,
          orderId: order.id,
          productId: product.id,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitPrice: '1.00',
          currency: 'TRY',
          quantity: 1,
          lineTotal: '1.00',
          ...data,
        },
      }),
      constraint,
    );
  });
});

describe('one currency per order (database triggers)', () => {
  /** The raw PostgreSQL error of a rejected write (Prisma 7 driver adapter). */
  const rejection = (message: RegExp) => ({
    meta: {
      driverAdapterError: {
        cause: expect.objectContaining({
          originalCode: '23514',
          originalMessage: expect.stringMatching(message),
        }),
      },
    },
  });

  it('refuses a line whose currency differs from its order', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const order = await createOrder(organization.id, warehouse.id, { currency: 'EUR' });
    const line = (currency: 'TRY' | 'EUR') =>
      prisma.orderItem.create({
        data: {
          organizationId: organization.id,
          orderId: order.id,
          productId: product.id,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitPrice: '1.00',
          currency,
          quantity: 1,
          lineTotal: '1.00',
        },
      });

    await expect(line('TRY')).rejects.toMatchObject(rejection(/currency of its order/));
    const accepted = await line('EUR');
    await expect(
      prisma.orderItem.update({ where: { id: accepted.id }, data: { currency: 'USD' } }),
    ).rejects.toMatchObject(rejection(/currency of its order/));
  });

  it('refuses an order currency change while lines in another currency exist', async () => {
    const { organization, warehouse, product } = await createStockFixture();
    const order = await createOrder(organization.id, warehouse.id, {
      currency: 'TRY',
      items: {
        create: {
          productId: product.id,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitPrice: '1.00',
          currency: 'TRY',
          quantity: 1,
          lineTotal: '1.00',
        },
      },
    });

    await expect(
      prisma.order.update({ where: { id: order.id }, data: { currency: 'EUR' } }),
    ).rejects.toMatchObject(rejection(/currency of its lines/));
    await expect(
      prisma.order.update({ where: { id: order.id }, data: { currency: null } }),
    ).rejects.toMatchObject(rejection(/currency of its lines/));

    // Without lines, the currency may change (the application then adds lines in it).
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    const emptied = await prisma.order.update({
      where: { id: order.id },
      data: { currency: null },
    });
    expect(emptied.currency).toBeNull();
  });

  it('stores currencies as ISO codes of the currency enum only', async () => {
    const { organization } = await createStockFixture();
    await expectInvalidEnumValue(
      prisma.$executeRaw`UPDATE products SET currency = 'BTC' WHERE organization_id = ${organization.id}::uuid`,
    );
  });
});
