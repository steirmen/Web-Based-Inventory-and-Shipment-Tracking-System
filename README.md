# Nexora (working name)

A business operations SaaS platform for small and medium-sized businesses: inventory, orders, customers, and reporting.

> **Status: Phase 2 (database & domain model).** The repository contains the technical foundation (monorepo, API, web app, design system, tooling, tests) and the multi-tenant PostgreSQL domain schema with migrations, seed data, and database integration tests. Authentication, business APIs, and business UI come in later phases.

## Tech stack

| Layer    | Technology                                                                              |
| -------- | --------------------------------------------------------------------------------------- |
| Web app  | React 19, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS 4                |
| API      | NestJS, TypeScript (ESM), Zod (config validation), class-validator (request validation) |
| Database | PostgreSQL (native install on the host), Prisma ORM 7                                   |
| Tooling  | npm workspaces, oxlint, Prettier, Vitest, Testing Library, GitHub Actions               |

## Prerequisites

- **Node.js 22.22+** (24 LTS recommended, see `.nvmrc`) and npm 10+
- **PostgreSQL 16+** installed and running locally
- Git

For PostgreSQL installation on Windows and database creation, see [docs/local-development.md](docs/local-development.md).

## Quick start

```bash
# 1. Configure environment (then edit DB_* values in .env)
cp .env.example .env

# 2. Install dependencies (also builds the shared package and generates the Prisma client)
npm install

# 3. Verify the database connection, apply migrations, load demo data
npm run db:check
npm run db:deploy
npm run db:seed

# 4. Start API + web app
npm run dev
```

| Service             | URL                                  |
| ------------------- | ------------------------------------ |
| Web app             | <http://localhost:5173>              |
| System status page  | <http://localhost:5173/health-check> |
| API health endpoint | <http://localhost:3000/health>       |

## Commands

Run from the repository root.

| Command                                   | Description                                                    |
| ----------------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                             | Start shared (watch), API, and web app together                |
| `npm run dev:api` / `npm run dev:web`     | Start one app                                                  |
| `npm run build`                           | Production build of every workspace                            |
| `npm run test`                            | Run unit and HTTP tests (no database needed)                   |
| `npm run test:db`                         | Run database integration tests against `DB_TEST_NAME`          |
| `npm run lint`                            | Lint all workspaces (oxlint)                                   |
| `npm run typecheck`                       | Type-check all workspaces                                      |
| `npm run format` / `npm run format:check` | Format with Prettier / verify formatting                       |
| `npm run validate`                        | Everything CI runs: format check, lint, typecheck, test, build |
| `npm run db:check`                        | Verify Prisma can reach PostgreSQL                             |
| `npm run db:generate`                     | Regenerate the Prisma client                                   |
| `npm run db:migrate`                      | Create/apply migrations (`prisma migrate dev`)                 |
| `npm run db:deploy`                       | Apply pending migrations (`prisma migrate deploy`)             |
| `npm run db:status`                       | Show migration status                                          |
| `npm run db:seed`                         | Load the development demo data (idempotent)                    |
| `npm run db:validate`                     | Validate the Prisma schema                                     |
| `npm run db:studio`                       | Open Prisma Studio                                             |

Run a command in a single workspace with `-w`, for example `npm run test -w @app/web`.

## Repository structure

```text
apps/
  api/          NestJS API + Prisma             → @app/api
  web/          React single-page application   → @app/web
packages/
  shared/       Types shared by API and web     → @app/shared
docs/           Architecture, design system, local setup
.github/        CI workflow
.env.example    Documented environment variables
```

## Documentation

- [Local development & PostgreSQL setup](docs/local-development.md)
- [Architecture](docs/architecture.md)
- [Database design](docs/database-design.md)
- [Design system](docs/design-system.md)
- [CLAUDE.md](CLAUDE.md): conventions for AI-assisted development
