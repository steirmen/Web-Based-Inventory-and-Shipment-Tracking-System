# Personalization & appearance

Every signed-in user can change how Nexora **looks** for them: light or dark mode, a theme, an optional animated background, and interface density, corners, and text size. They can also save named looks as profiles. The page is **Appearance** (`/settings/appearance`), reached from the account menu (the user's name in the top bar).

Appearance is **personal and user-level**. It belongs to the account, not to a workspace: it is the same in every organization, survives reloads and sign-in on another device, and never depends on roles, pages, or business data.

## What can and cannot be customized

Same content, same navigation, same workflow, different visual experience.

| Customizable (presentation only)              | Intentionally **not** customizable                       |
| --------------------------------------------- | -------------------------------------------------------- |
| Mode: light / dark                            | Sidebar or navigation position, order, or visibility     |
| Theme: 10 presets + a custom accent and tone  | Page layouts, page builders, moving or hiding components |
| Background effect and its animation intensity | Dashboard widgets or their placement                     |
| Density: compact / comfortable / spacious     | Table columns or table structure                         |
| Corners: sharp / medium / round               | Business workflows, permissions, or what a page shows    |
| Text size: small / default / large            |                                                          |
| Saved profiles of the settings above          |                                                          |

Why no layout reconfiguration: Nexora is a shared business tool. Teammates, support, and documentation all rely on every screen being in the same place for everyone; a rearranged app makes "click Inventory, then Receive" ambiguous, multiplies the states we must test, and turns a visual preference into a support and training problem. Appearance therefore changes only design tokens (colors, spacing, radius, text scale) and a decorative background. Every component, route, and permission check is identical under every setting.

## Settings model

All identifiers are stable, lowercase, and defined once in [`packages/shared/src/appearance.ts`](../packages/shared/src/appearance.ts); display names live only in the web app's dictionary (theme names in `i18n/messages/common.ts`, everything else in `i18n/messages/appearance.ts`, English and Turkish; see [localization.md](localization.md)) and are never persisted.

| Field                | Values                                                                                                           | Default       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- |
| `mode`               | `light`, `dark`                                                                                                  | `light`       |
| `theme`              | `default`, `ocean`, `forest`, `sunset`, `graphite`, `plum`, `paper`, `mint`, `lavender`, `rose`, `custom`        | `default`     |
| `customAccent`       | `#rrggbb` (stored lowercase; used when `theme` is `custom`)                                                      | `#4f46e5`     |
| `customTone`         | `neutral`, `warm`, `cool` (custom theme surfaces)                                                                | `neutral`     |
| `backgroundEffect`   | `none`, `rain`, `snow`, `fireflies`, `starry-night`, `autumn-leaves`, `cherry-blossoms`, `soft-lights`, `aurora` | `none`        |
| `animationIntensity` | `low`, `medium`, `high`                                                                                          | `medium`      |
| `density`            | `compact`, `comfortable`, `spacious`                                                                             | `comfortable` |
| `radius`             | `sharp`, `medium`, `round`                                                                                       | `medium`      |
| `fontScale`          | `small`, `default`, `large`                                                                                      | `default`     |

`DEFAULT_APPEARANCE` is the single definition of the defaults (API responses, reset, and the web app all use it). `GUEST_APPEARANCE` (`DEFAULT_APPEARANCE` in dark mode) is what signed-out visitors see; it is never saved for a user. The custom accent and tone are kept when another theme is selected, so switching back to Custom restores them.

## Persistence (API is the source of truth)

### Database

Two user-owned tables (migration `20261001090000_add_user_appearance`), typed columns instead of JSON:

- **`user_appearances`**: one optional row per user (`user_id` is the primary key and a foreign key to `users`, `ON DELETE CASCADE`), the nine fields above, and `updated_at`. No row means "never saved" (defaults). Reset deletes the row.
- **`appearance_profiles`**: `id` (UUIDv7), `user_id` (`ON DELETE CASCADE`), `name` (≤ 60 characters), the nine fields, `created_at`, `updated_at`; index `(user_id, created_at)`.

CHECK constraints (generated from the shared lists) restrict every enum-like column to the supported values, `custom_accent` to `^#[0-9a-f]{6}$`, and profile names to non-blank. A unique index on `(user_id, lower(name))` makes profile names unique per user, case-insensitively. These tables have no `organization_id`: appearance is not tenant data. Deleting a user removes their appearance and profiles.

### API

All endpoints are under `/me/appearance`, require a session (global `SessionAuthGuard`), and act **only on the signed-in user** (`@CurrentUser()`). No endpoint accepts a `userId` or `organizationId`; the global `ValidationPipe` (`forbidNonWhitelisted`) rejects them, along with any other unknown field.

| Method   | Path                                       | Body                                      | Response                                                                        |
| -------- | ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `GET`    | `/me/appearance`                           |                                           | `200 { appearance, updatedAt }` (defaults and `updatedAt: null` if never saved) |
| `PUT`    | `/me/appearance`                           | full `AppearanceConfig` (all nine fields) | `200 { appearance, updatedAt }`                                                 |
| `POST`   | `/me/appearance/reset`                     |                                           | `200` defaults, `updatedAt: null`                                               |
| `GET`    | `/me/appearance/profiles`                  |                                           | `200 { profiles }` (oldest first)                                               |
| `POST`   | `/me/appearance/profiles`                  | `{ name, appearance }`                    | `201 { profile }`                                                               |
| `PATCH`  | `/me/appearance/profiles/:profileId`       | `{ name?, appearance? }`                  | `200 { profile }`                                                               |
| `DELETE` | `/me/appearance/profiles/:profileId`       |                                           | `204`                                                                           |
| `POST`   | `/me/appearance/profiles/:profileId/apply` |                                           | `200 { appearance, updatedAt }`                                                 |

Validation and errors:

- Every field is validated with `IsIn` against the shared lists; `customAccent` must be a 6-digit hex color (lowercased before storage). Missing fields, unknown values, and extra properties are `400 VALIDATION_ERROR`. The database CHECK constraints are a second line of defense.
- Profile names are trimmed with inner whitespace collapsed, 1–60 characters. A duplicate name (any letter case) is `409 APPEARANCE_PROFILE_NAME_TAKEN`; a 13th profile is `409 APPEARANCE_PROFILE_LIMIT` (`APPEARANCE_LIMITS.profilesMax` = 12; checked while holding a row lock on the user, so concurrent creates cannot exceed it).
- Unknown, malformed, and **other users'** profile ids all answer `404 APPEARANCE_PROFILE_NOT_FOUND` (queries always filter by the signed-in user's id).
- **Apply** copies the profile's settings into the current appearance. Later edits or deletion of the profile do not change the current appearance.
- `GET` responses are `Cache-Control: no-store`. Appearance changes are personal preferences, so they are not written to organization activity logs.

## Frontend

### One provider, one layer

```text
AppProviders
└─ QueryClientProvider
   └─ AppearanceProvider            app/appearance-provider.tsx
      ├─ BackgroundEffectLayer      the app's only effect canvas
      └─ RouterProvider …
```

`AppearanceProvider` is the single owner of appearance state (`useAppearance()` from `lib/appearance/appearance-context.ts`):

- **Guests** (sign-in, register, invitation pages) get the guest appearance: `GUEST_APPEARANCE` (dark), or the mode and theme preset they chose with the **Appearance** button of the auth shell (`GuestAppearanceControl` in `AuthLayout`). That choice is kept on this device in `localStorage['app:guest-appearance']` (`lib/appearance/guest.ts`): only `{ mode, theme }`, validated on read, never sent to the API, and never applied once someone signs in. The guest look also replaces the startup cache, so after sign-out nothing of the previous user's look remains. No authenticated request (`/me/appearance`) is made for guests.
- **Sign-in hand-off**: once signed in, the user's saved appearance (`GET /me/appearance`) replaces the guest look; the guest choice is never written to the user's appearance, and the guest control disappears (it renders only while `status === 'guest'`).
- **Signed in**, it loads `GET /me/appearance` (`useSavedAppearance`, query key `['appearance', userId, 'current']`) and applies it. Keys include the user id, and sign-out removes all non-auth queries, so one user's appearance can never answer for the next user in the same browser.
- **Preview**: the Appearance page calls `preview(config)` to show unsaved settings and `preview(null)` to drop them.

Pages never apply themes or run effects themselves. Switching workspaces or routes re-renders pages inside the same provider, so the appearance is not reloaded and no second effect layer can appear.

### Applying an appearance

`applyAppearance()` (`lib/appearance/apply.ts`) is the only code that touches the document's look. It:

1. builds the palette (`buildPalette(config)`) and sets each token as a CSS custom property on `<html>`;
2. sets `data-mode`, `data-theme`, `data-density`, `data-radius`, `data-font-scale` on `<html>`, which `globals.css` maps to `--spacing`, `--radius-control` / `--radius-card`, the root font size, and `color-scheme`;
3. updates `<meta name="theme-color">`.

Because Tailwind 4 compiles `p-4`, `gap-3`, `rounded-control`, `bg-surface`, … to `var(--…)`, every existing component follows the theme, density, radius, and text size without component changes.

### Startup without a flash

After applying the saved appearance (or, for guests, the guest appearance), the provider caches the computed tokens and data attributes in `localStorage['app:appearance']`. A small inline script in `apps/web/index.html` re-applies them **before** React starts, so a reload does not flash another theme. Without a cache (a first visit), the script applies its own copy of the guest palette, so the sign-in page is dark from the first paint; `appearance-provider.test.tsx` fails if that copy (or the static `theme-color`) drifts from `buildPalette(GUEST_APPEARANCE)`. The production CSP hash of the script is computed from `index.html` at build time. The cache:

- holds presentation values only (no user id, email, token, or anything from the session) and is replaced by the guest look for guests and on sign-out;
- is never authoritative: the API response replaces it as soon as it loads;
- is validated by the script: only `--lowercase-names` with plain color/shadow values (no `url()`, `image()`, `attr()`, `;`, or quotes) and whitelisted data attributes are applied, and a corrupt cache is ignored.

### Appearance page

`pages/appearance-page.tsx`, built from existing primitives (`Card`, `Button`, `Alert`, `FormField`, `ConfirmDialog`, `Dialog`) plus two small generic ones: `SegmentedControl` and `radioOptionProps` (`components/ui`). Feature components are in `components/appearance/` (theme picker, effect picker, custom theme editor, profiles).

- **Live preview, explicit save.** Every change is applied immediately through `preview()` but nothing is sent until **Save** (one `PUT`). A sticky bar shows "Unsaved changes — you are seeing a preview." with **Reset to default**, **Cancel**, and **Save**, and stays reachable on phones.
- **Sections and sample.** Mode, Theme, Background, Interface, and Saved profiles are separate cards with icons. From `xl`, a sticky **Preview** column shows a small sample of real interface parts (buttons, field, badges, table rows, a figure, an alert) built from the same components, so color, density, corners, and text size can be judged next to the controls. The sample is inert and hidden from assistive technology; the whole app previews the draft anyway.
- **Cancel** returns to the saved appearance. **Leaving the page** also ends an unsaved preview.
- **Reset to default** saves the defaults (`POST …/reset`). It asks for confirmation only when it would discard unsaved changes, and is disabled when the saved appearance is already the default. Profiles are kept.
- **Profiles**: "Save current look" stores what you see (including an unsaved preview). Each profile shows a swatch and summary, **Apply** (or "In use" when it equals the saved appearance), **Rename** (dialog), and **Delete** (confirmation). Loading, error, empty, and "limit reached" states are shown.

## Theme system

### Semantic tokens

Components use semantic tokens only (see [design-system.md](design-system.md)); the theme engine provides values for all of them:

| Group     | Tokens                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| Canvas    | `--background`, `--surface`, `--surface-muted`, `--overlay` (dialog backdrop)                                             |
| Text      | `--foreground`, `--muted-foreground`, `--subtle-foreground`                                                               |
| Lines     | `--border`, `--border-strong`, `--ring` (focus)                                                                           |
| Accent    | `--primary`, `--primary-hover`, `--primary-foreground`, `--primary-soft`, `--primary-soft-foreground` (also "info")       |
| Status    | `--success*`, `--warning*`, `--danger*` (`-soft`, `-soft-foreground`, `-border`, `--danger-foreground`, `--danger-hover`) |
| Elevation | `--shadow-card`, `--shadow-raised`                                                                                        |

### Presets

Each preset is a complete palette in both modes (canvas, surfaces, borders, text, accent, focus ring, shadows), generated in OKLCH from a neutral hue/chroma and an accent:

| Theme    | Character                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Default  | The original Nexora slate + indigo. **Light Default is the exact pre-Phase 7B token set**, so existing users see no change. |
| Ocean    | Calm blues and cool grays                                                                                                   |
| Forest   | Deep greens, grounded neutrals                                                                                              |
| Sunset   | Warm orange accents                                                                                                         |
| Graphite | Monochrome and focused                                                                                                      |
| Plum     | Rich purple-magenta                                                                                                         |
| Paper    | Soft cream surfaces, ink-like accents                                                                                       |
| Mint     | Fresh teal greens                                                                                                           |
| Lavender | Gentle violet tones                                                                                                         |
| Rose     | Warm pinks and reds                                                                                                         |
| Custom   | The user's accent color with a neutral, warm, or cool tone                                                                  |

### Custom theme and readability guarantees

The custom theme takes one accent color (color picker or hex field) and a tone; surfaces, borders, hover, focus, and soft tints are derived. `buildPalette()` then **enforces contrast** for every preset and every custom color, in both modes (WCAG 2 ratios, verified by `themes.test.ts` across all presets and a set of extreme colors such as `#ffffff`, `#000000`, `#ffff00`, `#777777`):

| Pair                                                                                                                               | Minimum |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `foreground` on `background` / `surface`                                                                                           | 7       |
| `muted-foreground` and `subtle-foreground` on `background` / `surface` / `surface-muted`                                           | 4.5     |
| `primary-foreground` on `primary` (button text: white or ink, whichever works; the accent's lightness is adjusted if neither does) | 4.5     |
| `primary` as text (links, eyebrows, selected labels) on `background` / `surface`                                                   | 4.5     |
| `ring` (focus outline) on `background`                                                                                             | 3       |
| `primary-hover` differs visibly from `primary`                                                                                     | yes     |
| `*-soft-foreground` on `*-soft` (badges, alerts)                                                                                   | 4.5     |
| `danger` text and `danger-foreground` on `danger`                                                                                  | 4.5     |
| `success-soft-foreground` (green text such as stock increases) on `surface`                                                        | 4.5     |

Targets are met with a 0.05 margin so that rounding the CSS values can never drop a pair below its minimum.

When the chosen accent had to be adjusted, the editor shows the color actually used and why ("In this mode we use #0073B4, a close shade of your color, so buttons, links, and focus outlines stay readable.").

### Status colors

Success, warning, and danger come from a **fixed per-mode set** that themes do not change, so a red "Cancelled" or green "In stock" means the same in every theme. Statuses are always shown with text (badges with labels), never by color alone. "Info" uses the theme's primary-soft pair.

## Density, corners, and text size

| Setting   | Implementation                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Density   | `--spacing` 0.22rem / 0.25rem (default) / 0.28rem: padding, gaps, control and row heights scale together     |
| Corners   | `--radius-control` / `--radius-card`: sharp 0.1875/0.25rem, medium 0.5/0.75rem (default), round 0.75/1.25rem |
| Text size | Root font size 93.75% / 100% / 106.25%; everything in `rem` scales, layouts are unchanged                    |

All three are bounded token values. Layouts are tested at 375px, 820px, 1280px, and 1440px.

## Background effects

Effects are decorative and drawn by **one** `<canvas>` (`BackgroundEffectLayer`, engine in `lib/appearance/effects.ts`):

- `position: fixed; inset: 0; z-index: -10; pointer-events: none; aria-hidden="true"`: always behind content, never intercepts clicks or scrolling, never changes layout. It is not rendered at all when the effect is Off.
- **Effects:** rain, snow, fireflies, starry night, autumn leaves, cherry blossoms, soft lights (slow color glows in the theme's accent), aurora. Each draws a few dozen to at most a few hundred simple shapes (starry night at High on a large screen is the maximum, about 260), with low opacity tuned per mode so the app stays professional.
- **Intensity** scales the amount and speed (low 0.5×/0.6×, medium 1×, high 1.6×/1.3×); particle counts also scale with screen area, capped.
- **Performance:** one `requestAnimationFrame` loop, drawing at most 30 frames per second, device pixel ratio capped at 1.5, debounced resize, and **paused while the tab is hidden**. Changing the effect, intensity, mode, or accent stops the previous loop and removes its listeners before starting a new one; unmounting does the same.
- **Reduced motion:** when the OS/browser reports `prefers-reduced-motion: reduce`, the effect is drawn once as a still image and never animated, whatever intensity is selected; the Appearance page says so. CSS transitions are already disabled globally under reduced motion.

## Accessibility

- All choices are native buttons in labelled radio groups (`role="radiogroup"` / `role="radio"`, `aria-checked`), with roving focus and arrow/Home/End keys, and the shared `focus-ring`.
- Selection is never color-only: selected theme cards have a check mark and a thicker outline, selected effects a check mark, segmented options a filled background and bold weight.
- Theme and effect cards have names such as "Ocean theme" and "Starry night background"; previews are `aria-hidden`.
- Save status is announced through a polite live region; errors use `Alert`.
- Contrast guarantees as above; reduced motion as above.

## Testing

- **API** (`apps/api/test/database/appearance-api.db-spec.ts`, real PostgreSQL): defaults, save, reset, invalid modes/themes/effects/colors/extra fields (`userId`, `organizationId`), 401 on every route, the same appearance across organizations, profile create/list/rename/replace/apply/delete, case-insensitive names, the 12-profile limit, and cross-user isolation (another user's profile is 404 for read, rename, apply, and delete).
- **Theme engine** (`lib/appearance/themes.test.ts`): Default light equals the original tokens; every preset and extreme custom colors meet the contrast table in both modes.
- **Effects** (`lib/appearance/effects.test.ts`): every effect animates and stops completely, reduced motion draws one still frame, hidden tabs pause, listeners are removed.
- **Provider** (`app/appearance-provider.test.tsx`): guests get the dark guest appearance (also on a first visit, before React), the cache holds no user data, workspace switches don't reload or change appearance, sign-out/sign-in as another user never shows the previous look, exactly one effect layer, and the `index.html` startup script (applies valid values, rejects unsafe ones, survives corrupt data).
- **Page** (`pages/appearance-page.test.tsx`): loading/error/retry, preview, save, cancel, leaving the page, custom color validation, effects, intensity, density/radius/text size, keyboard, reset (with and without confirmation), reduced-motion notice, and profile save/apply/rename/delete/empty/error/limit.

## Adding a theme or effect later

1. Add the id to `THEME_IDS` or `BACKGROUND_EFFECTS` in `packages/shared/src/appearance.ts`.
2. Add a migration that replaces the CHECK constraints of both tables (`user_appearances_*_check`, `appearance_profiles_*_check`).
3. Theme: add its spec to `PRESETS` in `lib/appearance/themes.ts` and its name and description to `common.themes` in both languages (the contrast tests cover it automatically). Effect: add a scene in `lib/appearance/effects.ts`, its name and description to `appearance.effects`, and a preview in `effect-picker.tsx`.
