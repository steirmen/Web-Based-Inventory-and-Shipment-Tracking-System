import {
  canAssignRole,
  canManageMember,
  hasPermission,
  type MemberRole,
  type Organization,
  type Permission,
} from '@app/shared';
import { createContext, useContext } from 'react';

/**
 * The organization shown by the current `/org/:organizationId` route and the
 * viewer's role in it, as returned by the API. Used ONLY to decide what to
 * display — every action is authorized again by the API.
 */
export interface CurrentOrganization {
  organization: Organization;
  role: MemberRole;
  can: (permission: Permission) => boolean;
  canAssign: (role: MemberRole) => boolean;
  canManage: (targetRole: MemberRole) => boolean;
}

export const OrganizationContext = createContext<CurrentOrganization | null>(null);

export function createOrganizationContext(
  organization: Organization,
  role: MemberRole,
): CurrentOrganization {
  return {
    organization,
    role,
    can: (permission) => hasPermission(role, permission),
    canAssign: (target) => canAssignRole(role, target),
    canManage: (target) => canManageMember(role, target),
  };
}

export function useCurrentOrganization(): CurrentOrganization {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useCurrentOrganization() used outside an organization route.');
  }
  return context;
}
