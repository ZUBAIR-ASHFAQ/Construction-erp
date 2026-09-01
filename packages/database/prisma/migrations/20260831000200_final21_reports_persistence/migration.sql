-- Final-21 Pass B20.2: add only Reports & Analytics persistence.
-- Report source data stays in its owning modules; this migration stores catalog metadata,
-- asynchronous export runs, and user-saved filters without creating reporting source copies.

CREATE TABLE "report_definitions" (
  "id" UUID NOT NULL,
  "company_id" UUID,
  "code" VARCHAR(120) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "domain" VARCHAR(100) NOT NULL,
  "required_permissions" JSONB NOT NULL,
  "filter_schema_json" JSONB NOT NULL,
  "output_formats" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_runs" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "report_code" VARCHAR(120) NOT NULL,
  "requested_by" UUID NOT NULL,
  "filters_json" JSONB NOT NULL,
  "output_format" VARCHAR(20) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "file_id" UUID,
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "error_code" VARCHAR(100),
  CONSTRAINT "report_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_report_filters" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "report_code" VARCHAR(120) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "filters_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_report_filters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_definitions_company_code_uq"
  ON "report_definitions"("company_id", "code")
  WHERE "company_id" IS NOT NULL;

CREATE INDEX "report_definitions_company_code_idx"
  ON "report_definitions"("company_id", "code");

-- PostgreSQL treats NULL values as distinct in a normal unique index, so this
-- partial index keeps shared report codes unique when company_id is NULL.
CREATE UNIQUE INDEX "report_definitions_global_code_uq"
  ON "report_definitions"("code")
  WHERE "company_id" IS NULL;

CREATE INDEX "report_definitions_company_status_domain_idx"
  ON "report_definitions"("company_id", "status", "domain");

CREATE INDEX "report_definitions_code_status_idx"
  ON "report_definitions"("code", "status");

CREATE INDEX "report_runs_company_requester_status_idx"
  ON "report_runs"("company_id", "requested_by", "status");

CREATE INDEX "report_runs_company_report_code_idx"
  ON "report_runs"("company_id", "report_code");

CREATE INDEX "saved_report_filters_company_user_report_idx"
  ON "saved_report_filters"("company_id", "user_id", "report_code");

ALTER TABLE "report_definitions"
  ADD CONSTRAINT "report_definitions_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_runs"
  ADD CONSTRAINT "report_runs_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "report_runs_requester_company_fkey"
  FOREIGN KEY ("requested_by", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "report_runs_file_company_fkey"
  FOREIGN KEY ("file_id", "company_id") REFERENCES "documents"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "saved_report_filters"
  ADD CONSTRAINT "saved_report_filters_company_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "saved_report_filters_user_company_fkey"
  FOREIGN KEY ("user_id", "company_id") REFERENCES "users"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
