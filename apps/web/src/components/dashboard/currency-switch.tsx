import type { Currency } from '@app/shared';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useFormat } from '@/i18n/format';
import { currencySymbol } from '@/lib/money';

/**
 * Chooses the currency of the money figures (dashboard, sales report).
 * Amounts in different currencies are never added together, so the figures
 * show one currency at a time; with a single currency there is nothing to
 * choose and nothing is rendered.
 */
export function CurrencySwitch({
  label,
  value,
  currencies,
  onChange,
}: {
  label: string;
  value: Currency;
  currencies: readonly Currency[];
  onChange: (currency: Currency) => void;
}) {
  const f = useFormat();
  if (currencies.length < 2) return null;
  return (
    <SegmentedControl
      label={label}
      value={value}
      options={currencies.map((currency) => ({
        value: currency,
        label: `${currency} ${currencySymbol(currency, f.locale)}`,
      }))}
      onChange={onChange}
    />
  );
}
