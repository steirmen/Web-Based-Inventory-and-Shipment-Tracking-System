import {
  type AcceptInvitationResponse,
  type AuthUser,
  canAssignRole,
  canManageMember,
  type CreatedInvitationResponse,
  type InvitationListResponse,
  type PublicInvitationResponse,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { normalizeEmail } from '../auth/email.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import {
  generateSecureToken,
  hashToken,
  isWellFormedToken,
} from '../common/security/secure-token.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateInvitationDto } from './dto/organization.dto.js';
import type { OrganizationContext } from './organization-context.js';
import {
  invitationAlreadyAccepted,
  invitationAlreadyPending,
  invitationEmailMismatch,
  invitationExpired,
  invitationNotFound,
  invitationRevoked,
  invitationRoleForbidden,
  membershipAlreadyExists,
} from './organization-errors.js';
import { INVITATION_SELECT, invitationStatus, toInvitation } from './organization-mappers.js';

const DAY_MS = 86_400_000;
const LIST_LIMIT = 100;

interface InvitationLifecycle {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/** Throws unless the invitation can still be accepted (server time is authoritative). */
function assertUsable(invitation: InvitationLifecycle, now: Date): void {
  switch (invitationStatus(invitation, now)) {
    case 'ACCEPTED':
      throw invitationAlreadyAccepted();
    case 'REVOKED':
      throw invitationRevoked();
    case 'EXPIRED':
      throw invitationExpired();
    case 'PENDING':
      return;
  }
}

/**
 * Invitation links. The raw token is generated here, returned once inside
 * `inviteUrl`, and never persisted or logged — the database stores only its
 * SHA-256 hash. No email is sent (no delivery provider in this phase).
 */
@Injectable()
export class InvitationsService {
  private readonly ttlMs: number;
  private readonly webAppUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('INVITATION_TTL_DAYS', { infer: true }) * DAY_MS;
    this.webAppUrl = config.get('WEB_APP_URL', { infer: true });
  }

  async create(
    context: OrganizationContext,
    input: CreateInvitationDto,
  ): Promise<CreatedInvitationResponse> {
    const email = normalizeEmail(input.email);
    const organizationId = context.organization.id;

    if (input.role === 'OWNER' || !canAssignRole(context.membership.role, input.role)) {
      throw invitationRoleForbidden();
    }

    const token = generateSecureToken();
    const now = new Date();

    const invitation = await this.prisma.$transaction(async (tx) => {
      const existingMember = await tx.organizationMember.findFirst({
        where: { organizationId, user: { email } },
        select: { id: true },
      });
      if (existingMember) {
        throw membershipAlreadyExists();
      }

      const pending = await tx.organizationInvitation.findFirst({
        where: {
          organizationId,
          invitedEmail: email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (pending) {
        throw invitationAlreadyPending();
      }

      const created = await tx.organizationInvitation.create({
        data: {
          organizationId,
          invitedEmail: email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedByUserId: context.user.id,
          expiresAt: new Date(now.getTime() + this.ttlMs),
        },
        select: { id: true, invitedEmail: true, role: true, expiresAt: true },
      });
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.INVITATION_CREATED,
        entityType: 'OrganizationInvitation',
        entityId: created.id,
        metadata: { email, role: created.role, expiresAt: created.expiresAt.toISOString() },
      });
      return created;
    });

    return {
      invitation: {
        id: invitation.id,
        email: invitation.invitedEmail,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        inviteUrl: `${this.webAppUrl}/invite/${token}`,
      },
    };
  }

  async list(organizationId: string): Promise<InvitationListResponse> {
    const invitations = await this.prisma.organizationInvitation.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: LIST_LIMIT,
      select: INVITATION_SELECT,
    });
    const now = new Date();
    return { invitations: invitations.map((invitation) => toInvitation(invitation, now)) };
  }

  /** Idempotent: revoking an already revoked invitation succeeds without a new log entry. */
  async revoke(context: OrganizationContext, invitationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where: { id: invitationId, organizationId: context.organization.id },
        select: { id: true, invitedEmail: true, role: true, acceptedAt: true, revokedAt: true },
      });
      if (!invitation) {
        throw invitationNotFound();
      }
      if (!canManageMember(context.membership.role, invitation.role)) {
        throw invitationRoleForbidden("You can't manage invitations for this role.");
      }
      if (invitation.revokedAt) {
        return;
      }
      if (invitation.acceptedAt) {
        throw invitationAlreadyAccepted();
      }

      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count !== 1) {
        return; // Revoked or accepted concurrently; nothing left to do.
      }

      await recordActivity(tx, {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: ActivityAction.INVITATION_REVOKED,
        entityType: 'OrganizationInvitation',
        entityId: invitation.id,
        metadata: { email: invitation.invitedEmail, role: invitation.role },
      });
    });
  }

  /** Public lookup by token: only what the invite page needs. */
  async getByToken(token: string): Promise<PublicInvitationResponse> {
    if (!isWellFormedToken(token)) {
      throw invitationNotFound();
    }
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        invitedEmail: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        organization: { select: { id: true, name: true } },
      },
    });
    if (!invitation) {
      throw invitationNotFound();
    }
    assertUsable(invitation, new Date());

    return {
      invitation: {
        organization: invitation.organization,
        email: invitation.invitedEmail,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
        status: 'PENDING',
      },
    };
  }

  /**
   * Marks the invitation accepted and creates the membership atomically. The
   * signed-in user's email must equal the invited email.
   */
  async accept(user: AuthUser, token: string): Promise<AcceptInvitationResponse> {
    if (!isWellFormedToken(token)) {
      throw invitationNotFound();
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.organizationInvitation.findUnique({
          where: { tokenHash: hashToken(token) },
          select: {
            id: true,
            organizationId: true,
            invitedEmail: true,
            role: true,
            expiresAt: true,
            acceptedAt: true,
            revokedAt: true,
            organization: { select: { id: true, name: true, slug: true } },
          },
        });
        if (!invitation) {
          throw invitationNotFound();
        }
        const now = new Date();
        assertUsable(invitation, now);

        if (normalizeEmail(user.email) !== invitation.invitedEmail) {
          throw invitationEmailMismatch();
        }

        const existing = await tx.organizationMember.findUnique({
          where: {
            organizationId_userId: { organizationId: invitation.organizationId, userId: user.id },
          },
          select: { id: true },
        });
        if (existing) {
          throw membershipAlreadyExists('You are already a member of this workspace.');
        }

        // Conditional update: exactly one concurrent acceptance can win.
        const { count } = await tx.organizationInvitation.updateMany({
          where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { acceptedAt: now },
        });
        if (count !== 1) {
          throw invitationAlreadyAccepted();
        }

        const member = await tx.organizationMember.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
          },
          select: { id: true },
        });
        await recordActivity(tx, {
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          action: ActivityAction.INVITATION_ACCEPTED,
          entityType: 'OrganizationInvitation',
          entityId: invitation.id,
          metadata: { email: invitation.invitedEmail, role: invitation.role, memberId: member.id },
        });

        return { organization: invitation.organization, membership: { role: invitation.role } };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw membershipAlreadyExists('You are already a member of this workspace.');
      }
      throw error;
    }
  }
}
