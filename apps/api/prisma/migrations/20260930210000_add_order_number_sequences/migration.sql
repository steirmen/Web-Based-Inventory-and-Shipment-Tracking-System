-- CreateTable
CREATE TABLE "order_number_sequences" (
    "organization_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_number_sequences_pkey" PRIMARY KEY ("organization_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_product_id_key" ON "order_items"("order_id", "product_id");

-- AddForeignKey
ALTER TABLE "order_number_sequences" ADD CONSTRAINT "order_number_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK constraints (not expressible in Prisma).
ALTER TABLE "order_number_sequences"
  ADD CONSTRAINT "order_number_sequences_last_number_non_negative_check" CHECK ("last_number" >= 0);

-- Backfill: continue after the highest existing "SO-<number>" of every organization,
-- so generated numbers never collide with orders created before this migration.
INSERT INTO "order_number_sequences" ("organization_id", "last_number")
SELECT "organization_id", MAX(CAST(substring("order_number" FROM '^SO-([0-9]{1,9})$') AS INTEGER))
FROM "orders"
WHERE "order_number" ~ '^SO-[0-9]{1,9}$'
GROUP BY "organization_id";
