# Localization (English / Turkish)

Phase 10.1. The entire web interface is available in **English** (the default) and **Turkish**. The language is presentation only. It never changes routes, permissions, data, or business rules, and it is independent of appearance.

## Choosing the language

- The **TR | EN** switch sits in the top bar (`[Appearance][TR|EN][User ▼]`) and on the sign-in and register pages (`LanguageSwitch`, `components/i18n/language-switch.tsx`).
- It is a labelled `radiogroup` (English / Türkçe) that is keyboard-operable and works at 375 px.
- Switching is **immediate**: no reload and no remount. The route, query string, open workspace, and unsaved form input stay as they are.

Which language applies (`I18nProvider`, `app/i18n-provider.tsx`, the only owner):

1. **Signed in:** the user's saved `language` (`users.language`, returned by `GET /auth/me`, login, and register).
2. Otherwise **this device's** last choice: `localStorage` `app:language`, holding only `"en"` or `"tr"`, never user, session, or token data.
3. Otherwise **English** (`DEFAULT_LANGUAGE`).

Changing the language:

- stores it on the device;
- when signed in, updates the cached user immediately and saves it with `PATCH /me/preferences { "language": "tr" }`.

A signed-in user's saved language also becomes the device's language, so the sign-in page after sign-out matches.

### Preferences API

`PATCH /me/preferences` is scoped to `@CurrentUser()`:

- body `{ language: 'en' | 'tr' }`, validated with `@IsIn(LANGUAGES)`;
- returns `{ language }`;
- protected by CSRF like every state-changing route;
- the column has a CHECK `users_language_check`, and `NULL` means "not chosen yet";
- there is no organization id and no activity entry, and the language is never stored in the session or a cookie.

`index.html`'s inline startup script sets `<html lang>` from `app:language`, accepting only `en`/`tr`, so the first paint has the right language attribute. The provider then keeps `document.documentElement.lang` in sync.

## Dictionary (`apps/web/src/i18n`)

- `define.ts`: `defineMessages(en, tr)` takes the English messages, which define the keys, and the Turkish translation typed as `Translation<typeof en>`. A missing key, an extra key, or a different parameter list is a **type error**.
- Messages are strings, or functions of named parameters for text with values (`({ count }) => …`). Plurals and word order live inside the message, never in components.
- Bundles live in `messages/`. Each page's text ships with its lazy chunk; only `common` is in the entry bundle:

  | Bundle          | Contents                                                                                                                              |
  | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
  | `common.ts`     | shell, navigation, sign-in/register, shared states and actions, statuses, roles, ranges, currency names, theme names, **error codes** |
  | `catalog.ts`    | products, categories, category picker                                                                                                 |
  | `stock.ts`      | warehouses, inventory, stock movements and operations                                                                                 |
  | `sales.ts`      | customers, orders, order builder                                                                                                      |
  | `insights.ts`   | dashboard and reports                                                                                                                 |
  | `workspace.ts`  | workspaces, onboarding, invitations, team, settings, system status                                                                    |
  | `appearance.ts` | Appearance page, effects, profiles                                                                                                    |

- Components read texts with `useMessages(bundle)` and never test the language: no `if (language === 'tr')`. `useLanguage()` gives `{ language, locale, setLanguage }`.
- Pure helpers (validators, error mappers) take the messages they need as a parameter, so they stay testable without React.
- `i18n.test.ts` checks that every bundle has identical key shapes in both languages and no empty text.

### What is translated

- All interface text: labels, buttons, headings, hints, empty, loading, and error states, `aria-label`s, page titles, validation messages, and notices.
- **API errors by code** (`common.errors.codes`):
  - in English the API's own user-facing 4xx message is shown, because it names the records involved;
  - in Turkish the code's translation is shown;
  - 5xx and network errors always get generic text;
  - field messages from validation details show as-is in English and as a generic message in Turkish.
- Statuses (order, stock, product, warehouse), movement types, roles, date-range names, theme and effect names, and currency names.
- **Report exports:** the web app sends `lang`, and the server translates only generated labels (see [export.md](export.md)).

**User data is never translated:** product, customer, and warehouse names, SKUs, notes, and category names appear exactly as entered.

## Formatting

`useFormat()` (`i18n/format.ts`) uses `Intl` with the language's locale (`LANGUAGE_LOCALES`: `en` → `en-US`, `tr` → `tr-TR`):

|         | English       | Turkish      |
| ------- | ------------- | ------------ |
| number  | `1,000,000`   | `1.000.000`  |
| money   | `₺1,250.50`   | `₺1.250,50`  |
| percent | `12.5%`       | `%12,5`      |
| date    | `Sep 3, 2025` | `3 Eyl 2025` |

Dates are formatted from the stored UTC instant in the browser's time zone; date-only report days use `formatDayRange(from, to, locale)`. Money rules are in [currency.md](currency.md).

## Adding text

1. Add the key to the English object of the right bundle and its Turkish translation. The compiler forces both.
2. Read it with `useMessages(bundle)`. Never hard-code visible text, and never concatenate translated fragments where word order differs; use a parameterized message.
3. A new API error code needs a translation in `common` (`Record<ApiErrorCode, string>` enforces it).
4. Tests: `renderApp()` includes `I18nProvider`. `test/setup.ts` resets `<html lang>` and `localStorage`. `mockApi` answers `PATCH /me/preferences` by echoing the body.
