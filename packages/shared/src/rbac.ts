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
  'WAREHOUSES_READ',
  'WAREHOUSES_CREATE',
  'WAREHOUSES_UPDATE',
  /** Archive and restore warehouses. */
  'WAREHOUSES_ARCHIVE',
  /** Inventory list and detail (with its movement history). */
  'INVENTORY_READ',
  /** Receive stock (PURCHASE movements). */
  'INVENTORY_RECEIVE',
  /** Remove stock: issue (SALE) and damage/write-off (DAMAGE). */
  'INVENTORY_ISSUE',
  /** Set a counted quantity (ADJUSTMENT). */
  'INVENTORY_ADJUST',
  /** Move stock between warehouses (TRANSFER_OUT + TRANSFER_IN). */
  'INVENTORY_TRANSFER',
  'STOCK_MOVEMENTS_READ',
  'CUSTOMERS_READ',
  'CUSTOMERS_CREATE',
  'CUSTOMERS_UPDATE',
  /** Archive and restore customers. */
  'CUSTOMERS_ARCHIVE',
  'ORDERS_READ',
  /** Create DRAFT orders. */
  'ORDERS_CREATE',
  /** Edit DRAFT orders (customer, warehouse, lines, notes). */
  'ORDERS_UPDATE',
  /** DRAFT → CONFIRMED (no stock effect). */
  'ORDERS_CONFIRM',
  /** CONFIRMED → PROCESSING: deducts stock (SALE movements). */
  'ORDERS_PROCESS',
  /** PROCESSING → SHIPPED. */
  'ORDERS_SHIP',
  /** SHIPPED → COMPLETED. */
  'ORDERS_COMPLETE',
  /** DRAFT/CONFIRMED → CANCELLED. */
  'ORDERS_CANCEL',
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
    'WAREHOUSES_READ',
    'WAREHOUSES_CREATE',
    'WAREHOUSES_UPDATE',
    'WAREHOUSES_ARCHIVE',
    'INVENTORY_READ',
    'INVENTORY_RECEIVE',
    'INVENTORY_ISSUE',
    'INVENTORY_ADJUST',
    'INVENTORY_TRANSFER',
    'STOCK_MOVEMENTS_READ',
    'CUSTOMERS_READ',
    'CUSTOMERS_CREATE',
    'CUSTOMERS_UPDATE',
    'CUSTOMERS_ARCHIVE',
    'ORDERS_READ',
    'ORDERS_CREATE',
    'ORDERS_UPDATE',
    'ORDERS_CONFIRM',
    'ORDERS_PROCESS',
    'ORDERS_SHIP',
    'ORDERS_COMPLETE',
    'ORDERS_CANCEL',
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
    'WAREHOUSES_READ',
    'INVENTORY_READ',
    'INVENTORY_RECEIVE',
    'INVENTORY_ISSUE',
    'STOCK_MOVEMENTS_READ',
    'CUSTOMERS_READ',
    'CUSTOMERS_CREATE',
    'CUSTOMERS_UPDATE',
    'ORDERS_READ',
    'ORDERS_CREATE',
    'ORDERS_UPDATE',
    'ORDERS_CONFIRM',
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
