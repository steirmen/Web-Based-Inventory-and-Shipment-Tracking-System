# Design system

A restrained B2B SaaS visual language: neutral slate surfaces, a single indigo accent, borders over shadows, compact 14px body text.

All tokens are defined in [`apps/web/src/styles/globals.css`](../apps/web/src/styles/globals.css). Primitives live in `apps/web/src/components/ui` and `apps/web/src/components/layout`.

## Rules

1. **Use semantic tokens, not palette colors.** Write `bg-surface`, `text-muted-foreground`, `border-border`, `bg-primary`, not `bg-white`, `text-slate-600`, `bg-indigo-600`. Palette colors are allowed only inside `globals.css`.
2. **Compose primitives before writing new styles.** Reach for `Button`, `Card`, `Badge`, `Alert`, `PageHeader` first. Add a variant to a primitive before adding a one-off class string.
3. **Merge classes with `cn()`** so callers can override utilities safely.
4. **Never convey state by color alone.** Pair color with text or an icon (for example `Badge` with a label).
5. **Every interactive element gets `focus-ring`**, a keyboard-only 2px indigo outline with 2px offset.

## Tokens

### Color

| Token                                                   | Use                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `background`                                            | App canvas                                                             |
| `surface` / `surface-muted`                             | Cards, inputs / subtle fills, hover, disabled                          |
| `foreground` / `muted-foreground` / `subtle-foreground` | Primary text / secondary text / placeholders, meta                     |
| `border` / `border-strong`                              | Dividers, card outlines / control outlines                             |
| `primary`, `primary-hover`, `primary-foreground`        | Primary actions, links, brand                                          |
| `primary-soft`, `primary-soft-foreground`               | Informational tints                                                    |
| `success-*`, `warning-*`, `danger-*`                    | Status: `-soft` background, `-soft-foreground` text, `-border` outline |
| `ring`                                                  | Focus indicator                                                        |

### Typography

Font: **Inter Variable** (self-hosted via `@fontsource-variable/inter`). Body text is `text-sm` (14px).

| Role                            | Classes                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| Page title (`h1`, one per page) | `text-2xl font-semibold tracking-tight` (in `PageHeader`)    |
| Section / card title (`h2`)     | `text-base font-semibold` (in `CardTitle`)                   |
| Section label                   | `text-sm font-semibold`                                      |
| Body                            | `text-sm`                                                    |
| Secondary / helper              | `text-sm text-muted-foreground`                              |
| Meta, captions, badges          | `text-xs`                                                    |
| Eyebrow                         | `text-xs font-semibold uppercase tracking-wide text-primary` |
| Code, IDs, commands             | `font-mono text-xs` or `text-[13px]`                         |

### Spacing (4px grid, Tailwind scale)

| Context                    | Value                                        |
| -------------------------- | -------------------------------------------- |
| Page vertical padding      | `py-8 sm:py-10` (in `AppShell`)              |
| Between page sections      | `gap-8`                                      |
| Between cards in a grid    | `gap-4`                                      |
| Card padding               | `p-6` (header/content), `px-6 py-4` (footer) |
| Inside a group of controls | `gap-2`                                      |
| List rows                  | `px-4 py-3`                                  |

### Sizing

| Element              | sm       | md (default) | lg       |
| -------------------- | -------- | ------------ | -------- |
| Button height        | `h-8`    | `h-9`        | `h-10`   |
| Input height         |          | `h-9`        |          |
| Icon inside controls | `size-4` | `size-4`     | `size-4` |

### Radius, borders, and shadows

| Token             | Value       | Use                                      |
| ----------------- | ----------- | ---------------------------------------- |
| `rounded-control` | 0.5rem      | Buttons, inputs, alerts, list containers |
| `rounded-card`    | 0.75rem     | Cards, panels                            |
| `rounded-full`    |             | Badges, dots, avatars                    |
| `shadow-card`     | very subtle | Cards, controls                          |
| `shadow-raised`   | soft        | Floating elements (menus, popovers)      |

Borders are 1px `border-border` (containers) or `border-border-strong` (controls).

### Layout

- Page content width: `max-w-page` (72rem) via `Container`, with `px-4 sm:px-6 lg:px-8` gutters.
- Layouts must work at 375px wide with no horizontal scroll. Stack on mobile, then use `sm:` / `md:` for rows and grids.

## Interaction states

| State           | Treatment                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hover           | One step darker background (`hover:bg-primary-hover`, `hover:bg-surface-muted`) or stronger border; 150ms color transition |
| Focus           | `focus-ring` (keyboard only, `:focus-visible`)                                                                             |
| Disabled        | `opacity-50`, `pointer-events-none` (buttons); `bg-surface-muted` + `cursor-not-allowed` (inputs)                          |
| Loading         | `Button isLoading` shows a spinner, disables the button and sets `aria-busy`                                               |
| Error (field)   | `aria-invalid` on `Input` gives a `border-danger` outline                                                                  |
| Error (section) | `<Alert tone="danger">`, announced with `role="alert"`                                                                     |
| Reduced motion  | Animations and transitions are disabled globally                                                                           |

## Primitives

| Component                                              | File                                     | Notes                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonVariants`                             | `ui/button.tsx`, `ui/button-variants.ts` | Variants: `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`. Use `buttonVariants()` to style links. |
| `Input`                                                | `ui/input.tsx`                           | Mark errors with `aria-invalid`                                                                                     |
| `Label`                                                | `ui/label.tsx`                           | Always pair with `htmlFor`                                                                                          |
| `FormField`                                            | `ui/form-field.tsx`                      | Label + control + hint/error; render prop passes `id`, `aria-invalid`, and `aria-describedby` to the control        |
| `PasswordInput`                                        | `ui/password-input.tsx`                  | `Input` with a show/hide toggle (`aria-pressed`)                                                                    |
| `Card` + `CardHeader/Title/Description/Content/Footer` | `ui/card.tsx`                            |                                                                                                                     |
| `Badge`                                                | `ui/badge.tsx`                           | Tones: `neutral`, `primary`, `success`, `warning`, `danger`; optional `dot`                                         |
| `Alert`                                                | `ui/alert.tsx`                           | Tones: `info`, `success`, `warning`, `danger`                                                                       |
| `Spinner`                                              | `ui/spinner.tsx`                         | `label={null}` when the surrounding UI already announces loading                                                    |
| `Container`                                            | `layout/container.tsx`                   | Page width and gutters                                                                                              |
| `PageHeader`                                           | `layout/page-header.tsx`                 | `eyebrow`, `title` (h1), `description`, `actions`                                                                   |

Business-specific components (product cards, order tables, dashboard widgets, and so on) belong in their feature phases, not here.
