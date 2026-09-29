-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'DAMAGE', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('DRAFT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'STAFF',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "minimum_stock" INTEGER NOT NULL DEFAULT 0,
    "status" "product_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "movement_type" "stock_movement_type" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "reason" TEXT,
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "transfer_group_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "company_name" VARCHAR(200),
    "address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name_snapshot" VARCHAR(200) NOT NULL,
    "sku_snapshot" VARCHAR(64) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_name_key" ON "categories"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_id_key" ON "categories"("organization_id", "id");

-- CreateIndex
CREATE INDEX "products_organization_id_category_id_idx" ON "products"("organization_id", "category_id");

-- CreateIndex
CREATE INDEX "products_organization_id_status_idx" ON "products"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_sku_key" ON "products"("organization_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_id_key" ON "products"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organization_id_code_key" ON "warehouses"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_organization_id_id_key" ON "warehouses"("organization_id", "id");

-- CreateIndex
CREATE INDEX "inventory_organization_id_product_id_idx" ON "inventory"("organization_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_warehouse_id_product_id_key" ON "inventory"("warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_product_id_created_at_idx" ON "stock_movements"("organization_id", "product_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_warehouse_id_created_at_idx" ON "stock_movements"("organization_id", "warehouse_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_created_at_idx" ON "stock_movements"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_reference_type_reference_id_idx" ON "stock_movements"("organization_id", "reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "stock_movements_transfer_group_id_idx" ON "stock_movements"("transfer_group_id");

-- CreateIndex
CREATE INDEX "stock_movements_actor_user_id_idx" ON "stock_movements"("actor_user_id");

-- CreateIndex
CREATE INDEX "customers_organization_id_name_idx" ON "customers"("organization_id", "name");

-- CreateIndex
CREATE INDEX "customers_organization_id_email_idx" ON "customers"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_id_key" ON "customers"("organization_id", "id");

-- CreateIndex
CREATE INDEX "orders_organization_id_status_created_at_idx" ON "orders"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_organization_id_created_at_idx" ON "orders"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_organization_id_customer_id_idx" ON "orders"("organization_id", "customer_id");

-- CreateIndex
CREATE INDEX "orders_organization_id_warehouse_id_idx" ON "orders"("organization_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_order_number_key" ON "orders"("organization_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_organization_id_id_key" ON "orders"("organization_id", "id");

-- CreateIndex
CREATE INDEX "order_items_organization_id_order_id_idx" ON "order_items"("organization_id", "order_id");

-- CreateIndex
CREATE INDEX "order_items_organization_id_product_id_idx" ON "order_items"("organization_id", "product_id");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_created_at_idx" ON "activity_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_entity_type_entity_id_created_idx" ON "activity_logs"("organization_id", "entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_actor_user_id_idx" ON "activity_logs"("actor_user_id");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- CHECK constraints
-- Hand-written: Prisma's schema language cannot express CHECK constraints.
-- Prisma does not diff CHECK constraints, so future `migrate dev` runs keep them.
-- See docs/database-design.md ("Integrity constraints").
-- =============================================================================

-- users: emails are stored normalized (trimmed, lowercase) so the unique index
-- also prevents case variants of the same address.
ALTER TABLE "users"
  ADD CONSTRAINT "users_name_not_blank_check" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower(btrim("email")) AND "email" LIKE '_%@_%');

-- organizations: slug is URL-safe (lowercase letters, digits, single hyphens).
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_name_not_blank_check" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "organizations_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_not_blank_check" CHECK (btrim("name") <> '');

ALTER TABLE "products"
  ADD CONSTRAINT "products_name_not_blank_check" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "products_sku_not_blank_check" CHECK (btrim("sku") <> ''),
  ADD CONSTRAINT "products_price_non_negative_check" CHECK ("price" >= 0),
  ADD CONSTRAINT "products_cost_non_negative_check" CHECK ("cost" >= 0),
  ADD CONSTRAINT "products_minimum_stock_non_negative_check" CHECK ("minimum_stock" >= 0);

ALTER TABLE "warehouses"
  ADD CONSTRAINT "warehouses_name_not_blank_check" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "warehouses_code_not_blank_check" CHECK (btrim("code") <> '');

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_quantity_non_negative_check" CHECK ("quantity" >= 0);

-- stock_movements: every row is a consistent ledger entry.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_delta_non_zero_check" CHECK ("quantity_delta" <> 0),
  ADD CONSTRAINT "stock_movements_quantity_before_non_negative_check" CHECK ("quantity_before" >= 0),
  ADD CONSTRAINT "stock_movements_quantity_after_non_negative_check" CHECK ("quantity_after" >= 0),
  ADD CONSTRAINT "stock_movements_quantity_balance_check" CHECK ("quantity_after" = "quantity_before" + "quantity_delta"),
  -- Inbound types add stock, outbound types remove it; adjustments may go either way.
  ADD CONSTRAINT "stock_movements_delta_direction_check" CHECK (
    ("movement_type" IN ('PURCHASE', 'TRANSFER_IN') AND "quantity_delta" > 0)
    OR ("movement_type" IN ('SALE', 'DAMAGE', 'TRANSFER_OUT') AND "quantity_delta" < 0)
    OR "movement_type" = 'ADJUSTMENT'
  ),
  -- Transfer rows must carry a transfer group; other rows must not.
  ADD CONSTRAINT "stock_movements_transfer_group_check" CHECK (
    ("movement_type" IN ('TRANSFER_IN', 'TRANSFER_OUT')) = ("transfer_group_id" IS NOT NULL)
  ),
  -- A reference is either complete (type + id) or absent.
  ADD CONSTRAINT "stock_movements_reference_pair_check" CHECK (
    ("reference_type" IS NULL) = ("reference_id" IS NULL)
  );

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_name_not_blank_check" CHECK (btrim("name") <> '');

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_order_number_not_blank_check" CHECK (btrim("order_number") <> ''),
  ADD CONSTRAINT "orders_subtotal_non_negative_check" CHECK ("subtotal" >= 0),
  ADD CONSTRAINT "orders_total_non_negative_check" CHECK ("total" >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_unit_price_non_negative_check" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "order_items_line_total_non_negative_check" CHECK ("line_total" >= 0),
  ADD CONSTRAINT "order_items_snapshots_not_blank_check" CHECK (btrim("product_name_snapshot") <> '' AND btrim("sku_snapshot") <> '');

ALTER TABLE "activity_logs"
  ADD CONSTRAINT "activity_logs_action_not_blank_check" CHECK (btrim("action") <> ''),
  ADD CONSTRAINT "activity_logs_entity_type_not_blank_check" CHECK (btrim("entity_type") <> '');
