import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/cn';

/** Loading placeholder for a page or section. */
export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner size="lg" label={null} />
      <p aria-live="polite">{label}</p>
    </div>
  );
}

/** Failed request with a safe message and an optional retry. */
export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
  className,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      <Alert tone="danger" title={title} className="w-full">
        {apiErrorMessage(error)}
      </Alert>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Nothing to show yet, with an optional call to action. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-control border border-dashed border-border-strong px-6 py-10 text-center">
      {icon && (
        <div className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
