-- Reconcile Project Manager master assignments with trusted Site Manager login scope.
-- System Administrators keep company-wide access and do not require Site Manager grants.

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
 AND site_manager_role."is_system" = TRUE
 AND site_manager_role."status" = 'ACTIVE'
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
ON CONFLICT ("company_id", "user_id", "project_id") DO UPDATE SET
  "role_code" = 'site-manager',
  "status" = 'ACTIVE';
