-- Final-21 B7: Project Stages / Progress.
-- Physical progress, stage weight, cost, billing and receipts remain separate concepts.

CREATE TABLE "project_stages" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(300) NOT NULL,
  "sequence_no" INTEGER NOT NULL,
  "weight_percent" DECIMAL(7,4) NOT NULL,
  "planned_amount" DECIMAL(18,2),
  "planned_start_date" DATE,
  "planned_end_date" DATE,
  "actual_start_date" DATE,
  "actual_end_date" DATE,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_stages_weight_ck" CHECK ("weight_percent" > 0 AND "weight_percent" <= 100),
  CONSTRAINT "project_stages_sequence_ck" CHECK ("sequence_no" > 0),
  CONSTRAINT "project_stages_planned_date_order_ck" CHECK ("planned_end_date" IS NULL OR "planned_start_date" IS NULL OR "planned_end_date" >= "planned_start_date"),
  CONSTRAINT "project_stages_actual_date_order_ck" CHECK ("actual_end_date" IS NULL OR "actual_start_date" IS NULL OR "actual_end_date" >= "actual_start_date"),
  CONSTRAINT "project_stages_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_stages_project_company_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "project_stages_company_project_code_uq" ON "project_stages"("company_id", "project_id", "code");
CREATE UNIQUE INDEX "project_stages_company_project_sequence_uq" ON "project_stages"("company_id", "project_id", "sequence_no");
CREATE UNIQUE INDEX "project_stages_id_project_uq" ON "project_stages"("id", "project_id");
CREATE UNIQUE INDEX "project_stages_id_company_uq" ON "project_stages"("id", "company_id");
CREATE INDEX "project_stages_company_project_status_sequence_idx" ON "project_stages"("company_id", "project_id", "status", "sequence_no");

CREATE TABLE "stage_progress_updates" (
  "id" UUID NOT NULL,
  "stage_id" UUID NOT NULL,
  "progress_percent" DECIMAL(7,4) NOT NULL,
  "progress_date" DATE NOT NULL,
  "note" TEXT,
  "evidence_document_id" UUID,
  "entered_by" UUID NOT NULL,
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "status" VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_progress_updates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stage_progress_updates_percent_ck" CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100),
  CONSTRAINT "stage_progress_updates_status_ck" CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "stage_progress_updates_approval_shape_ck" CHECK (
    ("status" = 'APPROVED' AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
    OR
    ("status" <> 'APPROVED')
  ),
  CONSTRAINT "stage_progress_updates_stage_fkey" FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stage_progress_updates_evidence_fkey" FOREIGN KEY ("evidence_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stage_progress_updates_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stage_progress_updates_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "stage_progress_updates_stage_status_date_idx" ON "stage_progress_updates"("stage_id", "status", "progress_date", "created_at");
CREATE INDEX "stage_progress_updates_evidence_idx" ON "stage_progress_updates"("evidence_document_id");
CREATE INDEX "stage_progress_updates_entered_by_idx" ON "stage_progress_updates"("entered_by", "created_at");
CREATE INDEX "stage_progress_updates_approved_by_idx" ON "stage_progress_updates"("approved_by", "approved_at");

CREATE TABLE "stage_progress_baselines" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "version_no" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "total_weight_percent" DECIMAL(7,4) NOT NULL,
  "frozen_at" TIMESTAMPTZ(6),
  "frozen_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stage_progress_baselines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stage_progress_baselines_version_ck" CHECK ("version_no" > 0),
  CONSTRAINT "stage_progress_baselines_total_weight_ck" CHECK ("total_weight_percent" = 100.0000),
  CONSTRAINT "stage_progress_baselines_status_ck" CHECK ("status" IN ('FROZEN')),
  CONSTRAINT "stage_progress_baselines_freeze_shape_ck" CHECK ("frozen_at" IS NOT NULL AND "frozen_by" IS NOT NULL),
  CONSTRAINT "stage_progress_baselines_project_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stage_progress_baselines_frozen_by_fkey" FOREIGN KEY ("frozen_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "stage_progress_baselines_project_version_uq" ON "stage_progress_baselines"("project_id", "version_no");
CREATE INDEX "stage_progress_baselines_project_status_version_idx" ON "stage_progress_baselines"("project_id", "status", "version_no");

-- Final Module 7 permissions.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'stages.read', 'Read Project Stages', 'project_stages'),
  (gen_random_uuid(), 'stages.manage', 'Manage Project Stages', 'project_stages'),
  (gen_random_uuid(), 'stages.baseline.freeze', 'Freeze Project Stage Baseline', 'project_stages'),
  (gen_random_uuid(), 'stages.progress.update', 'Record Project Stage Progress', 'project_stages'),
  (gen_random_uuid(), 'stages.progress.approve', 'Approve Project Stage Progress', 'project_stages'),
  (gen_random_uuid(), 'stages.financial.read', 'Read Project Stage Financials', 'project_stages')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Preserve sensible existing Project-role access while introducing the new Stage permission vocabulary.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT DISTINCT rp."role_id", mapping."stage_code"
FROM "role_permissions" rp
JOIN (VALUES
  ('projects.read', 'stages.read'),
  ('projects.update', 'stages.manage'),
  ('projects.update', 'stages.progress.update'),
  ('projects.activate', 'stages.baseline.freeze'),
  ('projects.complete', 'stages.progress.approve'),
  ('job_cost.read', 'stages.financial.read'),
  ('client_billing.read', 'stages.financial.read'),
  ('finance.read', 'stages.financial.read')
) AS mapping("existing_code", "stage_code") ON mapping."existing_code" = rp."permission_code"
ON CONFLICT DO NOTHING;

-- B4/B5 compatibility bridge is no longer needed after their grants have been mapped.
DROP TRIGGER IF EXISTS "final21_role_permission_legacy_code_sync" ON "role_permissions";
DROP FUNCTION IF EXISTS "final21_sync_role_permission_legacy_code"();
ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "permission_code";
