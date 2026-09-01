-- Final-21 Pass B13: align Module 12 Equipment Management to Project/Stage assignments,
-- simple usage/rental costing, maintenance history and the exact six-route contract.
-- Historical migrations remain immutable; this migration transforms the active Equipment tables forward.

-- Retire Stage-17 triggers/functions before their legacy columns are changed.
DROP TRIGGER IF EXISTS "equipment_assignments_scope_integrity" ON "equipment_assignments";
DROP FUNCTION IF EXISTS "module_12_validate_equipment_assignment_scope"();
DROP TRIGGER IF EXISTS "equipment_usage_scope_integrity" ON "equipment_usage";
DROP FUNCTION IF EXISTS "module_12_validate_equipment_usage_scope"();
DROP TRIGGER IF EXISTS "equipment_usage_posted_immutable_update" ON "equipment_usage";
DROP TRIGGER IF EXISTS "equipment_usage_posted_immutable_delete" ON "equipment_usage";
DROP FUNCTION IF EXISTS "prevent_posted_equipment_usage_mutation"();

-- Final Equipment master naming and fields.
ALTER TABLE "equipment" RENAME COLUMN "equipment_code" TO "code";
ALTER TABLE "equipment" RENAME COLUMN "category" TO "equipment_type";
ALTER TABLE "equipment" RENAME COLUMN "cost_rate_per_hour" TO "default_rate";
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "rate_unit" VARCHAR(32);
UPDATE "equipment" SET "rate_unit" = 'HOUR' WHERE "default_rate" IS NOT NULL AND "rate_unit" IS NULL;
ALTER TABLE "equipment" DROP COLUMN IF EXISTS "serial_no";
ALTER TABLE "equipment" DROP COLUMN IF EXISTS "plate_no";
DROP INDEX IF EXISTS "equipment_company_category_status_idx";
CREATE INDEX IF NOT EXISTS "equipment_company_type_status_idx" ON "equipment"("company_id", "equipment_type", "status");

ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_code_not_blank";
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_category_not_blank";
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_cost_rate_nonnegative";
ALTER TABLE "equipment"
  ADD CONSTRAINT "equipment_code_not_blank" CHECK (length(btrim("code")) > 0),
  ADD CONSTRAINT "equipment_type_not_blank" CHECK (length(btrim("equipment_type")) > 0),
  ADD CONSTRAINT "equipment_default_rate_nonnegative" CHECK ("default_rate" IS NULL OR "default_rate" >= 0),
  ADD CONSTRAINT "equipment_rate_pair_ck" CHECK (("default_rate" IS NULL) = ("rate_unit" IS NULL));

-- Add optional Stage ownership to Equipment assignments while preserving existing Project periods.
ALTER TABLE "equipment_assignments" ADD COLUMN IF NOT EXISTS "stage_id" UUID;
DROP INDEX IF EXISTS "equipment_assignments_project_dates_idx";
CREATE INDEX IF NOT EXISTS "equipment_assignments_project_stage_dates_idx"
  ON "equipment_assignments"("project_id", "stage_id", "from_date", "to_date");
ALTER TABLE "equipment_assignments" DROP CONSTRAINT IF EXISTS "equipment_assignments_stage_project_fkey";
ALTER TABLE "equipment_assignments"
  ADD CONSTRAINT "equipment_assignments_stage_project_fkey"
  FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Final assignment integrity: same Company, valid Stage/Project, and no overlapping exclusive periods.
CREATE FUNCTION "final21_validate_equipment_assignment_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  equipment_company_id UUID;
  project_company_id UUID;
  stage_project_id UUID;
BEGIN
  SELECT "company_id" INTO equipment_company_id FROM "equipment" WHERE "id" = NEW."equipment_id";
  SELECT "company_id" INTO project_company_id FROM "projects" WHERE "id" = NEW."project_id";

  IF equipment_company_id IS DISTINCT FROM project_company_id THEN
    RAISE EXCEPTION 'Equipment assignment Equipment and Project must belong to the same Company' USING ERRCODE = '23514';
  END IF;

  IF NEW."stage_id" IS NOT NULL THEN
    SELECT "project_id" INTO stage_project_id FROM "project_stages" WHERE "id" = NEW."stage_id";
    IF stage_project_id IS DISTINCT FROM NEW."project_id" THEN
      RAISE EXCEPTION 'Equipment assignment Stage must belong to the assignment Project' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."equipment_id"::text, 0));
  IF EXISTS (
    SELECT 1
    FROM "equipment_assignments" existing
    WHERE existing."equipment_id" = NEW."equipment_id"
      AND existing."id" <> NEW."id"
      AND existing."from_date" <= COALESCE(NEW."to_date", 'infinity'::date)
      AND NEW."from_date" <= COALESCE(existing."to_date", 'infinity'::date)
  ) THEN
    RAISE EXCEPTION 'Equipment assignment periods may not overlap' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER "equipment_assignments_scope_integrity"
BEFORE INSERT OR UPDATE OF "equipment_id", "project_id", "stage_id", "from_date", "to_date"
ON "equipment_assignments"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_equipment_assignment_scope"();

-- Add final usage columns before migrating legacy usage rows.
ALTER TABLE "equipment_usage" ADD COLUMN IF NOT EXISTS "assignment_id" UUID;
ALTER TABLE "equipment_usage" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(18,4);
ALTER TABLE "equipment_usage" ADD COLUMN IF NOT EXISTS "rate" DECIMAL(18,4);
ALTER TABLE "equipment_usage" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(18,2);
ALTER TABLE "equipment_usage" ADD COLUMN IF NOT EXISTS "entered_by" UUID;
ALTER TABLE "equipment_usage" ADD COLUMN IF NOT EXISTS "status" VARCHAR(32);

-- Resolve every historical usage row to the assignment that covered the same Equipment/Project/date.
WITH resolved AS (
  SELECT
    u."id" AS usage_id,
    a."id" AS assignment_id,
    a."assigned_by" AS entered_by,
    COALESCE(e."default_rate",
      CASE WHEN u."hours" > 0 THEN round((u."cost_amount" / u."hours")::numeric, 4) ELSE 0 END
    ) AS rate
  FROM "equipment_usage" u
  JOIN "equipment" e ON e."id" = u."equipment_id"
  JOIN LATERAL (
    SELECT candidate."id", candidate."assigned_by"
    FROM "equipment_assignments" candidate
    WHERE candidate."equipment_id" = u."equipment_id"
      AND candidate."project_id" = u."project_id"
      AND candidate."from_date" <= u."usage_date"
      AND (candidate."to_date" IS NULL OR candidate."to_date" >= u."usage_date")
    ORDER BY candidate."from_date" DESC, candidate."id"
    LIMIT 1
  ) a ON TRUE
)
UPDATE "equipment_usage" u
SET
  "assignment_id" = resolved.assignment_id,
  "quantity" = u."hours",
  "rate" = resolved.rate,
  "amount" = u."cost_amount",
  "entered_by" = resolved.entered_by,
  "status" = CASE WHEN upper(COALESCE(u."approval_status", 'RECORDED')) = 'POSTED' THEN 'POSTED' ELSE upper(COALESCE(u."approval_status", 'RECORDED')) END
FROM resolved
WHERE resolved.usage_id = u."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "equipment_usage" WHERE "assignment_id" IS NULL OR "entered_by" IS NULL) THEN
    RAISE EXCEPTION 'B13 cannot migrate Equipment usage without a matching historical assignment/actor';
  END IF;
END;
$$;

-- Remove legacy usage dimensions and keep assignment as the single Project/Stage cost destination.
ALTER TABLE "equipment_usage" DROP CONSTRAINT IF EXISTS "equipment_usage_equipment_fkey";
ALTER TABLE "equipment_usage" DROP CONSTRAINT IF EXISTS "equipment_usage_project_fkey";
ALTER TABLE "equipment_usage" DROP CONSTRAINT IF EXISTS "equipment_usage_cost_structure_fkey";
DROP INDEX IF EXISTS "equipment_usage_equipment_date_idx";
DROP INDEX IF EXISTS "equipment_usage_project_date_idx";
DROP INDEX IF EXISTS "equipment_usage_cost_structure_date_idx";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "equipment_id";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "project_id";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "hours";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "meter_start";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "meter_end";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "fuel_qty";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "cost_amount";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "cost_structure_id";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "approval_status";
ALTER TABLE "equipment_usage" DROP COLUMN IF EXISTS "posted_at";
ALTER TABLE "equipment_usage" ALTER COLUMN "assignment_id" SET NOT NULL;
ALTER TABLE "equipment_usage" ALTER COLUMN "quantity" SET NOT NULL;
ALTER TABLE "equipment_usage" ALTER COLUMN "rate" SET NOT NULL;
ALTER TABLE "equipment_usage" ALTER COLUMN "amount" SET NOT NULL;
ALTER TABLE "equipment_usage" ALTER COLUMN "entered_by" SET NOT NULL;
ALTER TABLE "equipment_usage" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "equipment_usage"
  ADD CONSTRAINT "equipment_usage_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "equipment_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "equipment_usage_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "equipment_usage_quantity_nonnegative" CHECK ("quantity" >= 0),
  ADD CONSTRAINT "equipment_usage_rate_nonnegative" CHECK ("rate" >= 0),
  ADD CONSTRAINT "equipment_usage_amount_nonnegative" CHECK ("amount" >= 0);
CREATE INDEX IF NOT EXISTS "equipment_usage_assignment_date_idx" ON "equipment_usage"("assignment_id", "usage_date");
CREATE INDEX IF NOT EXISTS "equipment_usage_entered_by_date_idx" ON "equipment_usage"("entered_by", "usage_date");
ALTER TABLE "equipment_usage"
  ADD CONSTRAINT "equipment_usage_status_not_blank" CHECK (length(btrim("status")) > 0);

-- Posted usage is immutable history. Future corrections must use a reviewed compensating adjustment/reversal flow.
CREATE FUNCTION "final21_prevent_posted_equipment_usage_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF upper(COALESCE(OLD."status", '')) = 'POSTED' THEN
    RAISE EXCEPTION 'Posted Equipment usage is immutable; use a compensating adjustment or reversal' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "equipment_usage_posted_immutable_update"
BEFORE UPDATE ON "equipment_usage"
FOR EACH ROW EXECUTE FUNCTION "final21_prevent_posted_equipment_usage_mutation"();
CREATE TRIGGER "equipment_usage_posted_immutable_delete"
BEFORE DELETE ON "equipment_usage"
FOR EACH ROW EXECUTE FUNCTION "final21_prevent_posted_equipment_usage_mutation"();

-- assigned_by was only legacy row metadata; Foundation audit owns actor history in Final-21.
ALTER TABLE "equipment_assignments" DROP CONSTRAINT IF EXISTS "equipment_assignments_assigned_by_fkey";
ALTER TABLE "equipment_assignments" DROP COLUMN IF EXISTS "assigned_by";

-- Simplify maintenance to the exact Final Module 12 history fields.
ALTER TABLE "equipment_maintenance" RENAME COLUMN "maintenance_type" TO "type";
ALTER TABLE "equipment_maintenance" RENAME COLUMN "scheduled_date" TO "maintenance_date";
ALTER TABLE "equipment_maintenance" RENAME COLUMN "notes" TO "note";
ALTER TABLE "equipment_maintenance" DROP COLUMN IF EXISTS "completed_date";
ALTER TABLE "equipment_maintenance" DROP COLUMN IF EXISTS "meter_reading";
ALTER TABLE "equipment_maintenance" ALTER COLUMN "note" DROP NOT NULL;
ALTER TABLE "equipment_maintenance" DROP CONSTRAINT IF EXISTS "equipment_maintenance_cost_nonnegative";
ALTER TABLE "equipment_maintenance"
  ADD CONSTRAINT "equipment_maintenance_cost_nonnegative" CHECK ("cost" >= 0);
DROP INDEX IF EXISTS "equipment_maintenance_equipment_scheduled_idx";
DROP INDEX IF EXISTS "equipment_maintenance_equipment_status_scheduled_idx";
CREATE INDEX IF NOT EXISTS "equipment_maintenance_equipment_date_idx" ON "equipment_maintenance"("equipment_id", "maintenance_date");
CREATE INDEX IF NOT EXISTS "equipment_maintenance_equipment_status_date_idx" ON "equipment_maintenance"("equipment_id", "status", "maintenance_date");

-- Final Module 12 permission vocabulary. Existing old grants are moved to the replacement permissions.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'equipment.read', 'Read Equipment', 'equipment'),
  (gen_random_uuid(), 'equipment.manage', 'Manage Equipment', 'equipment'),
  (gen_random_uuid(), 'equipment.assign', 'Assign Equipment', 'equipment'),
  (gen_random_uuid(), 'equipment.usage.create', 'Record Equipment Usage', 'equipment'),
  (gen_random_uuid(), 'equipment.maintenance.manage', 'Manage Equipment Maintenance', 'equipment')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", replacement."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'equipment.usage'
JOIN "permissions" replacement ON replacement."code" = 'equipment.usage.create'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", replacement."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'equipment.maintenance'
JOIN "permissions" replacement ON replacement."code" = 'equipment.maintenance.manage'
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" IN ('equipment.usage', 'equipment.maintenance'));
DELETE FROM "permissions" WHERE "code" IN ('equipment.usage', 'equipment.maintenance');
