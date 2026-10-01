# Timestamps & time zones

**Convention:** every persisted timestamp (`timestamptz`) holds the **real UTC instant**, and every database session runs in **UTC**. "Days" (dashboard ranges, report periods, date filters on lists) are local calendar days in an IANA time zone the client sends, converted to UTC instants by one shared helper on each side. Nothing in the code adds or subtracts hours.

This was established in Phase 8.1. Before it, stored instants were shifted by the database server's UTC offset (3 hours on the dev machine). This document records the root cause, the fix, and how it was verified.

## Root cause

Prisma 7 talks to PostgreSQL through the driver adapter `@prisma/adapter-pg` (7.10.0). The adapter **assumes the session runs in UTC**:

- **Writing** (`formatDateTime` in `node_modules/@prisma/adapter-pg/dist/index.mjs`): a JavaScript `Date` is sent as zone-less UTC wall-clock text, for example `2026-09-24 11:00:00` for `2026-09-24T11:00:00Z`. PostgreSQL interprets zone-less text for a `timestamptz` in the **session** time zone.
- **Reading** (`normalize_timestamptz` in the same file): the printed offset of a `timestamptz` is replaced with `+00:00` (`2026-09-24 11:00:00+03` becomes `2026-09-24T11:00:00+00:00`).

The PostgreSQL server's default `TimeZone` (in `postgresql.conf`, set by the Windows installer) is `Europe/Istanbul`, and nothing overrode it per database or per connection. So:

| Value                                                                                | Stored instant                 | Read through Prisma            |
| ------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------ |
| Written by Prisma (`@default(now())` and `@updatedAt` are filled by Prisma, not SQL) | 3 h **early** (11:00 → 08:00Z) | Correct: the two errors cancel |
| Written by PostgreSQL itself (`now()`; only `order_number_sequences.updated_at`)     | Correct                        | 3 h **late**                   |

Through Prisma the application looked right, which is why the bug survived several phases. Everything that used the stored instant directly was wrong: raw SQL with `AT TIME ZONE` or `date_trunc`, comparisons with `now()`, `psql`, and backups read by other tools. Phase 8A worked around it in the dashboard (`localCreatedAt()`: `(created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'`), and the orders and stock-movement lists filtered by UTC days while the dashboard used local days, so dashboard links could show different counts near midnight.

### Evidence (dev database, before → after the fix)

Snapshots of the same rows, taken with `psql` (`extract(epoch …)`, `::text`) and through the adapter:

| Row                                 | Stored text before           | Stored text after            | Epoch change | Prisma/API value (both)                       |
| ----------------------------------- | ---------------------------- | ---------------------------- | -----------: | --------------------------------------------- |
| `orders` SO-1008 `created_at`       | `2026-09-24 11:00:00+03`     | `2026-09-24 11:00:00+00`     |    +10,800 s | `2026-09-24T11:00:00.000Z`                    |
| `organizations` (demo) `created_at` | `2026-09-01 08:00:00+03`     | `2026-09-01 08:00:00+00`     |    +10,800 s | `2026-09-01T08:00:00.000Z`                    |
| `sessions.expires_at` (sample)      | `2026-10-08 07:36:29.429+03` | `2026-10-08 07:36:29.429+00` |    +10,800 s | `2026-10-08T07:36:29.429Z`                    |
| `order_number_sequences.updated_at` | `2026-10-01 04:43:05.714+03` | `2026-10-01 01:43:05.714+00` |          0 s | before `04:43:05Z` (wrong), after `01:43:05Z` |

Every Prisma-written column moved by exactly the zone's offset, values seen by the application did not change, the one PostgreSQL-written column kept its instant (and Prisma now reads it correctly), and row counts were unchanged.

## Fix

Migration `20261001120000_store_timestamps_in_utc` (data migration, no schema change):

1. For every timestamp column Prisma writes (users, sessions, organizations, members, invitations, categories, products, warehouses, inventory, stock movements, customers, orders, order items, activity logs, appearance tables), reinterpret the stored wall-clock time of the zone it was written in as UTC: `col = (col AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'`. The zone is the migration session's own zone, which is the zone every application connection used, because they all used the database default. On a database whose sessions already run in UTC this is a no-op.
2. `order_number_sequences.updated_at` is **not** converted (PostgreSQL's `now()` already stored the right instant), and `_prisma_migrations` is left to Prisma.
3. `ALTER DATABASE <current database> SET "TimeZone" TO 'UTC'`: every new session (API, tests, seed, migrations, psql) now runs in UTC, matching the adapter's assumption.

`stock_movements` and `activity_logs` are append-only for the application. This one-time repair keeps every row and only corrects the stored instant.

**Why no per-connection `options=-c TimeZone=UTC`:** the conversion must run in the zone the data was written in. If the API (or the CLI) forced UTC before the migration ran, it would write correct instants next to shifted ones, and the migration could no longer tell them apart. The database-level setting changes the zone in the same step as the repair.

### Applying it safely

- **Stop the API before `npm run db:deploy`** (or `db:migrate`) on a database that predates the fix, and **restart both dev servers afterwards**. Existing pooled connections keep the old session zone until they reconnect.
- The migration is not destructive: no reset, no recreated database, and no rows added or removed. Test databases get it through the normal test setup (`migrate deploy`).
- `ALTER DATABASE` needs the database owner (the local `postgres` user is).

## Local days

One definition, used everywhere a client sends dates:

- API: `apps/api/src/common/time/local-days.ts`. `startOfLocalDay`, `localDay`, `formatLocalDateTime`, `isKnownTimeZone`, and `instantRange(from, to, timeZone = 'UTC')`. A date-only `from` is 00:00 local time; a date-only `to` includes the whole local day (`< next day 00:00 local`); a date-time bound is that exact instant. DST-aware; unknown zones and numeric offsets are `400 VALIDATION_ERROR`.
- Web: `apps/web/src/lib/local-days.ts`. `browserTimeZone()`, `timeZoneParam()` (URL validation), day formatting for ranges and chart buckets.

Who uses it:

| Feature                             | Parameters                             |
| ----------------------------------- | -------------------------------------- |
| Dashboard summary (ranges, buckets) | `range`, `from`, `to`, `timeZone`      |
| Sales and orders reports, CSV times | `range`, `from`, `to`, `timeZone`      |
| `GET …/orders` date filter          | `from`, `to`, `timeZone` (default UTC) |
| `GET …/stock-movements` date filter | `from`, `to`, `timeZone` (default UTC) |

The web app sends the browser's zone. Dashboard links to the orders list carry `from`, `to`, **and** `timeZone`, so the list shows exactly the orders counted on the dashboard. Display is unchanged: the browser formats ISO instants in the viewer's zone.

SQL that buckets by local day uses the stored instant directly: `date_trunc('day', created_at AT TIME ZONE $1)`.

## Rules

- Never add or subtract hours to "fix" a time. If a time looks shifted, check the session zone (`SHOW TimeZone;` must say `UTC`).
- Take "days" from the client only together with an IANA `timeZone`, and convert them with `instantRange`/`startOfLocalDay`.
- New timestamp columns need nothing special: Prisma writes correct instants into a UTC session. Columns filled by `DEFAULT now()` are also correct.
- A new database gets the UTC session setting from this migration. A restored dump of another database should be checked with `SHOW TimeZone`.

## Tests

- `apps/api/test/database/timestamps.db-spec.ts`: UTC session; an exact instant stored and returned; API time vs PostgreSQL `now()`; a `DEFAULT now()` value read through Prisma; activity-log and session-expiry instants; orders at 21:30Z and 02:30Z around a day boundary, counted the same in UTC, `Europe/Istanbul`, and `America/New_York` by the dashboard KPIs, recent orders, the sales report, and the orders list; default UTC days; stock movements with a time zone; unknown zone and reversed range (400); recent orders limited to the period.
- `apps/api/src/common/time/local-days.spec.ts`: `instantRange` per zone, the 23:30 UTC / 02:30 Istanbul boundary, a DST day, date-time bounds, open ranges, errors.
- Web: `pages/orders-page.test.tsx` ("OrdersPage dates"), `pages/dashboard-page.test.tsx` (links carry `timeZone`), `pages/stock-movements-page.test.tsx`.
