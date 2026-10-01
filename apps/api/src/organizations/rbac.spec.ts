import {
  canAssignRole,
  canManageMember,
  hasPermission,
  type MemberRole,
  type Permission,
} from '@app/shared';
import { describe, expect, it } from 'vitest';

/** Pins the role matrix (Phase 4 organization, Phase 5 catalog, Phase 6 inventory, Phase 7A customer/order, Phase 8 dashboard and report permissions) (docs/organizations-rbac.md). Changes here must be deliberate. */
describe('role permissions', () => {
  const matrix: Record<Permission, Record<MemberRole, boolean>> = {
    ORGANIZATION_READ: { OWNER: true, ADMIN: true, STAFF: true },
    ORGANIZATION_UPDATE: { OWNER: true, ADMIN: true, STAFF: false },
    MEMBERS_READ: { OWNER: true, ADMIN: true, STAFF: true },
    MEMBERS_INVITE: { OWNER: true, ADMIN: true, STAFF: false },
    MEMBERS_UPDATE_ROLE: { OWNER: true, ADMIN: true, STAFF: false },
    MEMBERS_REMOVE: { OWNER: true, ADMIN: true, STAFF: false },
    OWNERSHIP_TRANSFER: { OWNER: true, ADMIN: false, STAFF: false },
    PRODUCTS_READ: { OWNER: true, ADMIN: true, STAFF: true },
    PRODUCTS_CREATE: { OWNER: true, ADMIN: true, STAFF: true },
    PRODUCTS_UPDATE: { OWNER: true, ADMIN: true, STAFF: true },
    PRODUCTS_ARCHIVE: { OWNER: true, ADMIN: true, STAFF: false },
    CATEGORIES_READ: { OWNER: true, ADMIN: true, STAFF: true },
    CATEGORIES_CREATE: { OWNER: true, ADMIN: true, STAFF: true },
    CATEGORIES_UPDATE: { OWNER: true, ADMIN: true, STAFF: true },
    CATEGORIES_DELETE: { OWNER: true, ADMIN: true, STAFF: false },
    WAREHOUSES_READ: { OWNER: true, ADMIN: true, STAFF: true },
    WAREHOUSES_CREATE: { OWNER: true, ADMIN: true, STAFF: false },
    WAREHOUSES_UPDATE: { OWNER: true, ADMIN: true, STAFF: false },
    WAREHOUSES_ARCHIVE: { OWNER: true, ADMIN: true, STAFF: false },
    INVENTORY_READ: { OWNER: true, ADMIN: true, STAFF: true },
    INVENTORY_RECEIVE: { OWNER: true, ADMIN: true, STAFF: true },
    INVENTORY_ISSUE: { OWNER: true, ADMIN: true, STAFF: true },
    INVENTORY_ADJUST: { OWNER: true, ADMIN: true, STAFF: false },
    INVENTORY_TRANSFER: { OWNER: true, ADMIN: true, STAFF: false },
    STOCK_MOVEMENTS_READ: { OWNER: true, ADMIN: true, STAFF: true },
    CUSTOMERS_READ: { OWNER: true, ADMIN: true, STAFF: true },
    CUSTOMERS_CREATE: { OWNER: true, ADMIN: true, STAFF: true },
    CUSTOMERS_UPDATE: { OWNER: true, ADMIN: true, STAFF: true },
    CUSTOMERS_ARCHIVE: { OWNER: true, ADMIN: true, STAFF: false },
    ORDERS_READ: { OWNER: true, ADMIN: true, STAFF: true },
    ORDERS_CREATE: { OWNER: true, ADMIN: true, STAFF: true },
    ORDERS_UPDATE: { OWNER: true, ADMIN: true, STAFF: true },
    ORDERS_CONFIRM: { OWNER: true, ADMIN: true, STAFF: true },
    ORDERS_PROCESS: { OWNER: true, ADMIN: true, STAFF: false },
    ORDERS_SHIP: { OWNER: true, ADMIN: true, STAFF: false },
    ORDERS_COMPLETE: { OWNER: true, ADMIN: true, STAFF: false },
    ORDERS_CANCEL: { OWNER: true, ADMIN: true, STAFF: false },
    DASHBOARD_READ: { OWNER: true, ADMIN: true, STAFF: true },
    REPORTS_READ: { OWNER: true, ADMIN: true, STAFF: true },
    REPORTS_EXPORT: { OWNER: true, ADMIN: true, STAFF: true },
  };

  for (const [permission, roles] of Object.entries(matrix)) {
    for (const [role, allowed] of Object.entries(roles)) {
      it(`${role} ${allowed ? 'has' : 'lacks'} ${permission}`, () => {
        expect(hasPermission(role as MemberRole, permission as Permission)).toBe(allowed);
      });
    }
  }
});

describe('role hierarchy', () => {
  it.each([
    ['OWNER', 'ADMIN', true],
    ['OWNER', 'STAFF', true],
    ['OWNER', 'OWNER', false],
    ['ADMIN', 'STAFF', true],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'OWNER', false],
    ['STAFF', 'STAFF', false],
  ] as const)('%s assigning/managing %s → %s', (actor, target, allowed) => {
    expect(canAssignRole(actor, target)).toBe(allowed);
    expect(canManageMember(actor, target)).toBe(allowed);
  });
});
