import type {
  DashboardKpis,
  DashboardSummaryResponse,
  DashboardTimeSeriesPoint,
} from '@app/shared';

const metric = (current: number, previous: number) => ({
  current,
  previous,
  absoluteChange: current - previous,
  percentageChange:
    previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10,
});

/** Seven daily points, Sep 1–7 2025, with revenue on two days. */
export function dailyPoints(): DashboardTimeSeriesPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = `2025-09-0${index + 1}`;
    const revenue = index === 1 ? '150.00' : index === 4 ? '50.50' : '0.00';
    const orders = index === 1 ? 2 : index === 4 ? 1 : index === 5 ? 1 : 0;
    return {
      period: day,
      periodEnd: day,
      orders,
      realizedOrders: revenue === '0.00' ? 0 : 1,
      revenue,
    };
  });
}

/**
 * A dashboard summary with easily recognizable numbers. `kpis` overrides
 * merge into the defaults; everything else replaces whole sections.
 */
export function dashboardSummary(
  overrides: Partial<Omit<DashboardSummaryResponse, 'kpis'>> & {
    kpis?: Partial<DashboardKpis>;
  } = {},
): DashboardSummaryResponse {
  const { kpis, ...rest } = overrides;
  return {
    period: {
      range: 'LAST_30_DAYS',
      timeZone: 'UTC',
      from: '2025-09-01',
      to: '2025-09-07',
      start: '2025-09-01T00:00:00.000Z',
      end: '2025-09-08T00:00:00.000Z',
      days: 7,
    },
    comparisonPeriod: {
      from: '2025-08-25',
      to: '2025-08-31',
      start: '2025-08-25T00:00:00.000Z',
      end: '2025-09-01T00:00:00.000Z',
      days: 7,
    },
    generatedAt: '2025-09-07T12:00:00.000Z',
    currency: 'TRY',
    currencies: ['TRY'],
    kpis: {
      sales: {
        current: '200.50',
        previous: '100.25',
        absoluteChange: '100.25',
        percentageChange: 100,
      },
      orders: metric(4, 8),
      realizedOrders: metric(2, 2),
      newCustomers: metric(3, 0),
      activeCustomers: 17,
      archivedCustomers: 2,
      activeProducts: 23,
      archivedProducts: 4,
      inventoryUnits: 4321,
      inStockItems: 31,
      lowStockItems: 7,
      outOfStockItems: 5,
      activeWarehouses: 2,
      inactiveWarehouses: 1,
      ...kpis,
    },
    orderStatus: [
      { status: 'DRAFT', count: 1 },
      { status: 'CONFIRMED', count: 0 },
      { status: 'PROCESSING', count: 1 },
      { status: 'SHIPPED', count: 0 },
      { status: 'COMPLETED', count: 1 },
      { status: 'CANCELLED', count: 1 },
    ],
    timeSeries: { bucket: 'DAY', points: dailyPoints() },
    topProducts: [
      {
        productId: '0198c0de-0000-7000-8000-0000000000b1',
        name: 'Copy Paper A4',
        sku: 'PAP-A4',
        status: 'ACTIVE',
        unitsSold: 30,
        revenue: '207.00',
      },
      {
        productId: '0198c0de-0000-7000-8000-0000000000b2',
        name: 'Old Stapler',
        sku: 'STAP-OLD',
        status: 'ARCHIVED',
        unitsSold: 2,
        revenue: '9.90',
      },
    ],
    warehouses: [
      {
        id: '0198c0de-0000-7000-8000-0000000000c1',
        name: 'Main Warehouse',
        code: 'MAIN',
        isActive: true,
        totalUnits: 4000,
        inStockItems: 25,
        lowStockItems: 6,
        outOfStockItems: 2,
      },
      {
        id: '0198c0de-0000-7000-8000-0000000000c2',
        name: 'East',
        code: 'EAST',
        isActive: true,
        totalUnits: 321,
        inStockItems: 6,
        lowStockItems: 1,
        outOfStockItems: 3,
      },
      {
        id: '0198c0de-0000-7000-8000-0000000000c3',
        name: 'Closed depot',
        code: 'OLD',
        isActive: false,
        totalUnits: 12,
        inStockItems: 1,
        lowStockItems: 0,
        outOfStockItems: 0,
      },
    ],
    recentOrders: [
      {
        id: '0198c0de-0000-7000-8000-0000000000d9',
        orderNumber: 'SO-1042',
        status: 'SHIPPED',
        customer: {
          id: '0198c0de-0000-7000-8000-0000000000e1',
          name: 'Alice Acme',
          companyName: 'Acme, Inc.',
        },
        total: '79.98',
        currency: 'TRY',
        createdAt: '2025-09-06T10:00:00.000Z',
      },
    ],
    ...rest,
  };
}

/** A workspace with no data at all (what a brand-new workspace returns). */
export function emptyDashboardSummary(): DashboardSummaryResponse {
  const zero = metric(0, 0);
  return dashboardSummary({
    kpis: {
      sales: { current: '0.00', previous: '0.00', absoluteChange: '0.00', percentageChange: null },
      orders: zero,
      realizedOrders: zero,
      newCustomers: zero,
      activeCustomers: 0,
      archivedCustomers: 0,
      activeProducts: 0,
      archivedProducts: 0,
      inventoryUnits: 0,
      inStockItems: 0,
      lowStockItems: 0,
      outOfStockItems: 0,
      activeWarehouses: 0,
      inactiveWarehouses: 0,
    },
    orderStatus: dashboardSummary().orderStatus.map((entry) => ({ ...entry, count: 0 })),
    timeSeries: {
      bucket: 'DAY',
      points: dailyPoints().map((point) => ({
        ...point,
        orders: 0,
        realizedOrders: 0,
        revenue: '0.00',
      })),
    },
    topProducts: [],
    warehouses: [],
    recentOrders: [],
  });
}
