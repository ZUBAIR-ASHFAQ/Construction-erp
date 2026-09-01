-- Final 21-module Project Management: add the commercial model/value owned by Project.
ALTER TABLE "projects"
  ADD COLUMN "project_model" VARCHAR(32) NOT NULL DEFAULT 'FIXED_PRICE',
  ADD COLUMN "project_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "cost_plus_percent" DECIMAL(7,4),
  ALTER COLUMN "project_manager_user_id" DROP NOT NULL,
  ALTER COLUMN "location" DROP NOT NULL;

-- Keep Project commercial values valid even when writes bypass the API.
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_project_model_ck"
    CHECK ("project_model" IN ('FIXED_PRICE', 'COST_PLUS_PERCENTAGE')),
  ADD CONSTRAINT "projects_project_value_nonnegative_ck"
    CHECK ("project_value" >= 0),
  ADD CONSTRAINT "projects_cost_plus_percent_ck"
    CHECK (
      ("project_model" = 'FIXED_PRICE' AND "cost_plus_percent" IS NULL)
      OR
      ("project_model" = 'COST_PLUS_PERCENTAGE' AND "cost_plus_percent" > 0 AND "cost_plus_percent" <= 100)
    );
