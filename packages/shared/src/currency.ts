/**
 * Currencies (Phase 10.1). Stored and exchanged as ISO 4217 codes — never as
 * symbols; display (₺ / € / $, separators, decimals) is a formatting concern
 * of the client (`Intl.NumberFormat`). There is no exchange-rate conversion:
 * amounts in different currencies are never added together. See docs/currency.md.
 */

/** Mirrors the `currency` database enum (a new code needs a migration). */
export const CURRENCIES = ['TRY', 'EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * The currency of records created before currencies existed (migration
 * `add_currency_and_language`) and of products created without one.
 */
export const DEFAULT_CURRENCY: Currency = 'TRY';

export function isCurrency(value: unknown): value is Currency {
  return CURRENCIES.includes(value as Currency);
}

/** An amount in one currency: a decimal string ("1250.50") and its ISO code. */
export interface MoneyAmount {
  currency: Currency;
  amount: string;
}
