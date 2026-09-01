-- Pass 370 closes the reviewed Module-11 durable readback, approved revision-history and retention-release gaps.
-- The repair preserves the original five source-owned tables and adds only two immutable evidence tables.
-- Finance/AP posting remains deferred to Stage 26 and Change Order target adapters remain deferred to Stage 27.

CREATE TABLE "subcontract_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subcontract_id" UUID NOT NULL,
  "revision_no" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "previous_value" DECIMAL(18,2) NOT NULL,
  "revised_value" DECIMAL(18,2) NOT NULL,
  "before_snapshot_json" JSONB NOT NULL,
  "after_snapshot_json" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subcontract_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subcontract_revisions_revision_positive_ck" CHECK ("revision_no" > 0),
  CONSTRAINT "subcontract_revisions_previous_nonnegative_ck" CHECK ("previous_value" >= 0),
  CONSTRAINT "subcontract_revisions_revised_nonnegative_ck" CHECK ("revised_value" >= 0),
  CONSTRAINT "subcontract_revisions_subcontract_fk" FOREIGN KEY ("subcontract_id") REFERENCES "subcontracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subcontract_revisions_creator_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "subcontract_revisions_subcontract_revision_uq" ON "subcontract_revisions"("subcontract_id", "revision_no");
CREATE INDEX "subcontract_revisions_subcontract_created_idx" ON "subcontract_revisions"("subcontract_id", "created_at");
CREATE INDEX "subcontract_revisions_creator_idx" ON "subcontract_revisions"("created_by");

CREATE TABLE "subcontract_retention_releases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subcontract_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "released_by" UUID NOT NULL,
  "released_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subcontract_retention_releases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subcontract_retention_releases_amount_positive_ck" CHECK ("amount" > 0),
  CONSTRAINT "subcontract_retention_releases_subcontract_fk" FOREIGN KEY ("subcontract_id") REFERENCES "subcontracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subcontract_retention_releases_releaser_fk" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "subcontract_retention_releases_subcontract_released_idx" ON "subcontract_retention_releases"("subcontract_id", "released_at");
CREATE INDEX "subcontract_retention_releases_releaser_idx" ON "subcontract_retention_releases"("released_by");

-- Ensure immutable history actors belong to the same Company as the owning Subcontract.
CREATE OR REPLACE FUNCTION module_11_validate_revision_actor_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  subcontract_company UUID;
  actor_company UUID;
BEGIN
  SELECT company_id INTO subcontract_company FROM subcontracts WHERE id = NEW.subcontract_id;
  SELECT company_id INTO actor_company FROM users WHERE id = NEW.created_by;

  IF subcontract_company IS NULL OR actor_company IS NULL OR subcontract_company <> actor_company THEN
    RAISE EXCEPTION 'Module 11 revision creator must belong to the owning Subcontract Company';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "subcontract_revisions_actor_scope_integrity"
BEFORE INSERT OR UPDATE ON "subcontract_revisions"
FOR EACH ROW
EXECUTE FUNCTION module_11_validate_revision_actor_scope();

CREATE OR REPLACE FUNCTION module_11_validate_retention_release_actor_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  subcontract_company UUID;
  actor_company UUID;
BEGIN
  SELECT company_id INTO subcontract_company FROM subcontracts WHERE id = NEW.subcontract_id;
  SELECT company_id INTO actor_company FROM users WHERE id = NEW.released_by;

  IF subcontract_company IS NULL OR actor_company IS NULL OR subcontract_company <> actor_company THEN
    RAISE EXCEPTION 'Module 11 retention releaser must belong to the owning Subcontract Company';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "subcontract_retention_releases_actor_scope_integrity"
BEFORE INSERT OR UPDATE ON "subcontract_retention_releases"
FOR EACH ROW
EXECUTE FUNCTION module_11_validate_retention_release_actor_scope();


-- Preserve approved revision and retention-release evidence as append-only history.
CREATE OR REPLACE FUNCTION module_11_reject_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Module 11 approved history is immutable';
END;
$$;

CREATE TRIGGER "subcontract_revisions_immutable"
BEFORE UPDATE OR DELETE ON "subcontract_revisions"
FOR EACH ROW
EXECUTE FUNCTION module_11_reject_history_mutation();

CREATE TRIGGER "subcontract_retention_releases_immutable"
BEFORE UPDATE OR DELETE ON "subcontract_retention_releases"
FOR EACH ROW
EXECUTE FUNCTION module_11_reject_history_mutation();
