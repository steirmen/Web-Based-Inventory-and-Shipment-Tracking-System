/**
 * Role-based access control: the single definition of what each organization
 * role may do.
 *
 * The API enforces these rules on every request. The web app uses the same
 * functions only to decide what to SHOW — frontend visibility is never a
 * security boundary.
 */

/** Mirrors the `member_role` database enum. */
export const MEMBER_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PERMISSIONS = [
  'ORGANIZATION_READ',
  'ORGANIZATION_UPDATE',
  'MEMBERS_READ',
  /** Create, list, and revoke invitations. */
  'MEMBERS_INVITE',
  'MEMBERS_UPDATE_ROLE',
  'MEMBERS_REMOVE',
  'OWNERSHIP_TRANSFER',
  'PRODUCTS_READ',
  'PRODUCTS_CREATE',
  'PRODUCTS_UPDATE',
  /** Archive and restore products. */
  'PRODUCTS_ARCHIVE',
  'CATEGORIES_READ',
  'CATEGORIES_CREATE',
  'CATEGORIES_UPDATE',
  'CATEGORIES_DELETE',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: [
    'ORGANIZATION_READ',
    'ORGANIZATION_UPDATE',
    'MEMBERS_READ',
    'MEMBERS_INVITE',
    'MEMBERS_UPDATE_ROLE',
    'MEMBERS_REMOVE',
    'PRODUCTS_READ',
    'PRODUCTS_CREATE',
    'PRODUCTS_UPDATE',
    'PRODUCTS_ARCHIVE',
    'CATEGORIES_READ',
    'CATEGORIES_CREATE',
    'CATEGORIES_UPDATE',
    'CATEGORIES_DELETE',
  ],
  STAFF: [
    'ORGANIZATION_READ',
    'MEMBERS_READ',
    'PRODUCTS_READ',
    'PRODUCTS_CREATE',
    'PRODUCTS_UPDATE',
    'CATEGORIES_READ',
    'CATEGORIES_CREATE',
    'CATEGORIES_UPDATE',
  ],
};

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Role hierarchy: the roles each role may grant (by invitation or role change)
 * and, equally, the roles of members it may manage (change or remove).
 * OWNER is never assignable — ownership moves only through ownership transfer.
 */
export const ASSIGNABLE_ROLES: Record<MemberRole, readonly MemberRole[]> = {
  OWNER: ['ADMIN', 'STAFF'],
  ADMIN: ['STAFF'],
  STAFF: [],
};

/** May `actor` grant `role` (invite with it, or change a member to it)? */
export function canAssignRole(actor: MemberRole, role: MemberRole): boolean {
  return ASSIGNABLE_ROLES[actor].includes(role);
}

/** May `actor` change the role of, or remove, a member whose role is `target`? */
export function canManageMember(actor: MemberRole, target: MemberRole): boolean {
  return ASSIGNABLE_ROLES[actor].includes(target);
}
