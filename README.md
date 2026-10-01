# Nexora (working name)

A business operations SaaS platform for small and medium-sized businesses: inventory, orders, customers, and reporting.

> **Status: Phase 9 (UI/UX polish and frontend performance).** The repository contains the technical foundation, the multi-tenant PostgreSQL domain schema, email/password **authentication** with database-backed sessions, **multi-tenant workspaces** (organization creation and switching, role-based access control for OWNER / ADMIN / STAFF, team management, invitation links, ownership transfer), the **product catalog** (categories and products with search, filters, sorting, pagination, and archive/restore), **warehouses & inventory** (warehouses with archive/restore, stock per product and warehouse with low-stock states, stock operations, and an immutable stock movement history), **customers & orders** (sales orders whose fulfillment deducts stock), **personal appearance settings**, the **dashboard** (the workspace overview: organization-scoped KPIs, sales and order charts, top products, recent orders, and stock summaries), and **reports** (sales, orders, and inventory with filters, sorting, pagination, and CSV export). The interface uses one design system throughout (workspace sidebar, consistent tables, forms, dialogs, and feedback; responsive down to 375px), and each page is downloaded on demand.

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
- **Roles.** OWNER has full control, including ownership transfer. ADMIN renames the workspace, invites STAFF, and removes STAFF. STAFF has read-only access to the workspace settings and team, works on the catalog, and handles day-to-day stock (see below).
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

## Warehouses and inventory

Each workspace tracks stock per product and warehouse under **Inventory**, **Warehouses**, and **Stock movements** (`/org/:id/inventory`, `/org/:id/warehouses`, `/org/:id/stock-movements`).

- **Warehouses** have a name, a code (unique within the workspace, e.g. `MAIN`, fixed after creation), and an address. They are archived instead of deleted and can be restored; an archived warehouse keeps its stock and history, but no stock moves in or out of it until it is restored.
- **Inventory** shows the quantity on hand of each product in each warehouse, searched, filtered (warehouse, stock level), sorted, and paginated on the server.
- **Low stock.** Each row is **Out of stock** (0), **Low stock** (at or below the product's minimum stock), or **In stock**, shown as text badges.
- **Stock operations:** **Receive** (purchase), **Issue** (sale, recorded by hand until orders exist), **Damage** (write-off with a required reason), **Adjust** (set a counted quantity; the difference is recorded), and **Transfer** between two warehouses. Stock can never go negative, archived products and warehouses take no new stock, and every operation runs in one database transaction with row locks, so concurrent operations can't oversell or lose updates.
- **Transfers** are atomic: the source decreases and the destination increases together, recorded as two linked movements (transfer out + transfer in) with the same transfer id.
- **Movement history** is a permanent, read-only record of every change: type, signed change, quantity before and after, who, when, and why. Mistakes are corrected with a new movement, never by editing history. Filter by warehouse, product, type, and date, or open both legs of one transfer.
- **Who can do what.** Everyone sees warehouses, stock, and history, and can receive, issue, and record damage. Only OWNER and ADMIN manage warehouses, adjust counts, and transfer stock. The API enforces this; the UI only hides what a role can't do.

Try it locally with the seeded demo workspace: `MAIN`, `EAST`, and `NORTH` hold stock (the Wireless Mouse is low in MAIN and NORTH and out of stock in EAST), and the archived `OLD` depot shows how history survives archiving. Sign in as `staff@demo-trading.example` (receive, issue, damage) and `admin@demo-trading.example` (also adjust, transfer, and manage warehouses).

Stock operations are not idempotent: resending a request records it again (the UI prevents double submission). Details: [docs/warehouses-inventory.md](docs/warehouses-inventory.md).

## Customers and orders

**Customers** are the people and businesses a workspace sells to (search, archive/restore; archived customers keep their orders). **Orders** get a number per workspace (`SO-1001`, …), one fulfilment warehouse, and lines that keep the product name, SKU, and price they were added with.

- Status workflow: Draft → Confirmed → Processing → Shipped → Completed; Draft and Confirmed orders can be cancelled.
- **Processing** deducts stock: one SALE stock movement per line, all or nothing. If any line is short, nothing is deducted and the order stays Confirmed.
- Shipping, completing, and cancelling never change stock. Staff can create, edit, and confirm orders; owners and admins also process, ship, complete, and cancel them.

Details: [docs/customers-orders.md](docs/customers-orders.md).

## Personalization and appearance

Each user can change how Nexora looks for them under **Appearance** (palette icon next to your name, `/settings/appearance`).

- **Mode and themes.** Light or dark, ten designed themes (Default, Ocean, Forest, Sunset, Graphite, Plum, Paper, Mint, Lavender, Rose), or a **Custom** theme from one accent color and a tone. Colors are adjusted automatically when needed so text, buttons, and focus outlines stay readable.
- **Background effects.** Off, rain, snow, fireflies, starry night, autumn leaves, cherry blossoms, soft lights, or aurora, at low, medium, or high intensity. Effects stay behind the content and never block clicks; with the system's "reduce motion" setting they are shown as a still image.
- **Interface.** Compact, comfortable, or spacious density; sharp, medium, or round corners; small, default, or large text.
- **Live preview.** Changes show immediately; **Save** keeps them, **Cancel** goes back, **Reset to default** restores the original look.
- **Saved profiles.** Save up to 12 named looks (for example "Night work") and switch with one click.
- **Personal, not per workspace.** Your appearance is stored on the server with your account, so it follows you across workspaces, reloads, and devices. Other users never see it.

Only the presentation changes: navigation, pages, and workflows are the same for everyone. Details: [docs/personalization-appearance.md](docs/personalization-appearance.md).

## Dashboard (workspace overview)

Opening a workspace shows its **Overview**: KPI cards (sales, orders, customers, products, units in stock, low stock), a sales-over-time chart (revenue or orders, with a data table), orders by status, an inventory and warehouse summary, the top 5 products, and the 5 newest orders. Pick a range (today, last 7 or 30 days, this month, previous month, this year, or custom dates); it is kept in the URL, so you can share or reload it. Every section links to the detailed page (for example, low stock opens the inventory filtered to low stock). The overview follows your appearance settings and only reads data.

### Dashboard API

`GET /organizations/:id/dashboard/summary` returns a workspace's dashboard numbers in one response, computed from its real data on every request:

- **Sales** (realized revenue: only orders whose stock was deducted — processing, shipped, completed — at the prices on the order lines), **orders** (every status), realized orders, and new customers, each compared with the previous period of the same length.
- **Current state:** active/archived customers and products, units in stock, low-stock and out-of-stock items, and every warehouse with its own stock summary.
- **Order status distribution**, **top 5 products** by units sold, and a **time series** of orders and revenue (daily, weekly, or monthly depending on the range, with empty periods as zeros).
- **Ranges:** today, last 7 or 30 days (default), this month, previous month, this year, or a custom range of up to 366 days, counted in the time zone you pass (`timeZone=Europe/Istanbul`; default UTC).

Every member (owner, admin, staff) can read it; it never changes data. Details: [docs/dashboard-reporting.md](docs/dashboard-reporting.md).

## Reports

Under **Reports** (`/org/:id/reports`) every member can open three reports and download them as CSV:

- **Sales**: realized sales (processing, shipped, and completed orders) with units and revenue at the prices on the order, filterable by date range, status, warehouse, customer, category, product, and a search across order numbers, customers, and products.
- **Orders**: every order created in the period with its status and total, filterable by date range, status, warehouse, customer, and search.
- **Inventory**: current stock per product and warehouse with its stock status (in stock, low stock, out of stock), filterable by warehouse, category, status, and search; archived products and warehouses on request.

Filters, sorting, and pages run on the server and are kept in the URL. **Export CSV** downloads exactly the filtered report (up to 10,000 rows; narrow the filters for larger exports). Exported cells that look like spreadsheet formulas are neutralized. Reports use the same definitions as the dashboard, so the numbers agree. Details: [docs/dashboard-reporting.md](docs/dashboard-reporting.md#reports).

## Commands

Run from the repository root.

| Command                                   | Description                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                             | Start shared (watch), API, and web app together                                        |
| `npm run dev:api` / `npm run dev:web`     | Start one app                                                                          |
| `npm run build`                           | Production build of every workspace                                                    |
| `npm run test`                            | Run unit and HTTP tests (no database needed)                                           |
| `npm run test:db`                         | Run database integration tests against `DB_TEST_NAME`                                  |
| `npm run test:e2e`                        | Real-browser end-to-end tests (Playwright + installed Edge) against `app_e2e_test`     |
| `npm run db:verify`                       | Read-only integrity audit of the database in `DB_NAME`                                 |
| `npm run check:build`                     | Review the web production build (no source maps or secrets, lazy pages, bundle budget) |
| `npm run lint`                            | Lint all workspaces (oxlint)                                                           |
| `npm run typecheck`                       | Type-check all workspaces                                                              |
| `npm run format` / `npm run format:check` | Format with Prettier / verify formatting                                               |
| `npm run validate`                        | Format check, lint, typecheck, test, build, build review                               |
| `npm run db:check`                        | Verify Prisma can reach PostgreSQL                                                     |
| `npm run db:generate`                     | Regenerate the Prisma client                                                           |
| `npm run db:migrate`                      | Create/apply migrations (`prisma migrate dev`)                                         |
| `npm run db:deploy`                       | Apply pending migrations (`prisma migrate deploy`)                                     |
| `npm run db:status`                       | Show migration status                                                                  |
| `npm run db:seed`                         | Load the development demo data (idempotent)                                            |
| `npm run db:validate`                     | Validate the Prisma schema                                                             |
| `npm run db:studio`                       | Open Prisma Studio                                                                     |

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
- [Warehouses & inventory](docs/warehouses-inventory.md)
- [Customers & orders](docs/customers-orders.md)
- [Personalization & appearance](docs/personalization-appearance.md)
- [Dashboard & reporting](docs/dashboard-reporting.md)
- [Timestamps & time zones](docs/timezone.md)
- [Security](docs/security.md)
- [Testing & quality gate](docs/testing.md)
- [Design system](docs/design-system.md)
- [CLAUDE.md](CLAUDE.md): conventions for AI-assisted development
