# CLAUDE.md

Guidance for Claude Code (and other contributors) working in this repository.

## Project

Business operations SaaS for SMBs. The product name ("Nexora") is a **working name**: keep it in `apps/web/src/lib/app-config.ts` and `apps/web/index.html` only, and never in package names, module names, or database identifiers. Packages use the neutral `@app/*` scope.

## Phased delivery (important)

Work is delivered in explicit phases. **Only implement what the current phase asks for, and never start the next phase automatically.**

- **Phase 1 (done): foundation.** Monorepo, NestJS API with `GET /health`, React app with `/` and `/health-check`, design-system primitives, API client, Prisma + PostgreSQL connectivity, tooling, tests, CI.
- **Phase 2 (done): database & domain model.** Prisma models and migration for User, Organization, OrganizationMember, Category, Product, Warehouse, Inventory, StockMovement, Customer, Order, OrderItem, and ActivityLog; CHECK constraints; dev seed; database integration tests. **Schema only: no services, APIs, or UI for these domains yet.**
- **Phase 3 (done): authentication.** Register/login/logout/me, Argon2id passwords, database-backed sessions (`Session` model) in an HttpOnly cookie, global auth guard, rate limiting, standard error responses, login/register UI, protected and guest routes, authenticated landing page. See [docs/authentication.md](docs/authentication.md).
- **Phase 4 (done): organizations & RBAC.** Organization creation/listing/switching (`/org/:organizationId` routes), OrganizationAccessGuard + `@RequirePermissions`, OWNER/ADMIN/STAFF matrix, team management, invitation links, ownership transfer, organization activity logging. See [docs/organizations-rbac.md](docs/organizations-rbac.md).
- **Phase 5 (done): products & categories.** Category CRUD (delete only when unused), products with server-side search/filter/sort/pagination, archive/restore (no product delete), catalog permissions, activity logging, product list/create/edit/detail and categories UI, seed additions. See [docs/products-categories.md](docs/products-categories.md).
- **Phase 6 (done): warehouses & inventory.** Warehouse CRUD with immutable codes and archive/restore (no delete), inventory list/detail with low-stock states, receive/issue/damage/adjust/transfer in one row-locked transaction each, immutable stock movement history (filters, transfer groups), inventory permissions, activity logging, warehouses/inventory/stock-movements UI, seed additions. No schema changes. See [docs/warehouses-inventory.md](docs/warehouses-inventory.md).
- **Phase 7A (done): customers & orders.** Customer CRUD, sales orders with per-organization order numbers, status workflow, and fulfillment that issues stock through `StockOperationsService` (SALE movements) in the same transaction, sales permissions, activity logging, customers/orders UI. Migration `add_order_number_sequences`. (Detailed customers/orders docs are still to be written.)
- **Phase 7B (done): personalization & appearance.** User-level appearance (mode, 10 theme presets + custom accent, background effects, animation intensity, density, corners, text size), saved appearance profiles, `/me/appearance` API, `UserAppearance`/`AppearanceProfile` models, theme engine with enforced contrast, single background-effect layer, Appearance page with live preview. See [docs/personalization-appearance.md](docs/personalization-appearance.md).
- **Later phases:** dashboard/reporting (APIs and UI). Password reset, email verification, email delivery, OAuth, and 2FA are also not built. Do not add these, or placeholder routes or modules, until asked.

Environment constraints: **local development only. No Docker, no Docker Compose, no WSL.** PostgreSQL runs natively on the Windows host.

## Commands (repository root)

```bash
npm run dev          # shared (watch) + api (:3000) + web (:5173)
npm run validate     # format:check, lint, typecheck, test, build — run before finishing a task
npm run test         # unit + HTTP tests (no DB); single workspace: npm run test -w @app/api
npm run test:db      # database integration tests (real PostgreSQL, DB_TEST_NAME)
npm run db:check     # Prisma → PostgreSQL connectivity
npm run db:migrate -- --name <change>   # after editing apps/api/prisma/schema.prisma
npm run db:deploy    # apply pending migrations (non-destructive)
npm run db:seed      # idempotent demo data
```

## Layout

- `apps/api`: NestJS 12, ESM (`"type": "module"`, `module: nodenext`)
- `apps/web`: React 19 + Vite 8 + React Router 8 + TanStack Query 5 + Tailwind CSS 4
- `packages/shared`: framework-free TS types, compiled to `dist/` (built by root `postinstall` and in watch mode by `npm run dev`)
- `docs/`: architecture, design system, local setup. Update these when conventions change.

## Conventions

### General

- TypeScript strict everywhere. `any` is a lint error.
- Formatting: Prettier (single quotes, trailing commas, width 100, Tailwind class sorting). Linting: **oxlint** (not ESLint), per-app `.oxlintrc.json`.
- Tests: Vitest in both apps. `npm run test` must not require a real database or a `.env` file. Tests that need PostgreSQL go in `apps/api/test/database/*.db-spec.ts` (`npm run test:db`).
- File names: kebab-case (`health-check-page.tsx`, `prisma.service.ts`).
- Shared request/response types go in `packages/shared`, imported with `import type` from both apps.

### API (`apps/api`)

- **Relative imports need the `.js` extension** (ESM/nodenext): `import { X } from './x.js'`.
- Do **not** convert DI constructor parameters to `import type`, because Nest needs the runtime class for `emitDecoratorMetadata`.
- One folder per feature module under `src/<feature>/`: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and `*.spec.ts` next to the code. HTTP-level tests go in `test/*.e2e-spec.ts` using `configureApp()` so they run the real pipeline.
- Configuration: add new env vars to the Zod schema in `src/config/env.ts` **and** to `.env.example` (documented). Read them via `ConfigService<Env, true>` with `{ infer: true }`, never `process.env`.
- Cross-cutting HTTP setup (pipes, CORS, cookies, error filter) goes in `src/app.setup.ts`.
- **Authentication is secure by default:** `SessionAuthGuard` is a global guard, so every new route requires a session. Mark intentionally public routes with `@Public()` (from `src/auth/decorators.ts`). Get the user with `@CurrentUser()`. Authorization/RBAC does not exist yet; don't add ad-hoc role checks.
- **Errors:** throw `AppException(status, code, message)` (codes are `ApiErrorCode` in `@app/shared`) for anything the client should read. Messages of other exceptions are replaced with generic text by `ApiExceptionFilter`, and 5xx never leak details.
- **Never log** passwords, password hashes, session tokens, cookies, or email addresses; log user IDs. Never select `passwordHash` into anything returned to a client.
- Passwords: only via `PasswordService` (Argon2id). Never trim or normalize them. Emails: always `normalizeEmail()` before queries (the DB enforces lowercase + trimmed).
- Database: inject `PrismaService` (global `DatabaseModule`). Prisma 7 specifics:
  - Client is generated into `src/generated/prisma` (git-ignored). Import from `../generated/prisma/client.js`.
  - Connection URL is built from `DB_*` vars in `prisma.config.ts` (CLI) and `prisma.service.ts` (runtime), not from `DATABASE_URL`.
  - Uses the `@prisma/adapter-pg` driver adapter.
- Never run destructive Prisma commands (`migrate reset`, `db push --force-reset`, `--accept-data-loss`) without explicit user approval.

### Organizations & authorization (read [docs/organizations-rbac.md](docs/organizations-rbac.md))

- **Never trust organization ids from the frontend.** Every organization-scoped endpoint lives under `organizations/:organizationId`, has `@UseGuards(OrganizationAccessGuard)` on the controller, and declares `@RequirePermissions(...)` per handler. The guard verifies membership and permission; use `@OrgContext()` and scope every query with `context.organization.id`. Never take the organization id from a body or query string.
- Non-members and unknown organizations must get the same `404 ORGANIZATION_NOT_FOUND`. Look up sub-resources (members, invitations, and later products…) **with** the organization id.
- Permissions and the role hierarchy live **only** in `packages/shared/src/rbac.ts` (`ROLE_PERMISSIONS`, `ASSIGNABLE_ROLES`, `canAssignRole`, `canManageMember`). Don't write `role === 'OWNER'` checks in controllers. New domains add permissions there (and update `src/organizations/rbac.spec.ts`).
- **OWNER is protected:** never assignable through role changes or invitations, never removable. Ownership moves only via `POST …/ownership/transfer`. The DB allows at most one OWNER (partial unique index).
- Mutations that change roles or memberships run in a transaction, re-check the target's current row, and use conditional updates.
- Record organization mutations with `recordActivity(tx, …)` **inside the same transaction**. Never put passwords, hashes, session tokens, or invitation tokens in metadata.
- Raw invitation tokens are returned once (in `inviteUrl`) and never persisted or logged. Store `hashToken(token)` (`src/common/security/secure-token.ts`).
- Frontend permission checks (`<Can>`, `useCurrentOrganization().can/canManage`) are **UX only**. The API is authoritative.
- Do not implement dashboard/reporting functionality until that phase.

### Products & categories (read [docs/products-categories.md](docs/products-categories.md))

- **Money is a decimal string end to end** (`"19.99"`): validate with `MONEY_PATTERN`, store as `Decimal`, return `toFixed(2)`, compare with `Decimal#equals`. Never `Number()`/`parseFloat` a price or cost, in the API or the web app (`formatMoney` passes the string to `Intl`).
- Products are **archived, never deleted**; status changes only via `…/archive` and `…/restore`. Edits of ARCHIVED products are rejected (`PRODUCT_ARCHIVED`).
- List endpoints: whitelist sort fields (never pass a client string as a column), always add `id` as the tie-breaker, cap `pageSize` (100), and escape `%`, `_`, `\` in `contains` searches.
- A `categoryId` from a client (body or filter) must be looked up **with** the organization id; a foreign one is `422 PRODUCT_CATEGORY_NOT_FOUND`.
- Frontend catalog query keys live under `organizationKeys.detail(organizationId)` (`catalogKeys` in `src/api/catalog.ts`); invalidate by organization after mutations. `OrganizationLayout` keys the page outlet by organization id, so don't rely on page state surviving a workspace switch.
- Confirm destructive or meaningful actions with `ConfirmDialog`/`Dialog` (`components/ui`), not `window.confirm`.

### Warehouses & inventory (read [docs/warehouses-inventory.md](docs/warehouses-inventory.md))

- Inventory, warehouses, and stock movements are **organization-scoped** like everything else: routes under `organizations/:organizationId`, queries filtered by `context.organization.id`, and every `warehouseId`/`productId` from a body or filter looked up **with** the organization id (foreign → `422 INVENTORY_WAREHOUSE_NOT_FOUND` / `INVENTORY_PRODUCT_NOT_FOUND`). Organization ids are never taken from bodies.
- **Stock movements are immutable.** Never update or delete a `stock_movements` row, and never add a route that could (`stock-movement-immutability.spec.ts` fails if you do). Corrections are new movements.
- **Every stock mutation goes through `StockOperationsService` and its single `transaction()`**: lock → read current quantity → validate → update `inventory` → insert `StockMovement` → `recordActivity`, all in the same transaction. Never read a quantity outside the transaction and write it later, and never change `inventory.quantity` anywhere else (controllers never touch inventory rows).
- Lock order is fixed: `warehouses` FOR SHARE (id order) → `products` FOR SHARE → `inventory` FOR UPDATE (warehouse-id order). New operations must follow it, or they can deadlock with existing ones.
- **Inventory quantity never goes negative** (checked under the lock, backed by `inventory_quantity_non_negative_check`), and `quantityBefore + quantityDelta = quantityAfter` must chain: each movement's before is the previous after, and the inventory equals the last after. DB tests end with `expectLedgerConsistent(org)`.
- **Transfers always write exactly two movements** (`TRANSFER_OUT` + `TRANSFER_IN`, same `transferGroupId`, deltas summing to 0) and one `STOCK_TRANSFERRED` activity entry, atomically.
- Concurrent stock operations must stay safe: rely on the row locks, add a real parallel test in `stock-concurrency.db-spec.ts` for new operations, and let lost lock races surface as `409 INVENTORY_CONCURRENCY_CONFLICT` (don't catch them elsewhere).
- **Archived products and inactive warehouses take no new stock movements** (`INVENTORY_PRODUCT_INACTIVE` / `INVENTORY_WAREHOUSE_INACTIVE`); their history stays readable.
- Frontend stock checks and previews are **UX only**; the backend is authoritative and re-validates against the locked row. Keep inventory query keys under `organizationKeys.detail(organizationId)` (`inventoryKeys`), and invalidate inventory, movements, and warehouses after an operation.
- Stock operations are not idempotent; don't claim otherwise. Don't add Redis, queues, CQRS, or event sourcing for inventory.
- Orders change stock only through `StockOperationsService` (fulfillment issues SALE movements in the order's transaction); there are no reservations.

### Database schema (`apps/api/prisma`)

Read [docs/database-design.md](docs/database-design.md) before changing the schema. Key rules:

- **Tenancy:** every tenant-owned table has `organizationId`. Every query on tenant data must filter by `organizationId`. References between tenant-owned tables use **composite foreign keys** `(organizationId, xId) → X(organizationId, id)`, so each referenced model keeps `@@unique([organizationId, id])`. Follow this pattern for new tables.
- Naming: snake_case tables/columns via `@@map`/`@map`; IDs `@default(uuid(7)) @db.Uuid`; timestamps `@db.Timestamptz(3)`; money `Decimal @db.Decimal(12, 2)` (never Float); quantities `Int`.
- **CHECK constraints live in migration SQL** (Prisma can't express them). When adding a rule, create the migration with `--create-only`, append `ALTER TABLE … ADD CONSTRAINT <table>_<rule>_check …`, then apply it. Document it in database-design.md.
- Deletes are RESTRICT by default. Retire records (`isActive`, `ProductStatus.ARCHIVED`) instead of deleting. `stock_movements` and `activity_logs` are append-only: never update or delete rows.
- Inventory invariant: change `inventory.quantity` only in the same transaction as inserting the matching `StockMovement` (before + delta = after).
- Order lines store `productNameSnapshot`, `skuSnapshot`, and `unitPrice`. Never read historical order data from the current product.
- Prisma with composite relations: nested creates inherit `organizationId` from the parent (don't pass it). Clear optional composite relations by setting the scalar (`categoryId: null`), not with `disconnect`.
- Never modify an applied migration; add a new one. Never point `DB_TEST_NAME` at a real database (tests truncate it).

### Web (`apps/web`)

- Import alias `@/` maps to `src/`.
- **Data flow:** page/component → hook in `src/hooks` (TanStack Query) → endpoint function in `src/api/<resource>.ts` → `apiRequest` in `src/api/http-client.ts`. **Never call `fetch` in components.** Query keys live next to their endpoint functions.
- Env vars: only via `src/lib/env.ts` (add the type to `src/vite-env.d.ts`). Browser-exposed vars must be prefixed `VITE_`.
- Routes: add paths to `src/routes/paths.ts` and the route table in `src/routes/router.tsx`. Pages live in `src/pages`, render inside `AppShell`, start with `<PageHeader>`, and set `<title>{pageTitle('…')}</title>`. App pages go under the `RequireAuth` branch unless explicitly public. Guest-only pages go under `RequireGuest` → `AuthLayout`.
- Organization pages go under `/org/:organizationId` (`OrganizationLayout`) and read `useCurrentOrganization()` (organization, role, `can`, `canAssign`, `canManage`). The URL is the only "active organization"; don't store it in auth state or on the session. `localStorage` `app:lastOrganizationId` is UX only.
- Every page has loading, empty, error, and success states (`LoadingState`, `EmptyState`, `ErrorState` in `components/layout/page-state.tsx`). Show API errors with `apiErrorMessage()`, never raw error details.
- **Auth state** comes only from `useAuth()` (TanStack Query on `GET /auth/me`). Never store tokens or user data in localStorage/sessionStorage/context. `apiRequest` always sends `credentials: 'include'`; the HttpOnly cookie is handled by the browser. After login/register, `setQueryData(authQueryKeys.me, user)`; any 401 resets it to `null` (see `app/query-client.ts`).
- Forms: use `FormField` (label/hint/error wiring) with `Input` / `PasswordInput`. Validate on the client with `AUTH_LIMITS` from `@app/shared`, and treat the server as authoritative.
- Frontend tests that need routing/auth: `renderApp(path)` (real route table) + `mockApi({ 'GET /auth/me': … })` from `src/test/`.
- `RouterProvider` is imported from `react-router/dom`, everything else from `react-router` (v8; there is no `react-router-dom`).
- Styling: follow [docs/design-system.md](docs/design-system.md). Use semantic tokens (`bg-surface`, `text-muted-foreground`, `border-border`, `bg-primary`), never raw palette colors (`bg-white`, `text-slate-500`) in components. Compose with `cn()`. Reuse primitives from `src/components/ui` and `src/components/layout`.
- Keep cva variant definitions in a separate non-component file when exported (for example `button-variants.ts`) so Fast Refresh keeps working.
- Business-specific components belong to their feature phase, not to `components/ui`.

### Personalization & appearance (read [docs/personalization-appearance.md](docs/personalization-appearance.md))

- Appearance is **user-level presentation only**. It never changes navigation, routes, page structure, table columns, permissions, or workflows. Don't add layout customization (draggable/hidden navigation, widgets, page builders, user-defined layouts).
- IDs and defaults live only in `packages/shared/src/appearance.ts` (`THEME_IDS`, `BACKGROUND_EFFECTS`, …, `DEFAULT_APPEARANCE`); display names only in the web app. Never persist localized names. A new id also needs a migration that updates the CHECK constraints of `user_appearances` and `appearance_profiles`.
- API: `/me/appearance` only, always scoped to `@CurrentUser()`; never accept `userId`/`organizationId` in bodies. Another user's profile is `404 APPEARANCE_PROFILE_NOT_FOUND`. Appearance is not tenant data (no `organizationId`, no activity log).
- **`AppearanceProvider` is the only owner** of appearance state (`useAppearance()`), and `applyAppearance()` (`lib/appearance/apply.ts`) the only code that writes tokens to `<html>`. Pages never apply themes or start effects; `BackgroundEffectLayer` is rendered once, by the provider.
- Components must use semantic tokens so every theme works: never raw colors, inline hex/rgb, or fixed pixel spacing/radius. New tokens go into `globals.css` **and** `buildPalette()` (`lib/appearance/themes.ts`) with a contrast rule in `themes.test.ts`. Status colors (success/warning/danger) stay fixed per mode, not per theme.
- The `localStorage` `app:appearance` cache is a presentation-only startup cache (never user or auth data), cleared for guests; the API is the source of truth. The inline script in `index.html` must keep validating cached names and values.
- Effects: one rAF loop (≤ 30 fps), paused when hidden, still frame under `prefers-reduced-motion`, everything removed on change/unmount; canvas `fixed -z-10 pointer-events-none aria-hidden`.
- `renderApp()` includes `AppearanceProvider`, and `mockApi` answers `GET /me/appearance` with the defaults unless a test overrides it. `test/setup.ts` resets `<html>` styles/data attributes and `localStorage` after each test.

## Gotchas

- TypeScript is pinned to `~6.0`: Nest CLI and the Vite toolchain rely on the TS 6 compiler API (TS 7 is the native port).
- Root `package.json` `overrides` pin patched versions of `mysql2` and `deepmerge-ts` (transitive dependencies of the Prisma CLI) to clear security advisories. Re-check them when upgrading Prisma.
- Vite runs on a fixed port (`strictPort`) because the API's CORS allow-list (`API_CORS_ORIGINS`) expects `http://localhost:5173`.
- After editing `.env`, restart both dev servers (Vite only reads env at startup).
- On Windows, a refused connection to `localhost` can take about 2 seconds to fail, so the health-check page may show loading briefly when the API is down.
- Prisma 7 errors: the raw PostgreSQL error is in `error.meta.driverAdapterError.cause` (`originalCode` SQLSTATE, `originalMessage` with the constraint name). CHECK violations are Prisma `P2039`; `ON DELETE RESTRICT` violations are SQLSTATE `23001` (not `23503`).
- `psql` is not on PATH on the dev machine: use `"C:\Program Files\PostgreSQL\18\bin\psql.exe"`.
- Open the web app at `http://localhost:5173` (not `127.0.0.1`), or the session cookie will not be sent to the API.
- Auth rate limits are in-memory, per API process. Each HTTP test creates a fresh app (`createHttpApp()`), which resets the counters.
- Dev-only demo logins (after `npm run db:seed`, password `demo-password-2026`): `owner@`, `admin@`, `staff@`, and `newcomer@demo-trading.example` (no workspace).
- The seed is idempotent and also upgrades older databases (`ensureDemoTeam`). Don't delete user-created accounts in the dev DB; the developer's own account lives there too.
- Prisma ignores partial indexes when diffing, so `organization_members_one_owner_per_organization` survives future `migrate dev` runs. Same for CHECK constraints.
- Supertest: create each request right before awaiting it (it starts and stops a server per request).
- In dev, React StrictMode mounts twice, so you'll see an aborted duplicate `GET /auth/me` in the network tab. That's expected.
