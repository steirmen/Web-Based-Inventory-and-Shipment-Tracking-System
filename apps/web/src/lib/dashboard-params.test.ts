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
    expect(read('range=THIS_YEAR')).toEqual({ range: 'THIS_YEAR', from: '', to: '', currency: '' });
    expect(read('range=CUSTOM&from=2025-01-01&to=2025-01-31')).toEqual({
      range: 'CUSTOM',
      from: '2025-01-01',
      to: '2025-01-31',
      currency: '',
    });
    expect(read('range=TODAY&currency=EUR').currency).toBe('EUR');
    expect(read('currency=BTC').currency).toBe('');
    expect(writeDashboardParams(DEFAULT_DASHBOARD_PARAMS).toString()).toBe('');
    expect(
      writeDashboardParams({ range: 'TODAY', from: 'x', to: 'y', currency: '' }).toString(),
    ).toBe('range=TODAY');
    expect(
      writeDashboardParams({ range: 'TODAY', from: '', to: '', currency: 'USD' }).toString(),
    ).toBe('range=TODAY&currency=USD');
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
    expect(customRangeError('', '2024-12-31')).toBe('missing');
    expect(customRangeError('2024-12-31', '2024-01-01')).toBe('order');
    expect(customRangeError('2024-01-01', '2025-01-01')).toBe('tooLong');
  });

  it('builds the API query with the time zone', () => {
    expect(
      toDashboardQuery({ range: 'LAST_7_DAYS', from: '', to: '', currency: '' }, 'Europe/Istanbul'),
    ).toEqual({ range: 'LAST_7_DAYS', timeZone: 'Europe/Istanbul' });
    expect(
      toDashboardQuery(
        { range: 'CUSTOM', from: '2025-01-01', to: '2025-01-02', currency: 'EUR' },
        'UTC',
      ),
    ).toEqual({
      range: 'CUSTOM',
      from: '2025-01-01',
      to: '2025-01-02',
      timeZone: 'UTC',
      currency: 'EUR',
    });
  });

  it('formats calendar days without time zone shifts', () => {
    expect(formatDayRange('2025-09-01', '2025-09-01', 'en-US')).toBe('Sep 1, 2025');
    expect(formatDayRange('2025-09-01', '2025-09-01', 'tr-TR')).toBe('1 Eyl 2025');
    expect(formatDayRange('2025-01-01', '2025-01-01', 'en-US')).toMatch(/1/);
  });

  it('links to the detailed pages with the matching filters', () => {
    expect(inventoryStatusPath('org-1', 'OUT_OF_STOCK')).toBe(
      '/org/org-1/inventory?status=OUT_OF_STOCK',
    );
    expect(
      ordersInPeriodPath('org-1', 'SHIPPED', {
        from: '2025-09-01',
        to: '2025-09-30',
        timeZone: 'Europe/Istanbul',
      }),
    ).toBe(
      '/org/org-1/orders?status=SHIPPED&from=2025-09-01&to=2025-09-30&timeZone=Europe%2FIstanbul',
    );
  });
});
