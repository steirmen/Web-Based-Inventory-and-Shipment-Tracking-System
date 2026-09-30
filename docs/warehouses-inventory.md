# Warehouses and inventory

Warehouses, current stock per product and warehouse, the five stock operations (receive, issue, damage, adjust, transfer), and the immutable stock movement history, plus the matching web screens. Everything is organization-scoped and follows [organizations-rbac.md](organizations-rbac.md); the tables come from Phase 2 ([database-design.md](database-design.md)). Orders, customers, the dashboard, and order/inventory integration are **not** part of this module: a `SALE` movement is recorded by hand with **Issue stock**.

## Data model

No schema changes were needed: Phase 6 uses the Phase 2 tables `warehouses`, `inventory`, and `stock_movements`, their composite foreign keys, CHECK constraints, and indexes.

### Warehouse

| Field      | Notes                                                                                                                                                                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`     | Required, ≤ 200 characters, whitespace collapsed                                                                                                                                                                                                                            |
| `code`     | Required, ≤ 32 characters, stored upper-case (`main` → `MAIN`), `[A-Z0-9][A-Z0-9_-]*`, unique **per organization**. **Immutable** after creation (`WAREHOUSE_CODE_IMMUTABLE`): it identifies the warehouse in history and messages. Two organizations may both have `MAIN`. |
| `address`  | Optional, ≤ 500 characters; blank becomes `null`                                                                                                                                                                                                                            |
| `isActive` | Changed only by archive/restore (`WAREHOUSE_STATUS_INVALID` on PATCH)                                                                                                                                                                                                       |

Responses add `productCount` (products with quantity > 0) and `totalUnits` (sum of quantities), computed with one `GROUP BY` over the organization's inventory, so the list has no N+1 queries.

### Warehouse lifecycle

```text
ACTIVE ──archive──▶ ARCHIVED ──restore──▶ ACTIVE
```

- Warehouses are **never deleted** (there is no `DELETE` route): inventory rows and movements keep referencing them.
- Archive and restore are idempotent: repeating one returns the current state and logs nothing. Only real transitions write `WAREHOUSE_ARCHIVED` / `WAREHOUSE_RESTORED`.
- An archived warehouse keeps its stock and history (both stay readable and filterable), but **no stock can move in or out** of it (`409 INVENTORY_WAREHOUSE_INACTIVE`) until it is restored. It is not offered in the operation dialogs.
- Archiving waits for stock operations in progress on that warehouse (they hold a `FOR SHARE` lock on its row), so an archive never interleaves with a movement.

### Inventory: current state

`inventory` holds **one row per product and warehouse** with the on-hand `quantity` (`CHECK quantity >= 0`). It answers "how many are there now?" in one indexed read, without summing history. A row is created by the first stock that arrives (receive, transfer in, or an adjustment to a non-zero count) and is never deleted: it can reach 0 and stays as `OUT_OF_STOCK`.

### Stock movements: immutable history

`stock_movements` is the append-only ledger that explains every quantity: who changed what, when, by how much, and why. Each row stores `quantityBefore`, `quantityDelta`, and `quantityAfter` (`after = before + delta` is a CHECK constraint; `delta` is never 0).

Movements are **immutable**: there is no API route, and no service code, that updates or deletes one. A mistake is corrected with a **new** movement (for example an adjustment), so the history always shows what really happened and when. Immutability is pinned by tests: `src/inventory/stock-movement-immutability.spec.ts` scans the source for any update/delete of `stock_movements` and pins the inventory and ledger routes; the HTTP test sends `PATCH`/`PUT`/`DELETE` to movement URLs and expects `404`.

The **core invariant** is maintained by `StockOperationsService` and checked by every stock test (`expectLedgerConsistent`) and by the seed:

- `inventory.quantity` = last `quantityAfter` = `SUM(quantityDelta)` of that product and warehouse;
- each movement's `quantityBefore` equals the previous movement's `quantityAfter`.

### Movement types

| Type           | Operation          | Delta | Reason   | Reference                      |
| -------------- | ------------------ | :---: | -------- | ------------------------------ |
| `PURCHASE`     | Receive            |   +   | optional | none                           |
| `SALE`         | Issue              |   −   | optional | none (orders come in Phase 7)  |
| `DAMAGE`       | Damage / write-off |   −   | required | none                           |
| `ADJUSTMENT`   | Adjust (count)     |   ±   | required | none                           |
| `TRANSFER_OUT` | Transfer (source)  |   −   | optional | `TRANSFER` + `transferGroupId` |
| `TRANSFER_IN`  | Transfer (dest.)   |   +   | optional | `TRANSFER` + `transferGroupId` |

The direction per type and "transfer rows, and only they, carry a `transferGroupId`" are CHECK constraints in the database.

### Stock status (low stock)

Computed per inventory row (per warehouse) against the product's `minimumStock` (its reorder level, the same for every warehouse):

| Status         | Rule                          | Example (minimum 10) |
| -------------- | ----------------------------- | -------------------- |
| `OUT_OF_STOCK` | `quantity = 0`                | 0                    |
| `LOW_STOCK`    | `0 < quantity ≤ minimumStock` | 7, 10                |
| `IN_STOCK`     | `quantity > minimumStock`     | 15                   |

A quantity **equal to** the minimum is already `LOW_STOCK` (it is time to reorder). With `minimumStock = 0`, any stock is `IN_STOCK`. The same rule exists once in TypeScript (`stockStatus()` in `inventory-mappers.ts`, for responses) and once in SQL (`STATUS_CONDITIONS` in `inventory.service.ts`, for the `status` filter); a unit test pins the TypeScript side and the database tests pin the filter. The UI always shows the status as **text** in a badge (the colored dot is decoration only).

## API

All routes require a session and membership: `OrganizationAccessGuard` + `@RequirePermissions` on every handler. The organization comes **only** from the route. Bodies with `organizationId`, `id`, statuses, timestamps, or unknown fields are rejected with `400 VALIDATION_ERROR`.

### Warehouses

| Method & path                                                         | Permission           | Result                                          |
| --------------------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| `GET /organizations/:organizationId/warehouses`                       | `WAREHOUSES_READ`    | `{ warehouses }`, active first, then by name    |
| `POST /organizations/:organizationId/warehouses`                      | `WAREHOUSES_CREATE`  | `201 { warehouse }`; `409 WAREHOUSE_CODE_TAKEN` |
| `GET /organizations/:organizationId/warehouses/:warehouseId`          | `WAREHOUSES_READ`    | `{ warehouse }`                                 |
| `PATCH /organizations/:organizationId/warehouses/:warehouseId`        | `WAREHOUSES_UPDATE`  | `{ warehouse }`; name and address only          |
| `POST /organizations/:organizationId/warehouses/:warehouseId/archive` | `WAREHOUSES_ARCHIVE` | `{ warehouse }`; idempotent                     |
| `POST /organizations/:organizationId/warehouses/:warehouseId/restore` | `WAREHOUSES_ARCHIVE` | `{ warehouse }`; idempotent                     |

The warehouse list is not paginated: an organization has a handful of warehouses. Unknown, malformed, and other organizations' warehouse ids are all `404 WAREHOUSE_NOT_FOUND`.

### Inventory and movements

| Method & path                                                         | Permission                                | Result                                                |
| --------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `GET /organizations/:organizationId/inventory`                        | `INVENTORY_READ`                          | `{ items, pagination }`                               |
| `GET /organizations/:organizationId/inventory/:inventoryId`           | `INVENTORY_READ`                          | `{ inventory }`                                       |
| `GET /organizations/:organizationId/inventory/:inventoryId/movements` | `INVENTORY_READ` + `STOCK_MOVEMENTS_READ` | `{ items, pagination }`, newest first                 |
| `GET /organizations/:organizationId/stock-movements`                  | `STOCK_MOVEMENTS_READ`                    | `{ items, pagination }`                               |
| `POST /organizations/:organizationId/inventory/receive`               | `INVENTORY_RECEIVE`                       | `{ inventory, movement }`                             |
| `POST /organizations/:organizationId/inventory/issue`                 | `INVENTORY_ISSUE`                         | `{ inventory, movement }`                             |
| `POST /organizations/:organizationId/inventory/damage`                | `INVENTORY_ISSUE`                         | `{ inventory, movement }`                             |
| `POST /organizations/:organizationId/inventory/adjust`                | `INVENTORY_ADJUST`                        | `{ inventory, movement }` (see no-op below)           |
| `POST /organizations/:organizationId/inventory/transfer`              | `INVENTORY_TRANSFER`                      | `{ transferGroupId, source, destination, movements }` |

Operations answer `200` with the resulting state. Types live in `packages/shared/src/inventory.ts` together with `INVENTORY_LIMITS`, `WAREHOUSE_CODE_PATTERN`, `STOCK_STATUSES`, and `STOCK_MOVEMENT_TYPES`.

**Inventory list:** `GET …/inventory?warehouseId=&productId=&search=&status=&sortBy=&sortOrder=&page=&pageSize=`

- `search`: case-insensitive substring of product name or SKU (≤ 100 characters; `%`, `_`, `\` matched literally).
- `status`: `IN_STOCK`, `LOW_STOCK`, or `OUT_OF_STOCK`.
- `sortBy`: whitelist `productName` (default), `sku`, `quantity`, `updatedAt`; then warehouse code and `id` as tie-breakers, so pages are stable.
- `page` (default 1), `pageSize` (default 20, max 100).
- The page is selected with one SQL query (organization filter, composite joins to products and warehouses) plus a count, then loaded with one `findMany` including warehouse and product: no N+1.

**Movement list:** `GET …/stock-movements?warehouseId=&productId=&movementType=&actorUserId=&transferGroupId=&from=&to=&search=&sortOrder=&page=&pageSize=`, ordered by `createdAt` (default newest first) with `id` as tie-breaker. `from`/`to` are inclusive ISO 8601 dates or date-times; a date-only `to` includes that whole day (UTC). `search` matches product name, SKU, or reason. `transferGroupId` returns both legs of one transfer. History is always paginated; it is never loaded into memory as a whole.

Every id in a filter or body is looked up **with** the organization id: another organization's (or an unknown) warehouse or product is `422 INVENTORY_WAREHOUSE_NOT_FOUND` / `422 INVENTORY_PRODUCT_NOT_FOUND`, and another organization's user is `422 STOCK_MOVEMENT_ACTOR_NOT_FOUND`. A foreign `transferGroupId` simply matches nothing (the query is scoped to the organization).

### Input validation (server-side, authoritative)

| Field                                                                     | Rule                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `warehouseId`, `productId`, `sourceWarehouseId`, `destinationWarehouseId` | UUIDs; must belong to the organization (422 otherwise)                             |
| `quantity`                                                                | JSON integer, `1 … 1 000 000 000` (no strings, decimals, or exponents)             |
| `newQuantity` (adjust)                                                    | JSON integer, `0 … 1 000 000 000`                                                  |
| `reason`                                                                  | ≤ 500 characters, trimmed; **required** for damage and adjust                      |
| transfer                                                                  | source ≠ destination (`400 INVENTORY_SAME_WAREHOUSE`, compared case-insensitively) |
| resulting quantity                                                        | ≤ 1 000 000 000 (`422 INVENTORY_QUANTITY_LIMIT`)                                   |
| enums (`status`, `movementType`, `sortBy`, `sortOrder`)                   | validated against the shared whitelists                                            |

Clients never send statuses, before/after values, movement types, or organization ids: the server derives them.

## Stock operations

All five go through `StockOperationsService` (controller → service → one transaction → PostgreSQL). Controllers never touch inventory rows, and the increase/decrease logic exists once (`change()` / `record()`). Each operation:

1. gets the organization from the verified `OrganizationContext` (the guard already checked membership and permission);
2. locks the warehouse(s) and product **of this organization** (unknown/foreign → 422);
3. rejects archived warehouses (`409 INVENTORY_WAREHOUSE_INACTIVE`) and archived products (`409 INVENTORY_PRODUCT_INACTIVE`);
4. locks the inventory row(s) and reads the current quantity **under the lock**;
5. validates the result (no negative stock, limit);
6. updates `inventory`, inserts the `stock_movements` row(s), and records the activity entry;
7. commits, and returns the resulting inventory and movement(s).

| Operation    | What it does                                                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Receive**  | `+quantity` as `PURCHASE`. Creates the inventory row on first receipt.                                                                                                                                                                                                                                         |
| **Issue**    | `−quantity` as `SALE`. `409 INVENTORY_INSUFFICIENT_STOCK` ("Not enough stock: 3 units available in MAIN.") if it would go below 0. Issuing everything is allowed (→ `OUT_OF_STOCK`).                                                                                                                           |
| **Damage**   | `−quantity` as `DAMAGE` with a required reason (damaged, lost, expired). Same stock check as issue.                                                                                                                                                                                                            |
| **Adjust**   | Sets a **counted** quantity (`newQuantity ≥ 0`); the movement records `delta = newQuantity − current` as `ADJUSTMENT`. If the count equals the current quantity it is a **no-op**: nothing is written, the response has `movement: null` (and `inventory: null` if no stock record exists and the count is 0). |
| **Transfer** | Moves `quantity` from a source to a destination warehouse (both active, different): `TRANSFER_OUT` on the source and `TRANSFER_IN` on the destination, sharing one `transferGroupId`. See below.                                                                                                               |

Receiving into or counting stock in a location without stock creates the row; decreases never create empty rows.

### Transfer atomicity

A transfer is **one transaction** that writes exactly **two** movements:

```text
BEGIN
  lock source + destination warehouses (FOR SHARE, id order), lock product (FOR SHARE)
  lock both inventory rows (FOR UPDATE, warehouse-id order; destination row created if missing)
  check source quantity ≥ transfer quantity
  source.quantity      -= q   → TRANSFER_OUT (before, −q, after, transferGroupId)
  destination.quantity += q   → TRANSFER_IN  (before, +q, after, transferGroupId)
  one STOCK_TRANSFERRED activity entry
COMMIT
```

If anything fails (insufficient stock, an archived warehouse, a failed insert, a crash), nothing is written: no half transfer, no orphan movement, no empty destination row. For every transfer, `sourceBefore + sourceDelta = sourceAfter`, `destinationBefore + destinationDelta = destinationAfter`, and `sourceDelta + destinationDelta = 0`; the database tests check this for every transfer they create (`expectTransfersBalanced`). Both legs carry `referenceType = 'TRANSFER'` and `referenceId = transferGroupId`.

## Concurrency

Stock operations run at PostgreSQL's default `READ COMMITTED` isolation with **explicit row locks** that are held until commit:

| Order | Row(s)                          | Lock         | Why                                                                                           |
| :---: | ------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
|   1   | `warehouses` (by id, ascending) | `FOR SHARE`  | An archive (`UPDATE`) waits until the operation commits, so status can't change underneath it |
|   2   | `products`                      | `FOR SHARE`  | Same for product archive                                                                      |
|   3   | `inventory` (by warehouse id)   | `FOR UPDATE` | Serializes all changes to the same stock                                                      |

A missing inventory row is first inserted with `INSERT … ON CONFLICT (warehouse_id, product_id) DO NOTHING` and then locked, so two concurrent first receipts can't create two rows or lose an update.

Consequences:

- The quantity is always read **after** its lock is held and inside the same transaction as the write, so `quantityBefore` is never stale and two operations can't both spend the same stock. Example: 10 on hand, two parallel issues of 7 → one succeeds, the other waits, then reads 3 and fails with `INVENTORY_INSUFFICIENT_STOCK`; final stock 3, one `SALE` movement.
- Locks are always taken in the same global order (warehouses by id → product → inventory by warehouse id), so two transfers in opposite directions can't deadlock.
- `CHECK (quantity >= 0)` is the last line of defense if application code were ever wrong.
- If a transaction still loses a lock race (deadlock, lock timeout, or the 10 s wait / 15 s run limit of the interactive transaction), it is rolled back and the API answers `409 INVENTORY_CONCURRENCY_CONFLICT` ("… Nothing was changed; please try again.") instead of a generic 500.

`test/database/stock-concurrency.db-spec.ts` runs real parallel HTTP requests: parallel issues against scarce stock, parallel receipts (+5 and +7 on 10 → 22), 20 parallel issues of 1 against 10 units, 15 parallel first receipts, 20 opposite transfers, and a mix of all operations; each ends with a full ledger check. It also produces a real deadlock and a real lock timeout to test the conflict mapping.

### Repeated requests (no idempotency keys)

Stock operations are **not idempotent**: retrying `POST …/inventory/receive` after a lost response records a second, valid receipt. This phase does not add idempotency keys. The web app prevents accidental double submission (the submit button is disabled and repeated submits are ignored while a request runs), and a `409` conflict is always safe to retry because nothing was written. An `Idempotency-Key` mechanism (stored per organization with the response) can be added in a later production-hardening phase.

## RBAC

Permissions live in `packages/shared/src/rbac.ts` (pinned by `src/organizations/rbac.spec.ts`):

| Permission                                        | OWNER | ADMIN | STAFF |
| ------------------------------------------------- | :---: | :---: | :---: |
| `WAREHOUSES_READ`                                 |  ✅   |  ✅   |  ✅   |
| `WAREHOUSES_CREATE`                               |  ✅   |  ✅   |  ❌   |
| `WAREHOUSES_UPDATE`                               |  ✅   |  ✅   |  ❌   |
| `WAREHOUSES_ARCHIVE`: archive and restore         |  ✅   |  ✅   |  ❌   |
| `INVENTORY_READ`                                  |  ✅   |  ✅   |  ✅   |
| `INVENTORY_RECEIVE`: receive                      |  ✅   |  ✅   |  ✅   |
| `INVENTORY_ISSUE`: issue and damage               |  ✅   |  ✅   |  ✅   |
| `INVENTORY_ADJUST`: adjust to a counted quantity  |  ✅   |  ✅   |  ❌   |
| `INVENTORY_TRANSFER`: transfer between warehouses |  ✅   |  ✅   |  ❌   |
| `STOCK_MOVEMENTS_READ`                            |  ✅   |  ✅   |  ✅   |

STAFF handle day-to-day stock flow (receipts, issues, damage); corrections and relocations need ADMIN or OWNER. A missing permission is `403 ORGANIZATION_FORBIDDEN` from the guard (the same code for every domain). The frontend hides what the role can't do (`<Can>`, `can()`), but that is UX only: direct API calls are tested (`STAFF → adjust`, `STAFF → transfer`, `STAFF → archive`, … all `403`).

## Tenant isolation

- Every route is under `/organizations/:organizationId/…`; non-members get `404 ORGANIZATION_NOT_FOUND` whether or not the organization exists.
- Every query filters by `organization_id`. The inventory list query also joins products and warehouses on `(organization_id, id)`.
- Ids from bodies and filters are resolved **with** the organization id (422 for foreign ids), and ids in paths are looked up with it (`404 WAREHOUSE_NOT_FOUND` / `INVENTORY_NOT_FOUND` for another organization's ids).
- The database enforces it too: composite foreign keys make it impossible for an inventory row or movement to reference another organization's product or warehouse.
- `test/database/inventory-tenant-isolation.db-spec.ts` uses known ids of organization B from organization A: every read, mutation, transfer into/out of B, filter, search (`search=mouse` with a "Wireless Mouse" in both), status filter, and count stays inside A, and B's data is unchanged afterwards.

## Activity log

Recorded with `recordActivity(tx, …)` inside the operation's transaction, so the stock change and its log entry commit or roll back together:

| Action               | Entity    | Metadata                                                                                                                                                               |
| -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WAREHOUSE_CREATED`  | Warehouse | `name`, `code`                                                                                                                                                         |
| `WAREHOUSE_UPDATED`  | Warehouse | `code`, `changes` (name from/to; address only as `{ changed: true }`); only when something changed                                                                     |
| `WAREHOUSE_ARCHIVED` | Warehouse | `name`, `code`; only on a real transition                                                                                                                              |
| `WAREHOUSE_RESTORED` | Warehouse | `name`, `code`; only on a real transition                                                                                                                              |
| `STOCK_RECEIVED`     | Product   | `warehouseId`, `warehouseCode`, `productId`, `sku`, `inventoryId`, `movementId`, `quantity`, `quantityBefore`, `quantityAfter`, `quantityDelta`                        |
| `STOCK_ISSUED`       | Product   | same as received                                                                                                                                                       |
| `STOCK_DAMAGED`      | Product   | same as received                                                                                                                                                       |
| `STOCK_ADJUSTED`     | Product   | same without `quantity`; only when the count changed the stock                                                                                                         |
| `STOCK_TRANSFERRED`  | Product   | `productId`, `sku`, `sourceWarehouseId`/`Code`, `destinationWarehouseId`/`Code`, `quantity`, `transferGroupId`, `source` and `destination` before/after, `movementIds` |

A transfer writes **one** `STOCK_TRANSFERRED` entry (identified by its `transferGroupId`), not one per leg. Free-text reasons stay in the movement and are not copied into metadata; no personal data, passwords, tokens, or emails are ever stored there.

## Error codes

| Code                             | Status | When                                                           |
| -------------------------------- | :----: | -------------------------------------------------------------- |
| `WAREHOUSE_NOT_FOUND`            |  404   | Unknown, malformed, or foreign warehouse id in the path        |
| `WAREHOUSE_CODE_TAKEN`           |  409   | Code already used in this organization (case-insensitive)      |
| `WAREHOUSE_CODE_IMMUTABLE`       |  400   | `code` sent to PATCH                                           |
| `WAREHOUSE_STATUS_INVALID`       |  400   | `isActive` sent to PATCH (use archive/restore)                 |
| `INVENTORY_NOT_FOUND`            |  404   | Unknown, malformed, or foreign inventory id in the path        |
| `INVENTORY_WAREHOUSE_NOT_FOUND`  |  422   | Warehouse id in a body/filter is not this organization's       |
| `INVENTORY_WAREHOUSE_INACTIVE`   |  409   | Stock operation touches an archived warehouse                  |
| `INVENTORY_PRODUCT_NOT_FOUND`    |  422   | Product id in a body/filter is not this organization's         |
| `INVENTORY_PRODUCT_INACTIVE`     |  409   | Stock operation on an archived product                         |
| `INVENTORY_INSUFFICIENT_STOCK`   |  409   | Issue, damage, or transfer would make stock negative           |
| `INVENTORY_SAME_WAREHOUSE`       |  400   | Transfer source and destination are the same                   |
| `INVENTORY_QUANTITY_LIMIT`       |  422   | Resulting quantity above 1 000 000 000                         |
| `INVENTORY_CONCURRENCY_CONFLICT` |  409   | Lost lock race (deadlock or timeout); nothing written, retry   |
| `STOCK_MOVEMENT_ACTOR_NOT_FOUND` |  422   | `actorUserId` filter is not a member or former actor here      |
| `ORGANIZATION_FORBIDDEN`         |  403   | Role lacks the permission (e.g. STAFF adjust/transfer/archive) |
| `VALIDATION_ERROR`               |  400   | Invalid body or query (field details included)                 |

Invalid quantities are `VALIDATION_ERROR` with the field (`quantity`, `newQuantity`) in `details`, in the same format as every other validation error. Raw Prisma/PostgreSQL errors never reach the client (`ApiExceptionFilter`).

## Frontend

| Route                                          | Page                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/org/:organizationId/warehouses`              | Warehouse list (code, address, status, products in stock, units); create/edit dialog, archive (confirmation) and restore for OWNER/ADMIN                                                                                       |
| `/org/:organizationId/warehouses/:warehouseId` | Warehouse detail with totals, archived notice, links to its inventory and movements                                                                                                                                            |
| `/org/:organizationId/inventory`               | Stock per product and warehouse: search, warehouse/status filters, sort, pagination (all in the URL, applied by the server), status badges, per-row operations the role allows, and "Receive stock" / "Transfer" in the header |
| `/org/:organizationId/stock-movements`         | Read-only ledger: warehouse, product, type, date range, order filters in the URL; signed changes, before/after, actor, reason. Both legs of a transfer show the same `Transfer #XXXXXX` link, which opens just that transfer.  |

- **One dialog for all operations** (`StockOperationDialog`): product picker (server-side search over **active** products of the organization, up to 50 matches, so large catalogs are never loaded), active-warehouse selects (the source is excluded from the destinations), quantity, reason, and a preview (current → result; for adjustments current / new / difference or "No change"; for transfers both warehouses before → after). The preview and the client checks are **UX only**: the server re-reads the locked stock and validates again, and server errors are shown on the matching field (e.g. insufficient stock on the quantity) or above the form.
- Submitting is disabled while a request runs, so a double click sends one request.
- After a successful operation (and after a conflict, when the shown data is stale) the organization's inventory lists, movement lists, and warehouse totals are invalidated and refetched; a transfer therefore refreshes both warehouses.
- Query keys live under `organizationKeys.detail(organizationId)` (`inventoryKeys` in `src/api/inventory.ts`), and `OrganizationLayout` keys the page by organization id, so switching workspaces never shows another workspace's cached stock or keeps its search text.
- Selectors only use organization-scoped endpoints. The movement page's product filter lists the first 100 products by name (a selected product outside that list stays selected); it can move to the server-searched picker when catalogs grow.
- Tables switch to cards below the `xl` breakpoint (inventory, movements) or `lg` (warehouses); dialogs are full-width on narrow screens. Status is always text (`In stock`, `Low stock`, `Out of stock`, `Active`, `Archived`), tables have column headers, icon-only buttons have accessible names, and results are announced with `role="status"` alerts.

## Tests

| Suite (`apps/api/test/database/`) | Covers                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `warehouses-api`                  | CRUD, normalization, duplicate codes (per org), immutable code, archive/restore (idempotent), RBAC, stock blocked while archived |
| `inventory-read`                  | List/detail, filters, search, status, sorting, pagination, history, date ranges, transfer groups, 422s                           |
| `stock-operations`                | Receive/issue/damage/adjust/transfer per role, validation, archived rules, no-op adjust, activity, immutability                  |
| `stock-rollback`                  | Failures after the inventory update roll back inventory, movements, and activity                                                 |
| `stock-concurrency`               | Real parallel requests, no oversell/lost update/deadlock; real deadlock/lock-timeout → 409                                       |
| `inventory-tenant-isolation`      | Cross-organization reads, mutations, transfers, filters, search, and counts                                                      |

Frontend: `warehouses-page.test.tsx`, `inventory-page.test.tsx`, `stock-movements-page.test.tsx` (including the workspace-switch cache test), and `lib/stock-form.test.ts`.
