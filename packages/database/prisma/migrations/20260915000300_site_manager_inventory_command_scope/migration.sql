-- Keep Site Manager Inventory authority Project-scoped: issue stock and create direct stock entries.
-- Cross-Project stock transfer remains an administrator-only capability through inventory.transfer.

DELETE FROM "role_permissions" role_permission
USING "roles" role
WHERE role_permission."role_id" = role."id"
  AND role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role_permission."permission_code" = 'inventory.transfer';

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'inventory.adjust'
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
