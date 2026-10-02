import type { Currency, DashboardCountMetric, DashboardMoneyMetric } from '@app/shared';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { insights } from '@/i18n/messages/insights';

/** One headline number with a label, a small icon, and an optional supporting line. */
export function KpiCard({
  label,
  value,
  icon,
  emphasis = false,
  children,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  /** Draws attention to the icon (e.g. stock that needs action); never the only cue. */
  emphasis?: boolean;
  /** Supporting line: comparison or context. */
  children?: ReactNode;
}) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
            emphasis
              ? 'bg-warning-soft text-warning-soft-foreground'
              : 'bg-primary-soft text-primary-soft-foreground',
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="text-2xl leading-8 font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {children && <div className="text-xs text-muted-foreground">{children}</div>}
    </Card>
  );
}

/**
 * Change against the previous period, stated neutrally: an arrow AND the
 * signed number, in the same muted color whatever the direction (more is not
 * automatically "good"). `null` percentages mean there is nothing to compare.
 */
export function ChangeIndicator({
  metric,
  kind,
  comparison,
  currency = null,
}: {
  metric: DashboardCountMetric | DashboardMoneyMetric;
  kind: 'count' | 'money';
  /** Human-readable comparison period, e.g. "Aug 3 – Sep 1, 2026". */
  comparison: string;
  /** Currency of a money metric. */
  currency?: Currency | null;
}) {
  const m = useMessages(insights).change;
  const f = useFormat();
  const { percentageChange } = metric;
  const previous =
    kind === 'money'
      ? f.money(String(metric.previous), currency)
      : f.number(Number(metric.previous));
  if (percentageChange === null) {
    return (
      <p className="flex items-center gap-1" title={m.previousPeriod({ period: comparison })}>
        <Minus className="size-3.5" aria-hidden="true" />
        <span>{m.noActivity}</span>
      </p>
    );
  }
  const direction = percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'flat';
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const sign = percentageChange > 0 ? '+' : '';
  const percent = new Intl.NumberFormat(f.locale, { maximumFractionDigits: 1 }).format(
    Math.abs(percentageChange),
  );
  const spoken =
    direction === 'flat'
      ? m.unchanged
      : direction === 'up'
        ? m.up({ percent })
        : m.down({ percent });
  return (
    <p
      className="flex flex-wrap items-center gap-x-1"
      title={m.previousPeriod({ period: comparison })}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium text-foreground" aria-hidden="true">
        {sign}
        {f.percent(percentageChange)}
      </span>
      <span aria-hidden="true">{m.versus({ previous })}</span>
      <span className="sr-only">
        {spoken} ({previous}, {comparison}).
      </span>
    </p>
  );
}
