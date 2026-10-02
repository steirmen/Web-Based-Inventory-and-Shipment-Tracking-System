import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { useApiErrorMessage } from '@/lib/api-errors';
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

/**
 * Placeholder in the shape of a list (a card of rows) while its first page
 * loads. The label is announced; the shapes are decorative.
 */
export function ListSkeleton({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <p className="sr-only" aria-live="polite">
        {label}
      </p>
      <div className="flex items-center gap-6 border-b border-border bg-surface-muted/60 px-4 py-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-6 border-b border-border px-4 py-4 last:border-b-0"
        >
          <Skeleton className="h-4 w-1/3 max-w-56" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a detail page (header and two sections) while it loads. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="sr-only" aria-live="polite">
        {label}
      </p>
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-card lg:col-span-2" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  );
}

/** Failed request with a safe message and an optional retry. */
export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const m = useMessages(common);
  const errorMessage = useApiErrorMessage();
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      <Alert tone="danger" title={title ?? m.states.somethingWentWrong} className="w-full">
        {errorMessage(error)}
      </Alert>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {m.actions.tryAgain}
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
