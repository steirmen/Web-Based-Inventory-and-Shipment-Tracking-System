import { CURRENCIES, type Currency, DEFAULT_CURRENCY } from '@app/shared';

/**
 * Money is never added across currencies (docs/currency.md), so the dashboard
 * and the sales report show their money figures in ONE currency at a time.
 * The same rule picks it in both places, so their totals always agree.
 */

/** Orders per currency, e.g. realized orders of the period. */
export type CurrencyCounts = ReadonlyMap<Currency, number>;

/**
 * The requested currency, else the one with the most orders in the first
 * non-empty count (ties: CURRENCIES order), else DEFAULT_CURRENCY.
 */
export function chooseCurrency(
  requested: Currency | undefined,
  ...counts: CurrencyCounts[]
): Currency {
  if (requested) return requested;
  for (const count of counts) {
    let best: Currency | null = null;
    for (const currency of CURRENCIES) {
      const orders = count.get(currency) ?? 0;
      if (orders > 0 && (best === null || orders > count.get(best)!)) best = currency;
    }
    if (best) return best;
  }
  return DEFAULT_CURRENCY;
}

/** The currencies present in any of the counts plus `selected`, in CURRENCIES order. */
export function availableCurrencies(selected: Currency, ...counts: CurrencyCounts[]): Currency[] {
  return CURRENCIES.filter(
    (currency) => currency === selected || counts.some((count) => (count.get(currency) ?? 0) > 0),
  );
}
