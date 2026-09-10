-- Provision the built-in Site Manager role and backfill explicit Project access.
-- System Administrators retain company-wide access; Site Managers receive only scoped operations.

INSERT INTO "roles" (
  "id", "company_id", "code", "name", "description", "is_system", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  company."id",
  'site-manager',
  'Site Manager',
  'Operates assigned construction Projects without company administration, approvals, payroll, or finance authority.',
  TRUE,
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "companies" company
ON CONFLICT ("company_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system" = TRUE,
  "status" = 'ACTIVE',
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'dashboard.read',
  'dashboard.project.read',
  'dashboard.manage_preferences',
  'projects.read',
  'projects.update',
  'stages.read',
  'stages.manage',
  'stages.progress.update',
  'stages.financial.read',
  'project_team.read',
  'project_team.manage',
  'budgets.read',
  'job_cost.read',
  'clients.read',
  'vendors.read',
  'subcontractors.read',
  'procurement.read',
  'requisitions.create',
  'purchase_orders.create',
  'goods_receipts.create',
  'inventory.read',
  'inventory.issue',
  'inventory.transfer',
  'equipment.read',
  'equipment.assign',
  'equipment.usage.create',
  'attendance.read',
  'attendance.create',
  'attendance.correct',
  'site_expenses.read',
  'site_expenses.create',
  'site_expenses.update',
  'documents.read',
  'documents.upload',
  'documents.link',
  'documents.version',
  'supplier_payables.read',
  'client_billing.read',
  'client_invoices.read',
  'client_receipts.read'
)
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;

-- Existing active Project managers become Site Managers unless they already administer the company.
INSERT INTO "user_roles" ("id", "company_id", "user_id", "role_id", "status", "created_at")
SELECT DISTINCT
  gen_random_uuid(),
  project."company_id",
  project."project_manager_user_id",
  site_manager_role."id",
  'ACTIVE',
  CURRENT_TIMESTAMP
FROM "projects" project
JOIN "users" manager
  ON manager."id" = project."project_manager_user_id"
 AND manager."company_id" = project."company_id"
 AND manager."status" = 'ACTIVE'
JOIN "roles" site_manager_role
  ON site_manager_role."company_id" = project."company_id"
 AND site_manager_role."code" = 'site-manager'
WHERE project."project_manager_user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "user_roles" administrator_assignment
    JOIN "roles" administrator_role ON administrator_role."id" = administrator_assignment."role_id"
    WHERE administrator_assignment."company_id" = project."company_id"
      AND administrator_assignment."user_id" = project."project_manager_user_id"
      AND administrator_assignment."status" = 'ACTIVE'
      AND administrator_role."company_id" = project."company_id"
      AND administrator_role."code" = 'system-admin'
      AND administrator_role."is_system" = TRUE
      AND administrator_role."status" = 'ACTIVE'
  )
ON CONFLICT ("company_id", "user_id", "role_id") DO UPDATE SET "status" = 'ACTIVE';

INSERT INTO "user_project_scopes" ("id", "company_id", "user_id", "project_id", "role_code", "status")
SELECT
  gen_random_uuid(),
  project."company_id",
  project."project_manager_user_id",
  project."id",
  'site-manager',
  'ACTIVE'
FROM "projects" project
JOIN "users" manager
  ON manager."id" = project."project_manager_user_id"
 AND manager."company_id" = project."company_id"
 AND manager."status" = 'ACTIVE'
JOIN "user_roles" manager_assignment
  ON manager_assignment."company_id" = project."company_id"
 AND manager_assignment."user_id" = project."project_manager_user_id"
 AND manager_assignment."status" = 'ACTIVE'
JOIN "roles" manager_role
  ON manager_role."id" = manager_assignment."role_id"
 AND manager_role."company_id" = project."company_id"
 AND manager_role."code" = 'site-manager'
 AND manager_role."status" = 'ACTIVE'
WHERE project."project_manager_user_id" IS NOT NULL
ON CONFLICT ("company_id", "user_id", "project_id") DO UPDATE SET
  "role_code" = 'site-manager',
  "status" = 'ACTIVE';
