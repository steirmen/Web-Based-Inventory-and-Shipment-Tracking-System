import type { Currency } from '@app/shared';
import { formatterFor } from '@/i18n/format';

/** Expected UI text in English (the default language), as `useFormat()` renders it. */
const en = formatterFor('en-US');

export const money = (amount: string, currency: Currency | null = 'TRY') =>
  en.money(amount, currency);
export const count = (value: number) => en.number(value);
