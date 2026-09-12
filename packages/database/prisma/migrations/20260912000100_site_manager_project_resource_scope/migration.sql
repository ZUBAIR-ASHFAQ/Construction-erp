-- Project membership for reusable supplier and subcontractor master records.
-- Existing operational history is used to preserve visibility after rollout.

CREATE TABLE "vendor_project_assignments" (
  "company_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_project_assignments_pkey" PRIMARY KEY ("vendor_id", "project_id"),
  CONSTRAINT "vendor_project_assignments_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "vendor_project_assignments_vendor_company_fkey"
    FOREIGN KEY ("vendor_id", "company_id") REFERENCES "vendors"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "vendor_project_assignments_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "vendor_project_assignments_company_project_vendor_idx"
  ON "vendor_project_assignments"("company_id", "project_id", "vendor_id");

CREATE TABLE "subcontractor_project_assignments" (
  "company_id" UUID NOT NULL,
  "subcontractor_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subcontractor_project_assignments_pkey" PRIMARY KEY ("subcontractor_id", "project_id"),
  CONSTRAINT "subcontractor_project_assignments_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subcontractor_project_assignments_subcontractor_company_fkey"
    FOREIGN KEY ("subcontractor_id", "company_id") REFERENCES "subcontractors"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "subcontractor_project_assignments_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "subcontractor_project_scope_idx"
  ON "subcontractor_project_assignments"("company_id", "project_id", "subcontractor_id");

INSERT INTO "vendor_project_assignments" ("company_id", "vendor_id", "project_id")
SELECT source."company_id", source."vendor_id", source."project_id"
FROM (
  SELECT "company_id", "vendor_id", "project_id" FROM "purchase_orders"
  UNION
  SELECT "company_id", "vendor_id", "project_id" FROM "goods_receipts"
  UNION
  SELECT "company_id", "vendor_id", "project_id" FROM "supplier_invoices"
  UNION
  SELECT "company_id", "vendor_id", "project_id" FROM "supplier_payments" WHERE "project_id" IS NOT NULL
) source
ON CONFLICT DO NOTHING;

INSERT INTO "subcontractor_project_assignments" ("company_id", "subcontractor_id", "project_id")
SELECT "company_id", "subcontractor_id", "project_id"
FROM "subcontract_contracts"
ON CONFLICT DO NOTHING;

-- Site Managers operate Project resources but do not receive approval, posting,
-- organization-administration, finance-core, or cross-Project permissions.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'employees.read',
  'employees.create',
  'employees.update',
  'vendors.read',
  'vendors.create',
  'vendors.update',
  'subcontractors.read',
  'subcontractors.manage',
  'procurement.read',
  'requisitions.create',
  'purchase_orders.create',
  'goods_receipts.create'
)
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
