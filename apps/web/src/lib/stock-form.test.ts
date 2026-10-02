import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/http-client';
import { common } from '@/i18n/messages/common';
import { stock } from '@/i18n/messages/stock';
import { describeApiError } from './api-errors';
import {
  movementsPath,
  readInventoryParams,
  readMovementParams,
  toInventoryQuery,
  writeInventoryParams,
  writeMovementParams,
} from './inventory-params';
import {
  mapStockError,
  parseUnits,
  type StockFormValues,
  toStockOperation,
  validateStockForm,
} from './stock-form';

const W1 = '0198c0de-0000-7000-8000-0000000000a1';
const W2 = '0198c0de-0000-7000-8000-0000000000a2';
const P = '0198c0de-0000-7000-8000-0000000000d1';

const values = (overrides: Partial<StockFormValues> = {}): StockFormValues => ({
  warehouseId: W1,
  destinationWarehouseId: '',
  productId: P,
  quantity: '5',
  reason: '',
  ...overrides,
});

const m = stock.en.validation;
const errorMessage = (error: unknown) => describeApiError(error, common.en.errors);
const stockError = (error: unknown) => mapStockError(error, errorMessage, common.en.errors);

const errorsOf = (errors: object) => Object.entries(errors).filter(([, value]) => value);

describe('parseUnits', () => {
  it.each([
    ['5', 5],
    [' 12 ', 12],
    ['0', 0],
    ['1.5', null],
    ['-2', null],
    ['1e3', null],
    ['', null],
    ['abc', null],
  ])('%j → %j', (input, expected) => {
    expect(parseUnits(input)).toBe(expected);
  });
});

describe('validateStockForm', () => {
  it('accepts a valid receipt without a reason', () => {
    expect(errorsOf(validateStockForm('receive', values(), undefined, m))).toEqual([]);
  });

  it('requires positive whole units, but allows 0 as a counted quantity', () => {
    expect(validateStockForm('issue', values({ quantity: '0' }), 10, m).quantity).toBeDefined();
    expect(
      validateStockForm('receive', values({ quantity: '-100000' }), 0, m).quantity,
    ).toBeDefined();
    expect(
      validateStockForm('adjust', values({ quantity: '0', reason: 'Count' }), 3, m).quantity,
    ).toBeUndefined();
    expect(
      validateStockForm('adjust', values({ quantity: '2.5', reason: 'Count' }), 3, m).quantity,
    ).toBeDefined();
  });

  it('checks the known stock for removals and transfers, not for receipts', () => {
    expect(validateStockForm('issue', values({ quantity: '11' }), 10, m).quantity).toBe(
      'Only 10 units are available.',
    );
    expect(validateStockForm('damage', values({ quantity: '2', reason: 'x' }), 1, m).quantity).toBe(
      'Only 1 unit is available.',
    );
    expect(
      validateStockForm('receive', values({ quantity: '11' }), 10, m).quantity,
    ).toBeUndefined();
    // Unknown stock: the server decides.
    expect(
      validateStockForm('issue', values({ quantity: '11' }), undefined, m).quantity,
    ).toBeUndefined();
  });

  it('requires reasons for damage and adjustments', () => {
    expect(validateStockForm('damage', values(), 10, m).reason).toBeDefined();
    expect(validateStockForm('adjust', values({ reason: '  ' }), 10, m).reason).toBeDefined();
  });

  it('requires two different warehouses for a transfer', () => {
    expect(validateStockForm('transfer', values(), 10, m).destinationWarehouseId).toBeDefined();
    expect(
      validateStockForm('transfer', values({ destinationWarehouseId: W1 }), 10, m)
        .destinationWarehouseId,
    ).toBe('Choose a different warehouse than the source.');
    expect(
      errorsOf(validateStockForm('transfer', values({ destinationWarehouseId: W2 }), 10, m)),
    ).toEqual([]);
  });
});

describe('toStockOperation', () => {
  it('builds each request with integer units and a trimmed or null reason', () => {
    expect(toStockOperation('issue', values({ reason: '  ' }))).toEqual({
      kind: 'issue',
      body: { warehouseId: W1, productId: P, quantity: 5, reason: null },
    });
    expect(toStockOperation('adjust', values({ quantity: '0', reason: ' Count ' }))).toEqual({
      kind: 'adjust',
      body: { warehouseId: W1, productId: P, newQuantity: 0, reason: 'Count' },
    });
    expect(toStockOperation('transfer', values({ destinationWarehouseId: W2 }))).toEqual({
      kind: 'transfer',
      body: {
        sourceWarehouseId: W1,
        destinationWarehouseId: W2,
        productId: P,
        quantity: 5,
        reason: null,
      },
    });
  });
});

describe('mapStockError', () => {
  const apiError = (
    code: string,
    message: string,
    details: { field: string; messages: string[] }[] = [],
  ) => new ApiError(message, { status: 409, url: '/x', code: code as never, details });

  it('puts stock, product, and warehouse problems on their fields', () => {
    expect(stockError(apiError('INVENTORY_INSUFFICIENT_STOCK', 'Not enough')).fields).toEqual({
      quantity: 'Not enough',
    });
    expect(stockError(apiError('INVENTORY_PRODUCT_INACTIVE', 'Archived')).fields).toEqual({
      productId: 'Archived',
    });
    expect(stockError(apiError('INVENTORY_SAME_WAREHOUSE', 'Same')).fields).toEqual({
      destinationWarehouseId: 'Same',
    });
    expect(
      stockError(
        apiError('VALIDATION_ERROR', 'Invalid', [
          { field: 'newQuantity', messages: ['Too small'] },
        ]),
      ).fields,
    ).toEqual({ quantity: 'Too small' });
  });

  it('shows other errors (e.g. an archived warehouse) above the form', () => {
    const error = apiError('INVENTORY_WAREHOUSE_INACTIVE', 'Warehouse MAIN is archived.');
    expect(stockError(error)).toEqual({ fields: {}, form: error });
  });
});

describe('inventory URL state', () => {
  it('reads valid values, ignores invalid ones, and writes only non-defaults', () => {
    const params = readInventoryParams(
      new URLSearchParams(
        `warehouseId=${W1}&status=LOW_STOCK&sort=quantity:desc&page=2&search=key`,
      ),
    );
    expect(params).toEqual({
      search: 'key',
      warehouseId: W1,
      status: 'LOW_STOCK',
      sort: 'quantity:desc',
      page: 2,
    });
    expect(toInventoryQuery(params)).toMatchObject({
      sortBy: 'quantity',
      sortOrder: 'desc',
      pageSize: 20,
    });
    expect(
      readInventoryParams(new URLSearchParams('warehouseId=x&status=SOLD&sort=price:asc&page=-1')),
    ).toEqual({ search: '', warehouseId: '', status: '', sort: 'productName:asc', page: 1 });
    expect(writeInventoryParams(readInventoryParams(new URLSearchParams())).toString()).toBe('');
  });

  it('round-trips movement filters', () => {
    const query = `warehouseId=${W1}&productId=${P}&movementType=DAMAGE&from=2026-09-01&to=2026-09-30&sortOrder=asc&page=2`;
    expect(writeMovementParams(readMovementParams(new URLSearchParams(query))).toString()).toBe(
      query,
    );
    expect(
      readMovementParams(new URLSearchParams('movementType=TRANSFER&from=yesterday')),
    ).toMatchObject({
      movementType: '',
      from: '',
    });
    expect(movementsPath('org', { productId: P })).toBe(`/org/org/stock-movements?productId=${P}`);
  });
});
