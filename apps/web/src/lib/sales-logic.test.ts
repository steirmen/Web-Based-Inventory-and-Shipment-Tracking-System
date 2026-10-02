import { describe, expect, it } from 'vitest';
import { common } from '@/i18n/messages/common';
import { sales } from '@/i18n/messages/sales';
import { testOrder, testOrderItem } from '@/test/sales-fixtures';
import { describeApiError } from './api-errors';
import { toCustomerRequest, validateCustomer } from './customer-form';
import {
  mapOrderError,
  orderFormState,
  parseQuantity,
  subtotalPreview,
  toUpdateOrderRequest,
  validateOrderForm,
} from './order-form';
import { fromCents, lineTotal, sumMoney, toCents } from './order-money';
import { readOrderParams, toOrderQuery, writeOrderParams } from './sales-params';
import { ApiError } from '@/api/http-client';

describe('order money (exact cents, never floats)', () => {
  it('converts and multiplies exactly', () => {
    expect(toCents('0.1')).toBe(10n);
    expect(fromCents(toCents('1234.5'))).toBe('1234.50');
    expect(lineTotal('0.10', 3)).toBe('0.30');
    expect(lineTotal('24.99', 7)).toBe('174.93');
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(sumMoney([])).toBe('0.00');
  });

  it('rejects things that are not money amounts', () => {
    expect(() => toCents('1e3')).toThrow('Not a money amount: 1e3');
    expect(() => toCents('-1')).toThrow('Not a money amount: -1');
  });
});

describe('order form', () => {
  it('parses whole quantities in range only', () => {
    expect(parseQuantity(' 3 ')).toBe(3);
    for (const value of ['0', '-1', '1.5', 'abc', '', '1000001']) {
      expect(parseQuantity(value)).toBeNull();
    }
  });

  it('requires a customer and warehouse and valid quantities, and previews the subtotal', () => {
    const state = orderFormState(null);
    const errors = validateOrderForm(
      {
        ...state,
        lines: [
          {
            productId: 'a',
            name: 'A',
            sku: 'A',
            unitPrice: '0.10',
            quantity: '3',
            currency: 'TRY',
            saved: false,
            archived: false,
          },
          {
            productId: 'b',
            name: 'B',
            sku: 'B',
            unitPrice: '1.00',
            quantity: '0',
            currency: 'TRY',
            saved: false,
            archived: false,
          },
        ],
      },
      sales.en.builder,
    );
    expect(errors.fields).toMatchObject({
      customerId: 'Choose a customer.',
      warehouseId: 'Choose a warehouse.',
    });
    expect(Object.keys(errors.lines)).toEqual(['b']);
    expect(
      subtotalPreview([
        {
          productId: 'a',
          name: 'A',
          sku: 'A',
          unitPrice: '0.10',
          quantity: '3',
          currency: 'TRY',
          saved: false,
          archived: false,
        },
      ]),
    ).toBe('0.30');
  });

  it('sends only what changed, and the full line list only when lines changed', () => {
    const order = testOrder({ items: [testOrderItem({ quantity: 2 })] });
    const state = orderFormState(order);

    expect(toUpdateOrderRequest(order, state)).toEqual({});
    expect(toUpdateOrderRequest(order, { ...state, notes: '  Call first ' })).toEqual({
      notes: 'Call first',
    });
    expect(
      toUpdateOrderRequest(order, {
        ...state,
        lines: [{ ...state.lines[0]!, quantity: '5' }],
      }),
    ).toEqual({ items: [{ productId: order.items[0]!.productId, quantity: 5 }] });
  });

  it('maps server errors onto fields and lines', () => {
    const state = orderFormState(testOrder());
    const inactive = new ApiError('Customer archived', {
      status: 409,
      url: '',
      code: 'ORDER_CUSTOMER_INACTIVE',
    });
    const validation = new ApiError('Invalid', {
      status: 400,
      url: '',
      code: 'VALIDATION_ERROR',
      details: [{ field: 'items.0.quantity', messages: ['Quantity must be at most 1000000.'] }],
    });

    const errorMessage = (error: unknown) => describeApiError(error, common.en.errors);
    const map = (error: unknown) =>
      mapOrderError(
        error,
        state.lines,
        errorMessage,
        common.en.errors.fieldError,
        'Invalid value.',
      );
    expect(map(inactive).errors.fields.customerId).toBe('Customer archived');
    expect(map(validation).errors.lines).toEqual({
      [state.lines[0]!.productId]: 'Quantity must be at most 1000000.',
    });
  });
});

describe('customer form', () => {
  it('validates and normalizes like the server', () => {
    expect(
      validateCustomer(
        {
          name: ' ',
          companyName: '',
          email: 'nope',
          phone: 'x',
          address: '',
          notes: '',
        },
        sales.en.customerForm,
        common.en.authValidation,
      ),
    ).toMatchObject({
      name: 'Enter the customer’s name.',
      email: expect.any(String),
      phone: 'Use digits, spaces, and + - ( ) . / only.',
    });
    expect(
      toCustomerRequest({
        name: '  Jamie   Rivera ',
        companyName: ' ',
        email: ' A@B.EXAMPLE ',
        phone: '',
        address: '',
        notes: '',
      }),
    ).toEqual({
      name: 'Jamie Rivera',
      companyName: null,
      email: 'a@b.example',
      phone: null,
      address: null,
      notes: null,
    });
  });
});

describe('order list URL state', () => {
  it('reads valid values, ignores invalid ones, and writes only non-defaults', () => {
    const params = readOrderParams(
      new URLSearchParams(
        'status=SHIPPED&customerId=bad&warehouseId=0198c0de-0000-7000-8000-0000000000a1&sort=total:desc&from=2026-09-01&page=2',
      ),
    );
    expect(params).toMatchObject({
      status: 'SHIPPED',
      customerId: '',
      sort: 'total:desc',
      from: '2026-09-01',
      page: 2,
    });
    expect(toOrderQuery(params)).toMatchObject({ sortBy: 'total', sortOrder: 'desc', page: 2 });
    expect(writeOrderParams({ ...params, status: '', page: 1 }).toString()).toBe(
      'warehouseId=0198c0de-0000-7000-8000-0000000000a1&from=2026-09-01&sort=total%3Adesc',
    );
  });
});
