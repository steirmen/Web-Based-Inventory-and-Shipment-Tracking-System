import { describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { expectCheckViolation, expectForeignKeyViolation } from './support/db-errors.js';
import { createOrganization, createProduct, createUser } from './support/factories.js';

describe('ActivityLog', () => {
  it('belongs to an organization and an optional actor', async () => {
    const organization = await createOrganization();
    const actor = await createUser();

    const [userEvent, systemEvent] = await Promise.all([
      prisma.activityLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: actor.id,
          action: 'MEMBER_INVITED',
          entityType: 'OrganizationMember',
        },
        include: { organization: true, actor: true },
      }),
      prisma.activityLog.create({
        data: { organizationId: organization.id, action: 'NIGHTLY_SYNC', entityType: 'System' },
      }),
    ]);

    expect(userEvent.organization.id).toBe(organization.id);
    expect(userEvent.actor?.id).toBe(actor.id);
    expect(userEvent.entityId).toBeNull();
    expect(systemEvent.actorUserId).toBeNull();

    const feed = await prisma.organization.findUniqueOrThrow({
      where: { id: organization.id },
      select: { activityLogs: { select: { action: true }, orderBy: { action: 'asc' } } },
    });
    expect(feed.activityLogs.map((log) => log.action)).toEqual(['MEMBER_INVITED', 'NIGHTLY_SYNC']);
  });

  it('requires an existing organization', async () => {
    await expectForeignKeyViolation(
      prisma.activityLog.create({
        data: {
          organizationId: '00000000-0000-7000-8000-000000000000',
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
        },
      }),
      'activity_logs_organization_id_fkey',
    );
  });

  it('stores structured JSON metadata and supports JSON path filters', async () => {
    const organization = await createOrganization();
    const product = await createProduct(organization.id);
    const metadata = {
      sku: product.sku,
      changes: { price: { from: '10.00', to: '12.50' } },
      tags: ['pricing', 'manual'],
      approved: true,
    };

    await prisma.activityLog.createMany({
      data: [
        {
          organizationId: organization.id,
          action: 'PRODUCT_UPDATED',
          entityType: 'Product',
          entityId: product.id,
          metadata,
        },
        {
          organizationId: organization.id,
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: product.id,
          metadata: { sku: product.sku },
        },
      ],
    });

    const [updated] = await prisma.activityLog.findMany({
      where: {
        organizationId: organization.id,
        metadata: { path: ['changes', 'price', 'to'], equals: '12.50' },
      },
    });
    expect(updated.action).toBe('PRODUCT_UPDATED');
    expect(updated.metadata).toEqual(metadata);
  });

  it('rejects a blank action', async () => {
    const organization = await createOrganization();

    await expectCheckViolation(
      prisma.activityLog.create({
        data: { organizationId: organization.id, action: ' ', entityType: 'Product' },
      }),
      'activity_logs_action_not_blank_check',
    );
  });
});
