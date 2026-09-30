import { hasPermission, type Permission } from '@app/shared';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUuid } from '../common/validation/uuid.js';
import { PrismaService } from '../database/prisma.service.js';
import { type OrganizationRequest, REQUIRED_PERMISSIONS_KEY } from './organization-context.js';
import { organizationForbidden, organizationNotFound } from './organization-errors.js';

/**
 * Authorization for organization-scoped routes (`/organizations/:organizationId/...`).
 * Runs after the global SessionAuthGuard, so the user is already authenticated.
 *
 *   authenticated user → :organizationId (route param) → membership lookup
 *   → role → required permissions → allow, or deny
 *
 * - The organization id is taken ONLY from the route, never from the body or query.
 * - Unknown organizations and organizations the user does not belong to produce
 *   the same 404 from the same single indexed query, so existence is not revealed.
 * - A member lacking a required permission gets 403 ORGANIZATION_FORBIDDEN.
 * - On success, `request.organizationContext` holds { user, organization, membership }.
 */
@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrganizationRequest>();

    const user = request.auth?.user;
    if (!user) {
      throw new Error('OrganizationAccessGuard requires an authenticated (non-@Public) route.');
    }
    const organizationId = request.params.organizationId;
    if (typeof organizationId !== 'string') {
      throw new Error('OrganizationAccessGuard requires an :organizationId route parameter.');
    }
    if (!isUuid(organizationId)) {
      throw organizationNotFound();
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: organizationId.toLowerCase(), userId: user.id },
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        organization: {
          select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
        },
      },
    });
    if (!membership) {
      throw organizationNotFound();
    }

    const required =
      this.reflector.getAllAndMerge<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (!required.every((permission) => hasPermission(membership.role, permission))) {
      throw organizationForbidden();
    }

    const { organization, ...member } = membership;
    request.organizationContext = { user, organization, membership: member };
    return true;
  }
}
