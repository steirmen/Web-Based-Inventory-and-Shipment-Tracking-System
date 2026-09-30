import {
  canAssignRole,
  canManageMember,
  type MemberListResponse,
  type MemberResponse,
  type MemberRole,
  type TransferOwnershipResponse,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { PrismaService } from '../database/prisma.service.js';
import type { OrganizationContext } from './organization-context.js';
import {
  alreadyOwner,
  concurrentModification,
  memberRemovalForbidden,
  memberRoleChangeForbidden,
  membershipNotFound,
  organizationForbidden,
  ownerTransferRequired,
} from './organization-errors.js';
import { MEMBER_SELECT, toMember } from './organization-mappers.js';

/**
 * Member management. Permission to call each method is checked by
 * OrganizationAccessGuard; the role-hierarchy rules for the TARGET member
 * (canManageMember / canAssignRole from @app/shared) are checked here, inside
 * the transaction, against the target's current row.
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<MemberListResponse> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      // Enum order: OWNER, ADMIN, STAFF — then longest-standing first.
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: MEMBER_SELECT,
    });
    return { members: members.map(toMember) };
  }

  async changeRole(
    context: OrganizationContext,
    memberId: string,
    role: MemberRole,
  ): Promise<MemberResponse> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: context.organization.id },
        select: MEMBER_SELECT,
      });
      if (!target) {
        throw membershipNotFound();
      }
      if (target.role === 'OWNER') {
        throw ownerTransferRequired();
      }
      if (role === 'OWNER') {
        throw memberRoleChangeForbidden(
          'Ownership can only be changed with an ownership transfer.',
        );
      }
      const actorRole = context.membership.role;
      if (!canManageMember(actorRole, target.role) || !canAssignRole(actorRole, role)) {
        throw memberRoleChangeForbidden();
      }
      if (target.role === role) {
        return { member: toMember(target) };
      }

      // Conditional on the role we checked, so a concurrent change can't be overwritten.
      const { count } = await tx.organizationMember.updateMany({
        where: { id: target.id, role: target.role },
        data: { role },
      });
      if (count !== 1) {
        throw concurrentModification();
      }

      await recordActivity(tx, {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: ActivityAction.MEMBER_ROLE_CHANGED,
        entityType: 'OrganizationMember',
        entityId: target.id,
        metadata: { userId: target.userId, from: target.role, to: role },
      });
      return { member: toMember({ ...target, role }) };
    });
  }

  /** Removes the membership only — the user account and other memberships are untouched. */
  async remove(context: OrganizationContext, memberId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findFirst({
        where: { id: memberId, organizationId: context.organization.id },
        select: MEMBER_SELECT,
      });
      if (!target) {
        throw membershipNotFound();
      }
      if (target.role === 'OWNER') {
        throw ownerTransferRequired();
      }
      if (!canManageMember(context.membership.role, target.role)) {
        throw memberRemovalForbidden();
      }

      const { count } = await tx.organizationMember.deleteMany({
        where: { id: target.id, role: target.role },
      });
      if (count !== 1) {
        throw concurrentModification();
      }

      await recordActivity(tx, {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: ActivityAction.MEMBER_REMOVED,
        entityType: 'OrganizationMember',
        entityId: target.id,
        metadata: { userId: target.userId, email: target.user.email, role: target.role },
      });
    });
  }

  /**
   * The current OWNER becomes ADMIN and the target becomes OWNER in one
   * transaction. The demotion runs first so the "one owner per organization"
   * unique index is never violated; other transactions never observe an
   * intermediate state.
   */
  async transferOwnership(
    context: OrganizationContext,
    targetMemberId: string,
  ): Promise<TransferOwnershipResponse> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.organizationMember.findFirst({
        where: { id: targetMemberId, organizationId: context.organization.id },
        select: MEMBER_SELECT,
      });
      if (!target) {
        throw membershipNotFound();
      }
      if (target.role === 'OWNER') {
        throw alreadyOwner();
      }

      const demoted = await tx.organizationMember.updateMany({
        where: { id: context.membership.id, role: 'OWNER' },
        data: { role: 'ADMIN' },
      });
      if (demoted.count !== 1) {
        // The caller is no longer the owner (e.g. ownership already moved).
        throw organizationForbidden();
      }
      const promoted = await tx.organizationMember.updateMany({
        where: { id: target.id, role: target.role },
        data: { role: 'OWNER' },
      });
      if (promoted.count !== 1) {
        throw concurrentModification();
      }

      await recordActivity(tx, {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: ActivityAction.OWNERSHIP_TRANSFERRED,
        entityType: 'Organization',
        entityId: context.organization.id,
        metadata: {
          fromUserId: context.user.id,
          fromMemberId: context.membership.id,
          toUserId: target.userId,
          toMemberId: target.id,
        },
      });

      const previousOwner = await tx.organizationMember.findUniqueOrThrow({
        where: { id: context.membership.id },
        select: MEMBER_SELECT,
      });
      return {
        owner: toMember({ ...target, role: 'OWNER' }),
        previousOwner: toMember(previousOwner),
      };
    });
  }
}
