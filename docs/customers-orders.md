# Customers & orders

Phase 7A adds customers and sales orders to a workspace. Orders run through a fixed status workflow; **processing** an order is the one step that changes stock: it writes one `SALE` stock movement per line through the Phase 6 stock operations, in the same transaction as the status change. The typed contract is in `@app/shared` (`packages/shared/src/sales.ts`), and permissions are in `packages/shared/src/rbac.ts`.

Like every workspace feature, everything here is organization-scoped: routes live under `organizations/:organizationId`, `OrganizationAccessGuard` verifies membership, each handler declares `@RequirePermissions(…)`, and every query filters by the verified organization id (see [organizations-rbac.md](organizations-rbac.md)).

## Customers

A customer is a buyer contact: `name` (required), and optional `companyName`, `email` (stored lower-case, not unique), `phone` (digits, spaces, and `+ - ( ) . /`), `address`, and `notes`. Limits are `CUSTOMER_LIMITS` (shared by API validation and the forms). Responses include `orderCount` (orders of any status).

**Lifecycle:** customers are **archived, never deleted** (`isActive = false`), because orders keep referencing them. Archiving and restoring are idempotent: a request that changes nothing records no activity. Archived customers:

- keep their orders and history, and still appear in order lists, reports, and report filters;
- can't be put on a new order or a draft (`409 ORDER_CUSTOMER_INACTIVE`);
- block confirming a draft that still uses them (`409 ORDER_CUSTOMER_INACTIVE`). Restore the customer or choose another one.

`isActive` can't be set through `PATCH` (`400 CUSTOMER_STATUS_INVALID`); use `…/archive` and `…/restore`.

**List:** `GET …/customers?search=&status=ACTIVE|ARCHIVED&sortBy=name|companyName|createdAt|updatedAt&sortOrder=&page=&pageSize=`. Search is a case-insensitive match on name, company, email, or phone (wildcards `%`, `_`, `\` are escaped). Sort fields are whitelisted, `id` is the tie-breaker, and `pageSize` is capped at 100.

## Orders

An order belongs to one **customer** (required when creating; `null` only for legacy rows) and one **warehouse** it is fulfilled from, and has 0–100 lines (one per product, quantity 1–1,000,000).

### Order numbers

`SO-1001`, `SO-1002`, … per organization. `nextOrderNumber()` (`orders/order-number.ts`) takes the next number with one atomic upsert on `order_number_sequences` inside the create transaction. Concurrent creates are serialized on the counter row, so two orders never get the same number. A rolled-back create rolls the counter back too, and a number that is already taken (for example a row inserted by hand) is skipped. `(organization_id, order_number)` is unique in the database.

### Snapshots and totals

Each line stores `productNameSnapshot`, `skuSnapshot`, and `unitPrice`, copied from the product **when the line is added**. Renaming, re-pricing, or archiving a product never changes an existing order. When a draft is edited, lines of products already on the order keep their snapshot (only the quantity changes); new products are priced at their current price.

**Currency (Phase 10.1):** each line also snapshots the product's `currency`. An order has **one currency**: the first line sets `orders.currency`, adding a product in another currency is `422 ORDER_CURRENCY_MISMATCH` (names the product and both currencies), emptying a draft resets it to `null`, and database triggers refuse a mismatch even from direct SQL. No exchange-rate conversion. See [currency.md](currency.md).

Totals are exact decimals (`orders/order-totals.ts`): `lineTotal = unitPrice × quantity`, `subtotal = Σ lineTotal`, `total = subtotal`. There are no taxes, discounts, or shipping costs. A total that doesn't fit `NUMERIC(14,2)` is `422 ORDER_TOTAL_LIMIT`. Money is a decimal string in the API and the web app (never a float).

### Status workflow

```text
DRAFT ──confirm──▶ CONFIRMED ──process──▶ PROCESSING ──ship──▶ SHIPPED ──complete──▶ COMPLETED
  │                    │
  └──────cancel────────┴──▶ CANCELLED
```

`ORDER_TRANSITIONS` in `@app/shared` is the only definition. Each change has its own endpoint (`POST …/orders/:orderId/<action>`). A status can't be set through `PATCH` (`400 ORDER_STATUS_INVALID`), and any other change is `409 ORDER_INVALID_TRANSITION` with nothing changed (for example: ship or complete a draft, process a completed or cancelled order, cancel a shipped or completed order, or confirm a cancelled one). COMPLETED and CANCELLED are final.

| Action     | From             | Checks                                                                                                      | Stock                           | Activity           |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ |
| (create)   | –                | Customer and warehouse of this organization and active; products of this organization, active, not repeated | none                            | `ORDER_CREATED`    |
| (edit)     | DRAFT only       | As create, for changed fields; other statuses are `409 ORDER_NOT_EDITABLE`                                  | none                            | `ORDER_UPDATED`    |
| `confirm`  | DRAFT            | A customer, at least one line (`422 ORDER_EMPTY`); customer, warehouse, and every product still active      | none                            | `ORDER_CONFIRMED`  |
| `process`  | CONFIRMED        | Warehouse and products active; **every** line has enough stock in the order's warehouse                     | one `SALE` per line             | `ORDER_PROCESSING` |
| `ship`     | PROCESSING       | –                                                                                                           | none                            | `ORDER_SHIPPED`    |
| `complete` | SHIPPED          | –                                                                                                           | none                            | `ORDER_COMPLETED`  |
| `cancel`   | DRAFT, CONFIRMED | –                                                                                                           | none (nothing was deducted yet) | `ORDER_CANCELLED`  |

Drafts and confirmed orders **don't reserve stock**. The order detail shows the current on-hand quantity next to each line while the order is DRAFT or CONFIRMED (`availableQuantity`, informational only); the check that counts happens when the order is processed.

### Processing and inventory

`OrderFulfillmentService.process()` runs in **one** stock transaction (`runStockTransaction`, the same one as Phase 6 stock operations):

1. Lock the order row `FOR UPDATE` and re-check it is still CONFIRMED. A repeated or parallel request waits, then fails with `409 ORDER_INVALID_TRANSITION`, so an order is never deducted twice.
2. `StockOperationsService.issueForOrder()` follows the fixed lock order: the warehouse `FOR SHARE`, then the products `FOR SHARE` (id order), then the inventory rows `FOR UPDATE`. It reads every quantity under those locks and checks **all** lines first. If any line is short, it answers `409 INVENTORY_INSUFFICIENT_STOCK` with one detail per short line ("2 needed, 1 available in MAIN") and writes nothing. Otherwise it writes one `SALE` movement per line (`quantityBefore + quantityDelta = quantityAfter`, reason `Order SO-1009`, reference `ORDER` + the order id) and updates the inventory rows.
3. Set PROCESSING (a conditional update from CONFIRMED) and record one `ORDER_PROCESSING` activity entry with the movement ids. No per-line `STOCK_ISSUED` entries are written.

Any failure (a short line, an archived warehouse or product, an error at any write) rolls the whole transaction back: the order stays CONFIRMED and no inventory or movement change remains. A lost lock race surfaces as `409 INVENTORY_CONCURRENCY_CONFLICT`. The movements are immutable like all stock movements; shipping, completing, and cancelling never touch stock.

There is **no automatic return of stock**: a processed order can't be cancelled, and returns or corrections are manual stock operations (for example a receive or adjustment) with their own movements.

### Concurrency

- Every order mutation (edit and every transition) locks the order row first, then re-checks the status under the lock, so edits and transitions of one order run one after another.
- `confirm` takes share locks on the customer, warehouse, and products, so a concurrent archive waits for it (or it sees the archive).
- Processing shares the Phase 6 lock order with manual stock operations, so they can't deadlock and stock never goes negative (the `inventory_quantity_non_negative_check` CHECK is the last line of defense).
- Covered by `order-concurrency.db-spec.ts`: two orders of 7 against 10 in stock processed in parallel (one succeeds, one SALE, 3 left); the same order processed 6 times at once (exactly once); orders sharing products in opposite line order (no deadlock); processing racing manual stock operations (ledger consistent).

## Permissions

| Permission                             | OWNER | ADMIN | STAFF |
| -------------------------------------- | :---: | :---: | :---: |
| `CUSTOMERS_READ`                       |  ✅   |  ✅   |  ✅   |
| `CUSTOMERS_CREATE`                     |  ✅   |  ✅   |  ✅   |
| `CUSTOMERS_UPDATE`                     |  ✅   |  ✅   |  ✅   |
| `CUSTOMERS_ARCHIVE` (archive, restore) |  ✅   |  ✅   |   –   |
| `ORDERS_READ`                          |  ✅   |  ✅   |  ✅   |
| `ORDERS_CREATE`                        |  ✅   |  ✅   |  ✅   |
| `ORDERS_UPDATE` (edit drafts)          |  ✅   |  ✅   |  ✅   |
| `ORDERS_CONFIRM`                       |  ✅   |  ✅   |  ✅   |
| `ORDERS_PROCESS`                       |  ✅   |  ✅   |   –   |
| `ORDERS_SHIP`                          |  ✅   |  ✅   |   –   |
| `ORDERS_COMPLETE`                      |  ✅   |  ✅   |   –   |
| `ORDERS_CANCEL`                        |  ✅   |  ✅   |   –   |

Missing permission is `403 ORGANIZATION_FORBIDDEN`. The web app hides actions the viewer can't run (`<Can>`, `can()`), as UX only; the API is authoritative.

## Tenant isolation

- Customer and order ids are looked up **with** the organization id. Unknown, malformed, and other organizations' ids get the same `404 CUSTOMER_NOT_FOUND` / `ORDER_NOT_FOUND`.
- A `customerId`, `warehouseId`, or `productId` from a body or a list filter must belong to the organization: `422 ORDER_CUSTOMER_NOT_FOUND`, `ORDER_WAREHOUSE_NOT_FOUND`, or `ORDER_PRODUCT_NOT_FOUND`.
- In the database, orders, lines, and customers reference each other through composite foreign keys `(organization_id, id)`, so a cross-tenant reference can't be stored.
- Covered by `sales-tenant-isolation.db-spec.ts`.

## API

All routes are under `/organizations/:organizationId`.

| Method & path                                                                | Permission          | Notes                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /customers`                                                             | `CUSTOMERS_READ`    | Search, status, sort, paging (see above)                                                                                                                                                               |
| `POST /customers`                                                            | `CUSTOMERS_CREATE`  |                                                                                                                                                                                                        |
| `GET /customers/:customerId`                                                 | `CUSTOMERS_READ`    |                                                                                                                                                                                                        |
| `PATCH /customers/:customerId`                                               | `CUSTOMERS_UPDATE`  | Partial; logs only the names of changed contact fields                                                                                                                                                 |
| `POST /customers/:customerId/archive`, `/restore`                            | `CUSTOMERS_ARCHIVE` | Idempotent                                                                                                                                                                                             |
| `GET /orders`                                                                | `ORDERS_READ`       | `search` (number, customer name, company), `status`, `customerId`, `warehouseId`, `from`, `to`, `timeZone`, `sortBy=createdAt\|updatedAt\|orderNumber\|total`, `sortOrder`, `page`, `pageSize` (≤ 100) |
| `POST /orders`                                                               | `ORDERS_CREATE`     | Creates a DRAFT; the number comes from the server                                                                                                                                                      |
| `GET /orders/:orderId`                                                       | `ORDERS_READ`       | Lines, totals, `availableQuantity` (DRAFT/CONFIRMED), and `history` from the activity log                                                                                                              |
| `PATCH /orders/:orderId`                                                     | `ORDERS_UPDATE`     | DRAFT only; `items` replaces the whole line list                                                                                                                                                       |
| `POST /orders/:orderId/confirm`, `/process`, `/ship`, `/complete`, `/cancel` | per action (above)  | Status workflow                                                                                                                                                                                        |

There is no delete route for customers or orders. Date filters on `GET /orders` are local days in `timeZone` (default UTC), the same definition the dashboard and reports use (see [timezone.md](timezone.md)).

Errors use the standard format (`statusCode`, `code`, `message`, optional `details`).

## Web app

- **Customers** (`/org/:organizationId/customers`): server-side search, status filter (active, archived, all), sort, paging; create and edit in a dialog; archive with a confirmation dialog, restore directly. The customer detail page shows contact data and the customer's orders.
- **Orders** (`/org/:organizationId/orders`): search, status, warehouse, created-from/to (local days, with the zone shown in the hint), and sort, all in the URL. The overview's status bars link here with the same period and time zone.
- **New / edit order** (`…/orders/new`, `…/orders/:orderId/edit`, drafts only): the order builder with a customer picker, warehouse select, product search and add (with each product's price and currency), quantities, line totals, and available stock per line. A product in another currency than the order's is refused inline, before saving.
- **Customer picker** (`components/customers/customer-picker.tsx`): searches on the server (name, company, email, phone), opens with the first 20 customers by name, and loads 20 more on demand, so customers beyond the first 100 are reachable. It has loading, error-with-retry, and "no matches" states, keyboard support (↓ into results, ↑/↓, Enter, Escape), and asks only the current workspace. Orders use active customers only; report filters pass `includeArchived`.
- **Order detail**: lines with snapshots, totals, and history, plus the actions the status and the viewer's permissions allow. Every action is confirmed in a dialog; processing shows the stock each line takes and, if it fails, the server's per-line shortage. A failed action keeps its dialog open with the reason, even when the refreshed order no longer offers any action (e.g. it was cancelled meanwhile). Lists and stock are refreshed after every action (nothing optimistic).

## Tests

- API database tests: `customers-api.db-spec.ts`, `orders-api.db-spec.ts`, `orders.db-spec.ts`, `order-fulfillment.db-spec.ts` (shortages change nothing, retry after replenishing, archived warehouse/product at processing, never twice, rollback midway), `order-concurrency.db-spec.ts`, `sales-tenant-isolation.db-spec.ts`. Unit: `order-rules.spec.ts`, `rbac.spec.ts`.
- Web: `pages/customers-page.test.tsx`, `pages/orders-page.test.tsx`, `pages/order-pages.test.tsx`, `components/customers/customer-picker.test.tsx`.
- Browser E2E (`e2e/tests/orders.spec.ts`, `history.spec.ts`, `errors.spec.ts`): the whole lifecycle through the UI with inventory, SALE movements, and activity verified in the database; cancellation; insufficient stock; invalid transitions; order history after products, customers, and warehouses change; a real 409 conflict; duplicate-click protection.

## Limitations

- No stock reservation: confirmed orders don't hold stock, so processing can fail if stock was used elsewhere in between (nothing is deducted in that case).
- One warehouse per order; no split fulfillment, partial shipments, or backorders.
- No returns, refunds, or cancellation after processing; stock corrections are manual stock operations.
- No taxes, discounts, shipping costs, currencies, invoices, or payments.
- Orders have no per-status timestamps; the history comes from the activity log, and reports use the creation date.
- Order actions are not idempotent beyond the state machine: repeating a successful action answers `409 ORDER_INVALID_TRANSITION`.
