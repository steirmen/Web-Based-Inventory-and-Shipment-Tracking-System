import { cva, type VariantProps } from 'class-variance-authority';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
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
}

/** Inline message for page- or section-level feedback. `danger` alerts are announced immediately. */
export function Alert({ tone = 'info', title, className, children, role, ...props }: AlertProps) {
  const Icon = icons[tone ?? 'info'];

  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="leading-5 font-medium">{title}</p>}
        {children && <div className="leading-5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}
