import type { KeyboardEvent } from 'react';

/**
 * Keyboard behavior of a radio group built from buttons (WAI-ARIA radio
 * group pattern): only the checked option is in the tab order, and the arrow
 * keys (plus Home/End) move AND select. Returns props for each option.
 */
export function radioOptionProps<T extends string>(
  values: readonly T[],
  selected: T,
  onSelect: (value: T) => void,
  value: T,
) {
  const move = (event: KeyboardEvent<HTMLElement>) => {
    const index = values.indexOf(selected);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % values.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + values.length) % values.length;
    }
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = values.length - 1;
    if (next === null) return;
    event.preventDefault();
    onSelect(values[next]!);
    const group = event.currentTarget.closest('[role="radiogroup"]');
    group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  const checked = value === selected;
  return {
    type: 'button' as const,
    role: 'radio' as const,
    'aria-checked': checked,
    tabIndex: checked ? 0 : -1,
    onClick: () => onSelect(value),
    onKeyDown: move,
  };
}
