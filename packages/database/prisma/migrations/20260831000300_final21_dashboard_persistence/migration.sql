-- Final-21 Pass B1.2: add only Dashboard user preference persistence.
-- Dashboard remains a read layer over approved source modules; no KPI, progress,
-- cost, billing, receipt, payable, cash or profitability totals are stored here.

CREATE TABLE "dashboard_preferences" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "layout_json" JSONB NOT NULL,
  "default_project_id" UUID,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dashboard_saved_filters" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "filter_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dashboard_saved_filters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dashboard_preferences_company_user_uq"
  ON "dashboard_preferences"("company_id", "user_id");

CREATE INDEX "dashboard_preferences_company_default_project_idx"
  ON "dashboard_preferences"("company_id", "default_project_id");

CREATE INDEX "dashboard_saved_filters_company_user_created_idx"
  ON "dashboard_saved_filters"("company_id", "user_id", "created_at");

ALTER TABLE "dashboard_preferences"
  ADD CONSTRAINT "dashboard_preferences_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "dashboard_preferences_user_company_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "dashboard_preferences_default_project_company_fkey"
  FOREIGN KEY ("default_project_id", "company_id") REFERENCES "projects"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "dashboard_saved_filters"
  ADD CONSTRAINT "dashboard_saved_filters_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "dashboard_saved_filters_user_company_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
