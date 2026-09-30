# Nexora (working name)

A business operations SaaS platform for small and medium-sized businesses: inventory, orders, customers, and reporting.

> **Status: Phase 5 (products & categories).** The repository contains the technical foundation, the multi-tenant PostgreSQL domain schema, email/password **authentication** with database-backed sessions, **multi-tenant workspaces** (organization creation and switching, role-based access control for OWNER / ADMIN / STAFF, team management, invitation links, ownership transfer), and the **product catalog**: categories and products with search, filters, sorting, pagination, and archive/restore. Inventory, warehouses, stock movements, customers, orders, and the dashboard come in later phases.

## Tech stack

| Layer    | Technology                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Web app  | React 19, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS 4                                             |
| API      | NestJS, TypeScript (ESM), Zod (config validation), class-validator (request validation), Argon2id, @nestjs/throttler |
| Database | PostgreSQL (native install on the host), Prisma ORM 7                                                                |
| Tooling  | npm workspaces, oxlint, Prettier, Vitest, Testing Library, GitHub Actions                                            |

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

| Service             | URL                                        |
| ------------------- | ------------------------------------------ |
| Web app             | <http://localhost:5173>                    |
| Sign in / register  | <http://localhost:5173/login>, `/register` |
| System status page  | <http://localhost:5173/health-check>       |
| API health endpoint | <http://localhost:3000/health>             |

Use `http://localhost:5173`, not `127.0.0.1`: the session cookie is only sent when the web app and API share the `localhost` host.

## Authentication

Open <http://localhost:5173>. You are redirected to **Sign in**. Create an account at **/register**, or sign in with a seeded demo account.

> **Development-only credentials.** These exist only in a local database seeded with `npm run db:seed`. They are not production credentials.
>
> | Email                           | Password             | Role in "Demo Trading Co."          |
> | ------------------------------- | -------------------- | ----------------------------------- |
> | `owner@demo-trading.example`    | `demo-password-2026` | OWNER                               |
> | `admin@demo-trading.example`    | `demo-password-2026` | ADMIN                               |
> | `staff@demo-trading.example`    | `demo-password-2026` | STAFF                               |
> | `newcomer@demo-trading.example` | `demo-password-2026` | none (for onboarding / invitations) |

Sessions last 7 days, are stored in PostgreSQL (the token itself only as a SHA-256 hash), and are carried by an HttpOnly `app_session` cookie. Signing out revokes the session on the server. Passwords are hashed with Argon2id. Details: [docs/authentication.md](docs/authentication.md).

| Variable                | Default                 | Purpose                                                        |
| ----------------------- | ----------------------- | -------------------------------------------------------------- |
| `AUTH_SESSION_TTL_DAYS` | `7`                     | Absolute session lifetime (1–90 days)                          |
| `AUTH_COOKIE_NAME`      | `app_session`           | Session cookie name                                            |
| `AUTH_COOKIE_SECURE`    | `false`                 | HTTPS-only cookie; **must be `true` in production** (enforced) |
| `API_CORS_ORIGINS`      | `http://localhost:5173` | Allowed browser origins for credentialed requests (no `*`)     |

Test the authentication flow:

```bash
npm run test      # includes auth unit tests and the login/register/routing UI tests
npm run test:db   # real HTTP tests of /auth/* and session tests against the test database
```

## Organizations, roles, and teams

The app is multi-tenant: each **organization** (shown as a _workspace_) owns its data, and a user can belong to several organizations with a different role in each.

- **Onboarding.** A user without a workspace is sent to `/onboarding` to create one and becomes its **OWNER**.
- **Switching.** Workspaces live at `/org/:organizationId`, so every browser tab can show a different workspace. Switch with the workspace menu in the header, or from `/organizations`.
- **Roles.** OWNER has full control, including ownership transfer. ADMIN renames the workspace, invites STAFF, and removes STAFF. STAFF has read-only access to the workspace settings and team, and works on the catalog (see below).
- **Enforcement.** The API enforces every rule; hidden buttons in the UI are only a convenience. Non-members get "Workspace not found".
- **Team** (`/org/:id/team`): members, role changes, removal with confirmation, ownership transfer, and pending invitations.
- **Invitations.** No email is sent yet. Creating an invitation produces a one-time link (valid 7 days) to copy and share. The invitee signs in with the **invited email** and accepts it at `/invite/:token`.

Try it locally: sign in as `owner@demo-trading.example`, open **Team**, and create an invitation for `newcomer@demo-trading.example`. Then sign out, sign in as the newcomer, and open the link.

| Variable              | Default                 | Purpose                              |
| --------------------- | ----------------------- | ------------------------------------ |
| `INVITATION_TTL_DAYS` | `7`                     | Invitation link lifetime (1–30 days) |
| `WEB_APP_URL`         | `http://localhost:5173` | Base URL used in invitation links    |

Details: [docs/organizations-rbac.md](docs/organizations-rbac.md).

## Products and categories

Each workspace has its own catalog under **Products** and **Categories** (`/org/:id/products`, `/org/:id/categories`).

- **Products** have a name, a SKU (unique within the workspace), an optional description and category, a price and a cost (exact decimals, sent as strings such as `"19.99"`), and a minimum stock level.
- **The list** is searched, filtered (category, status), sorted, and paginated on the server. The current view is kept in the URL, so reloads and shared links show the same results.
- **Archive instead of delete.** Products are never deleted. Archiving (with confirmation) keeps them for history, and they can be restored. Archived products can't be edited until restored.
- **Categories** show how many products (active and archived) use them. A category that is in use can't be deleted: move its products first.
- **Who can do what.** Everyone creates and edits products and categories. Only OWNER and ADMIN archive/restore products and delete categories.

Try it locally with the seeded demo workspace: sign in as `staff@demo-trading.example` (you can add and edit, but not archive) and as `admin@demo-trading.example` (archive, restore, delete unused categories).

Details: [docs/products-categories.md](docs/products-categories.md).

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
- [Authentication](docs/authentication.md)
- [Organizations & RBAC](docs/organizations-rbac.md)
- [Products & categories](docs/products-categories.md)
- [Design system](docs/design-system.md)
- [CLAUDE.md](CLAUDE.md): conventions for AI-assisted development
