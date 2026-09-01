-- Final Module 17 permission vocabulary. Runtime repository/service/routes remain deferred to later B16 passes.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'supplier_payables.read', 'Read Supplier Payables', 'supplier_payables'),
  (gen_random_uuid(), 'supplier_invoices.create', 'Create Supplier Invoices', 'supplier_payables'),
  (gen_random_uuid(), 'supplier_invoices.post', 'Post Supplier Invoices', 'supplier_payables'),
  (gen_random_uuid(), 'supplier_payments.create', 'Create Supplier Payments', 'supplier_payables'),
  (gen_random_uuid(), 'supplier_payments.allocate', 'Allocate Supplier Payments', 'supplier_payables')
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
    'supplier_payables.read',
    'supplier_invoices.create',
    'supplier_invoices.post',
    'supplier_payments.create',
    'supplier_payments.allocate'
  )
ON CONFLICT DO NOTHING;
