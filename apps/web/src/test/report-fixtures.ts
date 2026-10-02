import type {
  InventoryReportResponse,
  InventoryReportRow,
  OrdersReportResponse,
  OrdersReportRow,
  SalesReportResponse,
  SalesReportRow,
} from '@app/shared';
import { dashboardSummary } from './dashboard-fixtures';

const period = dashboardSummary().period;

export const salesRow = (overrides: Partial<SalesReportRow> = {}): SalesReportRow => ({
  orderId: '0198c0de-0000-7000-8000-0000000000d1',
  orderNumber: 'SO-2001',
  date: '2025-09-03T10:00:00.000Z',
  status: 'COMPLETED',
  customer: {
    id: '0198c0de-0000-7000-8000-0000000000e1',
    name: 'Alice Acme',
    companyName: 'Acme, Inc.',
  },
  warehouse: {
    id: '0198c0de-0000-7000-8000-0000000000c1',
    name: 'Main',
    code: 'MAIN',
    isActive: true,
  },
  units: 11,
  revenue: '55.00',
  currency: 'TRY',
  ...overrides,
});

export function salesReport(
  items: SalesReportRow[] = [
    salesRow(),
    salesRow({
      orderId: '0198c0de-0000-7000-8000-0000000000d2',
      orderNumber: 'SO-2002',
      status: 'SHIPPED',
      units: 2,
      revenue: '79.98',
      customer: null,
    }),
  ],
  pagination: Partial<SalesReportResponse['pagination']> = {},
): SalesReportResponse {
  return {
    period,
    items,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
      ...pagination,
    },
    totals: { orders: items.length, units: 13, revenue: '134.98' },
    currency: 'TRY',
    currencies: ['TRY'],
  };
}

export const ordersRow = (overrides: Partial<OrdersReportRow> = {}): OrdersReportRow => ({
  orderId: '0198c0de-0000-7000-8000-0000000000d3',
  orderNumber: 'SO-3001',
  status: 'DRAFT',
  customer: { id: '0198c0de-0000-7000-8000-0000000000e1', name: 'Alice Acme', companyName: null },
  warehouse: {
    id: '0198c0de-0000-7000-8000-0000000000c1',
    name: 'Main',
    code: 'MAIN',
    isActive: true,
  },
  itemCount: 3,
  total: '120.00',
  currency: 'TRY',
  createdAt: '2025-09-05T10:00:00.000Z',
  ...overrides,
});

export function ordersReport(items: OrdersReportRow[] = [ordersRow()]): OrdersReportResponse {
  return {
    period,
    items,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
    },
    totals: { orders: items.length, values: [{ currency: 'TRY', amount: '120.00' }] },
  };
}

export const inventoryRow = (overrides: Partial<InventoryReportRow> = {}): InventoryReportRow => ({
  inventoryId: '0198c0de-0000-7000-8000-0000000000f1',
  product: {
    id: '0198c0de-0000-7000-8000-0000000000b1',
    name: 'Hammer',
    sku: 'HAM',
    status: 'ACTIVE',
  },
  category: { id: '0198c0de-0000-7000-8000-0000000000a9', name: 'Tools' },
  warehouse: {
    id: '0198c0de-0000-7000-8000-0000000000c1',
    name: 'Main',
    code: 'MAIN',
    isActive: true,
  },
  quantity: 5,
  minimumStock: 5,
  status: 'LOW_STOCK',
  ...overrides,
});

export function inventoryReport(
  items: InventoryReportRow[] = [inventoryRow()],
): InventoryReportResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 25,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
    },
    totals: { rows: items.length, units: 5, inStock: 0, lowStock: 1, outOfStock: 0 },
  };
}
