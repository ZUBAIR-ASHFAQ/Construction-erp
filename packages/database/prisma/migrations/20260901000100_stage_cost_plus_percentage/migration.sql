-- Add an optional Stage-specific Cost + Percentage rate while preserving the Project rate as fallback.
ALTER TABLE "project_stages"
  ADD COLUMN "cost_plus_percent" DECIMAL(7,4);

ALTER TABLE "project_stages"
  ADD CONSTRAINT "project_stages_cost_plus_percent_ck"
  CHECK ("cost_plus_percent" IS NULL OR ("cost_plus_percent" > 0 AND "cost_plus_percent" <= 100));
