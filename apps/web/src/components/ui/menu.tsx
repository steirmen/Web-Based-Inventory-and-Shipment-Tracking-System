import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';

/** Classes for a `role="menuitem"` link or button inside a `Menu`. */
export const menuItemClass =
  'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm text-foreground outline-none transition-colors duration-150 hover:bg-surface-muted focus-visible:bg-surface-muted [&_svg]:size-4 [&_svg]:shrink-0';

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  type: 'button';
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string | undefined;
  onClick: () => void;
}

/**
 * Dropdown menu (workspace switcher, user menu): a trigger button and a
 * `role="menu"` popover. Opening focuses the first item; ↑/↓ move between
 * items, Escape closes and returns focus to the trigger, Tab or a click
 * outside closes it. Items are links or buttons with `role="menuitem"` and
 * `menuItemClass`; call `close()` from their onClick.
 */
export function Menu({
  label,
  trigger,
  align = 'start',
  className,
  children,
}: {
  /** Accessible name of the menu itself. */
  label: string;
  trigger: (props: MenuTriggerProps) => ReactNode;
  align?: 'start' | 'end';
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = (focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      {trigger({
        ref: triggerRef,
        type: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => setOpen((value) => !value),
      })}
      {open && (
        <div
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            'absolute top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] animate-popover-in rounded-card border border-border bg-surface p-1.5 shadow-raised',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A thin divider between groups of menu items. */
export function MenuSeparator() {
  return <hr className="my-1.5 border-border" />;
}
