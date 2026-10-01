import { DASHBOARD_RANGES, type DashboardRange } from '@app/shared';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  customRangeError,
  DASHBOARD_RANGE_LABELS,
  type DashboardParams,
} from '@/lib/dashboard-params';

/**
 * Date range of the dashboard: a preset, or a custom first/last day applied
 * with a button (so half-typed dates never trigger requests). `period` is the
 * currently shown range, used to prefill the custom dates.
 */
export function RangePicker({
  value,
  period,
  onChange,
}: {
  value: DashboardParams;
  period: { from: string; to: string } | undefined;
  onChange: (next: DashboardParams) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState<DashboardRange>(value.range);
  const [from, setFrom] = useState(value.from || period?.from || '');
  const [to, setTo] = useState(value.to || period?.to || '');
  const [error, setError] = useState<string | undefined>();
  const showCustom = selected === 'CUSTOM';

  const choose = (range: DashboardRange) => {
    setSelected(range);
    setError(undefined);
    if (range === 'CUSTOM') {
      // Start from what is on screen.
      if (!from && period) setFrom(period.from);
      if (!to && period) setTo(period.to);
      return;
    }
    onChange({ range, from: '', to: '' });
  };

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = customRangeError(from, to);
    setError(problem);
    if (!problem) onChange({ range: 'CUSTOM', from, to });
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <label htmlFor={`${id}-range`} className="sr-only">
        Date range
      </label>
      <Select
        id={`${id}-range`}
        value={selected}
        onChange={(event) => choose(event.target.value as DashboardRange)}
        wrapperClassName="w-full sm:w-48"
      >
        {DASHBOARD_RANGES.map((range) => (
          <option key={range} value={range}>
            {DASHBOARD_RANGE_LABELS[range]}
          </option>
        ))}
      </Select>
      {showCustom && (
        <form
          noValidate
          onSubmit={apply}
          aria-label="Custom date range"
          className="flex w-full flex-col gap-2 sm:w-auto"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
              <label htmlFor={`${id}-from`} className="text-xs font-medium text-muted-foreground">
                From
              </label>
              <Input
                id={`${id}-from`}
                type="date"
                value={from}
                max={to || undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => setFrom(event.target.value)}
                className="sm:w-40"
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
              <label htmlFor={`${id}-to`} className="text-xs font-medium text-muted-foreground">
                To
              </label>
              <Input
                id={`${id}-to`}
                type="date"
                value={to}
                min={from || undefined}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => setTo(event.target.value)}
                className="sm:w-40"
              />
            </div>
            <Button type="submit" variant="secondary" className="w-full sm:w-auto">
              Apply
            </Button>
          </div>
          {error && (
            <p id={`${id}-error`} className="text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
