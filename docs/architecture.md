# Architecture

## Monorepo layout

npm workspaces, no additional build orchestrator.

```text
apps/
  api/        NestJS HTTP API (ESM, TypeScript) + Prisma
  web/        React SPA (Vite, React Router, TanStack Query, Tailwind CSS)
packages/
  shared/     Framework-free types shared by api and web (compiled to dist/)
docs/         Project documentation
.github/      CI workflow
```

Dependency direction: `api → shared` and `web → shared`. The apps never import from each other.

## Backend (`apps/api`)

```text
src/
  main.ts            Bootstrap: create app, apply configureApp(), listen
  app.setup.ts       Cross-cutting HTTP setup (CORS, ValidationPipe, shutdown hooks) — reused by e2e tests
  app.module.ts      Root module: ConfigModule + feature modules
  config/            Env schema (Zod) and helpers; the only place that reads raw env vars
  common/errors/     AppException, ApiExceptionFilter (uniform error body), validation errors
  database/          Global DatabaseModule exposing PrismaService
  auth/              Register/login/logout/me, sessions, Argon2id passwords, global SessionAuthGuard
  organizations/     Organizations, members, invitations; OrganizationAccessGuard + @RequirePermissions (RBAC)
  catalog/           Categories and products (list/search/sort/paginate, archive/restore); see products-categories.md
  activity/          recordActivity(): audit entries written inside the caller's transaction
  health/            GET /health (public)
  generated/prisma/  Prisma client output (git-ignored, created by `prisma generate`)
prisma/
  schema.prisma      Multi-tenant domain model (see docs/database-design.md)
  migrations/        SQL migrations (CHECK constraints are hand-written here)
  seed.ts            Development seed (`npm run db:seed`)
prisma.config.ts     Prisma CLI config; builds the connection URL from DB_* vars
test/                HTTP-level (e2e) tests with Supertest
test/database/       Database integration tests against the test database
```

- **Configuration**: `ConfigModule` loads the repository-root `.env` and validates it with the Zod schema in `config/env.ts`. The app refuses to start with invalid config. Read values with `ConfigService<Env, true>` and `{ infer: true }`.
- **Request validation**: global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). DTOs use `class-validator` decorators. Failures become `400 VALIDATION_ERROR` with per-field `details`.
- **Errors**: every error response has the shape `{ statusCode, code, message, details? }` (`ApiErrorBody` in `@app/shared`), produced by `ApiExceptionFilter`.
- **Authentication**: a global `SessionAuthGuard` requires a valid session cookie on every route not marked `@Public()`. See [authentication.md](authentication.md).
- **Organizations & RBAC**: routes under `/organizations/:organizationId` are guarded by `OrganizationAccessGuard`, which verifies membership (404 for non-members) and the handler's `@RequirePermissions` (403). See [organizations-rbac.md](organizations-rbac.md).
- **Database**: `PrismaService` extends the generated `PrismaClient` using the `@prisma/adapter-pg` driver adapter (Prisma 7). It connects lazily, so the API still starts when PostgreSQL is down. The schema, tenancy model, and constraints are described in [database-design.md](database-design.md).
- **Feature modules**: one folder per domain (`src/<domain>/`) containing its module, controller, service, DTOs, and tests.

### `GET /health`

Always responds `200` while the process is alive:

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00.000Z",
  "uptime": 42,
  "checks": { "database": "up" }
}
```

`status` becomes `"degraded"` and `checks.database` becomes `"down"` if Prisma cannot run `SELECT 1`. The response type (`HealthResponse`) lives in `@app/shared`.

## Frontend (`apps/web`)

```text
src/
  main.tsx           Entry: global CSS, font, <App />
  app/               App root, providers, QueryClient configuration
  api/               HTTP client + one module per backend resource (endpoint functions, query keys)
  hooks/             TanStack Query hooks wrapping api/ functions
  components/ui/     Design-system primitives (Button, Input, Card, ...)
  components/layout/ Page-structure primitives (Container, PageHeader, page states, PaginationBar)
  components/<feature>/ Feature components (organization, team, products, categories)
  layouts/           Route layouts (AppShell for the app, AuthLayout for sign-in/register)
  pages/             Route components
  routes/            Route table (router.tsx), path constants (paths.ts), RequireAuth/RequireGuest guards
  lib/               Framework-agnostic helpers (cn, env, app-config)
  styles/            globals.css: Tailwind entry + design tokens
  test/              Test setup and render helpers
```

### Data flow

```text
component (pages/*)
   ↓ uses
hook (hooks/use-*.ts)            TanStack Query: caching, loading/error state
   ↓ calls
endpoint function (api/<resource>.ts)
   ↓ calls
apiRequest (api/http-client.ts)  base URL from env, JSON, timeout, ApiError
   ↓
backend
```

Components never call `fetch`. The API base URL comes only from `VITE_API_BASE_URL` via `lib/env.ts`. Every request is sent with `credentials: 'include'`, so the browser attaches the HttpOnly session cookie. Authentication state is the `['auth', 'me']` query (`hooks/use-auth.ts`).

### Routes

| Path                            | Access                | Page                                                                       |
| ------------------------------- | --------------------- | -------------------------------------------------------------------------- |
| `/`                             | authenticated         | Redirects to onboarding, the last or only workspace, or the workspace list |
| `/onboarding`                   | authenticated         | Create a workspace                                                         |
| `/organizations`                | authenticated         | The user's workspaces                                                      |
| `/org/:organizationId`          | member (API-verified) | Workspace home                                                             |
| `/org/:organizationId/team`     | member                | Team, invitations, roles, ownership                                        |
| `/org/:organizationId/settings` | member                | Workspace settings                                                         |
| `/login`, `/register`           | guest only            | Sign in, create account                                                    |
| `/invite/:token`                | public                | View and accept an invitation                                              |
| `/health-check`                 | public                | Technical frontend → API → database check                                  |
| `*`                             | public                | 404                                                                        |

## Environment

A single `.env` at the repository root serves every app:

- The API reads it via `ConfigModule` (path resolved in `config/env.ts`).
- Prisma CLI reads it via `dotenv` in `prisma.config.ts`.
- Vite reads it via `envDir` and exposes only `VITE_*` variables to the browser.

## Testing

| Workspace | Runner                   | Environment | Location                                                  |
| --------- | ------------------------ | ----------- | --------------------------------------------------------- |
| api       | Vitest                   | node        | `src/**/*.spec.ts` (unit), `test/**/*.e2e-spec.ts` (HTTP) |
| api (db)  | Vitest                   | node        | `test/database/**/*.db-spec.ts`                           |
| web       | Vitest + Testing Library | jsdom       | `src/**/*.test.ts(x)`                                     |

`npm run test` does not need a database or a `.env` file: API tests inject env values via `vitest.config.ts` and mock `PrismaService`; web tests stub `fetch` and `VITE_API_BASE_URL`.

`npm run test:db` (config: `apps/api/vitest.db.config.ts`) runs against a real PostgreSQL test database (`DB_TEST_NAME`, default `app_test`), which it creates and migrates automatically. See [database-design.md](database-design.md#testing).
