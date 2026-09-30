import type { Permission } from '@app/shared';
import type { ReactNode } from 'react';
import { useCurrentOrganization } from '@/lib/organization-context';

/**
 * Renders `children` only if the viewer's role has `permission` in the current
 * organization. UX ONLY — hiding a control is not a security boundary; the API
 * rejects the action independently.
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useCurrentOrganization();
  return <>{can(permission) ? children : fallback}</>;
}
