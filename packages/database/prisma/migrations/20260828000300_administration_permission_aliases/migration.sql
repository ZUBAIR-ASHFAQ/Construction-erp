-- Final Module 2 permission names introduced during the 21-module refactor.
INSERT INTO "permissions" ("id", "code", "name", "domain")
VALUES
  (gen_random_uuid(), 'admin.users.read', 'Read Administration Users', 'admin'),
  (gen_random_uuid(), 'admin.users.manage', 'Manage Administration Users', 'admin'),
  (gen_random_uuid(), 'admin.roles.read', 'Read Administration Roles', 'admin'),
  (gen_random_uuid(), 'admin.roles.manage', 'Manage Administration Roles', 'admin')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "domain" = EXCLUDED."domain";

-- Preserve current administrators by giving each legacy Administration permission its final alias.
WITH permission_aliases (legacy_code, final_code) AS (
  VALUES
    ('users.read', 'admin.users.read'),
    ('users.create', 'admin.users.manage'),
    ('users.update', 'admin.users.manage'),
    ('users.manage', 'admin.users.manage'),
    ('roles.read', 'admin.roles.read'),
    ('roles.manage', 'admin.roles.manage')
)
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_permission."role_id", final_permission."id"
FROM "role_permissions" role_permission
JOIN "permissions" legacy_permission
  ON legacy_permission."id" = role_permission."permission_id"
JOIN permission_aliases alias
  ON alias.legacy_code = legacy_permission."code"
JOIN "permissions" final_permission
  ON final_permission."code" = alias.final_code
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
