-- Final-21 B4: make Supplier & Subcontractor Management the single master-data owner.
-- Historical operational subcontract tables remain in the database for traceability until a later release cleanup migration.

-- Final Vendor code uniqueness is company-scoped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "vendors"
    GROUP BY "company_id", "code"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce final vendor code uniqueness because duplicate company/code rows exist.';
  END IF;
END $$;

DROP INDEX IF EXISTS "vendors_company_code_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "vendors_company_code_uq"
  ON "vendors"("company_id", "code");

-- Final Vendor contacts allow optional communication and role details.
ALTER TABLE "vendor_contacts"
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "role" DROP NOT NULL;

-- Final subcontractor master keeps only vendor link, code, specialty, status and default terms.
ALTER TABLE "subcontractors"
  ADD COLUMN IF NOT EXISTS "specialty" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "default_terms" TEXT;

UPDATE "subcontractors"
SET "specialty" = 'UNSPECIFIED'
WHERE "specialty" IS NULL OR btrim("specialty") = '';

ALTER TABLE "subcontractors"
  ALTER COLUMN "specialty" SET NOT NULL,
  ALTER COLUMN "legal_name" DROP NOT NULL,
  ALTER COLUMN "contact_json" DROP NOT NULL,
  ALTER COLUMN "compliance_status" DROP NOT NULL;

DROP INDEX IF EXISTS "subcontractors_company_status_compliance_idx";
CREATE INDEX IF NOT EXISTS "subcontractors_company_status_specialty_idx"
  ON "subcontractors"("company_id", "status", "specialty");

-- Final Module 5 permission vocabulary.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'vendors.read', 'Read Suppliers and Vendors', 'vendors_subcontractors'),
  (gen_random_uuid(), 'vendors.create', 'Create Suppliers and Vendors', 'vendors_subcontractors'),
  (gen_random_uuid(), 'vendors.update', 'Update Suppliers and Vendors', 'vendors_subcontractors'),
  (gen_random_uuid(), 'subcontractors.read', 'Read Subcontractors', 'vendors_subcontractors'),
  (gen_random_uuid(), 'subcontractors.manage', 'Manage Subcontractors', 'vendors_subcontractors')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Preserve existing purchasing/subcontractor access while moving ownership to final Module 5 permissions.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT DISTINCT rp."role_id", mapping."final_code"
FROM "role_permissions" rp
JOIN (VALUES
  ('procurement.read', 'vendors.read'),
  ('purchase_orders.create', 'vendors.read'),
  ('purchase_orders.create', 'vendors.create'),
  ('purchase_orders.create', 'vendors.update'),
  ('subcontractors.read', 'subcontractors.read'),
  ('subcontractors.manage', 'subcontractors.manage'),
  ('subcontracts.read', 'subcontractors.read'),
  ('subcontracts.create', 'subcontractors.manage'),
  ('subcontracts.execute', 'subcontractors.manage'),
  ('subcontracts.certify', 'subcontractors.manage'),
  ('subcontracts.close', 'subcontractors.manage')
) AS mapping("legacy_code", "final_code") ON mapping."legacy_code" = rp."permission_code"
ON CONFLICT DO NOTHING;

-- Operational Subcontract permissions no longer represent a final business module.
DELETE FROM "role_permissions"
WHERE "permission_code" IN (
  'subcontracts.read',
  'subcontracts.create',
  'subcontracts.execute',
  'subcontracts.certify',
  'subcontracts.close'
);

DELETE FROM "permissions"
WHERE "code" IN (
  'subcontracts.read',
  'subcontracts.create',
  'subcontracts.execute',
  'subcontracts.certify',
  'subcontracts.close'
);
