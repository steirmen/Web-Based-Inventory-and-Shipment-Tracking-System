import { describe, expect, it } from 'vitest';
import { centsToDecimal, labelIndexes, niceScale, percentOf, toCents } from './chart-math';

describe('money in charts', () => {
  it('parses decimal strings into exact cents and back', () => {
    expect(toCents('0.10')).toBe(10n);
    expect(toCents('0.1')).toBe(10n);
    expect(toCents('1234.5')).toBe(123450n);
    expect(toCents('999999999999.99')).toBe(99999999999999n);
    expect(toCents('-12.00')).toBe(-1200n);
    expect(centsToDecimal(30n)).toBe('0.30');
    expect(centsToDecimal(-1205n)).toBe('-12.05');
    expect(centsToDecimal(toCents('70.29'))).toBe('70.29');
  });

  it('refuses anything that is not a plain decimal amount', () => {
    for (const value of ['', '1e3', '1.234', 'abc', '1,5', 'NaN']) {
      expect(() => toCents(value)).toThrow('Not a decimal amount');
    }
  });
});

describe('niceScale', () => {
  it.each([
    [0, 4, [0, 1]],
    [3, 4, [0, 1, 2, 3]],
    [7, 4, [0, 2, 4, 6, 8]],
    [29200, 4, [0, 10000, 20000, 30000]],
    [70019, 4, [0, 20000, 40000, 60000, 80000]],
  ])('covers %i with whole, evenly spaced ticks', (max, count, ticks) => {
    const scale = niceScale(max, count);
    expect(scale.max).toBeGreaterThanOrEqual(Math.max(1, max));
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks.at(-1)).toBe(scale.max);
    expect(scale.ticks.every(Number.isInteger)).toBe(true);
    expect(scale.ticks).toEqual(ticks);
  });
});

describe('labelIndexes and percentOf', () => {
  it('thins labels to what fits, always starting with the first', () => {
    expect(labelIndexes(30, 8)).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
    expect(labelIndexes(7, 10)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(labelIndexes(0, 5)).toEqual([]);
    expect(labelIndexes(5, 0)).toEqual([0]);
  });

  it('computes whole percentages and never divides by zero', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
  });
});
