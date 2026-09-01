-- Repair the Project Stage permission mapping after the later Project permission vocabulary was registered.
-- Historical Stage migration 20260829001100 could not map projects.* grants because those codes did not yet exist.

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT DISTINCT existing."role_id", mapping."stage_code"
FROM "role_permissions" existing
JOIN (VALUES
  ('projects.read', 'stages.read'),
  ('projects.update', 'stages.manage'),
  ('projects.update', 'stages.progress.update'),
  ('projects.activate', 'stages.baseline.freeze'),
  ('projects.complete', 'stages.progress.approve'),
  ('job_cost.read', 'stages.financial.read'),
  ('client_billing.read', 'stages.financial.read'),
  ('finance.read', 'stages.financial.read')
) AS mapping("existing_code", "stage_code")
  ON mapping."existing_code" = existing."permission_code"
JOIN "permissions" stage_permission
  ON stage_permission."code" = mapping."stage_code"
ON CONFLICT DO NOTHING;

-- Preserve the repository's established full-permission policy for existing active system administrators.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
  AND permission."code" IN (
    'stages.read',
    'stages.manage',
    'stages.baseline.freeze',
    'stages.progress.update',
    'stages.progress.approve',
    'stages.financial.read'
  )
ON CONFLICT DO NOTHING;
