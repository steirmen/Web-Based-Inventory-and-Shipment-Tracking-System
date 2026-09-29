# Nexora (working name)

A business operations SaaS platform for small and medium-sized businesses: inventory, orders, customers, and reporting.

> **Status: Phase 1 (foundation).** This repository currently contains the technical foundation only: monorepo, API, web app, design system, database connectivity, tooling, and tests. Product features are built in later phases.

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

# 3. Verify the database connection
npm run db:check

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
| `npm run test`                            | Run all tests                                                  |
| `npm run lint`                            | Lint all workspaces (oxlint)                                   |
| `npm run typecheck`                       | Type-check all workspaces                                      |
| `npm run format` / `npm run format:check` | Format with Prettier / verify formatting                       |
| `npm run validate`                        | Everything CI runs: format check, lint, typecheck, test, build |
| `npm run db:check`                        | Verify Prisma can reach PostgreSQL                             |
| `npm run db:generate`                     | Regenerate the Prisma client                                   |
| `npm run db:migrate`                      | Create/apply migrations (`prisma migrate dev`)                 |
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
- [Design system](docs/design-system.md)
- [CLAUDE.md](CLAUDE.md): conventions for AI-assisted development
