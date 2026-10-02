import { Plus, Search, TrendingUp } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { appearance } from '@/i18n/messages/appearance';

const SAMPLE_ROWS = [
  { number: 'SO-1042', customer: 'Riverside Dental', status: 'completed', tone: 'success' },
  { number: 'SO-1041', customer: 'Northwind Café', status: 'processing', tone: 'warning' },
  { number: 'SO-1040', customer: 'Bright Office', status: 'draft', tone: 'neutral' },
] as const;

/**
 * A miniature of real interface parts (buttons, field, badges, table,
 * alert, figure) built from the same components as the pages, so it shows
 * the current mode, theme, density, corners, and text size exactly. It is
 * an illustration: inert (not focusable) and hidden from assistive
 * technology, because the whole app already previews the draft.
 */
export function AppearancePreview() {
  const m = useMessages(appearance).preview;
  const f = useFormat();
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          inert
          aria-hidden="true"
          className="flex flex-col gap-4 rounded-card border border-border bg-background p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold">{m.orders}</p>
            <Button size="sm">
              <Plus aria-hidden="true" />
              {m.newOrder}
            </Button>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
              aria-hidden="true"
            />
            <div className="flex h-9 items-center rounded-control border border-border-strong bg-surface pl-9 text-sm text-subtle-foreground shadow-card">
              {m.search}
            </div>
          </div>
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
            {SAMPLE_ROWS.map((row) => (
              <div
                key={row.number}
                className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-sm last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{row.number}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.customer}
                  </span>
                </span>
                <Badge tone={row.tone} dot>
                  {m[row.status]}
                </Badge>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-card">
            <span>
              <span className="block text-xs text-muted-foreground">{m.totalSales}</span>
              <span className="block text-lg font-semibold tabular-nums">
                {f.money('12480.00', 'TRY')}
              </span>
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
              <TrendingUp className="size-4" aria-hidden="true" />
            </span>
          </div>
          <Alert tone="success" role="presentation">
            {m.processed}
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary">
              {m.secondary}
            </Button>
            <Button size="sm" variant="ghost">
              {m.ghost}
            </Button>
            <Button size="sm" variant="danger">
              {m.danger}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
