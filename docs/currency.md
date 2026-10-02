# Currency

Phase 10.1. Products are priced in **TRY**, **EUR**, or **USD**. The database stores ISO 4217 codes, never symbols. Symbols (`₺`, `€`, `$`) and the number layout are presentation only, produced by `Intl`.

There is **no foreign-exchange conversion** anywhere. Amounts in different currencies are never added together.

## Model

`Currency` is a Prisma enum mapped to the PostgreSQL enum `currency` (`TRY`, `EUR`, `USD`). The shared list is `CURRENCIES`/`DEFAULT_CURRENCY = 'TRY'`/`isCurrency()` in `packages/shared/src/currency.ts`.

| Column                 | Rule                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products.currency`    | NOT NULL, default `TRY`. Price **and** cost are in this one currency.                                                                                                             |
| `order_items.currency` | NOT NULL, the product's currency **copied when the line is written**: a historical snapshot like `unit_price`. Changing a product's currency later never changes existing orders. |
| `orders.currency`      | Nullable. The currency of every line; `NULL` while the order has no lines.                                                                                                        |

Migration `20261002150000_add_currency_and_language`:

- creates the enum and the columns;
- **backfills every existing product, order line, and order with `TRY`**. The application only ever used Turkish lira before; the data audit found 11 products, 16 lines, and 10 orders, all TRY, with no mixed orders.
- After the backfill, the `order_items.currency` default is dropped, so the application must always write a line's currency explicitly. No mixed defaults are ever assigned silently.

Two triggers keep an order to one currency, even against direct SQL. Both raise SQLSTATE `23514`:

- `order_items_currency_matches_order`: a line's currency must equal its order's currency;
- `orders_currency_matches_items`: an order's currency cannot change away from its lines' currency.

`npm run db:verify` includes the `order-currency` check (orders whose lines disagree, or with a currency and no lines, or without one but with lines).

## API rules

- **Products:**
  - `currency` is optional on create (default `TRY`) and changeable on update;
  - validation is `@IsIn(CURRENCIES)`, so `BTC`, `abc`, `null`, or markup get `400 VALIDATION_ERROR`;
  - price and cost keep their decimal-string rules ([products-categories.md](products-categories.md));
  - activity metadata records the currency.
- **Orders, one currency per order:**
  - the first line sets `orders.currency`;
  - adding a product in another currency is refused with `422 ORDER_CURRENCY_MISMATCH`, whose message names the product and both currencies;
  - replacing all lines of a draft can switch the currency;
  - emptying a draft resets it to `null`;
  - totals are summed only within the order, which has a single currency;
  - existing lines keep their snapshot currency.
- **Dashboard and sales report:**
  - money KPIs, the sales chart, top products, and the sales report show **one currency at a time** (query `currency`);
  - without a `currency` query, the server picks the currency with the most realized orders in the period (then in the previous period), else `TRY`;
  - responses include `currency` (the one shown) and `currencies` (every currency with sales in either period);
  - order counts and stock figures are currency-independent;
  - recent orders carry their own currency.
- **Orders report:**
  - an optional `currency` filter;
  - each row has the order's currency;
  - `totals.values` is a list of `{ currency, amount }`, one per currency, never one mixed sum.
- **Exports:** money cells carry their currency; see [export.md](export.md).

## Web

- **`useFormat().money(amount, currency)`** (`i18n/format.ts`) is the only money formatter:
  - it uses `Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })`;
  - the decimal string goes to `Intl` as an exact numeric literal, never through `Number()`;
  - examples: `₺1,250.50` in English, `₺1.250,50` in Turkish, `€120.00`, `$70.50`;
  - with `currency = null` (an order with no lines) only the amount is shown.
- `currencySymbol(currency, locale)` (`lib/money.ts`) gives the symbol shown inside a money input.
- **Product form:** `Price [₺ 120.00][TRY ▼]`, `Cost [₺ 70.00] TRY`:
  - one currency select sits next to the price;
  - the cost shows the same currency;
  - the layout stacks on narrow screens.
- **Order builder:**
  - the first line fixes the currency;
  - picking a product in another currency shows an inline error on the product picker, and the line is not added (the server refuses it too);
  - totals show the order's currency.
- **Lists and detail pages** (products, orders, customers, inventory, reports, dashboard) always pass the record's own currency.
- **Dashboard / sales report:** when the period has sales in more than one currency, a currency switch (`CurrencySwitch`) appears. The choice is kept in the URL (`currency=EUR`) and carried by links to the sales report.

## Seed

`npm run db:seed` adds two non-TRY products, each idempotent:

- "Ergonomic Office Chair" (`ACC-CHAIR-ERG`, EUR 249.00);
- "Noise-Cancelling Headset" (`ELE-HEADSET-NC`, USD 129.00).

It also adds one EUR draft order ("Quote for two chairs, priced in EUR."). Existing demo data stays TRY.
