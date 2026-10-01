import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const alertVariants = cva('flex gap-3 rounded-control border p-4 text-sm', {
  variants: {
    tone: {
      info: 'border-primary/15 bg-primary-soft text-primary-soft-foreground',
      success: 'border-success-border bg-success-soft text-success-soft-foreground',
      warning: 'border-warning-border bg-warning-soft text-warning-soft-foreground',
      danger: 'border-danger-border bg-danger-soft text-danger-soft-foreground',
    },
  },
  defaultVariants: {
    tone: 'info',
  },
});

type AlertTone = NonNullable<VariantProps<typeof alertVariants>['tone']>;

const icons: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export interface AlertProps
  extends Omit<ComponentProps<'div'>, 'title'>, VariantProps<typeof alertVariants> {
  title?: ReactNode;
  /** Adds a close button (for feedback the user may want to clear, e.g. "Product saved."). */
  onDismiss?: () => void;
}

/**
 * Inline message for page- or section-level feedback: success after an
 * action, warnings, and errors (`danger` alerts are announced immediately,
 * the others politely). The app's one feedback pattern: shown next to what
 * it is about, never a browser alert().
 */
export function Alert({
  tone = 'info',
  title,
  className,
  children,
  role,
  onDismiss,
  ...props
}: AlertProps) {
  const Icon = icons[tone ?? 'info'];

  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && <p className="leading-5 font-medium">{title}</p>}
        {children && <div className="leading-5 opacity-90">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-1 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-control opacity-70 focus-ring transition-opacity duration-150 hover:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
