# CLAUDE.md

Guidance for Claude Code (and other contributors) working in this repository.

## Project

Business operations SaaS for SMBs. The product name ("Nexora") is a **working name**: keep it in `apps/web/src/lib/app-config.ts` and `apps/web/index.html` only, and never in package names, module names, or database identifiers. Packages use the neutral `@app/*` scope.

## Phased delivery (important)

Work is delivered in explicit phases. **Only implement what the current phase asks for, and never start the next phase automatically.**

- **Phase 1 (done): foundation.** Monorepo, NestJS API with `GET /health`, React app with `/` and `/health-check`, design-system primitives, API client, Prisma + PostgreSQL connectivity, tooling, tests, CI.
- **Phase 2 (done): database & domain model.** Prisma models and migration for User, Organization, OrganizationMember, Category, Product, Warehouse, Inventory, StockMovement, Customer, Order, OrderItem, and ActivityLog; CHECK constraints; dev seed; database integration tests. **Schema only: no services, APIs, or UI for these domains yet.**
- **Later phases:** authentication, RBAC enforcement, and the APIs/UI for products, warehouses, inventory, customers, orders, dashboard/reporting, and activity logs. Do not add these, or placeholder routes or modules, until asked.

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
- Cross-cutting HTTP setup (pipes, CORS, and so on) goes in `src/app.setup.ts`.
- Database: inject `PrismaService` (global `DatabaseModule`). Prisma 7 specifics:
  - Client is generated into `src/generated/prisma` (git-ignored). Import from `../generated/prisma/client.js`.
  - Connection URL is built from `DB_*` vars in `prisma.config.ts` (CLI) and `prisma.service.ts` (runtime), not from `DATABASE_URL`.
  - Uses the `@prisma/adapter-pg` driver adapter.
- Never run destructive Prisma commands (`migrate reset`, `db push --force-reset`, `--accept-data-loss`) without explicit user approval.

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
- Routes: add paths to `src/routes/paths.ts` and the route table in `src/routes/router.tsx`. Pages live in `src/pages`, render inside `AppShell`, start with `<PageHeader>`, and set `<title>{pageTitle('…')}</title>`.
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
