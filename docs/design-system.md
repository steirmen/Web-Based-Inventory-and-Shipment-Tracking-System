# Design system

A restrained B2B SaaS visual language: neutral slate surfaces, a single indigo accent, borders over shadows, compact 14px body text.

All tokens are defined in [`apps/web/src/styles/globals.css`](../apps/web/src/styles/globals.css). Primitives live in `apps/web/src/components/ui` and `apps/web/src/components/layout`.

The values below are the **Default light** theme. Users can switch mode, theme, density, corners, and text size ([personalization-appearance.md](personalization-appearance.md)): the theme engine then overrides the same tokens at runtime, so components must use tokens (never palette colors or fixed pixel spacing) to follow every theme.

## Rules

1. **Use semantic tokens, not palette colors.** Write `bg-surface`, `text-muted-foreground`, `border-border`, `bg-primary`, not `bg-white`, `text-slate-600`, `bg-indigo-600`. Palette colors are allowed only inside `globals.css`.
2. **Compose primitives before writing new styles.** Reach for `Button`, `Card`, `Table`, `Badge`, `Alert`, `PageHeader` first. Add a variant to a primitive before adding a one-off class string.
3. **Merge classes with `cn()`** so callers can override utilities safely.
4. **Never convey state by color alone.** Pair color with text or an icon (for example `Badge` with a label).
5. **Every interactive element gets `focus-ring`**, a keyboard-only 2px indigo outline with 2px offset.
6. **Same thing, same look.** The same action uses the same button hierarchy, the same feedback uses the same pattern, and the same kind of list uses the same table — everywhere (see [Patterns](#patterns)).

## Tokens

### Color

| Token                                                   | Use                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `background`                                            | App canvas                                                             |
| `surface` / `surface-muted`                             | Cards, inputs / subtle fills, hover, disabled                          |
| `foreground` / `muted-foreground` / `subtle-foreground` | Primary text / secondary text / placeholders, meta                     |
| `border` / `border-strong`                              | Dividers, card outlines / control outlines                             |
| `primary`, `primary-hover`, `primary-foreground`        | Primary actions, links, brand                                          |
| `primary-soft`, `primary-soft-foreground`               | Informational tints, the active navigation item                        |
| `success-*`, `warning-*`, `danger-*`                    | Status: `-soft` background, `-soft-foreground` text, `-border` outline |
| `ring`                                                  | Focus indicator                                                        |
| `overlay`                                               | Dialog backdrop                                                        |

The theme engine keeps the text pairs above at WCAG AA (4.5:1) in every theme and mode (`themes.test.ts`).

### Typography

Font: **Inter Variable** (self-hosted via `@fontsource-variable/inter`). Body text is `text-sm` (14px), scaled by the user's text-size setting (rem-based).

| Role                            | Classes                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Page title (`h1`, one per page) | `text-2xl font-semibold tracking-tight` (in `PageHeader`)                                   |
| Section / card title (`h2`)     | `text-base font-semibold` (in `CardTitle`)                                                  |
| Section label                   | `text-sm font-semibold`                                                                     |
| Body                            | `text-sm`                                                                                   |
| Secondary / helper              | `text-sm text-muted-foreground`                                                             |
| Meta, captions, badges          | `text-xs`                                                                                   |
| Eyebrow                         | `text-xs font-semibold uppercase tracking-wide text-primary`                                |
| Navigation group label          | `text-[0.6875rem] font-semibold uppercase tracking-wider` (AA)                              |
| Code, IDs, SKUs                 | `font-mono text-xs`, or `text-[0.8125rem]` next to a heading (rem, so it follows text size) |
| Figures                         | `tabular-nums` (right-aligned in tables)                                                    |

Long names truncate with `truncate` inside a `min-w-0` parent; never let them push a layout wider.

### Spacing (4px grid, Tailwind scale)

Spacing scales with the user's density setting (`--spacing`), so use the Tailwind scale, never fixed pixel values.

| Context                    | Value                                                                   |
| -------------------------- | ----------------------------------------------------------------------- |
| Page vertical padding      | `py-6 sm:py-8` (in `AppShell`)                                          |
| Between page sections      | `gap-6`                                                                 |
| Between cards in a grid    | `gap-4` (KPI cards) or `gap-6` (sections)                               |
| Card padding               | `p-6` (header/content), `px-6 py-4` (footer)                            |
| Inside a group of controls | `gap-2` (buttons), `gap-3` (filter fields)                              |
| Table cells                | `px-3 py-3`, `px-4` once the content column is ≥ 64rem (in `TableCell`) |

### Sizing

| Element              | sm       | md (default) | lg       | icon     | icon-sm  |
| -------------------- | -------- | ------------ | -------- | -------- | -------- |
| Button height        | `h-8`    | `h-9`        | `h-10`   | `size-9` | `size-8` |
| Input / select       |          | `h-9`        |          |          |          |
| Icon inside controls | `size-4` | `size-4`     | `size-4` | `size-4` | `size-4` |

### Radius, borders, and shadows

| Token             | Value       | Use                                          |
| ----------------- | ----------- | -------------------------------------------- |
| `rounded-control` | 0.5rem      | Buttons, inputs, alerts, menu items          |
| `rounded-card`    | 0.75rem     | Cards, panels, dialogs, menus                |
| `rounded-full`    |             | Badges, dots, avatars                        |
| `shadow-card`     | very subtle | Cards, controls                              |
| `shadow-raised`   | soft        | Floating elements (menus, popovers, dialogs) |

Borders are 1px `border-border` (containers) or `border-border-strong` (controls). Radius values follow the user's corner setting.

### Motion

Short and functional only. Every animation and transition stops under `prefers-reduced-motion` (global rule in `globals.css`).

| Token / class                                    | Use                                  |
| ------------------------------------------------ | ------------------------------------ |
| `transition-colors duration-150`                 | Hover and focus on controls and rows |
| `active:translate-y-px`                          | Button press (in `buttonVariants`)   |
| `animate-overlay-in`, `animate-dialog-in`        | Dialog backdrop and panel entering   |
| `animate-popover-in`                             | Menus opening                        |
| `animate-route-progress`, `animate-delayed-show` | The navigation progress bar          |

Never animate business values (numbers, totals, chart data).

## Layout

- `AppShell`: sticky header (brand, workspace switcher, account menu), main content, footer. Content width `max-w-page` (88rem) via `Container`, with `px-4 sm:px-6 lg:px-8` gutters. A new page starts at the top (`ScrollRestoration`, keyed by path so filter changes never jump).
- **Workspace pages** (`OrganizationLayout`): the workspace navigation (`WorkspaceNav`) is a sticky sidebar with labelled groups (Sales, Catalog, Stock, Insights, Workspace) from `lg`, and the same links in one horizontally scrolling bar below that. The page column is a **CSS container** (`@container`), so pages adapt to the space they actually have next to the sidebar: inside a workspace, use container variants (`@3xl:`, `@4xl:`, `@5xl:`) for lists rather than viewport breakpoints.
- Layouts must work at 375px wide with no page-level horizontal scroll. Stack on mobile, then use `sm:` / `md:` (or container variants) for rows and grids.

## Patterns

### Page header

Every page starts with `PageHeader` (one `h1`): `title`, an optional `description`, and `actions` (the primary action last). Detail, create, and edit pages put a `BackLink` ("← Products") above it. `eyebrow` gives context such as the workspace name or the record type.

### Buttons

One `primary` action per view; `secondary` for alternatives and Cancel; `ghost` for low-emphasis and row actions; `danger` for irreversible confirmations. Icon-only buttons (`size="icon"` / `"icon-sm"`) always have an `aria-label` and a `title` tooltip. Row actions in tables are icon-only (`compact`); the same actions in stacked cards keep their text.

### Forms

`FormField` wires label, hint, and error to the control; the error replaces the hint right under the field and sets `aria-invalid`. Submit buttons use `isLoading` (disabled while pending, so a double click sends one request). Server errors: field errors next to their field, everything else in an `Alert tone="danger"` at the top of the form; entered values are kept. Multi-step forms number their sections (the order builder: 1 Customer and warehouse → 2 Products → 3 Review and save).

### Tables and lists

Data tables use `Table`, `TableHeader`, `TableHead`, `TableBody`, `TableRow`, `TableCell` (`ui/table.tsx`): one header style, row hover, right-aligned tabular numbers (`align="right"`), and a built-in horizontal scroll wrapper, so a table never widens the page. Workspace lists show the table from a container width up (`className="hidden @4xl:table"`) and the same rows as stacked cards below it (`<ul aria-label="Products" className="@4xl:hidden">`), so nothing is hidden on small screens. Reports keep the table at every width and scroll it inside its card. Small summaries inside cards and dialogs (dashboard top products, the processing preview) use a compact inset table without a header fill. Pagination: `PaginationBar` (result range, page X of Y, previous/next) under the list.

### Filter bars

Search first (`SearchInput`), then selects, then "Clear filters" (ghost) when any filter is active; a small spinner shows while new results load. Lists with a few self-describing selects ("All categories") use `aria-label`s; filter bars with dates or ambiguous values use visible `FormField` labels in a grid. All filter state lives in the URL.

### Dialogs

`Dialog` sizes: `sm` (confirmations, default), `md` (forms), `lg` (wide content). The title and the footer stay visible and only the body scrolls, so actions remain reachable at 375px (the dialog docks to the bottom on phones). `ConfirmDialog` puts Cancel first and gives it the initial focus; destructive confirmations use `tone="danger"` and say what happens in plain words ("…will be marked as archived… It can be restored later."). Harmless, reversible actions (restore) are not confirmed.

### Menus and selectors

`Menu` (`ui/menu.tsx`) for dropdown menus (workspace switcher, account menu): `role="menu"`, ↑/↓/Home/End, Escape returns focus to the trigger, a click outside closes it. Pickers with server-side search (`CustomerPicker`, `ProductPicker`) share one pattern: `SearchInput` + results with loading, "no matches", and error-with-retry states. Short fixed lists use the native `Select`.

### Feedback

One pattern: an inline `Alert` next to what it is about. Success after an action (`tone="success"`, dismissible with `onDismiss`) appears under the page header; notices that survive a navigation (e.g. "Product created.") travel in router state (`useFlashNotice`) and are shown once. Errors are `tone="danger"` (`role="alert"`), with the API message from `apiErrorMessage()`, never raw details. No `window.alert`/`confirm`, no toasts.

### Loading, empty, and error states

- Lists: `ListSkeleton` (in the shape of the list) while the first page loads; later updates keep the previous page dimmed with a small spinner. Detail pages: `DetailSkeleton`. Small sections: `LoadingState`. Buttons: `isLoading`.
- Navigation: pages are code-split; the current page stays visible while the next page's code downloads, with a slim progress bar (`RouteProgress`). A page whose code can't be downloaded shows "Check your connection, then reload the app."
- `EmptyState`: what is empty, why, and the next step (a primary action, or "Clear filters" when filters hide everything). Never fake data.
- `ErrorState`: a readable explanation and "Try again"; never an empty table instead of an error.

### Status badges

`Badge` with a label (and `dot` for live states). Tones carry the same meaning everywhere: `success` active/completed/in stock, `warning` processing/low stock/adjustment, `danger` out of stock/cancelled, `neutral` draft/archived, `primary` informational. Color never stands alone.

## Interaction states

| State           | Treatment                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hover           | One step darker background (`hover:bg-primary-hover`, `hover:bg-surface-muted`) or stronger border; 150ms color transition |
| Press           | `active:translate-y-px` on buttons                                                                                         |
| Focus           | `focus-ring` (keyboard only, `:focus-visible`)                                                                             |
| Disabled        | `opacity-50`, `pointer-events-none` (buttons); `bg-surface-muted` + `cursor-not-allowed` (inputs)                          |
| Loading         | `Button isLoading` shows a spinner, disables the button and sets `aria-busy`                                               |
| Error (field)   | `aria-invalid` on `Input` gives a `border-danger` outline                                                                  |
| Error (section) | `<Alert tone="danger">`, announced with `role="alert"`                                                                     |
| Reduced motion  | Animations and transitions are disabled globally                                                                           |

## Primitives

| Component                                                                    | File                                               | Notes                                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonVariants`                                                   | `ui/button.tsx`, `ui/button-variants.ts`           | Variants `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`, `icon`, `icon-sm`. Use `buttonVariants()` for links |
| `Input`, `Textarea`, `Select`                                                | `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx` | Mark errors with `aria-invalid`                                                                                                 |
| `SearchInput`                                                                | `ui/search-input.tsx`                              | Search field with icon, `maxLength` 100; name it with `aria-label` or `FormField`                                               |
| `Label`                                                                      | `ui/label.tsx`                                     | Always pair with `htmlFor`                                                                                                      |
| `FormField`                                                                  | `ui/form-field.tsx`                                | Label + control + hint/error; render prop passes `id`, `aria-invalid`, and `aria-describedby` to the control                    |
| `PasswordInput`                                                              | `ui/password-input.tsx`                            | `Input` with a show/hide toggle (`aria-pressed`)                                                                                |
| `Card` + `CardHeader/Title/Description/Content/Footer`                       | `ui/card.tsx`                                      |                                                                                                                                 |
| `Table` + `TableHeader/Head/Body/Row/Cell`                                   | `ui/table.tsx`                                     | Data tables (see [Tables and lists](#tables-and-lists))                                                                         |
| `Dialog`, `ConfirmDialog`                                                    | `ui/dialog.tsx`, `ui/confirm-dialog.tsx`           | Sizes `sm`/`md`/`lg`; focus trap, Escape, focus return                                                                          |
| `Menu`, `menuItemClass`, `MenuSeparator`                                     | `ui/menu.tsx`                                      | Dropdown menus                                                                                                                  |
| `Badge`                                                                      | `ui/badge.tsx`                                     | Tones: `neutral`, `primary`, `success`, `warning`, `danger`; optional `dot`                                                     |
| `Alert`                                                                      | `ui/alert.tsx`                                     | Tones: `info`, `success`, `warning`, `danger`; `onDismiss` adds a close button                                                  |
| `Spinner`, `Skeleton`                                                        | `ui/spinner.tsx`, `ui/skeleton.tsx`                | `label={null}` when the surrounding UI already announces loading                                                                |
| `SegmentedControl`                                                           | `ui/segmented-control.tsx`                         | A few mutually exclusive options as an accessible radio group (arrow keys); `radioOptionProps` for custom radio cards           |
| `Container`                                                                  | `layout/container.tsx`                             | Page width and gutters                                                                                                          |
| `PageHeader`, `BackLink`                                                     | `layout/page-header.tsx`, `layout/back-link.tsx`   | `eyebrow`, `title` (h1), `description`, `actions`; "← Parent" link above it                                                     |
| `LoadingState`, `ListSkeleton`, `DetailSkeleton`, `ErrorState`, `EmptyState` | `layout/page-state.tsx`                            | Page and section states                                                                                                         |
| `PaginationBar`                                                              | `layout/pagination-bar.tsx`                        | Server-side pagination                                                                                                          |
| `RouteLoading`, `RouteProgress`                                              | `layout/route-loading.tsx`                         | Cold-start fallback and navigation progress (code splitting)                                                                    |

Business-specific components (product actions, the order builder, dashboard widgets, `WorkspaceNav`, and so on) live in feature folders, not in `ui/`.
