import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row"
    >
      <p>
        Showing <span className="font-medium text-foreground tabular-nums">{first}</span>–
        <span className="font-medium text-foreground tabular-nums">{last}</span> of{' '}
        <span className="font-medium text-foreground tabular-nums">{totalItems}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="px-1 tabular-nums" aria-live="polite">
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= totalPages}
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
