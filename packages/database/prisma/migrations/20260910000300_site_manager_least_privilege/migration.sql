-- Keep Site Manager access operational and Project-scoped.
-- Employee directory reads are required for Attendance and are scope-filtered by the API.

DELETE FROM "role_permissions" role_permission
USING "roles" role
WHERE role_permission."role_id" = role."id"
  AND role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role_permission."permission_code" IN (
    'projects.update',
    'stages.manage',
    'purchase_orders.create',
    'clients.read',
    'vendors.read',
    'subcontractors.read',
    'supplier_payables.read',
    'client_billing.read',
    'client_invoices.read',
    'client_receipts.read'
  );

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" = 'employees.read'
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
