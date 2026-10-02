import { describe, expect, it } from 'vitest';
import {
  nextSort,
  readInventoryReportParams,
  readSalesParams,
  salesReportPath,
  toInventoryReportQuery,
  toSalesQuery,
  writeInventoryReportParams,
  writeSalesParams,
} from './report-params';

const ID = '0198c0de-0000-7000-8000-0000000000aa';

describe('report URL params', () => {
  it('round-trips the sales filters and writes only non-defaults', () => {
    const search = `range=THIS_YEAR&search=acme&warehouseId=${ID}&status=SHIPPED&sort=revenue%3Aasc&page=3`;
    const params = readSalesParams(new URLSearchParams(search));

    expect(params).toMatchObject({
      period: { range: 'THIS_YEAR' },
      search: 'acme',
      warehouseId: ID,
      status: 'SHIPPED',
      sort: { field: 'revenue', order: 'asc' },
      page: 3,
    });
    expect(writeSalesParams(params).toString()).toBe(search);
    expect(writeSalesParams(readSalesParams(new URLSearchParams())).toString()).toBe('');
  });

  it('ignores invalid values instead of sending them', () => {
    const params = readSalesParams(
      new URLSearchParams('status=DRAFT&sort=unit_price%3Aasc&warehouseId=nope&page=-2'),
    );
    expect(params).toMatchObject({
      status: '',
      sort: { field: 'date', order: 'desc' },
      warehouseId: '',
      page: 1,
    });
  });

  it('builds API queries with only the set filters', () => {
    expect(toSalesQuery(readSalesParams(new URLSearchParams(`customerId=${ID}`)), 'UTC')).toEqual({
      range: 'LAST_30_DAYS',
      timeZone: 'UTC',
      customerId: ID,
      sortBy: 'date',
      sortOrder: 'desc',
      page: 1,
      pageSize: 25,
    });
    const inventory = readInventoryReportParams(
      new URLSearchParams('includeArchived=true&status=LOW_STOCK'),
    );
    expect(toInventoryReportQuery(inventory)).toEqual({
      includeArchived: true,
      status: 'LOW_STOCK',
      sortBy: 'productName',
      sortOrder: 'asc',
      page: 1,
      pageSize: 25,
    });
    expect(writeInventoryReportParams(inventory).toString()).toBe(
      'status=LOW_STOCK&includeArchived=true',
    );
  });

  it('flips the order on the same column and starts a new column at its default', () => {
    expect(nextSort({ field: 'date', order: 'desc' }, 'date', 'desc')).toEqual({
      field: 'date',
      order: 'asc',
    });
    expect(nextSort({ field: 'date', order: 'desc' }, 'revenue', 'desc')).toEqual({
      field: 'revenue',
      order: 'desc',
    });
  });

  it('links to the sales report of a dashboard range and product', () => {
    expect(
      salesReportPath(
        'org-1',
        { range: 'CUSTOM', from: '2025-01-01', to: '2025-01-31', currency: '' },
        ID,
      ),
    ).toBe(`/org/org-1/reports/sales?range=CUSTOM&from=2025-01-01&to=2025-01-31&productId=${ID}`);
  });
});
