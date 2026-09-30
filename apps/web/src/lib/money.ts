const moneyFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an API decimal string ("1234.5" → "1,234.50" in en-US) for display.
 * The string is passed to Intl directly (exact decimal formatting), never
 * parsed into a binary floating-point number.
 */
export function formatMoney(value: string | null): string {
  if (value === null) return '—';
  return moneyFormatter.format(value as Intl.StringNumericLiteral);
}
