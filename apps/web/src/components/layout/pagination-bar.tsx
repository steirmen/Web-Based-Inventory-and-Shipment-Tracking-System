import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';

/** Previous / "Page X of Y" / Next for server-side pagination. */
export function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  disabled = false,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const m = useMessages(common).pagination;
  const f = useFormat();
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label={m.label}
      className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row"
    >
      <p className="tabular-nums">
        {m.showing({ first: f.number(first), last: f.number(last), total: f.number(totalItems) })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft aria-hidden="true" />
          {m.previous}
        </Button>
        <span className="px-1 tabular-nums" aria-live="polite">
          {m.page({ page: f.number(page), total: f.number(Math.max(totalPages, 1)) })}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          {m.next}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
