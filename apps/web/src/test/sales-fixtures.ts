import type {
  Customer,
  CustomerListResponse,
  Order,
  OrderItem,
  OrderListItem,
  OrderListResponse,
  ProductListItem,
} from '@app/shared';
import { eastWarehouse, mainWarehouse } from './inventory-fixtures';

/** Test data for customer and order screens. */

export function testCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '0198c0de-0000-7000-8000-0000000000c7',
    name: 'Jamie Rivera',
    companyName: 'Riverside Dental',
    email: 'purchasing@riverside.example',
    phone: '+1 555 0101',
    address: '12 Harbor Road',
    notes: null,
    isActive: true,
    orderCount: 2,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
    ...overrides,
  };
}

export const riverside = testCustomer();
export const brightline = testCustomer({
  id: '0198c0de-0000-7000-8000-0000000000c8',
  name: 'Sam Patel',
  companyName: 'Brightline Studio',
  email: null,
  phone: null,
  address: null,
  orderCount: 0,
});

export function customerPage(
  items: Customer[],
  pagination: Partial<CustomerListResponse['pagination']> = {},
): CustomerListResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
      ...pagination,
    },
  };
}

const warehouseRef = (warehouse: typeof mainWarehouse) => ({
  id: warehouse.id,
  name: warehouse.name,
  code: warehouse.code,
  isActive: warehouse.isActive,
});

const customerRef = (customer: Customer) => ({
  id: customer.id,
  name: customer.name,
  companyName: customer.companyName,
  isActive: customer.isActive,
});

export function testProductItem(overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: '0198c0de-0000-7000-8000-0000000000d1',
    name: 'Keyboard K2',
    sku: 'KEY-002',
    price: '24.99',
    cost: '12.00',
    minimumStock: 5,
    status: 'ACTIVE',
    category: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

export const keyboardProduct = testProductItem();
export const penProduct = testProductItem({
  id: '0198c0de-0000-7000-8000-0000000000d2',
  name: 'Ballpoint Pen',
  sku: 'PEN-1',
  price: '0.10',
});

export function testOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: '0198c0de-0000-7000-8000-0000000001e1',
    productId: keyboardProduct.id,
    productName: 'Keyboard K2',
    sku: 'KEY-002',
    unitPrice: '24.99',
    quantity: 2,
    lineTotal: '49.98',
    productStatus: 'ACTIVE',
    availableQuantity: 12,
    ...overrides,
  };
}

export function testOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '0198c0de-0000-7000-8000-0000000001a1',
    orderNumber: 'SO-1001',
    status: 'DRAFT',
    customer: customerRef(riverside),
    warehouse: warehouseRef(mainWarehouse),
    itemCount: 1,
    total: '49.98',
    subtotal: '49.98',
    totalQuantity: 2,
    notes: null,
    items: [testOrderItem()],
    history: [
      {
        action: 'ORDER_CREATED',
        actor: { id: '0198c0de-0000-7000-8000-000000000001', name: 'Ada Example' },
        createdAt: '2026-09-03T10:00:00.000Z',
      },
    ],
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

export function toListItem(order: Order): OrderListItem {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customer: order.customer,
    warehouse: order.warehouse,
    itemCount: order.itemCount,
    total: order.total,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export const confirmedOrder = testOrder({
  id: '0198c0de-0000-7000-8000-0000000001a2',
  orderNumber: 'SO-1002',
  status: 'CONFIRMED',
  customer: customerRef(brightline),
  warehouse: warehouseRef(eastWarehouse),
  total: '125.50',
  subtotal: '125.50',
});

export function orderPage(
  items: OrderListItem[],
  pagination: Partial<OrderListResponse['pagination']> = {},
): OrderListResponse {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length ? 1 : 0,
      ...pagination,
    },
  };
}
