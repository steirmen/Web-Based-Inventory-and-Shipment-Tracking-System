import type { AuthUser, MemberRole, Permission } from '@app/shared';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';

/** Resolved by `OrganizationAccessGuard` after verifying membership (and permissions). */
export interface OrganizationContext {
  user: AuthUser;
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  };
  membership: { id: string; role: MemberRole; createdAt: Date };
}

export type OrganizationRequest = AuthenticatedRequest & {
  organizationContext?: OrganizationContext;
};

export const REQUIRED_PERMISSIONS_KEY = 'organization:requiredPermissions';

/**
 * Permissions the current member's role must have (see ROLE_PERMISSIONS in
 * @app/shared). Only effective on controllers guarded by `OrganizationAccessGuard`.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

function contextOf(executionContext: ExecutionContext): OrganizationContext {
  const context = executionContext
    .switchToHttp()
    .getRequest<OrganizationRequest>().organizationContext;
  if (!context) {
    throw new Error('Organization context used on a route without OrganizationAccessGuard.');
  }
  return context;
}

/** The full verified context: user, organization, and membership. */
export const OrgContext = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  contextOf(context),
);

export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => contextOf(context).organization,
);

export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => contextOf(context).membership,
);
