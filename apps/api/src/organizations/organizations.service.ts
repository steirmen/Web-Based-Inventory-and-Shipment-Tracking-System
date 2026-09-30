import type { AuthUser, OrganizationListResponse, OrganizationResponse } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto.js';
import { ORGANIZATION_SELECT, toOrganization } from './organization-mappers.js';
import type { OrganizationContext } from './organization-context.js';
import { organizationSlugTaken } from './organization-errors.js';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the organization and the creator's OWNER membership atomically.
   * A retried request fails on the unique slug instead of creating duplicates.
   */
  async create(user: AuthUser, input: CreateOrganizationDto): Promise<OrganizationResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: input.name, slug: input.slug },
          select: ORGANIZATION_SELECT,
        });
        await tx.organizationMember.create({
          data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
        });
        await recordActivity(tx, {
          organizationId: organization.id,
          actorUserId: user.id,
          action: ActivityAction.ORGANIZATION_CREATED,
          entityType: 'Organization',
          entityId: organization.id,
          metadata: { name: organization.name, slug: organization.slug },
        });
        return { organization: toOrganization(organization), membership: { role: 'OWNER' } };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw organizationSlugTaken();
      }
      throw error;
    }
  }

  /** Only organizations the user belongs to, with their role and member count, in one query. */
  async listForUser(userId: string): Promise<OrganizationListResponse> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      orderBy: [{ organization: { name: 'asc' } }, { organizationId: 'asc' }],
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        },
      },
    });

    return {
      organizations: memberships.map(({ role, organization }) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role,
        memberCount: organization._count.members,
        createdAt: organization.createdAt.toISOString(),
      })),
    };
  }

  get(context: OrganizationContext): OrganizationResponse {
    return {
      organization: toOrganization(context.organization),
      membership: { role: context.membership.role },
    };
  }

  /** Name only; the slug is immutable. */
  async update(
    context: OrganizationContext,
    input: UpdateOrganizationDto,
  ): Promise<OrganizationResponse> {
    const previousName = context.organization.name;

    const organization = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: context.organization.id },
        data: { name: input.name },
        select: ORGANIZATION_SELECT,
      });
      if (updated.name !== previousName) {
        await recordActivity(tx, {
          organizationId: updated.id,
          actorUserId: context.user.id,
          action: ActivityAction.ORGANIZATION_UPDATED,
          entityType: 'Organization',
          entityId: updated.id,
          metadata: { name: { from: previousName, to: updated.name } },
        });
      }
      return updated;
    });

    return {
      organization: toOrganization(organization),
      membership: { role: context.membership.role },
    };
  }
}
