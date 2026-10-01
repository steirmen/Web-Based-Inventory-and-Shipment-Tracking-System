import { APPEARANCE_MODES } from '@app/shared';
import { Moon, Palette, Sun } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { ThemePicker } from '@/components/appearance/theme-picker';
import { buttonVariants } from '@/components/ui/button-variants';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAppearance } from '@/lib/appearance/appearance-context';
import { GUEST_THEME_IDS } from '@/lib/appearance/guest';
import { MODE_LABELS } from '@/lib/appearance/labels';
import { cn } from '@/lib/cn';

const MODE_ICONS = { light: <Sun aria-hidden="true" />, dark: <Moon aria-hidden="true" /> };

/**
 * The "Appearance" button of the sign-in pages: a small popover with the mode
 * and the theme presets, applied immediately for this device (guests only; it
 * renders nothing for a signed-in user). The full settings stay on the
 * Appearance page. Escape closes it and returns focus to the button; a click
 * outside or moving focus elsewhere closes it too.
 */
export function GuestAppearanceControl() {
  const appearance = useAppearance();
  const panelId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    panel.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    // Non-modal: the page stays usable, and moving focus out of the popover closes it.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && !rootRef.current?.contains(next)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    panel.addEventListener('keydown', onEscape);
    panel.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      panel.removeEventListener('keydown', onEscape);
      panel.removeEventListener('focusout', onFocusOut);
    };
  }, [open]);

  if (appearance.status !== 'guest') return null;
  const { current, changeGuestAppearance } = appearance;

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 px-2.5')}
      >
        <Palette aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Appearance</span>
      </button>
      {open && (
        <dialog
          open
          ref={panelRef}
          id={panelId}
          aria-labelledby={titleId}
          className="absolute top-full right-0 left-auto z-50 m-0 mt-2 flex h-auto w-80 max-w-[calc(100vw-2rem)] animate-popover-in flex-col gap-4 rounded-card border border-border bg-surface p-4 text-foreground shadow-raised"
        >
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-sm font-semibold">
              Appearance
            </h2>
            <p className="text-xs text-muted-foreground">
              Used on this device until you sign in. After signing in, your saved appearance
              applies.
            </p>
          </div>
          <SegmentedControl
            label="Mode"
            value={current.mode}
            options={APPEARANCE_MODES.map((mode) => ({
              value: mode,
              label: MODE_LABELS[mode],
              icon: MODE_ICONS[mode],
            }))}
            onChange={(mode) => changeGuestAppearance({ mode })}
          />
          <ThemePicker
            compact
            config={current}
            themes={GUEST_THEME_IDS}
            onChange={(theme) => changeGuestAppearance({ theme })}
          />
        </dialog>
      )}
    </div>
  );
}
