-- Foundation Pass 17: controlled initial company provisioning state.
-- The bootstrap intentionally stores only non-secret identity intent/proof.
-- Users/RBAC foreign keys are deferred until Module 24A owns those tables.

CREATE TABLE "company_configurations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_configurations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_configurations_settings_object" CHECK (jsonb_typeof("settings") = 'object'),
    CONSTRAINT "company_configurations_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "company_configurations_company_uq" ON "company_configurations"("company_id");

CREATE TABLE "initial_bootstrap_runs" (
    "id" UUID NOT NULL,
    "bootstrap_key" VARCHAR(100) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'IDENTITY_PENDING',
    "company_id" UUID NOT NULL,
    "administrator_email" VARCHAR(320) NOT NULL,
    "administrator_name" VARCHAR(200) NOT NULL,
    "administrator_role_codes" JSONB NOT NULL,
    "system_role_definitions" JSONB NOT NULL,
    "administrator_user_id" UUID,
    "system_role_ids_by_code" JSONB,
    "request_id" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "initial_bootstrap_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "initial_bootstrap_runs_key_shape" CHECK ("bootstrap_key" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$'),
    CONSTRAINT "initial_bootstrap_runs_fingerprint_shape" CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "initial_bootstrap_runs_status_allowed" CHECK ("status" IN ('IDENTITY_PENDING', 'COMPLETED')),
    CONSTRAINT "initial_bootstrap_runs_admin_email_not_blank" CHECK (length(btrim("administrator_email")) > 0),
    CONSTRAINT "initial_bootstrap_runs_admin_name_not_blank" CHECK (length(btrim("administrator_name")) > 0),
    CONSTRAINT "initial_bootstrap_runs_admin_role_codes_array" CHECK (jsonb_typeof("administrator_role_codes") = 'array' AND jsonb_array_length("administrator_role_codes") > 0),
    CONSTRAINT "initial_bootstrap_runs_system_roles_array" CHECK (jsonb_typeof("system_role_definitions") = 'array' AND jsonb_array_length("system_role_definitions") > 0),
    CONSTRAINT "initial_bootstrap_runs_identity_completion_shape" CHECK (
      ("status" = 'IDENTITY_PENDING' AND "administrator_user_id" IS NULL AND "system_role_ids_by_code" IS NULL AND "completed_at" IS NULL)
      OR
      ("status" = 'COMPLETED' AND "administrator_user_id" IS NOT NULL AND jsonb_typeof("system_role_ids_by_code") = 'object' AND "completed_at" IS NOT NULL)
    ),
    CONSTRAINT "initial_bootstrap_runs_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "initial_bootstrap_runs_key_uq" ON "initial_bootstrap_runs"("bootstrap_key");
CREATE INDEX "initial_bootstrap_runs_company_created_at_idx" ON "initial_bootstrap_runs"("company_id", "created_at");
CREATE INDEX "initial_bootstrap_runs_status_created_at_idx" ON "initial_bootstrap_runs"("status", "created_at");
CREATE INDEX "initial_bootstrap_runs_request_id_idx" ON "initial_bootstrap_runs"("request_id");
CREATE INDEX "initial_bootstrap_runs_correlation_id_idx" ON "initial_bootstrap_runs"("correlation_id");
