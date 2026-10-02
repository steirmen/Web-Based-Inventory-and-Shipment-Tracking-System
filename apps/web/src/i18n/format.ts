import type { Currency } from '@app/shared';
import { useLanguage } from './i18n-context';

/**
 * Locale-aware formatting for the current interface language (`en-US` or
 * `tr-TR`): numbers, dates, and money. The ONLY place that formats money —
 * never concatenate currency symbols by hand.
 *
 * Money stays a decimal string end to end: the string goes to Intl as a
 * StringNumericLiteral (exact), never through Number()/parseFloat. Dates are
 * formatted from the stored instant in the browser's time zone; changing the
 * language changes only the presentation.
 */
export interface Formatter {
  locale: string;
  /** 1234 → "1,234" / "1.234". */
  number: (value: number) => string;
  /** +5 / −3 (real minus sign), for stock deltas. */
  signed: (value: number) => string;
  /** "Sep 3, 2025" / "3 Eyl 2025". */
  date: (iso: string | Date) => string;
  /** "Sep 3, 2025, 1:00 PM" / "3 Eyl 2025 13:00". */
  dateTime: (iso: string | Date) => string;
  /** "1:00:05 PM" / "13:00:05". */
  time: (iso: string | Date) => string;
  /**
   * "₺1,250.50" (en) / "₺1.250,50" (tr); without a currency (an order with no
   * lines) only the amount. `null` → "—".
   */
  money: (amount: string | null, currency: Currency | null) => string;
  /** Short amounts for chart axes: "₺1.3K" / "₺1,3 B". */
  compactMoney: (amount: string, currency: Currency | null) => string;
  /** 12.5 → "12.5%" / "%12,5". */
  percent: (value: number) => string;
}

const cache = new Map<string, Formatter>();

export function formatterFor(locale: string): Formatter {
  const cached = cache.get(locale);
  if (cached) return cached;

  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'medium' });
  const currencies = new Map<string, Intl.NumberFormat>();
  const currency = (code: Currency, compact: boolean) => {
    const key = `${code}:${compact}`;
    let format = currencies.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
        ...(compact
          ? { notation: 'compact', maximumFractionDigits: 1 }
          : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      });
      currencies.set(key, format);
    }
    return format;
  };
  const exact = (amount: string) => amount as Intl.StringNumericLiteral;

  const formatter: Formatter = {
    locale,
    number: (value) => integer.format(value),
    signed: (value) =>
      value > 0 ? `+${integer.format(value)}` : value < 0 ? `−${integer.format(-value)}` : '0',
    date: (value) => date.format(new Date(value)),
    dateTime: (value) => dateTime.format(new Date(value)),
    time: (value) => time.format(new Date(value)),
    money: (amount, code) => {
      if (amount === null) return '—';
      return code ? currency(code, false).format(exact(amount)) : decimal.format(exact(amount));
    },
    compactMoney: (amount, code) =>
      code
        ? currency(code, true).format(exact(amount))
        : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
            exact(amount),
          ),
    percent: (value) => percent.format(value / 100),
  };
  cache.set(locale, formatter);
  return formatter;
}

/** Formatting in the current interface language. */
export function useFormat(): Formatter {
  return formatterFor(useLanguage().locale);
}
