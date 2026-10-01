import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { prisma } from './database.js';
import { createCustomer, createProduct, createWarehouse } from './factories.js';
import { createTeam, type TeamMember } from './organizations.js';

/**
 * A team with an active customer, two warehouses (MAIN, EAST), and two
 * products with known prices — the starting point of order tests.
 * `stock()` receives stock through the real API, `order()` creates a DRAFT,
 * and `action()` runs a lifecycle step.
 */
export async function salesFixture(target: INestApplication | string, slug?: string) {
  const api = () =>
    request(typeof target === 'string' ? target : (target.getHttpServer() as never));
  const team = await createTeam(slug);
  const org = team.organization.id;
  const main = await createWarehouse(org, { name: 'Main', code: 'MAIN' });
  const east = await createWarehouse(org, { name: 'East', code: 'EAST' });
  const customer = await createCustomer(org, {
    name: 'Riverside Dental',
    companyName: 'Riverside',
  });
  const pen = await createProduct(org, { name: 'Ballpoint Pen', sku: 'PEN', price: '8.50' });
  const mouse = await createProduct(org, { name: 'Wireless Mouse', sku: 'MOUSE', price: '24.99' });
  const base = `/organizations/${org}`;

  const stock = (warehouseId: string, productId: string, quantity: number) =>
    api()
      .post(`${base}/inventory/receive`)
      .set('Cookie', team.owner.cookie)
      .send({ warehouseId, productId, quantity })
      .expect(200);

  const order = (
    items: { productId: string; quantity: number }[],
    options: { actor?: TeamMember; warehouseId?: string; customerId?: string } = {},
  ) =>
    api()
      .post(`${base}/orders`)
      .set('Cookie', (options.actor ?? team.owner).cookie)
      .send({
        customerId: options.customerId ?? customer.id,
        warehouseId: options.warehouseId ?? main.id,
        items,
      });

  const action = (
    orderId: string,
    step: 'confirm' | 'process' | 'ship' | 'complete' | 'cancel',
    actor: TeamMember = team.owner,
  ) => api().post(`${base}/orders/${orderId}/${step}`).set('Cookie', actor.cookie);

  /** A CONFIRMED order (created and confirmed through the API). */
  const confirmedOrder = async (
    items: { productId: string; quantity: number }[],
    options: { warehouseId?: string } = {},
  ) => {
    const created = await order(items, options).expect(201);
    const confirmed = await action(created.body.order.id, 'confirm').expect(200);
    return confirmed.body.order as {
      id: string;
      orderNumber: string;
      items: { id: string; productId: string }[];
    };
  };

  return {
    api,
    team,
    org,
    base,
    main,
    east,
    customer,
    pen,
    mouse,
    stock,
    order,
    action,
    confirmedOrder,
  };
}

export const orderLogs = (organizationId: string, action?: string) =>
  prisma.activityLog.findMany({
    where: { organizationId, entityType: 'Order', ...(action ? { action } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

export async function orderStatusOf(orderId: string): Promise<string | undefined> {
  return (await prisma.order.findUnique({ where: { id: orderId } }))?.status;
}

/** Every SALE movement of an order references it, and they match its lines exactly. */
export async function expectOrderMovements(orderId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  const movements = await prisma.stockMovement.findMany({
    where: { referenceType: 'ORDER', referenceId: orderId },
  });
  expect(movements).toHaveLength(order.items.length);
  for (const item of order.items) {
    const movement = movements.find((entry) => entry.productId === item.productId);
    expect(movement).toMatchObject({
      organizationId: order.organizationId,
      warehouseId: order.warehouseId,
      movementType: 'SALE',
      quantityDelta: -item.quantity,
      reason: `Order ${order.orderNumber}`,
    });
  }
}
