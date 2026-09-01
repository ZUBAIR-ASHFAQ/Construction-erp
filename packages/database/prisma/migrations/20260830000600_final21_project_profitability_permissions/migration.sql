-- Final Module 19 permission vocabulary. Project Profitability remains read-only and source-derived.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'project_profitability.read', 'Read Project Profitability', 'project_profitability'),
  (gen_random_uuid(), 'project_profitability.finance.read', 'Read Project Profitability Financial Detail', 'project_profitability'),
  (gen_random_uuid(), 'project_profitability.portfolio.read', 'Read Project Profitability Portfolio', 'project_profitability')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Existing conventional system administrators keep the full-active-permission policy used by Administration bootstrap.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
  AND permission."code" IN (
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  )
ON CONFLICT DO NOTHING;
