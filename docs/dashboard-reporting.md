# Dashboard & reporting

The dashboard is the **workspace overview** (`/org/:organizationId`): a read-only, organization-scoped endpoint (Phase 8A) aggregates the organization's real data (orders, sales, customers, products, inventory, warehouses), and the overview page (Phase 8B) presents it. Phase 8C adds [reports](#reports) (sales, orders, inventory) with CSV export, built on the same definitions. The typed contract is in `@app/shared` (`packages/shared/src/dashboard.ts`); the page is described under [Dashboard UI](#dashboard-ui).

Nothing is cached, precomputed, or invented: every number is read from the database on request.

## Endpoint

```http
GET /organizations/:organizationId/dashboard/summary?range=LAST_30_DAYS&timeZone=Europe/Istanbul
```

- Requires a session, membership of the organization, and the `DASHBOARD_READ` permission (OWNER, ADMIN, and STAFF all have it). The dashboard is read-only: there is no write or configuration permission.
- The organization comes only from the route and is verified by `OrganizationAccessGuard`. Non-members, unknown, and malformed organization ids all get `404 ORGANIZATION_NOT_FOUND`. Unknown query parameters (including `organizationId`) are `400 VALIDATION_ERROR`.
- `Cache-Control: no-store`. Writes nothing (no activity log entry).

### Query parameters

| Parameter  | Values                                                                                        | Default        |
| ---------- | --------------------------------------------------------------------------------------------- | -------------- |
| `range`    | `TODAY`, `LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `PREVIOUS_MONTH`, `THIS_YEAR`, `CUSTOM` | `LAST_30_DAYS` |
| `from`     | `YYYY-MM-DD`, first day (inclusive). Only with `range=CUSTOM`, where it is required           |                |
| `to`       | `YYYY-MM-DD`, last day (inclusive). Only with `range=CUSTOM`, where it is required            |                |
| `timeZone` | IANA name (`Europe/Istanbul`, `UTC`, `America/New_York`), used as given                       | `UTC`          |

The default range is the same for every organization and is not configurable.

Validation errors use the standard format (`400 VALIDATION_ERROR` with `details[].field`): unknown `range`; `from`/`to` with a preset; `CUSTOM` without `from` or `to`; impossible or malformed dates (`2025-02-30`, `2025-9-1`, date-times); `to` before `from`; a custom range longer than **366 days** (`DASHBOARD_LIMITS.customRangeMaxDays`, enough for a leap year, small enough to keep the queries bounded); an unknown time zone, or a numeric offset such as `+03:00` (PostgreSQL would read it with the inverted POSIX sign).

## Date ranges

A range is a whole number of **local days in `timeZone`**. Local days `from`…`to` (inclusive) become the UTC instants **[start, end)**: `start` is `from` at 00:00 local time, `end` is the day after `to` at 00:00 local time (exclusive), so the last day is complete and nothing is counted twice at a boundary. The default time zone is UTC, the API's existing date convention (date-only filters elsewhere are UTC days). Day boundaries are DST-aware.

"Today" is the current local date in `timeZone`. Presets that run to the present include today:

| Preset           | Local days                                |
| ---------------- | ----------------------------------------- |
| `TODAY`          | today                                     |
| `LAST_7_DAYS`    | today − 6 … today                         |
| `LAST_30_DAYS`   | today − 29 … today                        |
| `THIS_MONTH`     | 1st of this month … today (month to date) |
| `PREVIOUS_MONTH` | 1st … last day of the previous month      |
| `THIS_YEAR`      | January 1 … today (year to date)          |
| `CUSTOM`         | `from` … `to`                             |

The response echoes the resolved `period` (`range`, `timeZone`, `from`, `to`, `start`, `end`, `days`).

### Comparison period

`comparisonPeriod` is the **same number of days immediately before** the selected period: September 1–30 is compared with August 2–31; `THIS_MONTH` on October 10 (10 days) with September 21–30. The two periods touch without a gap or overlap.

Period KPIs return `current`, `previous`, `absoluteChange` (current − previous), and `percentageChange` (rounded to one decimal place). When `previous` is 0, `percentageChange` is **`null`**: never `Infinity` or `NaN`. The API does not judge a change as good or bad.

## KPI definitions

All period-bound numbers use the order's or customer's **creation time** (`createdAt`): orders have no per-status timestamps, so the order date is the reporting date.

| KPI                                                  | Definition                                                                                                              |  Period-bound   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | :-------------: |
| `sales`                                              | **Realized revenue**: Σ `quantity × unitPrice` over the lines of realized orders created in the period (decimal string) | ✅ + comparison |
| `orders`                                             | Orders created in the period, **every status** (DRAFT … CANCELLED)                                                      | ✅ + comparison |
| `realizedOrders`                                     | Realized orders created in the period                                                                                   | ✅ + comparison |
| `newCustomers`                                       | Customers created in the period, whatever their current status                                                          | ✅ + comparison |
| `activeCustomers` / `archivedCustomers`              | Customers that are / are not active now (archived customers are not active; their orders still count in history)        |       now       |
| `activeProducts` / `archivedProducts`                | Products with status `ACTIVE` / `ARCHIVED` now                                                                          |       now       |
| `inventoryUnits`                                     | Units on hand of **active products in active warehouses**                                                               |       now       |
| `inStockItems` / `lowStockItems` / `outOfStockItems` | Inventory rows (product × warehouse) that are `IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK`, same scope                     |       now       |
| `activeWarehouses` / `inactiveWarehouses`            | Warehouses that are active / archived                                                                                   |       now       |

"Now" KPIs describe the current state; their history is not stored, so they have no comparison.

### Sales lifecycle semantics

**Realized** orders are those whose stock has been deducted: `PROCESSING`, `SHIPPED`, `COMPLETED` (`REALIZED_ORDER_STATUSES`; CONFIRMED → PROCESSING issues the SALE movements). `DRAFT`, `CONFIRMED`, and `CANCELLED` orders never contribute revenue.

- Revenue is summed by PostgreSQL in `numeric` from each line's **price snapshot** (`order_items.unit_price`), never from the current product price, so editing a product never changes past sales. It is returned as a decimal string with two decimals (`"1234.50"`, `"-12.00"` for a negative change), like all money in the API.
- The **Orders** KPI (every status) and the **Sales**/**Realized orders** KPIs (realized only) intentionally use different lifecycle semantics: "orders taken" vs. "sales made".
- `orderStatus` lists the orders created in the period per status, always **all six statuses** in lifecycle order (zero counts included).

### Inventory and low stock

Stock status is the Phase 6 rule, per inventory row, against the product's `minimumStock` ([warehouses-inventory.md](warehouses-inventory.md#stock-status-low-stock)): `OUT_OF_STOCK` when quantity = 0, `LOW_STOCK` when 0 < quantity ≤ minimum (equal to the minimum is already low), otherwise `IN_STOCK`. The dashboard uses the **same SQL** as the inventory list filter (`STOCK_STATUS_SQL` in `inventory-mappers.ts`, next to the TypeScript `stockStatus()`); a database test checks that both agree.

Scope: the dashboard counts **sellable stock**: rows of `ACTIVE` products. Organization-wide totals include only **active** warehouses (an archived warehouse can't move stock). Products without an inventory row have no stock status (they are not "out of stock" rows).

`warehouses` lists **every** warehouse (active first, then by code) with `totalUnits`, `inStockItems`, `lowStockItems`, and `outOfStockItems` of its active products, so an archived warehouse that still holds stock remains visible.

### Top products

Up to 5 products by **units sold** in realized orders created in the period; ties are ordered by revenue, then name. `revenue` is Σ `quantity × unitPrice` of their lines (snapshots). `name`, `sku`, and `status` are the product's **current** values (its identity; a renamed product is reported once under its current name), while all amounts come from the order lines, so historical numbers are unaffected by product edits.

### Time series

`timeSeries.points` covers the selected period with **every bucket present** (zeros included), so charts get a stable x-axis. The bucket size follows from the period length:

| Days  | Bucket  | Notes                       |
| ----- | ------- | --------------------------- |
| ≤ 31  | `DAY`   |                             |
| 32–92 | `WEEK`  | ISO weeks, Monday to Sunday |
| > 92  | `MONTH` | Calendar months             |

Each point has `period` and `periodEnd` (the first and last local day of the bucket **inside** the period: the first and last weeks/months are clipped), `orders` (every status), `realizedOrders`, and `revenue` (realized). Orders and sales share the same buckets, and the points add up to the period KPIs.

## Aggregation strategy

`DashboardService.summary()` answers the whole response with **five grouped SQL queries** (none per KPI, status, product, or warehouse), all filtered by `organization_id` and joined on `(organization_id, id)`:

1. Orders and realized revenue grouped by status and by period (current/previous): KPIs, comparison, and status distribution.
2. Orders, realized orders, and revenue grouped by `date_trunc(day|week|month, local time)`: the time series.
3. Order lines of realized orders grouped by product, `ORDER BY units DESC … LIMIT 5`: top products.
4. Customer and product counts with `COUNT(*) FILTER (…)` in one statement.
5. Warehouses `LEFT JOIN` their inventory rows of active products, grouped by warehouse: warehouse summaries (organization totals are their sum over active warehouses).

Revenue per order comes from a `LATERAL` sum over its lines whose condition includes the realized statuses, so other orders add nothing. Client input reaches SQL only as bound parameters; the bucket unit comes from a whitelist.

**Consistency:** the five queries run in one `REPEATABLE READ` transaction (a Prisma batch), so every number in a response comes from the same database snapshot even while orders or stock change. That is the only reason for the transaction; nothing is written. `generatedAt` is the time of the read.

**Timestamps and time zones:** Prisma's PostgreSQL driver adapter sends `DateTime` values as zone-less UTC wall-clock text, which PostgreSQL reads in the session time zone (the dev machine's database runs in `Europe/Istanbul`), and Prisma fills `@default(now())` itself. Comparisons with `Date` parameters are consistent because both sides are written the same way. For bucketing, the query first recovers the true instant (`(created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC'`) and then converts it to the requested zone; with a UTC session this is a no-op. See known limitations.

## Indexes

No new index or migration: every query maps to existing indexes (checked with `EXPLAIN`):

| Query                                  | Index used                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders in a period (1, 2, 3)           | `orders (organization_id, status, created_at DESC)` / `orders (organization_id, created_at DESC)`                                                                      |
| Lines of an order (lateral revenue, 3) | `order_items (order_id, product_id)` UNIQUE, `order_items (organization_id, order_id)`                                                                                 |
| Product of a line (3)                  | `products (organization_id, id)` UNIQUE                                                                                                                                |
| Customer / product counts (4)          | organization-leading indexes (`customers (organization_id, id)` UNIQUE, `products (organization_id, …)`): one pass per organization, since every row is counted anyway |
| Warehouses and stock (5)               | `warehouses (organization_id, id)`, `inventory (warehouse_id, product_id)` UNIQUE, `products (organization_id, id)`                                                    |

The work grows with the orders **in the selected period** (bounded by the 366-day limit) and with the organization's customers, products, and inventory rows. No Redis, server cache, background jobs, or materialized views: revisit only if real data volumes make the endpoint slow.

## Tenant isolation

- Every query filters by the guard-verified organization id and joins tenant tables on `(organization_id, id)`; no id is taken from the query string or body.
- `dashboard-tenant-isolation.db-spec.ts` fills two organizations with the same names and SKUs but different amounts and checks every KPI, the status distribution, top products, warehouses, and the time series of each, in both directions, plus `404` for the other organization's dashboard.

## Tests

| File                                                  | Covers                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/dashboard/dashboard-period.spec.ts`              | Every preset with a pinned clock, month/year/leap-day edges, time zones and DST, comparison periods, all validation errors, bucket generation and selection                                                                                                                                |
| `src/dashboard/dashboard.service.spec.ts`             | Five queries in one REPEATABLE READ transaction, organization filter and parameters in every query, empty-organization response, `DASHBOARD_READ` metadata                                                                                                                                 |
| `test/database/dashboard-api.db-spec.ts`              | Access (roles, 401, 404), validation, realized sales per status (exact decimals, price snapshots), customers, products, inventory statuses and scope, top products, time series (boundaries, time zone, weeks, months), comparison (up, down, equal, zero), presets against the real clock |
| `test/database/dashboard-tenant-isolation.db-spec.ts` | Organization A/B isolation in both directions                                                                                                                                                                                                                                              |

## Dashboard UI

`pages/dashboard-page.tsx` replaces the Phase 4 placeholder home at `/org/:organizationId` (the **Overview** tab), so there is one workspace home. It uses the existing design system (`Card`, `Badge`, `Select`, `SegmentedControl`, page states) and semantic tokens only, so it follows every theme, mode, density, corner style, and text size from the Appearance settings.

### Structure (fixed; no widget configuration)

| Section               | Content                                                                                                                                                            | Links to                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Header                | Workspace name, "Overview", description, date range picker; below it the period and the comparison period                                                          |                                                 |
| Set up your workspace | Only for a workspace with no products, customers, or orders: shortcuts (filtered by role)                                                                          | New product, warehouses, customers, new order   |
| KPI cards             | Total sales and Orders (each with a neutral change indicator), Customers (+ new in the period), Products (+ archived), Inventory units, Low stock (+ out of stock) | Inventory filtered to low stock                 |
| Sales over time       | SVG bar chart of realized revenue **or** orders per day/week/month (toggle), tooltip, data table                                                                   | Orders, new order (empty state)                 |
| Orders by status      | All six statuses as labelled horizontal bars with count and share                                                                                                  | Orders filtered by status and the period's days |
| Inventory             | In stock / Low stock / Out of stock tiles (stock items per product and warehouse) and units on hand                                                                | Inventory filtered by status                    |
| Warehouses            | Active warehouses: units, low, out                                                                                                                                 | Warehouse detail, all warehouses                |
| Top products          | Up to 5: product, SKU, units sold, revenue                                                                                                                         | Product detail                                  |
| Recent orders         | The 5 newest orders (number, customer, date, status, total) from the regular orders list endpoint (`pageSize=5`, newest first)                                     | Order detail, all orders                        |

Layout: KPI cards stack on phones, 2 columns from `sm`, 3 from `lg`; the chart takes two thirds next to the status bars from `lg`; the other sections pair up from `lg`. Tables scroll inside their card on very narrow screens; the page itself never scrolls sideways.

### State and data

- **URL state:** `?range=THIS_YEAR`, or `?range=CUSTOM&from=YYYY-MM-DD&to=YYYY-MM-DD` (only non-defaults are written; invalid links fall back to the last 30 days). Links are shareable and survive reloads; the back button restores earlier ranges.
- **Time zone:** the browser's IANA time zone is sent as `timeZone`, so "today" and the chart's days are the viewer's days.
- **Query key:** `['organizations', 'detail', organizationId, 'dashboard', 'summary', query]` (`dashboardKeys` in `api/dashboard.ts`). Always refetched when the overview opens (`staleTime: 0`). While a new range loads, the previous range of the **same** workspace stays visible but dimmed (`aria-busy`); another workspace's data is never used as a placeholder, and the page remounts per workspace (`OrganizationLayout`).
- **Loading:** skeletons in the shape of the sections; the header and range picker stay usable. **Error:** an error state with "Try again", never zeros. **Empty:** each section says what is missing and links to where to add it.
- The overview only reads (GET requests); it never changes data.

### Charts

- No chart library: `components/dashboard/bar-chart.tsx` draws plain SVG, sized to its container with `ResizeObserver`. One bar per period, no smoothing or interpolation between periods. Axis ticks are "nice" whole numbers; money ticks are computed in exact integer cents (`lib/chart-math.ts` parses decimal strings into BigInt cents, never floats).
- Colors come from theme tokens only (`fill-primary`, `stroke-border`, `fill-muted-foreground`, status tokens `bg-success`/`bg-warning`/`bg-danger`), so charts follow the theme, mode, and custom accent, and status colors keep their meaning.
- No continuous or decorative chart animation (nothing to disable for reduced motion); skeleton pulses stop under reduced motion through the global rule.

### Accessibility

- Every number is text; color is never the only cue (change arrows plus signed percentages in one neutral color, status names on every bar, stock status names on every tile).
- The bar chart has a visually hidden native range input (`role="slider"`): ←/→/Home/End select a period, the tooltip follows, and `aria-valuetext` reads the period's revenue and orders. "Show data table" lists every value in a real table.
- Status and stock bars are links with full labels ("Draft: 1 order, 13%. View these orders"). Tables have captions and header cells; KPI cards have headings under a "Key figures" section heading.

### Frontend tests

`pages/dashboard-page.test.tsx` covers render, KPI values, neutral comparison, loading, error and retry, empty workspace, role-based shortcuts, default/preset/custom/shared/invalid ranges, refetch with the previous range dimmed, chart data mapping, keyboard value text, data table, status distribution, inventory and warehouse summaries, top products, recent orders, GET-only requests, no hard-coded colors, and a workspace switch without stale data. `lib/chart-math.test.ts` and `lib/dashboard-params.test.ts` cover the helpers. `mockApi` answers the dashboard (empty workspace) and its recent-orders request by default, so other tests that land on the overview need no extra mocks.

## Reports

Phase 8C adds three read-only reports under **Reports** (`/org/:organizationId/reports/sales`, `…/orders`, `…/inventory`; `/reports` opens Sales). Each is useful on its own: server-side filters, sorting, and pagination, totals over everything that matches, and CSV export of exactly what is shown.

### Shared definitions (dashboard = reports)

The reports reuse the dashboard's code, not copies of it:

| Definition                                                                                                                         | Single source                                                                                        | Used by                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Realized sale = order in PROCESSING, SHIPPED, COMPLETED                                                                            | `REALIZED_ORDER_SQL` (`src/dashboard/sales-semantics.ts`), `REALIZED_ORDER_STATUSES` (`@app/shared`) | Dashboard sales KPIs, time series, top products; Sales report |
| Revenue = Σ `order_items.quantity × unit_price` (line snapshots), summed in SQL `numeric`                                          | Same SQL expression in both services                                                                 | Dashboard, Sales report                                       |
| Date range = local days in the viewer's IANA time zone, [start, end), presets + CUSTOM ≤ 366 days, reporting date = order creation | `resolveDashboardPeriods()` and the dashboard query DTO (extended by the report DTOs)                | Dashboard, Sales and Orders reports                           |
| Stock status (Phase 6)                                                                                                             | `STOCK_STATUS_SQL` / `stockStatus()` (`inventory-mappers.ts`)                                        | Inventory list, dashboard, Inventory report                   |
| Sellable stock = active products in active warehouses                                                                              | Same condition                                                                                       | Dashboard stock KPIs, Inventory report default                |

Database tests assert the consistency: for the same period and time zone, the Sales report totals equal the dashboard's sales and realized-order KPIs; the Inventory report's default totals equal the dashboard's stock KPIs.

### Endpoints

All require a session, membership (404 `ORGANIZATION_NOT_FOUND` otherwise), and a permission; the organization comes only from the route.

| Method & path                                     | Permission       | Returns                                                                                                   |
| ------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /organizations/:id/reports/sales`            | `REPORTS_READ`   | `SalesReportResponse`: `period`, `items`, `pagination`, `totals { orders, units, revenue }`               |
| `GET /organizations/:id/reports/sales/export`     | `REPORTS_EXPORT` | `text/csv`                                                                                                |
| `GET /organizations/:id/reports/orders`           | `REPORTS_READ`   | `OrdersReportResponse`: `period`, `items`, `pagination`, `totals { orders, value }`                       |
| `GET /organizations/:id/reports/orders/export`    | `REPORTS_EXPORT` | `text/csv`                                                                                                |
| `GET /organizations/:id/reports/inventory`        | `REPORTS_READ`   | `InventoryReportResponse`: `items`, `pagination`, `totals { rows, units, inStock, lowStock, outOfStock }` |
| `GET /organizations/:id/reports/inventory/export` | `REPORTS_EXPORT` | `text/csv`                                                                                                |

Types: `packages/shared/src/reports.ts`. JSON responses are `Cache-Control: no-store`. Nothing is written (no activity log entry).

### Report definitions and filters

| Report    | Rows                                                           | Columns                                                                     | Filters                                                                                                                                                                                                 | Sort fields (default)                                                           |
| --------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Sales     | One per **realized** order created in the period               | date, order number, customer (+ company), warehouse, status, units, revenue | date range, `status` (PROCESSING/SHIPPED/COMPLETED only), `warehouseId`, `customerId`, `productId`, `categoryId`, `search` (order number, customer name/company, product name/SKU on the order's lines) | `date` (desc), `orderNumber`, `customer`, `units`, `revenue`                    |
| Orders    | One per order created in the period, **every status**          | order number, customer, warehouse, status, lines, total, created            | date range, `status`, `warehouseId`, `customerId`, `search` (order number, customer name/company)                                                                                                       | `createdAt` (desc), `orderNumber`, `customer`, `status`, `total`                |
| Inventory | One per inventory row (product × warehouse), **current** state | product, SKU, category, warehouse, quantity, minimum stock, status          | `warehouseId`, `productId`, `categoryId`, `status` (IN_STOCK/LOW_STOCK/OUT_OF_STOCK), `search` (product name/SKU), `includeArchived` (default false: sellable stock only)                               | `productName` (asc), `sku`, `category`, `warehouse`, `quantity`, `minimumStock` |

- With a **product or category** filter, the Sales report lists the orders containing such lines and counts **only those lines** in units and revenue (the UI says so).
- The Sales report never lists DRAFT, CONFIRMED, or CANCELLED orders; the Orders report is where every status is inspected. The Orders report's `value` is the sum of the listed orders' totals (all listed statuses), not revenue.
- The Inventory report is the current state; the stock movement history stays on Stock movements and is not replaced. Reports never change stock.
- Sorting: only whitelisted fields (`IsIn` on the DTO), mapped to SQL expressions in the service, ties broken by date/name and id. An unknown field is `400 VALIDATION_ERROR`.
- Pagination: `page` (≥ 1), `pageSize` (default 25, max 100); `pagination` has `page`, `pageSize`, `totalItems`, `totalPages`.
- Ids in filters are looked up **with** the organization id; an unknown or foreign id is `422 REPORT_FILTER_NOT_FOUND` (with the field), never another workspace's data.
- Search escapes `%`, `_`, and `\` (literal matching), case-insensitive.

### CSV export

- Same query string as the report (filters, date range, time zone, sort), without paging; the web app sends exactly the active report state.
- **Limit:** at most **10,000 rows** (`REPORT_LIMITS.exportMaxRows`). The API fetches one row more than the limit; if the export would be larger it answers `422 REPORT_EXPORT_TOO_LARGE` ("… would contain N rows; the maximum is 10,000. Narrow the filters …"). No background jobs.
- **Format:** RFC 4180, UTF-8 with BOM (spreadsheet apps detect UTF-8), CRLF line endings, a human-readable header row, the report's sort order. Money is the exact decimal string (`292.00`); dates are `YYYY-MM-DD HH:mm` in the report's time zone, named in the header (`Date (Europe/Istanbul)`); statuses are words (`Completed`, `Low stock`). Internal ids are not exported.
- **Escaping:** cells with a comma, double quote, line break, or leading/trailing space are quoted, inner quotes doubled.
- **Formula injection:** a text cell starting with `=`, `+`, `-`, `@`, tab, or carriage return gets a leading apostrophe (`'=HYPERLINK(…)`), so spreadsheets show it as text (OWASP). Plain numbers such as `-12.50` stay numeric. Implemented once in `src/reports/csv.ts` (`csvCell`, `toCsv`); `csv.spec.ts` round-trips hostile values through an RFC 4180 parser and the database tests export hostile customer names.
- Response headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="sales-report_2026-09-01_2026-09-30.csv"` (exposed to the web app via `Access-Control-Expose-Headers`), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- Web: `apiDownload()` (`api/http-client.ts`) fetches the file with the session cookie and turns error bodies into `ApiError`s; `saveFile()` hands it to the browser. A too-large export shows the API message next to the button.

### Permissions

| Permission       | OWNER | ADMIN | STAFF |
| ---------------- | :---: | :---: | :---: |
| `REPORTS_READ`   |  ✅   |  ✅   |  ✅   |
| `REPORTS_EXPORT` |  ✅   |  ✅   |  ✅   |

Enforced by the API per handler (`@RequirePermissions`, pinned by `reports.controller.spec.ts` and `rbac.spec.ts`); the Export button is hidden without `REPORTS_EXPORT` (UX only).

### Reports UI

- **Reports** tab in the workspace navigation, with a Sales / Orders / Inventory sub-navigation (the date range carries over between Sales and Orders, and from the dashboard: the Top products card links to the Sales report of the same range).
- Filter bar: date range (the dashboard's range picker), search (debounced), selects (status, warehouse, customer, category; up to 100 customers listed), "Include archived" for inventory, "Clear filters". Everything is in the URL (`?range=…&warehouseId=…&sort=revenue:desc&page=2`), so views are shareable and reloadable.
- Table with sortable column headers (buttons in `<th aria-sort>`), totals above it, `PaginationBar` below. Tables scroll horizontally inside their card on narrow screens; the page itself never does.
- States: loading, error with retry (never an empty table instead of an error), "nothing matches these filters" with Clear filters, and "no data yet" with a link to where data is created. Export is disabled for empty results.
- Query keys `['organizations', 'detail', organizationId, 'reports', type, query]`; placeholder data only from the same workspace; the page remounts per workspace.

### Report tests

- API unit: `csv.spec.ts` (escaping, formula neutralization, round-trip), `reports.controller.spec.ts` (permissions).
- Database (`reports-api.db-spec.ts`): roles × read/export, 401/404, read-only, validation (unsupported sort, statuses, paging, ranges, `includeArchived`, an `organizationId` parameter), unknown filter ids, Sales (realized only, snapshots, totals, dashboard consistency in two time zones, every filter, product/category line semantics, search incl. wildcards, every sort, pagination, empty), Orders (statuses, filters, sort), Inventory (Phase 6 status, sellable scope, `includeArchived`, filters, sorts, dashboard consistency, empty), CSV (filtered content, headers, time zone, hostile values, 10,001-row limit), tenant isolation (B's ids in A's reports and exports → 422; B's routes → 404).
- Web: `pages/reports/reports-pages.test.tsx` (navigation, rows/totals, default query, filters → URL + request, sort headers + `aria-sort`, pagination, empty vs no matches, loading, error/retry, product chip, export with the active filters, too-large message, disabled export, workspace switch, dashboard link), `lib/report-params.test.ts`.

## Performance and bundle size

- Every report is two queries in one REPEATABLE READ snapshot (totals + page) or one bounded query (export). Filters, sorting, and paging run in PostgreSQL; nothing is filtered in the browser, and exports are capped.
- Index review with `EXPLAIN` (no migration needed): the Sales report scans `orders (organization_id, created_at)` for the period and sums each order's lines through `order_items (order_id, product_id)`; the Orders report uses the same order indexes (Prisma); the Inventory report walks `products (organization_id, …)` → `inventory (organization_id, product_id)` → `warehouses (organization_id, id)`.
- **Bundle (production build, Phase 8C):** one JS file of ≈ 1,067 kB (≈ 280 kB gzip): react-dom ≈ 380 kB, all route pages ≈ 207 kB, react-router ≈ 93 kB, TanStack Query ≈ 33 kB, dashboard components ≈ 33 kB, tailwind-merge ≈ 27 kB, lucide icons ≈ 20 kB, report components ≈ 7 kB. Growth: ≈ 985 kB after Phase 7B → ≈ 1,030 kB (8B) → ≈ 1,067 kB (8C), all app code; no chart or report library was added. The largest win for a future performance phase is route-level code splitting (lazy pages), which would take most of the ≈ 207 kB of pages out of the initial download.

## Known limitations

- **Reporting date = order creation date.** Orders have no per-status timestamps, so a sale is attributed to the day the order was created, not the day it was processed. Adding status timestamps (or reading the SALE movement time) would be a separate change.
- **Stored timestamps depend on the database session time zone.** Because of the Prisma adapter behavior above, raw SQL that reads timestamps as real instants (for example `psql`, or `now()` defaults written by PostgreSQL itself) sees Prisma-written times shifted by the session's UTC offset. The application is consistent through Prisma, and the dashboard compensates. A root fix (connections in UTC plus a one-time correction of existing timestamps) touches every table and existing data, so it needs a deliberate decision.
- "Now" KPIs (stock, active customers/products) have no historical comparison.
- Concurrent writes during a request are not visible to it (snapshot); the next request sees them.
- Links from the overview to the orders list pass the period's days, but the orders list filters by **UTC** days while the dashboard uses the viewer's time zone, so counts can differ for orders created near midnight.
- The Recent orders box shows the newest orders of the workspace regardless of the selected range.
- Report filter selects list up to 100 customers; others are reachable through search or a link with `customerId`.
- Exports above 10,000 rows must be narrowed; there are no background or scheduled exports, and no PDF/XLSX.
