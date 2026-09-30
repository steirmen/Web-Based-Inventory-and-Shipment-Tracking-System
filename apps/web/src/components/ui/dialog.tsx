import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Set false while an action is in progress so the dialog can't be dismissed mid-request. */
  dismissible?: boolean;
  className?: string;
}

/**
 * Accessible modal dialog: labelled by its title, traps focus while open,
 * closes with Escape or the close button, and returns focus to the element
 * that opened it. Put `data-autofocus` on the element that should get focus
 * first (defaults to the first focusable element).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const initial =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    initial?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  // Escape closes; Tab and Shift+Tab stay inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (dismissible) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = panel.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-foreground/40"
        aria-hidden="true"
        onClick={() => dismissible && onClose()}
      />
      <dialog
        open
        ref={panelRef}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative m-0 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-card border border-border bg-surface p-0 text-foreground shadow-raised outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="flex flex-col gap-1.5">
            <h2 id={titleId} className="text-base leading-6 font-semibold">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="text-sm text-muted-foreground">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close dialog"
            className="-mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-control text-subtle-foreground focus-ring transition-colors duration-150 hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children && <div className="px-6 pt-4">{children}</div>}
        {footer && (
          <div className="flex flex-col-reverse gap-2 px-6 pt-6 pb-6 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
        {!footer && <div className="pb-6" />}
      </dialog>
    </div>,
    document.body,
  );
}
