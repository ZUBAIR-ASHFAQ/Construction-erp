-- Allow Site Managers to maintain the shared Material master used by their Project operations.
-- Keep Administration, Project Profitability, and Documents access outside the Site Manager role.

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'materials.manage'
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" role_permission
USING "roles" role
WHERE role_permission."role_id" = role."id"
  AND role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role_permission."permission_code" IN (
    'documents.read',
    'documents.upload',
    'documents.link',
    'documents.version'
  );
