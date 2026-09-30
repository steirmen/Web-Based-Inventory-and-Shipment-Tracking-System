-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invited_email" VARCHAR(320) NOT NULL,
    "role" "member_role" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_token_hash_key" ON "organization_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_created_at_idx" ON "organization_invitations"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "organization_invitations_organization_id_invited_email_idx" ON "organization_invitations"("organization_id", "invited_email");

-- CreateIndex
CREATE INDEX "organization_invitations_expires_at_idx" ON "organization_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "organization_invitations_invited_by_user_id_idx" ON "organization_invitations"("invited_by_user_id");

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- Hand-written constraints (Prisma's schema language cannot express these).
-- See docs/organizations-rbac.md.
-- =============================================================================

-- At most one OWNER per organization. The application additionally guarantees
-- an organization never loses its owner (ownership moves only via transfer).
CREATE UNIQUE INDEX "organization_members_one_owner_per_organization"
  ON "organization_members" ("organization_id")
  WHERE "role" = 'OWNER';

ALTER TABLE "organization_invitations"
  ADD CONSTRAINT "organization_invitations_email_normalized_check"
    CHECK ("invited_email" = lower(btrim("invited_email")) AND "invited_email" LIKE '_%@_%'),
  -- Ownership is never granted by invitation.
  ADD CONSTRAINT "organization_invitations_role_not_owner_check" CHECK ("role" <> 'OWNER'),
  -- Only a SHA-256 digest can be stored, never a raw (base64url) token.
  ADD CONSTRAINT "organization_invitations_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "organization_invitations_expires_after_creation_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "organization_invitations_accepted_or_revoked_check"
    CHECK ("accepted_at" IS NULL OR "revoked_at" IS NULL);
