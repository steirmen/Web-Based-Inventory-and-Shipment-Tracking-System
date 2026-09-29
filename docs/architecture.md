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
  database/          Global DatabaseModule exposing PrismaService
  health/            GET /health
  generated/prisma/  Prisma client output (git-ignored, created by `prisma generate`)
prisma/
  schema.prisma      Datasource + generator only in Phase 1 (no models)
prisma.config.ts     Prisma CLI config; builds the connection URL from DB_* vars
test/                HTTP-level (e2e) tests with Supertest
```

- **Configuration**: `ConfigModule` loads the repository-root `.env` and validates it with the Zod schema in `config/env.ts`. The app refuses to start with invalid config. Read values with `ConfigService<Env, true>` and `{ infer: true }`.
- **Request validation**: global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). DTOs use `class-validator` decorators.
- **Database**: `PrismaService` extends the generated `PrismaClient` using the `@prisma/adapter-pg` driver adapter (Prisma 7). It connects lazily, so the API still starts when PostgreSQL is down.
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
  components/layout/ Page-structure primitives (Container, PageHeader, BrandMark)
  layouts/           Route layouts (AppShell)
  pages/             Route components
  routes/            Route table (router.tsx) and path constants (paths.ts)
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

Components never call `fetch`. The API base URL comes only from `VITE_API_BASE_URL` via `lib/env.ts`.

### Routes (Phase 1)

| Path            | Page                                      |
| --------------- | ----------------------------------------- |
| `/`             | Project foundation overview               |
| `/health-check` | Technical frontend → API → database check |
| `*`             | 404                                       |

## Environment

A single `.env` at the repository root serves every app:

- The API reads it via `ConfigModule` (path resolved in `config/env.ts`).
- Prisma CLI reads it via `dotenv` in `prisma.config.ts`.
- Vite reads it via `envDir` and exposes only `VITE_*` variables to the browser.

## Testing

| Workspace | Runner                   | Environment | Location                                                  |
| --------- | ------------------------ | ----------- | --------------------------------------------------------- |
| api       | Vitest                   | node        | `src/**/*.spec.ts` (unit), `test/**/*.e2e-spec.ts` (HTTP) |
| web       | Vitest + Testing Library | jsdom       | `src/**/*.test.ts(x)`                                     |

Tests do not need a database or a `.env` file: API tests inject env values via `vitest.config.ts` and mock `PrismaService`; web tests stub `fetch` and `VITE_API_BASE_URL`.
