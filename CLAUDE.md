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
- **Later phases:** warehouses, inventory, stock movements, customers, orders, dashboard/reporting (APIs and UI). Password reset, email verification, email delivery, OAuth, and 2FA are also not built. Do not add these, or placeholder routes or modules, until asked.

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
- Do not implement inventory, warehouse, stock movement, customer, order, or dashboard functionality until those phases.

### Products & categories (read [docs/products-categories.md](docs/products-categories.md))

- **Money is a decimal string end to end** (`"19.99"`): validate with `MONEY_PATTERN`, store as `Decimal`, return `toFixed(2)`, compare with `Decimal#equals`. Never `Number()`/`parseFloat` a price or cost, in the API or the web app (`formatMoney` passes the string to `Intl`).
- Products are **archived, never deleted**; status changes only via `…/archive` and `…/restore`. Edits of ARCHIVED products are rejected (`PRODUCT_ARCHIVED`).
- List endpoints: whitelist sort fields (never pass a client string as a column), always add `id` as the tie-breaker, cap `pageSize` (100), and escape `%`, `_`, `\` in `contains` searches.
- A `categoryId` from a client (body or filter) must be looked up **with** the organization id; a foreign one is `422 PRODUCT_CATEGORY_NOT_FOUND`.
- Frontend catalog query keys live under `organizationKeys.detail(organizationId)` (`catalogKeys` in `src/api/catalog.ts`); invalidate by organization after mutations. `OrganizationLayout` keys the page outlet by organization id, so don't rely on page state surviving a workspace switch.
- Confirm destructive or meaningful actions with `ConfirmDialog`/`Dialog` (`components/ui`), not `window.confirm`.

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
