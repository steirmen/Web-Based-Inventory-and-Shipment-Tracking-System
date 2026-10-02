-- Phase 10.1: product currency, historical order-line currency, one currency per order,
-- and the user's interface language. See docs/currency.md and docs/localization.md.
--
-- Existing data: money was stored without a currency and shown as a bare amount. Every
-- existing product, order line, and order with lines is migrated to ONE explicit currency,
-- TRY (Turkish lira) — the same for every row, never inferred per record. Orders without
-- lines keep a NULL currency (they get one with their first line). Because every existing
-- line gets the same currency, every existing order satisfies the new rule (one currency
-- per order); no amount is changed.

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('TRY', 'EUR', 'USD');

-- Products: currency of price and cost (default TRY, also for products created without one).
ALTER TABLE "products" ADD COLUMN "currency" "currency" NOT NULL DEFAULT 'TRY';

-- Order lines: snapshot of the product currency (like the name, SKU, and price snapshots).
-- Existing lines are TRY; afterwards the application always sets it, so no default remains.
ALTER TABLE "order_items" ADD COLUMN "currency" "currency" NOT NULL DEFAULT 'TRY';
ALTER TABLE "order_items" ALTER COLUMN "currency" DROP DEFAULT;

-- Orders: the currency of all lines; NULL while there are none.
ALTER TABLE "orders" ADD COLUMN "currency" "currency";
UPDATE "orders" o
SET "currency" = 'TRY'
WHERE EXISTS (
  SELECT 1 FROM "order_items" oi
  WHERE oi."organization_id" = o."organization_id" AND oi."order_id" = o."id"
);

-- An order never mixes currencies: every line has the order's currency. A line can only be
-- added or changed to the order's currency, and an order's currency can only change while
-- it has no lines in another currency (the application clears it when the last line goes).
-- (A line whose order does not exist in its organization is left to the composite foreign
-- key, which reports it as such.)
CREATE FUNCTION order_items_currency_matches_order() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  order_currency "currency";
BEGIN
  SELECT o.currency INTO order_currency
  FROM orders o
  WHERE o.organization_id = NEW.organization_id AND o.id = NEW.order_id;
  IF FOUND AND order_currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'order_items.currency must equal the currency of its order'
      USING ERRCODE = '23514', CONSTRAINT = 'order_items_currency_matches_order';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_items_currency_matches_order
  BEFORE INSERT OR UPDATE OF currency, order_id ON order_items
  FOR EACH ROW EXECUTE FUNCTION order_items_currency_matches_order();

CREATE FUNCTION orders_currency_matches_items() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM order_items oi
    WHERE oi.organization_id = NEW.organization_id
      AND oi.order_id = NEW.id
      AND oi.currency IS DISTINCT FROM NEW.currency
  ) THEN
    RAISE EXCEPTION 'orders.currency must equal the currency of its lines'
      USING ERRCODE = '23514', CONSTRAINT = 'orders_currency_matches_items';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_currency_matches_items
  BEFORE UPDATE OF currency ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_currency_matches_items();

-- Users: interface language, NULL until chosen.
ALTER TABLE "users" ADD COLUMN "language" VARCHAR(5);
ALTER TABLE "users"
  ADD CONSTRAINT "users_language_check" CHECK ("language" IS NULL OR "language" IN ('en', 'tr'));
