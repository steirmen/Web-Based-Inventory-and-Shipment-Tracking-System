import type { DashboardSummaryResponse, OrderStatus } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '../../../src/generated/prisma/client.js';
import { prisma } from './database.js';
import { createProduct, createWarehouse } from './factories.js';
import { createTeam, type SignedInUser } from './organizations.js';

type ProductRow = Awaited<ReturnType<typeof createProduct>>;

let orderSequence = 0;

/**
 * A team plus helpers that write orders, customers, and stock DIRECTLY with
 * exact timestamps and statuses (the dashboard only reads, so its tests
 * control the data precisely instead of replaying the order lifecycle).
 */
export async function dashboardFixture(app: INestApplication, slug?: string) {
  const team = await createTeam(slug);
  const org = team.organization.id;
  const main = await createWarehouse(org, { name: 'Main', code: 'MAIN' });

  const product = (data: Parameters<typeof createProduct>[1] = {}) => createProduct(org, data);

  /** An order created at `createdAt` with lines of [product, quantity, unit price]. */
  const order = (
    status: OrderStatus,
    createdAt: string,
    lines: [ProductRow, number, string][],
    options: { warehouseId?: string; customerId?: string } = {},
  ) =>
    prisma.order.create({
      data: {
        organizationId: org,
        warehouseId: options.warehouseId ?? main.id,
        customerId: options.customerId,
        orderNumber: `SO-${++orderSequence}`,
        status,
        createdAt: new Date(createdAt),
        items: {
          create: lines.map(([item, quantity, unitPrice]) => ({
            productId: item.id,
            productNameSnapshot: item.name,
            skuSnapshot: item.sku,
            unitPrice,
            quantity,
            lineTotal: new Prisma.Decimal(unitPrice).mul(quantity).toFixed(2),
          })),
        },
      },
    });

  const customer = (createdAt: string, isActive = true) =>
    prisma.customer.create({
      data: {
        organizationId: org,
        name: `Customer ${createdAt}`,
        isActive,
        createdAt: new Date(createdAt),
      },
    });

  const stock = (warehouseId: string, productId: string, quantity: number) =>
    prisma.inventory.create({ data: { organizationId: org, warehouseId, productId, quantity } });

  const summary = (query: Record<string, string> = {}, who: SignedInUser = team.owner) =>
    request(app.getHttpServer())
      .get(`/organizations/${org}/dashboard/summary`)
      .query(query)
      .set('Cookie', who.cookie);

  /** `summary()` for a CUSTOM range (UTC unless `timeZone` is given), expecting 200. */
  const custom = async (from: string, to: string, extra: Record<string, string> = {}) =>
    (await summary({ range: 'CUSTOM', from, to, ...extra }).expect(200))
      .body as DashboardSummaryResponse;

  return { team, org, main, product, order, customer, stock, summary, custom };
}
