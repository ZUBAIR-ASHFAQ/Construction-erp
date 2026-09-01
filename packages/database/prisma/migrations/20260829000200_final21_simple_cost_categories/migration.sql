-- Pass A8: replace legacy BOQ/WBS/Cost Code budget and job-cost dimensions with simple Final-21 cost categories.
-- Stage IDs stay nullable until the Project Stages module creates the authoritative stage table and FK.

DROP TRIGGER IF EXISTS "budget_lines_cost_structure_integrity" ON "budget_lines";
DROP TRIGGER IF EXISTS "cost_commitments_scope_integrity" ON "cost_commitments";
DROP TRIGGER IF EXISTS "cost_actuals_scope_integrity" ON "cost_actuals";
DROP FUNCTION IF EXISTS "module_7_validate_budget_line_scope"();
DROP FUNCTION IF EXISTS "module_7_validate_source_cost_scope"();

ALTER TABLE "budget_lines"
  ADD COLUMN "stage_id" UUID,
  ADD COLUMN "category" VARCHAR(32),
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "planned_amount" DECIMAL(18,2);

UPDATE "budget_lines" line
SET "category" = CASE
      WHEN lower(COALESCE(ct."code", ct."name", '')) LIKE '%material%' THEN 'material'
      WHEN lower(COALESCE(ct."code", ct."name", '')) LIKE '%labour%'
        OR lower(COALESCE(ct."code", ct."name", '')) LIKE '%labor%' THEN 'labour'
      WHEN lower(COALESCE(ct."code", ct."name", '')) LIKE '%security%' THEN 'security'
      WHEN lower(COALESCE(ct."code", ct."name", '')) LIKE '%equipment%' THEN 'equipment'
      WHEN lower(COALESCE(ct."code", ct."name", '')) LIKE '%subcontract%' THEN 'subcontract'
      WHEN lower(COALESCE(ct."code", ct."name", '')) LIKE '%site%expense%' THEN 'site_expense'
      ELSE 'other'
    END,
    "description" = left(COALESCE(cc."name", cc."code", 'Migrated budget line'), 500),
    "planned_amount" = line."amount"
FROM "cost_types" ct, "cost_codes" cc
WHERE ct."id" = line."cost_type_id"
  AND cc."id" = line."cost_code_id";

UPDATE "budget_lines"
SET "category" = COALESCE("category", 'other'),
    "description" = COALESCE("description", 'Migrated budget line'),
    "planned_amount" = COALESCE("planned_amount", "amount");

ALTER TABLE "budget_lines"
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "description" SET NOT NULL,
  ALTER COLUMN "planned_amount" SET NOT NULL,
  ADD CONSTRAINT "budget_lines_category_allowed" CHECK ("category" IN ('material','labour','security','equipment','subcontract','site_expense','other')),
  ADD CONSTRAINT "budget_lines_planned_amount_non_negative" CHECK ("planned_amount" >= 0);

DROP INDEX IF EXISTS "budget_lines_budget_cost_structure_idx";
DROP INDEX IF EXISTS "budget_lines_wbs_node_idx";
DROP INDEX IF EXISTS "budget_lines_cost_code_idx";
DROP INDEX IF EXISTS "budget_lines_cost_type_idx";
ALTER TABLE "budget_lines" DROP CONSTRAINT IF EXISTS "budget_lines_wbs_node_fkey";
ALTER TABLE "budget_lines" DROP CONSTRAINT IF EXISTS "budget_lines_cost_code_fkey";
ALTER TABLE "budget_lines" DROP CONSTRAINT IF EXISTS "budget_lines_cost_type_fkey";
ALTER TABLE "budget_lines"
  DROP COLUMN "wbs_node_id",
  DROP COLUMN "cost_code_id",
  DROP COLUMN "cost_type_id",
  DROP COLUMN "quantity",
  DROP COLUMN "unit_rate",
  DROP COLUMN "amount",
  DROP COLUMN "revenue_amount";
CREATE INDEX "budget_lines_budget_stage_category_idx" ON "budget_lines"("budget_id", "stage_id", "category");

ALTER TABLE "cost_commitments"
  ADD COLUMN "stage_id" UUID,
  ADD COLUMN "category" VARCHAR(32),
  ADD COLUMN "source_key" VARCHAR(700),
  ADD COLUMN "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "cost_commitments" c
SET "category" = CASE
      WHEN lower(COALESCE(ct."code", ct."name", c."source_type")) LIKE '%material%' OR lower(c."source_type") LIKE '%purchase%' THEN 'material'
      WHEN lower(COALESCE(ct."code", ct."name", c."source_type")) LIKE '%labour%'
        OR lower(COALESCE(ct."code", ct."name", c."source_type")) LIKE '%labor%'
        OR lower(c."source_type") LIKE '%payroll%' THEN 'labour'
      WHEN lower(COALESCE(ct."code", ct."name", c."source_type")) LIKE '%security%' THEN 'security'
      WHEN lower(COALESCE(ct."code", ct."name", c."source_type")) LIKE '%equipment%' THEN 'equipment'
      WHEN lower(COALESCE(ct."code", ct."name", c."source_type")) LIKE '%subcontract%' OR lower(c."source_type") LIKE '%subcontract%' THEN 'subcontract'
      WHEN lower(c."source_type") LIKE '%site%expense%' THEN 'site_expense'
      ELSE 'other'
    END,
    "source_key" = c."source_type" || ':' || c."source_id" || ':' || c."source_line_id"
FROM "project_cost_codes" pcc
LEFT JOIN "cost_types" ct ON ct."id" = pcc."cost_type_id"
WHERE pcc."id" = c."cost_structure_id";

UPDATE "cost_commitments"
SET "category" = COALESCE("category", 'other'),
    "source_key" = COALESCE("source_key", "source_type" || ':' || "source_id" || ':' || "source_line_id");

ALTER TABLE "cost_commitments"
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "source_key" SET NOT NULL,
  ADD CONSTRAINT "cost_commitments_category_allowed" CHECK ("category" IN ('material','labour','security','equipment','subcontract','site_expense','other'));
DROP INDEX IF EXISTS "cost_commitments_source_key_uq";
DROP INDEX IF EXISTS "cost_commitments_cost_structure_idx";
ALTER TABLE "cost_commitments" DROP CONSTRAINT IF EXISTS "cost_commitments_cost_structure_fkey";
ALTER TABLE "cost_commitments" DROP COLUMN "cost_structure_id";
CREATE UNIQUE INDEX "cost_commitments_company_source_key_uq" ON "cost_commitments"("company_id", "source_key");
CREATE INDEX "cost_commitments_project_stage_category_status_idx" ON "cost_commitments"("project_id", "stage_id", "category", "status");

ALTER TABLE "cost_actuals"
  ADD COLUMN "stage_id" UUID,
  ADD COLUMN "category" VARCHAR(32),
  ADD COLUMN "source_key" VARCHAR(700);

UPDATE "cost_actuals" a
SET "category" = CASE
      WHEN lower(COALESCE(ct."code", ct."name", a."source_type")) LIKE '%material%' OR lower(a."source_type") LIKE '%inventory%' THEN 'material'
      WHEN lower(COALESCE(ct."code", ct."name", a."source_type")) LIKE '%labour%'
        OR lower(COALESCE(ct."code", ct."name", a."source_type")) LIKE '%labor%'
        OR lower(a."source_type") LIKE '%payroll%' THEN 'labour'
      WHEN lower(COALESCE(ct."code", ct."name", a."source_type")) LIKE '%security%' THEN 'security'
      WHEN lower(COALESCE(ct."code", ct."name", a."source_type")) LIKE '%equipment%' OR lower(a."source_type") LIKE '%equipment%' THEN 'equipment'
      WHEN lower(COALESCE(ct."code", ct."name", a."source_type")) LIKE '%subcontract%' OR lower(a."source_type") LIKE '%subcontract%' THEN 'subcontract'
      WHEN lower(a."source_type") LIKE '%site%expense%' THEN 'site_expense'
      ELSE 'other'
    END,
    "source_key" = a."source_type" || ':' || a."source_id" || ':' || a."source_line_id"
FROM "project_cost_codes" pcc
LEFT JOIN "cost_types" ct ON ct."id" = pcc."cost_type_id"
WHERE pcc."id" = a."cost_structure_id";

UPDATE "cost_actuals"
SET "category" = COALESCE("category", 'other'),
    "source_key" = COALESCE("source_key", "source_type" || ':' || "source_id" || ':' || "source_line_id");

ALTER TABLE "cost_actuals"
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "source_key" SET NOT NULL,
  ADD CONSTRAINT "cost_actuals_category_allowed" CHECK ("category" IN ('material','labour','security','equipment','subcontract','site_expense','other'));
DROP INDEX IF EXISTS "cost_actuals_source_key_uq";
DROP INDEX IF EXISTS "cost_actuals_project_posting_date_idx";
DROP INDEX IF EXISTS "cost_actuals_cost_structure_idx";
ALTER TABLE "cost_actuals" DROP CONSTRAINT IF EXISTS "cost_actuals_cost_structure_fkey";
ALTER TABLE "cost_actuals" DROP COLUMN "cost_structure_id";
CREATE UNIQUE INDEX "cost_actuals_company_source_key_uq" ON "cost_actuals"("company_id", "source_key");
CREATE INDEX "cost_actuals_project_stage_category_date_idx" ON "cost_actuals"("project_id", "stage_id", "category", "posting_date");

-- Client Billing may no longer depend on BOQ. Stage linkage is nullable until Project Stages owns the FK.
ALTER TABLE "progress_claim_lines" ADD COLUMN "stage_id" UUID;
DROP INDEX IF EXISTS "progress_claim_lines_boq_item_idx";
ALTER TABLE "progress_claim_lines" DROP CONSTRAINT IF EXISTS "progress_claim_lines_boq_item_fkey";
ALTER TABLE "progress_claim_lines" DROP COLUMN "boq_item_id";
CREATE INDEX "progress_claim_lines_claim_stage_idx" ON "progress_claim_lines"("claim_id", "stage_id");
