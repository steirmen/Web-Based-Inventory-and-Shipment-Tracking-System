import { ApiError } from '@/api/http-client';
import { describe, expect, it } from 'vitest';
import { describeApiError } from '@/lib/api-errors';
import { formatterFor } from './format';
import { appearance } from './messages/appearance';
import { catalog } from './messages/catalog';
import { common } from './messages/common';
import { insights } from './messages/insights';
import { sales } from './messages/sales';
import { stock } from './messages/stock';
import { workspace } from './messages/workspace';

const en = formatterFor('en-US');
const tr = formatterFor('tr-TR');

describe('formatting (Intl, by interface language)', () => {
  it('formats money with the currency symbol, exactly, in the locale’s style', () => {
    expect(en.money('1250.50', 'TRY')).toBe('₺1,250.50');
    expect(tr.money('1250.50', 'TRY')).toBe('₺1.250,50');
    expect(en.money('120.00', 'EUR')).toBe('€120.00');
    expect(tr.money('120.00', 'EUR')).toBe('€120,00');
    expect(en.money('70.5', 'USD')).toBe('$70.50');
    expect(en.money('-1250.50', 'TRY')).toBe('-₺1,250.50');
    // Exact decimal strings, beyond floating-point precision.
    expect(en.money('9999999999.99', 'USD')).toBe('$9,999,999,999.99');
    expect(tr.money('0.10', 'TRY')).toBe('₺0,10');
  });

  it('formats an amount without a currency (an order with no lines yet) and null', () => {
    expect(en.money('0.00', null)).toBe('0.00');
    expect(tr.money('1234.5', null)).toBe('1.234,50');
    expect(en.money(null, 'TRY')).toBe('—');
  });

  it('formats numbers, signed deltas, percentages, and dates per locale', () => {
    expect(en.number(1_000_000)).toBe('1,000,000');
    expect(tr.number(1_000_000)).toBe('1.000.000');
    expect(en.signed(5)).toBe('+5');
    expect(tr.signed(-1200)).toBe('−1.200');
    expect(en.percent(12.5)).toBe('12.5%');
    expect(tr.percent(12.5)).toBe('%12,5');
    const midday = '2025-09-03T12:00:00.000Z';
    expect(en.date(midday)).toBe('Sep 3, 2025');
    expect(tr.date(midday)).toBe('3 Eyl 2025');
  });
});

/** Every key path of a message tree, with the kind of each leaf. */
function shape(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? shape(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}:${typeof value}`],
  );
}

describe('dictionaries', () => {
  const bundles = { common, catalog, stock, sales, insights, workspace, appearance };

  it.each(Object.entries(bundles))(
    '%s has the same keys in English and Turkish, and no empty text',
    (_name, bundle) => {
      expect(shape(bundle.tr)).toEqual(shape(bundle.en));
      for (const language of [bundle.en, bundle.tr]) {
        const empty = shape(language)
          .filter((entry) => entry.endsWith(':string'))
          .map((entry) => entry.replace(/:string$/, ''))
          .filter((path) => {
            const text = path
              .split('.')
              .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], language);
            return String(text).trim() === '';
          });
        expect(empty).toEqual([]);
      }
    },
  );

  it('translates every API error code', () => {
    expect(Object.keys(common.tr.errors.codes)).toEqual(Object.keys(common.en.errors.codes));
  });
});

describe('API errors in the interface language', () => {
  const error = (status: number, code: string, message: string) =>
    new ApiError(message, { status, url: '/x', code: code as never });

  it('shows the API’s message in English and the code’s translation in Turkish', () => {
    const taken = error(409, 'PRODUCT_SKU_TAKEN', 'Another product already uses SKU OFF-PEN.');
    expect(describeApiError(taken, common.en.errors)).toBe(
      'Another product already uses SKU OFF-PEN.',
    );
    expect(describeApiError(taken, common.tr.errors)).toBe('Bu SKU başka bir üründe kullanılıyor.');
  });

  it('never shows server details for 5xx, and explains network failures', () => {
    const crash = error(500, 'INTERNAL_ERROR', 'TypeError: secret stack');
    expect(describeApiError(crash, common.tr.errors)).not.toContain('secret');
    expect(describeApiError(crash, common.en.errors)).not.toContain('secret');
    expect(describeApiError(new Error('x'), common.tr.errors)).toBe(common.tr.errors.generic);
  });
});
