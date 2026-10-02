import type { Currency } from '@app/shared';

/**
 * Money display helpers. Amounts are formatted only by `useFormat().money`
 * (i18n/format.ts: locale + currency via Intl, exact decimal strings); this
 * file has what the formatter does not cover.
 */

const symbols = new Map<string, string>();

/** The currency's narrow symbol in a locale: TRY → "₺", EUR → "€", USD → "$". */
export function currencySymbol(currency: Currency, locale: string): string {
  const key = `${locale}:${currency}`;
  let symbol = symbols.get(key);
  if (!symbol) {
    symbol =
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
      })
        .formatToParts(0)
        .find((part) => part.type === 'currency')?.value ?? currency;
    symbols.set(key, symbol);
  }
  return symbol;
}
