-- Pass B10: align Final Module 9 Project Budget & Cost Tracking to the controlling 21-module contract.
-- Historical migrations stay untouched; this forward migration preserves usable data while removing legacy fields.

-- Project budget versions now store only the Final-21 baseline fields.
ALTER TABLE "project_budgets" DROP CONSTRAINT IF EXISTS "project_budgets_budget_type_not_blank";
ALTER TABLE "project_budgets" RENAME COLUMN "approved_at" TO "frozen_at";
ALTER TABLE "project_budgets" RENAME COLUMN "total_cost" TO "total_amount";
ALTER TABLE "project_budgets"
  ADD COLUMN "currency" CHAR(3),
  ADD COLUMN "created_by" UUID;

UPDATE "project_budgets" budget
SET "currency" = project."currency",
    "created_by" = COALESCE(
      project."project_manager_user_id",
      (
        SELECT user_row."id"
        FROM "users" user_row
        WHERE user_row."company_id" = budget."company_id"
        ORDER BY user_row."created_at", user_row."id"
        LIMIT 1
      )
    )
FROM "projects" project
WHERE project."id" = budget."project_id"
  AND project."company_id" = budget."company_id";

ALTER TABLE "project_budgets"
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "created_by" SET NOT NULL,
  DROP COLUMN "budget_type",
  DROP COLUMN "total_revenue",
  ADD CONSTRAINT "project_budgets_total_amount_non_negative" CHECK ("total_amount" >= 0),
  ADD CONSTRAINT "project_budgets_created_by_company_fkey"
    FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "project_budgets_created_by_idx" ON "project_budgets"("created_by");

-- Budget lines may reference only a Stage from the same Company Project as the owning budget.
ALTER TABLE "budget_lines"
  ADD CONSTRAINT "budget_lines_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "module_9_validate_budget_line_stage_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  budget_project_id UUID;
  budget_company_id UUID;
BEGIN
  IF NEW."stage_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "project_id", "company_id"
    INTO budget_project_id, budget_company_id
  FROM "project_budgets"
  WHERE "id" = NEW."budget_id";

  IF budget_project_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM "project_stages"
    WHERE "id" = NEW."stage_id"
      AND "project_id" = budget_project_id
      AND "company_id" = budget_company_id
  ) THEN
    RAISE EXCEPTION 'Budget Stage must belong to the same Company Project.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "budget_lines_stage_scope_integrity" ON "budget_lines";
CREATE TRIGGER "budget_lines_stage_scope_integrity"
BEFORE INSERT OR UPDATE OF "budget_id", "stage_id"
ON "budget_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_9_validate_budget_line_stage_scope"();

-- Commitments keep one source-keyed amount instead of duplicate legacy amount columns/line IDs.
ALTER TABLE "cost_commitments" DROP CONSTRAINT IF EXISTS "cost_commitments_source_line_id_not_blank";
ALTER TABLE "cost_commitments" RENAME COLUMN "remaining_amount" TO "amount";
ALTER TABLE "cost_commitments"
  DROP COLUMN "original_amount",
  DROP COLUMN "source_line_id";

ALTER TABLE "cost_commitments"
  ADD CONSTRAINT "cost_commitments_stage_project_fkey"
    FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Actuals are append-only source-keyed rows; the old source-line field is redundant once encoded in source_key.
ALTER TABLE "cost_actuals" DROP CONSTRAINT IF EXISTS "cost_actuals_source_line_id_not_blank";
ALTER TABLE "cost_actuals" DROP COLUMN "source_line_id";
ALTER TABLE "cost_actuals"
  ADD CONSTRAINT "cost_actuals_stage_project_fkey"
    FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Convert dated budget-line forecast snapshots into one current Project/Stage/category forecast read model.
DROP TRIGGER IF EXISTS "forecast_lines_project_integrity" ON "forecast_lines";
DROP FUNCTION IF EXISTS "module_7_validate_forecast_scope"();
ALTER TABLE "forecast_lines" DROP CONSTRAINT IF EXISTS "forecast_lines_budget_line_fkey";
DROP INDEX IF EXISTS "forecast_lines_project_budget_line_date_uq";
DROP INDEX IF EXISTS "forecast_lines_project_as_of_date_idx";
DROP INDEX IF EXISTS "forecast_lines_budget_line_as_of_date_idx";

ALTER TABLE "forecast_lines"
  ADD COLUMN "stage_id" UUID,
  ADD COLUMN "category" VARCHAR(32),
  ADD COLUMN "forecast_amount" DECIMAL(18,2),
  ADD COLUMN "updated_by" UUID,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6);

UPDATE "forecast_lines" forecast
SET "stage_id" = line."stage_id",
    "category" = line."category",
    "forecast_amount" = forecast."forecast_final_cost",
    "updated_by" = COALESCE(
      project."project_manager_user_id",
      (
        SELECT user_row."id"
        FROM "users" user_row
        WHERE user_row."company_id" = project."company_id"
        ORDER BY user_row."created_at", user_row."id"
        LIMIT 1
      )
    ),
    "updated_at" = forecast."as_of_date"::timestamp AT TIME ZONE 'UTC'
FROM "budget_lines" line
JOIN "project_budgets" budget ON budget."id" = line."budget_id"
JOIN "projects" project ON project."id" = budget."project_id"
WHERE line."id" = forecast."budget_line_id"
  AND project."id" = forecast."project_id";

-- Preserve only the newest legacy row for each new Project/Stage/category key.
DELETE FROM "forecast_lines" old_row
USING (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "project_id", COALESCE("stage_id", '00000000-0000-0000-0000-000000000000'::uuid), "category"
           ORDER BY "as_of_date" DESC, "id" DESC
         ) AS row_no
  FROM "forecast_lines"
) ranked
WHERE old_row."id" = ranked."id"
  AND ranked.row_no > 1;

ALTER TABLE "forecast_lines"
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "forecast_amount" SET NOT NULL,
  ALTER COLUMN "updated_by" SET NOT NULL,
  ALTER COLUMN "updated_at" SET NOT NULL,
  DROP COLUMN "budget_line_id",
  DROP COLUMN "as_of_date",
  DROP COLUMN "estimate_to_complete",
  DROP COLUMN "forecast_final_cost",
  DROP COLUMN "forecast_final_revenue",
  DROP COLUMN "notes",
  ADD CONSTRAINT "forecast_lines_category_allowed" CHECK ("category" IN ('material','labour','security','equipment','subcontract','site_expense','other')),
  ADD CONSTRAINT "forecast_lines_amount_non_negative" CHECK ("forecast_amount" >= 0),
  ADD CONSTRAINT "forecast_lines_stage_project_fkey"
    FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "forecast_lines_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL expression uniqueness also treats Project-level NULL Stage as one logical key.
CREATE UNIQUE INDEX "forecast_lines_project_stage_category_uq"
  ON "forecast_lines"(
    "project_id",
    COALESCE("stage_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "category"
  );
CREATE INDEX "forecast_lines_project_stage_category_idx"
  ON "forecast_lines"("project_id", "stage_id", "category");
CREATE INDEX "forecast_lines_updated_by_at_idx"
  ON "forecast_lines"("updated_by", "updated_at");

-- Keep forecast authors inside the same Company as the selected Project.
CREATE OR REPLACE FUNCTION "module_9_validate_forecast_actor_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  project_company_id UUID;
  actor_company_id UUID;
BEGIN
  SELECT "company_id" INTO project_company_id FROM "projects" WHERE "id" = NEW."project_id";
  SELECT "company_id" INTO actor_company_id FROM "users" WHERE "id" = NEW."updated_by";

  IF project_company_id IS NULL OR actor_company_id IS DISTINCT FROM project_company_id THEN
    RAISE EXCEPTION 'Forecast author must belong to the same Company as the Project.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "forecast_lines_actor_scope_integrity"
BEFORE INSERT OR UPDATE OF "project_id", "updated_by"
ON "forecast_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_9_validate_forecast_actor_scope"();
