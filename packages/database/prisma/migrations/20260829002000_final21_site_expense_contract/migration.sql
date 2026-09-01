-- Final Module 14 permission vocabulary. Runtime repository/service/routes remain deferred to later B15 passes.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'site_expenses.read', 'Read Site Expenses', 'site_expenses'),
  (gen_random_uuid(), 'site_expenses.create', 'Create Site Expenses', 'site_expenses'),
  (gen_random_uuid(), 'site_expenses.update', 'Update Draft Site Expenses', 'site_expenses'),
  (gen_random_uuid(), 'site_expenses.post', 'Post Site Expenses', 'site_expenses'),
  (gen_random_uuid(), 'site_expenses.reverse', 'Reverse Site Expenses', 'site_expenses')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Existing conventional system administrators keep the same full-active-permission policy used by Administration bootstrap.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
  AND permission."code" IN (
    'site_expenses.read',
    'site_expenses.create',
    'site_expenses.update',
    'site_expenses.post',
    'site_expenses.reverse'
  )
ON CONFLICT DO NOTHING;
