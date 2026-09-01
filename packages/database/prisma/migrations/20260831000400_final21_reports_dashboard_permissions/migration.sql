-- Final-21 B1.10: register the final Reports and Dashboard permission vocabulary.
-- These permissions use the post-R9 stable code contract and preserve existing role grants.
INSERT INTO "permissions" ("code", "description", "domain") VALUES
  ('reports.read', 'Read Reports and Analytics', 'reports'),
  ('reports.export', 'Export Reports and Analytics', 'reports'),
  ('reports.finance.read', 'Read financial Reports and Analytics', 'reports'),
  ('reports.hr.read', 'Read people and payroll Reports and Analytics', 'reports'),
  ('reports.save_filters', 'Save Reports and Analytics filters', 'reports'),
  ('dashboard.read', 'Read Dashboard summary', 'dashboard'),
  ('dashboard.project.read', 'Read Project Dashboard detail', 'dashboard'),
  ('dashboard.finance.read', 'Read financial Dashboard detail', 'dashboard'),
  ('dashboard.manage_preferences', 'Manage Dashboard preferences', 'dashboard')
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "domain" = EXCLUDED."domain";

-- Existing active system administrators keep the full-permission policy used by Administration bootstrap.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
  AND permission."code" IN (
    'reports.read',
    'reports.export',
    'reports.finance.read',
    'reports.hr.read',
    'reports.save_filters',
    'dashboard.read',
    'dashboard.project.read',
    'dashboard.finance.read',
    'dashboard.manage_preferences'
  )
ON CONFLICT DO NOTHING;
