-- Development/manual-data reset for the Construction ERP.
--
-- Preserves:
--   * companies + company configuration
--   * initial bootstrap record
--   * permissions, roles and role-permission catalog
--   * the authoritative bootstrap administrator, including its exact password hash
--   * administrator role assignments and active administrator sessions
--   * number-sequence configuration (counters are reset to 1)
--
-- Removes operational/manual data and all non-administrator user accounts.
-- Recreates only the minimum operational defaults created by initial bootstrap.
--
-- This file is intentionally NOT a Prisma migration. It is an explicit development
-- maintenance operation and must never run automatically during application deploys.

BEGIN;

CREATE TEMP TABLE "_manual_data_reset_admin_guard" ON COMMIT DROP AS
SELECT
  bootstrap."company_id" AS "company_id",
  administrator."id" AS "administrator_id",
  administrator."email" AS "email",
  administrator."password_hash" AS "password_hash"
FROM "initial_bootstrap_runs" bootstrap
JOIN "users" administrator
  ON administrator."id" = bootstrap."administrator_user_id"
 AND administrator."company_id" = bootstrap."company_id"
WHERE bootstrap."bootstrap_key" = 'initial'
  AND bootstrap."status" = 'COMPLETED'
  AND administrator."email" = 'admin@example.com'
  AND administrator."status" = 'ACTIVE'
  AND administrator."password_hash" IS NOT NULL;

DO $$
DECLARE
  guard_count INTEGER;
  system_admin_count INTEGER;
  company_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO company_count FROM "companies";

  IF company_count <> 1 THEN
    RAISE EXCEPTION
      'Manual-data reset aborted: expected the single-company installation created by initial bootstrap, found % companies.',
      company_count;
  END IF;

  SELECT COUNT(*) INTO guard_count
  FROM "_manual_data_reset_admin_guard";

  IF guard_count <> 1 THEN
    RAISE EXCEPTION
      'Manual-data reset aborted: expected exactly one active completed bootstrap administrator admin@example.com, found %.',
      guard_count;
  END IF;

  SELECT COUNT(*) INTO system_admin_count
  FROM "_manual_data_reset_admin_guard" guard
  JOIN "user_roles" assignment
    ON assignment."company_id" = guard."company_id"
   AND assignment."user_id" = guard."administrator_id"
   AND assignment."status" = 'ACTIVE'
  JOIN "roles" role
    ON role."id" = assignment."role_id"
   AND role."company_id" = guard."company_id"
   AND role."code" = 'system-admin'
   AND role."is_system" = TRUE
   AND role."status" = 'ACTIVE';

  IF system_admin_count < 1 THEN
    RAISE EXCEPTION
      'Manual-data reset aborted: bootstrap administrator does not have an active system-admin role.';
  END IF;
END $$;

-- Every table below is operational/user-entered state. All referencing tables are
-- included in the same TRUNCATE so PostgreSQL can enforce the existing FK graph
-- without CASCADE reaching protected bootstrap/auth configuration tables.
TRUNCATE TABLE
  "audit_logs",
  "outbox_events",
  "idempotency_records",
  "queue_jobs",
  "user_project_scopes",
  "departments",
  "document_links",
  "document_versions",
  "document_upload_intents",
  "documents",
  "client_contacts",
  "clients",
  "stage_progress_updates",
  "stage_progress_baselines",
  "project_team_history",
  "project_team_assignments",
  "project_status_history",
  "project_stages",
  "journal_lines",
  "bank_reconciliations",
  "budget_lines",
  "project_budgets",
  "cost_commitments",
  "cost_actuals",
  "forecast_lines",
  "vendor_project_assignments",
  "vendor_contacts",
  "purchase_requisition_items",
  "purchase_requisitions",
  "purchase_order_items",
  "purchase_orders",
  "goods_receipt_items",
  "goods_receipts",
  "material_issue_items",
  "material_issues",
  "stock_ledger",
  "materials",
  "subcontractor_project_assignments",
  "subcontract_payments",
  "subcontract_contracts",
  "subcontractors",
  "equipment_maintenance",
  "equipment_usage",
  "equipment_assignments",
  "equipment",
  "attendance_entries",
  "employee_employment_history",
  "employee_compensation",
  "payroll_advance_recoveries",
  "payroll_payments",
  "payslips",
  "payroll_lines",
  "payroll_runs",
  "employee_advances",
  "employees",
  "site_expenses",
  "supplier_payment_allocations",
  "supplier_payments",
  "supplier_invoice_lines",
  "supplier_invoices",
  "client_receipt_allocations",
  "client_receipts",
  "client_invoice_lines",
  "client_invoices",
  "progress_claim_lines",
  "progress_claims",
  "project_billing_settings",
  "saved_report_filters",
  "report_runs",
  "report_definitions",
  "dashboard_saved_filters",
  "dashboard_preferences",
  "cash_bank_accounts",
  "journals",
  "gl_accounts",
  "fiscal_periods",
  "expense_categories",
  "warehouses",
  "vendors",
  "projects"
RESTART IDENTITY;

-- Remove login/session state for every manually created account while leaving the
-- bootstrap administrator credentials and current sessions untouched.
DELETE FROM "auth_sessions" session
USING "_manual_data_reset_admin_guard" guard
WHERE session."user_id" <> guard."administrator_id";

DELETE FROM "user_roles" assignment
USING "_manual_data_reset_admin_guard" guard
WHERE assignment."company_id" = guard."company_id"
  AND assignment."user_id" <> guard."administrator_id";

DELETE FROM "users" account
USING "_manual_data_reset_admin_guard" guard
WHERE account."company_id" = guard."company_id"
  AND account."id" <> guard."administrator_id";

-- Preserve numbering policies/prefixes but make the empty operational database
-- start numbering from its configured beginning again.
UPDATE "number_sequences" sequence
SET
  "next_value" = 1,
  "updated_at" = CURRENT_TIMESTAMP
FROM "_manual_data_reset_admin_guard" guard
WHERE sequence."company_id" = guard."company_id";

-- Recreate the exact minimum operational defaults installed by bootstrapInitialInstallation().
INSERT INTO "warehouses" (
  "id", "company_id", "project_id", "code", "name", "location", "status"
)
SELECT
  gen_random_uuid(), guard."company_id", NULL, 'MAIN', 'Main Warehouse', NULL, 'ACTIVE'
FROM "_manual_data_reset_admin_guard" guard;

INSERT INTO "expense_categories" (
  "id", "company_id", "code", "name", "default_gl_account_id", "status"
)
SELECT
  gen_random_uuid(), guard."company_id", 'GENERAL', 'General Site Expense', NULL, 'ACTIVE'
FROM "_manual_data_reset_admin_guard" guard;

WITH company_fiscal AS (
  SELECT
    guard."company_id",
    CASE
      WHEN jsonb_typeof(company."fiscal_settings" -> 'fiscalYearStartMonth') = 'number'
        THEN GREATEST(1, LEAST(12, (company."fiscal_settings" ->> 'fiscalYearStartMonth')::INTEGER))
      ELSE 1
    END AS fiscal_start_month,
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS calendar_year,
    EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER AS calendar_month
  FROM "_manual_data_reset_admin_guard" guard
  JOIN "companies" company ON company."id" = guard."company_id"
), current_period AS (
  SELECT
    "company_id",
    fiscal_start_month,
    calendar_year,
    calendar_month,
    ((calendar_month - fiscal_start_month + 12) % 12) + 1 AS period_no,
    CASE
      WHEN fiscal_start_month = 1 THEN calendar_year
      WHEN calendar_month >= fiscal_start_month THEN calendar_year + 1
      ELSE calendar_year
    END AS fiscal_year
  FROM company_fiscal
)
INSERT INTO "fiscal_periods" (
  "id", "company_id", "fiscal_year", "period_no", "start_date", "end_date", "status"
)
SELECT
  gen_random_uuid(),
  "company_id",
  fiscal_year,
  period_no,
  date_trunc('month', CURRENT_DATE)::DATE,
  (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
  'OPEN'
FROM current_period;

-- Fail the transaction if anything touched the administrator credential or if a
-- non-admin user survived the cleanup.
DO $$
DECLARE
  admin_changed_count INTEGER;
  other_user_count INTEGER;
  project_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO admin_changed_count
  FROM "_manual_data_reset_admin_guard" guard
  JOIN "users" administrator
    ON administrator."id" = guard."administrator_id"
   AND administrator."company_id" = guard."company_id"
  WHERE administrator."email" <> guard."email"
     OR administrator."password_hash" IS DISTINCT FROM guard."password_hash"
     OR administrator."status" <> 'ACTIVE';

  IF admin_changed_count <> 0 THEN
    RAISE EXCEPTION 'Manual-data reset aborted: administrator credential/state changed unexpectedly.';
  END IF;

  SELECT COUNT(*) INTO other_user_count
  FROM "users" account
  CROSS JOIN "_manual_data_reset_admin_guard" guard
  WHERE account."company_id" = guard."company_id"
    AND account."id" <> guard."administrator_id";

  IF other_user_count <> 0 THEN
    RAISE EXCEPTION 'Manual-data reset aborted: % non-administrator user(s) remain.', other_user_count;
  END IF;

  SELECT COUNT(*) INTO project_count
  FROM "projects" project
  CROSS JOIN "_manual_data_reset_admin_guard" guard
  WHERE project."company_id" = guard."company_id";

  IF project_count <> 0 THEN
    RAISE EXCEPTION 'Manual-data reset aborted: Project rows remain after cleanup.';
  END IF;
END $$;

COMMIT;
