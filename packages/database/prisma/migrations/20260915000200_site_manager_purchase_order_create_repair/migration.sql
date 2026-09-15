-- Restore the Project-scoped Purchase Order creation grant for active Site Managers.
-- Procurement service/repository authorization continues to enforce the manager's assigned Project scope.

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'purchase_orders.create'
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
