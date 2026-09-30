import { describe, expect, it } from 'vitest';
import { testProduct } from '@/test/catalog-fixtures';
import {
  EMPTY_PRODUCT_FORM,
  productToFormValues,
  toCategoryRequest,
  toCreateProductRequest,
  toUpdateProductRequest,
  validateCategory,
  validateProduct,
} from './product-form';

const valid = {
  ...EMPTY_PRODUCT_FORM,
  name: 'Pen',
  sku: 'OFF-PEN',
  price: '1.50',
  cost: '0.40',
  minimumStock: '0',
};

describe('validateProduct', () => {
  it('accepts a valid product', () => {
    expect(Object.values(validateProduct(valid)).filter(Boolean)).toEqual([]);
  });

  it.each(['1', '0', '0.1', '12.34', '1234567890.99'])('accepts the amount %s', (price) => {
    expect(validateProduct({ ...valid, price }).price).toBeUndefined();
  });

  it.each(['', '-1', '1.234', '1e3', '1,50', '12345678901', 'abc', '.5'])(
    'rejects the amount "%s"',
    (price) => {
      expect(validateProduct({ ...valid, price }).price).toBeDefined();
    },
  );

  it.each(['-1', '1.5', 'x', '', '1000000001'])('rejects minimum stock "%s"', (minimumStock) => {
    expect(validateProduct({ ...valid, minimumStock }).minimumStock).toBeDefined();
  });

  it('rejects blank names and invalid SKUs', () => {
    const errors = validateProduct({ ...valid, name: '   ', sku: '-starts-with-dash' });
    expect(errors.name).toBe('Enter a product name.');
    expect(errors.sku).toMatch(/letters, numbers/);
  });

  it('lets a legacy product keep an empty cost when allowed', () => {
    expect(validateProduct({ ...valid, cost: '' }).cost).toBeDefined();
    expect(validateProduct({ ...valid, cost: '' }, { costOptional: true }).cost).toBeUndefined();
    expect(validateProduct({ ...valid, cost: 'x' }, { costOptional: true }).cost).toBeDefined();
  });
});

describe('request building', () => {
  it('keeps money as strings and normalizes text', () => {
    expect(
      toCreateProductRequest({
        ...valid,
        name: '  Blue   pen ',
        sku: ' OFF-PEN ',
        description: '   ',
        price: ' 0.10 ',
        minimumStock: '7',
      }),
    ).toEqual({
      name: 'Blue pen',
      sku: 'OFF-PEN',
      description: null,
      categoryId: null,
      price: '0.10',
      cost: '0.40',
      minimumStock: 7,
    });
  });

  it('sends only changed fields on update', () => {
    const initial = productToFormValues(testProduct());
    expect(toUpdateProductRequest(initial, initial)).toEqual({});
    expect(
      toUpdateProductRequest(initial, { ...initial, categoryId: '', description: '' }),
    ).toEqual({ categoryId: null, description: null });
  });

  it('never clears the cost of a legacy product', () => {
    const initial = productToFormValues(testProduct({ cost: null }));
    expect(initial.cost).toBe('');
    expect(toUpdateProductRequest(initial, initial)).toEqual({});
    expect(toUpdateProductRequest(initial, { ...initial, cost: '2' })).toEqual({ cost: '2' });
  });

  it('builds category requests', () => {
    expect(validateCategory({ name: ' ', description: '' }).name).toBe('Enter a category name.');
    expect(toCategoryRequest({ name: ' Office   supplies ', description: ' ' })).toEqual({
      name: 'Office supplies',
      description: null,
    });
  });
});
