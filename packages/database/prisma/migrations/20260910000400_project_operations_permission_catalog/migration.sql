-- Repair permission catalog entries required by the implemented Inventory and Project Cost modules.

INSERT INTO "permissions" ("code", "description", "domain") VALUES
  ('inventory.read', 'Read Project-scoped Inventory', 'inventory'),
  ('inventory.issue', 'Issue Inventory to an authorized Project or Stage', 'inventory'),
  ('inventory.transfer', 'Transfer Inventory between authorized Projects', 'inventory'),
  ('inventory.adjust', 'Post controlled Inventory adjustments', 'inventory'),
  ('budgets.read', 'Read Project budgets', 'job_cost'),
  ('budgets.create', 'Create Project budgets', 'job_cost'),
  ('budgets.edit', 'Edit Project budgets', 'job_cost'),
  ('budgets.freeze', 'Freeze Project budget baselines', 'job_cost'),
  ('job_cost.read', 'Read source-derived Project cost', 'job_cost'),
  ('forecast.update', 'Update Project forecasts', 'job_cost')
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "domain" = EXCLUDED."domain";

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'inventory.read',
  'inventory.issue',
  'inventory.transfer',
  'inventory.adjust',
  'budgets.read',
  'budgets.create',
  'budgets.edit',
  'budgets.freeze',
  'job_cost.read',
  'forecast.update'
)
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'inventory.read',
  'inventory.issue',
  'inventory.transfer',
  'budgets.read',
  'job_cost.read'
)
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
