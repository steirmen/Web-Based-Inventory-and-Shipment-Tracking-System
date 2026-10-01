import { describe, expect, it } from 'vitest';
import {
  customRangeError,
  DEFAULT_DASHBOARD_PARAMS,
  formatDayRange,
  inventoryStatusPath,
  ordersInPeriodPath,
  readDashboardParams,
  toDashboardQuery,
  writeDashboardParams,
} from './dashboard-params';

const read = (search: string) => readDashboardParams(new URLSearchParams(search));

describe('dashboard URL params', () => {
  it('reads presets and custom ranges, and writes only non-defaults', () => {
    expect(read('')).toEqual(DEFAULT_DASHBOARD_PARAMS);
    expect(read('range=THIS_YEAR')).toEqual({ range: 'THIS_YEAR', from: '', to: '' });
    expect(read('range=CUSTOM&from=2025-01-01&to=2025-01-31')).toEqual({
      range: 'CUSTOM',
      from: '2025-01-01',
      to: '2025-01-31',
    });
    expect(writeDashboardParams(DEFAULT_DASHBOARD_PARAMS).toString()).toBe('');
    expect(writeDashboardParams({ range: 'TODAY', from: 'x', to: 'y' }).toString()).toBe(
      'range=TODAY',
    );
  });

  it.each([
    'range=YESTERDAY',
    'range=CUSTOM',
    'range=CUSTOM&from=2025-02-30&to=2025-03-01',
    'range=CUSTOM&from=2025-03-02&to=2025-03-01',
    'range=CUSTOM&from=2024-01-01&to=2025-01-01',
    'range=CUSTOM&from=2025-1-1&to=2025-01-31',
  ])('falls back to the default for %s', (search) => {
    expect(read(search)).toEqual(DEFAULT_DASHBOARD_PARAMS);
  });

  it('validates custom ranges like the API', () => {
    expect(customRangeError('2024-01-01', '2024-12-31')).toBeUndefined();
    expect(customRangeError('', '2024-12-31')).toMatch(/start and an end/);
    expect(customRangeError('2024-12-31', '2024-01-01')).toMatch(/before the start/);
    expect(customRangeError('2024-01-01', '2025-01-01')).toMatch(/366 days/);
  });

  it('builds the API query with the time zone', () => {
    expect(toDashboardQuery({ range: 'LAST_7_DAYS', from: '', to: '' }, 'Europe/Istanbul')).toEqual(
      { range: 'LAST_7_DAYS', timeZone: 'Europe/Istanbul' },
    );
    expect(
      toDashboardQuery({ range: 'CUSTOM', from: '2025-01-01', to: '2025-01-02' }, 'UTC'),
    ).toEqual({ range: 'CUSTOM', from: '2025-01-01', to: '2025-01-02', timeZone: 'UTC' });
  });

  it('formats calendar days without time zone shifts', () => {
    expect(formatDayRange('2025-09-01', '2025-09-01')).toContain('2025');
    expect(formatDayRange('2025-01-01', '2025-01-01')).toMatch(/1/);
  });

  it('links to the detailed pages with the matching filters', () => {
    expect(inventoryStatusPath('org-1', 'OUT_OF_STOCK')).toBe(
      '/org/org-1/inventory?status=OUT_OF_STOCK',
    );
    expect(ordersInPeriodPath('org-1', 'SHIPPED', '2025-09-01', '2025-09-30')).toBe(
      '/org/org-1/orders?status=SHIPPED&from=2025-09-01&to=2025-09-30',
    );
  });
});
