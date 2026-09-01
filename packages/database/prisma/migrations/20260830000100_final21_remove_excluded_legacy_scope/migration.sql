-- Final-21 Repair R3: remove legacy database scope that is explicitly excluded by the controlling 21-module specification.
-- Historical migrations remain immutable. This forward migration refuses to destroy legacy business rows silently.

-- Preflight data-bearing legacy BOQ/WBS/Cost Code and operational Subcontract tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "boqs" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "boq_revisions" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "boq_items" LIMIT 1) THEN
    RAISE EXCEPTION 'R3 preflight blocked: legacy BOQ data exists. Export/resolve it before applying Final-21 excluded-scope cleanup.';
  END IF;

  IF EXISTS (SELECT 1 FROM "wbs_nodes" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "cost_codes" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "cost_types" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "project_cost_codes" LIMIT 1) THEN
    RAISE EXCEPTION 'R3 preflight blocked: legacy WBS/Cost Code data exists. Export/resolve it before applying Final-21 excluded-scope cleanup.';
  END IF;

  IF EXISTS (SELECT 1 FROM "leave_requests" LIMIT 1) THEN
    RAISE EXCEPTION 'R3 preflight blocked: legacy Leave Request data exists. Export/resolve it before applying Final-21 excluded-scope cleanup.';
  END IF;

  IF EXISTS (SELECT 1 FROM "subcontracts" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "subcontract_items" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "subcontract_payment_applications" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "subcontract_payment_lines" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "subcontract_revisions" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "subcontract_retention_releases" LIMIT 1) THEN
    RAISE EXCEPTION 'R3 preflight blocked: legacy operational Subcontract data exists. Export/resolve it before applying Final-21 master-data cleanup.';
  END IF;

  -- Legacy Employee salary/rate columns may be removed only after compensation history exists.
  IF EXISTS (
    SELECT 1
    FROM "employees" employee
    WHERE (employee."base_salary" IS NOT NULL OR employee."hourly_rate" IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM "employee_compensation" compensation
        WHERE compensation."employee_id" = employee."id"
          AND compensation."company_id" = employee."company_id"
      )
  ) THEN
    RAISE EXCEPTION 'R3 preflight blocked: an Employee has legacy salary/rate data without Employee Compensation history.';
  END IF;
END $$;

-- Operational Subcontract tables are not part of Final Module 5; only the Supplier/Subcontractor master remains.
DROP TABLE "subcontract_payment_lines" CASCADE;
DROP TABLE "subcontract_retention_releases" CASCADE;
DROP TABLE "subcontract_revisions" CASCADE;
DROP TABLE "subcontract_payment_applications" CASCADE;
DROP TABLE "subcontract_items" CASCADE;
DROP TABLE "subcontracts" CASCADE;

-- Remove excluded BOQ scope after all remaining legacy dependants are gone.
DROP TABLE "boq_items" CASCADE;
DROP TABLE "boq_revisions" CASCADE;
DROP TABLE "boqs" CASCADE;

-- Remove excluded WBS / Cost Code scope and its old freeze-state helper table.
DROP TABLE "project_cost_codes" CASCADE;
DROP TABLE "wbs_nodes" CASCADE;
DROP TABLE "cost_codes" CASCADE;
DROP TABLE "cost_types" CASCADE;
DROP TABLE "project_cost_structure_states" CASCADE;

-- Leave Management is outside the Final-21 Employee & Labour master scope.
DROP TABLE "leave_requests" CASCADE;

-- Effective-dated Employee Compensation is now the only salary/wage/rate authority.
ALTER TABLE "employees"
  DROP COLUMN "base_salary",
  DROP COLUMN "hourly_rate";

-- Remove database helper functions whose owning legacy tables no longer exist.
DROP FUNCTION IF EXISTS "module_4b_validate_boq_item_scope"();
DROP FUNCTION IF EXISTS "module_6_validate_wbs_parent"();
DROP FUNCTION IF EXISTS "module_6_validate_project_cost_code"();
DROP FUNCTION IF EXISTS "module_6_reject_frozen_cost_structure_write"();
DROP FUNCTION IF EXISTS "module_14a_validate_leave_approver_company"();
DROP FUNCTION IF EXISTS "module_11_validate_subcontract_item_scope"();
DROP FUNCTION IF EXISTS "module_11_validate_payment_line_scope"();
DROP FUNCTION IF EXISTS module_11_validate_revision_actor_scope();
DROP FUNCTION IF EXISTS module_11_validate_retention_release_actor_scope();
DROP FUNCTION IF EXISTS module_11_reject_history_mutation();
