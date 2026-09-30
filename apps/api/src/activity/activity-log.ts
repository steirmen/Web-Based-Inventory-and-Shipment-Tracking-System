import type { Prisma } from '../generated/prisma/client.js';

/** Actions recorded in `activity_logs`. Add new actions here as domains are built. */
export const ActivityAction = {
  ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
  ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
  MEMBER_ROLE_CHANGED: 'MEMBER_ROLE_CHANGED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  OWNERSHIP_TRANSFERRED: 'OWNERSHIP_TRANSFERRED',
  INVITATION_CREATED: 'INVITATION_CREATED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  CATEGORY_DELETED: 'CATEGORY_DELETED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_ARCHIVED: 'PRODUCT_ARCHIVED',
  PRODUCT_RESTORED: 'PRODUCT_RESTORED',
} as const;
export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

export type ActivityEntityType =
  'Organization' | 'OrganizationMember' | 'OrganizationInvitation' | 'Category' | 'Product';

export interface ActivityEntry {
  organizationId: string;
  actorUserId: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string;
  /**
   * Event details. NEVER include passwords, password hashes, session tokens,
   * or invitation tokens.
   */
  metadata?: Prisma.InputJsonObject;
}

/**
 * Appends an audit entry using the caller's transaction client, so a mutation
 * and its activity log entry commit (or roll back) together.
 */
export async function recordActivity(
  tx: Prisma.TransactionClient,
  entry: ActivityEntry,
): Promise<void> {
  await tx.activityLog.create({ data: entry });
}
