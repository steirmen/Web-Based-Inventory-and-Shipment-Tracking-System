import { describe, expect, it } from 'vitest';
import { REQUIRED_PERMISSIONS_KEY } from '../organizations/organization-context.js';
import { ReportsController } from './reports.controller.js';

/** The API enforces report permissions itself (not only the UI). */
describe('ReportsController permissions', () => {
  it.each([
    ['sales', 'REPORTS_READ'],
    ['orders', 'REPORTS_READ'],
    ['inventory', 'REPORTS_READ'],
    ['salesExport', 'REPORTS_EXPORT'],
    ['ordersExport', 'REPORTS_EXPORT'],
    ['inventoryExport', 'REPORTS_EXPORT'],
  ] as const)('%s requires %s', (handler, permission) => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, ReportsController.prototype[handler]),
    ).toEqual([permission]);
  });
});
