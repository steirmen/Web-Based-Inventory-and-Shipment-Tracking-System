# Products and categories

The product catalog of an organization: categories, products, server-side search, filtering, sorting, and pagination, archive/restore, and the matching web screens. Everything is organization-scoped and follows [organizations-rbac.md](organizations-rbac.md). Inventory, stock movements, warehouses, orders, and the dashboard are **not** part of this module.

## Data model

Uses the Phase 2 tables `categories` and `products` (see [database-design.md](database-design.md)):

- Both are tenant-owned (`organization_id`). A product references its category with the composite foreign key `(organization_id, category_id) → categories(organization_id, id)`, so a product can never point at another organization's category, even if application code had a bug.
- **Category names** are unique per organization, **case-insensitively** in the API (`Office` and `office` conflict) and exactly by the `(organization_id, name)` unique index. Different organizations may use the same name.
- **SKUs** are unique per organization (`(organization_id, sku)` unique index). They are stored exactly as entered after trimming (case is preserved and significant). Different organizations may use the same SKU.
- **Money** (`price`, `cost`) is `NUMERIC(12,2)`. The API accepts and returns **decimal strings** (`"19.99"`, always 2 decimals in responses), never JavaScript numbers, so values are never rounded through binary floating point. Input must match `MONEY_PATTERN` (`/^\d{1,10}(\.\d{1,2})?$/`): non-negative, up to 10 integer digits and 2 decimals, no sign, exponent, or separators. The web app formats the strings with `Intl.NumberFormat` directly (`useFormat().money`).
- **Currency (Phase 10.1):** `currency` (`TRY`, `EUR`, `USD`; default `TRY`) applies to both price and cost. It is optional on create, changeable on update, and validated against `CURRENCIES` (anything else, including `null`, is `400 VALIDATION_ERROR`). See [currency.md](currency.md).
- `cost` is required when creating a product. It is `null` only for legacy rows created without one, and the edit form lets those keep it empty.
- `minimum_stock` is a whole number `0…1 000 000 000` (a reorder level; there is no stock tracking yet).
- **Status** is `ACTIVE` or `ARCHIVED`. Products are never deleted: order lines and stock history will reference them. Archiving is reversible.

### Product count

`Category.productCount` counts **all** products in the category, **active and archived**, because archived products still reference it (and would block deleting it). It is computed per request with `_count` scoped to the organization, so it can never include another organization's products.

## API

All routes require a session and membership: `OrganizationAccessGuard` + `@RequirePermissions` on every handler. The organization comes **only** from the route; bodies containing `organizationId`, `id`, `status` (on PATCH), timestamps, or unknown fields are rejected with `400 VALIDATION_ERROR`.

| Method & path                                                     | Permission          | Result                                                                                         |
| ----------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /organizations/:organizationId/categories`                   | `CATEGORIES_READ`   | `{ categories }`, newest first, with counts; `?search=` → at most 20 matches, exact name first |
| `POST /organizations/:organizationId/categories`                  | `CATEGORIES_CREATE` | `201 { category }`                                                                             |
| `PATCH /organizations/:organizationId/categories/:categoryId`     | `CATEGORIES_UPDATE` | `{ category }`                                                                                 |
| `DELETE /organizations/:organizationId/categories/:categoryId`    | `CATEGORIES_DELETE` | `204`, only when no product uses it                                                            |
| `GET /organizations/:organizationId/products`                     | `PRODUCTS_READ`     | `{ items, pagination }` (see below)                                                            |
| `POST /organizations/:organizationId/products`                    | `PRODUCTS_CREATE`   | `201 { product }`                                                                              |
| `GET /organizations/:organizationId/products/:productId`          | `PRODUCTS_READ`     | `{ product }`                                                                                  |
| `PATCH /organizations/:organizationId/products/:productId`        | `PRODUCTS_UPDATE`   | `{ product }`; partial; ACTIVE products only                                                   |
| `POST /organizations/:organizationId/products/:productId/archive` | `PRODUCTS_ARCHIVE`  | `{ product }`; idempotent                                                                      |
| `POST /organizations/:organizationId/products/:productId/restore` | `PRODUCTS_ARCHIVE`  | `{ product }`; idempotent                                                                      |

There is no `DELETE` for products.

Request and response types live in `packages/shared/src/catalog.ts` (`Category`, `Product`, `ProductListItem`, `ProductListQuery`, `CreateProductRequest`, …) together with `CATALOG_LIMITS`, `MONEY_PATTERN`, and `SKU_PATTERN`, which both the API and the forms use.

### Category search (Phase 10.1)

`GET …/categories?search=` searches the organization's categories case-insensitively (`contains`, with `%`, `_`, and `` escaped), returns an exact (case-insensitive) match first and then names alphabetically, capped at `CATALOG_LIMITS.categorySearchMax` (20). Without `search` the full list is returned as before. The duplicate check on create/rename (`CATEGORY_NAME_TAKEN`) escapes the same characters, so `%` or `_` in a name never matches other names.

The product form's **category combobox** (`components/products/category-picker.tsx`) uses it: type to search this workspace only, keyboard support, a selected state, clear, and a "Create “Name”" option only with `CATEGORIES_CREATE` (UX only; the API enforces the permission) that never duplicates an existing name in another letter case — if someone creates the same name meanwhile, the existing category is selected.

### Input normalization

- Names: trimmed, inner whitespace collapsed (`"  Wireless   Mouse "` → `"Wireless Mouse"`).
- SKU: trimmed; letters, digits, and `. _ - /`, starting with a letter or digit; at most 64 characters.
- Descriptions: trimmed; blank becomes `null`.
- `categoryId: null` (or omitted on create) means "no category". An unknown or foreign category is `422 PRODUCT_CATEGORY_NOT_FOUND`.

### Product list

`GET …/products?search=&categoryId=&status=&sortBy=&sortOrder=&page=&pageSize=`

| Parameter    | Default     | Notes                                                                                                           |
| ------------ | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `search`     | none        | Case-insensitive **substring** match on name or SKU, ≤ 100 characters. `%`, `_`, and `\` are matched literally. |
| `categoryId` | none        | Must be a category of this organization, otherwise `422 PRODUCT_CATEGORY_NOT_FOUND`                             |
| `status`     | all         | `ACTIVE` or `ARCHIVED`                                                                                          |
| `sortBy`     | `createdAt` | Whitelist: `name`, `sku`, `price`, `cost`, `minimumStock`, `createdAt`, `updatedAt`. Anything else is `400`.    |
| `sortOrder`  | `desc`      | `asc` or `desc`. `id` is always the final tie-breaker, so pages are stable. Products without a cost sort last.  |
| `page`       | `1`         | 1-based. A page past the end returns `items: []` with the real totals.                                          |
| `pageSize`   | `20`        | `1…100`                                                                                                         |

Response: `{ items: ProductListItem[], pagination: { page, pageSize, totalItems, totalPages } }` (`totalPages` is `0` when nothing matches). List items omit `description`. The count and the page are read in one transaction.

### Updates, archive, restore

- PATCH writes only the fields that actually change (money is compared as decimals: `"10.0"` equals `"10.00"`). A request that changes nothing succeeds without writing a log entry.
- Editing an ARCHIVED product is `409 PRODUCT_ARCHIVED` ("Restore it before editing"). The update is conditional on `status = 'ACTIVE'`, so an archive that happens concurrently also wins.
- Sending `status` in a PATCH is `400 PRODUCT_STATUS_INVALID`: status changes only through archive/restore.
- Archive/restore are idempotent: archiving an archived product returns it unchanged and logs nothing.

### Deleting categories

Only unused categories can be deleted. If any product (active or archived) uses it, the API answers `409 CATEGORY_IN_USE` with the count ("This category is used by N products. Move them to another category first.") and changes nothing. A product assigned concurrently makes the delete fail on the foreign key, which is reported the same way.

### Error codes

| Code                         | Status | When                                                                 |
| ---------------------------- | ------ | -------------------------------------------------------------------- |
| `VALIDATION_ERROR`           | 400    | Invalid or unknown fields (per-field `details`, values not echoed)   |
| `PRODUCT_STATUS_INVALID`     | 400    | `status` in a product PATCH                                          |
| `ORGANIZATION_NOT_FOUND`     | 404    | Unknown organization or not a member                                 |
| `ORGANIZATION_FORBIDDEN`     | 403    | The role lacks the permission                                        |
| `CATEGORY_NOT_FOUND`         | 404    | Unknown, malformed, or another organization's category               |
| `PRODUCT_NOT_FOUND`          | 404    | Unknown, malformed, or another organization's product                |
| `CATEGORY_NAME_TAKEN`        | 409    | Name already used in this organization (case-insensitive)            |
| `CATEGORY_IN_USE`            | 409    | Delete of a category that products use                               |
| `PRODUCT_SKU_TAKEN`          | 409    | SKU already used in this organization                                |
| `PRODUCT_ARCHIVED`           | 409    | Edit of an archived product                                          |
| `PRODUCT_CATEGORY_NOT_FOUND` | 422    | `categoryId` (body or filter) is not a category of this organization |

## Permissions

| Permission          | OWNER | ADMIN | STAFF |
| ------------------- | :---: | :---: | :---: |
| `PRODUCTS_READ`     |  ✅   |  ✅   |  ✅   |
| `PRODUCTS_CREATE`   |  ✅   |  ✅   |  ✅   |
| `PRODUCTS_UPDATE`   |  ✅   |  ✅   |  ✅   |
| `PRODUCTS_ARCHIVE`  |  ✅   |  ✅   |  ❌   |
| `CATEGORIES_READ`   |  ✅   |  ✅   |  ✅   |
| `CATEGORIES_CREATE` |  ✅   |  ✅   |  ✅   |
| `CATEGORIES_UPDATE` |  ✅   |  ✅   |  ✅   |
| `CATEGORIES_DELETE` |  ✅   |  ✅   |  ❌   |

STAFF runs the day-to-day catalog (create and edit products and categories); archiving products and deleting categories are reserved for OWNER and ADMIN. The matrix lives only in `ROLE_PERMISSIONS` (`packages/shared/src/rbac.ts`), and the web app hides controls from the same map (UX only).

## Activity log

Every successful change writes an `activity_logs` row in the same transaction. Rejected, forbidden, foreign, and no-op requests write nothing.

| Action             | Entity   | Metadata                                                                      |
| ------------------ | -------- | ----------------------------------------------------------------------------- |
| `CATEGORY_CREATED` | Category | name                                                                          |
| `CATEGORY_UPDATED` | Category | `changes.name: { from, to }`, `changes.description: { changed: true }`        |
| `CATEGORY_DELETED` | Category | name                                                                          |
| `PRODUCT_CREATED`  | Product  | name, sku                                                                     |
| `PRODUCT_UPDATED`  | Product  | sku, `changes: { field: { from, to } }` (description only as `changed: true`) |
| `PRODUCT_ARCHIVED` | Product  | name, sku                                                                     |
| `PRODUCT_RESTORED` | Product  | name, sku                                                                     |

Descriptions are never copied into the log (free text), and metadata never contains emails, passwords, or tokens.

## Indexes

Evaluated against the list queries (all filter by `organization_id` first):

| Query                                 | Index                                                                 |
| ------------------------------------- | --------------------------------------------------------------------- |
| Default list: newest first            | `products (organization_id, created_at DESC)` (added in this module)  |
| Sort by name                          | `products (organization_id, name)` (added in this module)             |
| Sort by / look up SKU; SKU uniqueness | `products (organization_id, sku)` UNIQUE                              |
| Filter by status                      | `products (organization_id, status)`                                  |
| Filter by category; category counts   | `products (organization_id, category_id)`                             |
| Detail by id                          | `products (organization_id, id)` UNIQUE / primary key                 |
| Category list and name check          | `categories (organization_id, id)` / `(organization_id, name)` UNIQUE |

Not indexed on purpose: substring search (`ILIKE '%…%'`) can't use a B-tree index. It runs on the organization's rows only, which is fine at SMB catalog sizes. Add a `pg_trgm` GIN index on `name` and `sku` when catalogs grow to tens of thousands of products. Sorting by price, cost, minimum stock, or `updated_at` sorts the organization's filtered rows in memory; add indexes only if a real pattern appears.

## Web app

| Route                                           | Screen                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/org/:organizationId/products`                 | List: search (debounced), category/status/sort filters, pagination, archive/restore, table/cards |
| `/org/:organizationId/products/new`             | Create form                                                                                      |
| `/org/:organizationId/products/:productId`      | Detail: all fields, created/updated, Edit / Archive / Restore by permission                      |
| `/org/:organizationId/products/:productId/edit` | Edit form (archived products show "Restore it before editing")                                   |
| `/org/:organizationId/categories`               | Categories with product counts; create/edit in a dialog; delete with confirmation                |

- **URL state:** the product list keeps `search`, `category`, `status`, `sort` (`field:order`), and `page` in the query string (only non-default values), so reload, back/forward, and shared links restore the same view. Changing a filter, the sort, or the search resets to page 1. Invalid values in the URL are ignored and the API validates everything again.
- **Data flow:** pages → hooks in `src/hooks/use-catalog.ts` → `src/api/catalog.ts` → `apiRequest`. Query keys (`catalogKeys`) are nested under `organizationKeys.detail(organizationId)`, so every cache entry belongs to exactly one organization.
- **Switching organizations:** because keys include the organization id, data from workspace A is never served in workspace B. `OrganizationLayout` renders only the organization the URL names and keys the page outlet by organization id, so page state (search text, dialogs, pending mutations) never carries over.
- **After mutations:** create/update/archive/restore put the returned product into its detail cache and invalidate that organization's product lists and categories (counts change). Category changes invalidate categories and product lists (names shown in lists).
- **Forms:** client validation uses the shared limits and patterns. Server errors land on fields: `PRODUCT_SKU_TAKEN` → SKU, `PRODUCT_CATEGORY_NOT_FOUND` → Category, `CATEGORY_NAME_TAKEN` → Name, `VALIDATION_ERROR` details → matching fields. Other errors show a safe message from `apiErrorMessage()`. The submit button is disabled while saving. The edit form sends only changed fields.
- **Confirmations:** archiving asks "Archive product?" (Cancel has initial focus). Restoring needs no confirmation. Deleting a category asks for confirmation, or, when products use it, explains why it can't be deleted and links to those products.
- **Dialogs** (`components/ui/dialog.tsx`) are labelled by their title, move focus inside, keep Tab inside, close with Escape (confirmation dialogs not while their request is running), and return focus to the control that opened them.
- **Permissions in the UI:** Add product and Edit for everyone with `PRODUCTS_CREATE`/`PRODUCTS_UPDATE`; Archive/Restore only with `PRODUCTS_ARCHIVE`; category Add/Edit with `CATEGORIES_CREATE`/`CATEGORIES_UPDATE`; Delete only with `CATEGORIES_DELETE`. Hidden controls are UX only.
- **Responsive:** the product table appears from `xl` (1280 px), the category table from `md` (768 px); below that both render as stacked cards without horizontal scrolling. Forms are one column on phones.

## Tests

- `apps/api/test/database/products-api.db-spec.ts`, `categories-api.db-spec.ts`: endpoints, validation, per-role permissions, search/filter/sort/pagination, archive/restore.
- `catalog-tenant-isolation.db-spec.ts`: organization A can't list, read, modify, archive, delete, or reference B's catalog; counts stay per organization.
- `catalog-activity.db-spec.ts`: events, actor, entity, safe metadata, nothing logged for rejected requests.
- `apps/api/src/organizations/rbac.spec.ts`: the permission matrix.
- `apps/web/src/pages/products-page.test.tsx`, `product-pages.test.tsx`, `categories-page.test.tsx`, `catalog-organization-switch.test.tsx`, `lib/product-form.test.ts`: list, forms, detail, confirmations, error mapping, permissions, and organization switching.

## Seed data

`npm run db:seed` gives Demo Trading Co. four categories (Office Supplies, Packaging, Electronics, Accessories) and ten products, one of them archived (`ACC-MOUSE-WD`). The Accessories additions are ensured on every run, matched by name and SKU, so already-seeded databases get them too and nothing is duplicated.
