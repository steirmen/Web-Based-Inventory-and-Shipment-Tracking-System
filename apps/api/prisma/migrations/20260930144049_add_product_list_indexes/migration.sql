-- CreateIndex
CREATE INDEX "products_organization_id_created_at_idx" ON "products"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "products_organization_id_name_idx" ON "products"("organization_id", "name");
