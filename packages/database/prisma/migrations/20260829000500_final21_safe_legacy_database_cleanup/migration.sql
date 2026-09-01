-- Final-21 Pass A11: remove database objects whose runtime owners were already removed in A2-A10.
-- Historical migration files remain unchanged. BOQ/WBS/Cost Code tables stay temporarily because active
-- Subcontract, Finance, Inventory, Equipment, and Workforce code still reads them and will be migrated later.

-- Client Billing no longer uses BOQ/Contract-era validation triggers.
DROP TRIGGER IF EXISTS "progress_claim_lines_scope_integrity" ON "progress_claim_lines";
DROP FUNCTION IF EXISTS "module_16_validate_progress_claim_line_scope"();
DROP TRIGGER IF EXISTS "client_invoices_claim_scope_integrity" ON "client_invoices";
DROP FUNCTION IF EXISTS "module_16_validate_client_invoice_claim_scope"();

-- Rebuild Client Invoice immutability without removed contract/retention columns.
DROP TRIGGER IF EXISTS "client_invoices_history_integrity" ON "client_invoices";
DROP FUNCTION IF EXISTS "module_16_validate_client_invoice_update"();

-- Project is now created directly from Client.
DROP INDEX IF EXISTS "projects_company_tender_idx";
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_tender_company_fkey";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "tender_id";

-- Temporary BOQ rows may only retain Project scope while Subcontract references are migrated later.
DROP INDEX IF EXISTS "boqs_company_tender_created_idx";
ALTER TABLE "boqs" DROP CONSTRAINT IF EXISTS "boqs_scope_required";
ALTER TABLE "boqs" DROP CONSTRAINT IF EXISTS "boqs_tender_company_fkey";
ALTER TABLE "boqs" DROP COLUMN IF EXISTS "tender_id";

-- Final Procurement no longer owns quotation/direct-purchase source fields or revision snapshots.
DROP INDEX IF EXISTS "purchase_orders_quotation_idx";
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_quotation_fkey";
ALTER TABLE "purchase_orders"
  DROP COLUMN IF EXISTS "quotation_id",
  DROP COLUMN IF EXISTS "direct_purchase_reason";

DROP TABLE IF EXISTS "purchase_order_revision_items" CASCADE;
DROP TABLE IF EXISTS "purchase_order_revisions" CASCADE;
DROP FUNCTION IF EXISTS "module_9_validate_po_revision_creator_scope"();
DROP FUNCTION IF EXISTS "module_9_block_po_revision_history_mutation"();

-- Remove legacy Client Contract columns after A10 migrated project/client ownership and billing settings.
DROP INDEX IF EXISTS "progress_claims_contract_claim_no_idx";
DROP INDEX IF EXISTS "progress_claims_contract_status_period_idx";
ALTER TABLE "progress_claims" DROP CONSTRAINT IF EXISTS "progress_claims_contract_fkey";
ALTER TABLE "progress_claims"
  DROP COLUMN IF EXISTS "contract_id",
  DROP COLUMN IF EXISTS "previous_value",
  DROP COLUMN IF EXISTS "current_value";

DROP INDEX IF EXISTS "client_invoices_contract_date_idx";
ALTER TABLE "client_invoices" DROP CONSTRAINT IF EXISTS "client_invoices_contract_company_project_fkey";
ALTER TABLE "client_invoices"
  DROP COLUMN IF EXISTS "contract_id",
  DROP COLUMN IF EXISTS "retention_amount";
ALTER TABLE "client_invoices" ALTER COLUMN "due_date" DROP NOT NULL;

CREATE OR REPLACE FUNCTION "module_16_validate_client_invoice_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Client Invoice source history cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."company_id" IS DISTINCT FROM OLD."company_id"
       OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
       OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
       OR NEW."claim_id" IS DISTINCT FROM OLD."claim_id"
       OR NEW."invoice_no" IS DISTINCT FROM OLD."invoice_no"
       OR NEW."invoice_date" IS DISTINCT FROM OLD."invoice_date"
       OR NEW."due_date" IS DISTINCT FROM OLD."due_date"
       OR NEW."gross_amount" IS DISTINCT FROM OLD."gross_amount"
       OR NEW."tax_amount" IS DISTINCT FROM OLD."tax_amount"
       OR NEW."total_receivable" IS DISTINCT FROM OLD."total_receivable" THEN
        RAISE EXCEPTION 'Client Invoice identity and financial values are immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "client_invoices_history_integrity"
BEFORE UPDATE OR DELETE ON "client_invoices"
FOR EACH ROW
EXECUTE FUNCTION "module_16_validate_client_invoice_update"();

DROP TRIGGER IF EXISTS "retention_ledger_history_integrity" ON "retention_ledger";
DROP FUNCTION IF EXISTS "module_16_validate_retention_ledger_update"();
DROP TABLE IF EXISTS "retention_ledger" CASCADE;
DROP TABLE IF EXISTS "client_contracts" CASCADE;

-- Generic Approval Workflow was removed. Final modules own their own controlled status commands.
DROP TABLE IF EXISTS "approval_actions" CASCADE;
DROP TABLE IF EXISTS "approval_requests" CASCADE;
DROP TABLE IF EXISTS "approval_delegations" CASCADE;
DROP TABLE IF EXISTS "approval_steps" CASCADE;
DROP TABLE IF EXISTS "approval_definitions" CASCADE;

-- CRM opportunity pipeline is excluded from final Client Management.
DROP TABLE IF EXISTS "opportunity_notes" CASCADE;
DROP TABLE IF EXISTS "opportunities" CASCADE;

-- Tender/Estimate is excluded after Project and temporary BOQ rows were detached from Tender.
DROP TABLE IF EXISTS "tender_submissions" CASCADE;
DROP TABLE IF EXISTS "estimate_items" CASCADE;
DROP TABLE IF EXISTS "estimate_versions" CASCADE;
DROP TABLE IF EXISTS "tenders" CASCADE;

-- RFQ/quotation is excluded after Procurement was consolidated around Material Requirement -> PO -> Goods Receipt.
DROP TABLE IF EXISTS "supplier_quotation_items" CASCADE;
DROP TABLE IF EXISTS "supplier_quotations" CASCADE;
DROP TABLE IF EXISTS "rfq_vendors" CASCADE;
DROP TABLE IF EXISTS "rfq_items" CASCADE;
DROP TABLE IF EXISTS "rfqs" CASCADE;
DROP FUNCTION IF EXISTS "module_8_validate_rfq_item_requisition_scope"();
DROP FUNCTION IF EXISTS "module_8_validate_rfq_requisition_scope"();
DROP FUNCTION IF EXISTS "module_8_validate_rfq_vendor_scope"();
DROP FUNCTION IF EXISTS "module_8_validate_supplier_quotation_header_item_scope"();
DROP FUNCTION IF EXISTS "module_8_validate_supplier_quotation_item_scope"();
DROP FUNCTION IF EXISTS "module_8_validate_supplier_quotation_scope"();

-- Standalone Project Scheduling is excluded. Project Stages will own final progress dates/evidence.
DROP TABLE IF EXISTS "schedule_dependencies" CASCADE;
DROP TABLE IF EXISTS "schedule_progress_updates" CASCADE;
DROP TABLE IF EXISTS "schedule_baselines" CASCADE;
DROP TABLE IF EXISTS "schedule_activities" CASCADE;
DROP TABLE IF EXISTS "project_schedules" CASCADE;
DROP FUNCTION IF EXISTS "module_21_validate_activity_scope"();
DROP FUNCTION IF EXISTS "module_21_validate_dependency_graph"();
DROP FUNCTION IF EXISTS "module_21_validate_baseline_actor_scope"();
DROP FUNCTION IF EXISTS "module_21_prevent_baseline_mutation"();
DROP FUNCTION IF EXISTS "module_21_validate_progress_scope"();
DROP FUNCTION IF EXISTS "module_21_prevent_progress_update_mutation"();

-- Standalone Change Requests / Change Orders are excluded from the final 21-module business scope.
DROP TABLE IF EXISTS "change_order_impacts" CASCADE;
DROP TABLE IF EXISTS "change_orders" CASCADE;
DROP TABLE IF EXISTS "change_request_lines" CASCADE;
DROP TABLE IF EXISTS "change_requests" CASCADE;
DROP FUNCTION IF EXISTS "module_17_validate_change_request_line_scope"();
DROP FUNCTION IF EXISTS "module_17_reject_change_order_snapshot_mutation"();
DROP FUNCTION IF EXISTS "module_17_validate_change_order_impact_update"();
DROP FUNCTION IF EXISTS "protect_withdrawn_change_request"();

-- RFI/Submittal is excluded as a standalone module. Evidence remains owned by Documents and final source modules.
DROP TABLE IF EXISTS "submittal_reviews" CASCADE;
DROP TABLE IF EXISTS "submittal_revisions" CASCADE;
DROP TABLE IF EXISTS "submittals" CASCADE;
DROP TABLE IF EXISTS "rfi_responses" CASCADE;
DROP TABLE IF EXISTS "rfis" CASCADE;
DROP FUNCTION IF EXISTS "prevent_submittal_review_mutation"();
DROP FUNCTION IF EXISTS "prevent_rfi_response_mutation"();

-- Remove obsolete permission grants after all A2-A10 role mappings have been applied.
DELETE FROM "role_permissions" role_permission
USING "permissions" permission
WHERE permission."id" = role_permission."permission_id"
  AND permission."code" IN (
  'approvals.inbox.read', 'approvals.act', 'approval_definitions.read', 'approval_definitions.manage', 'approval_delegations.manage',
  'opportunities.read', 'opportunities.manage',
  'procurement.pr.read', 'procurement.pr.create', 'procurement.rfq.manage', 'procurement.quotation.record', 'procurement.quotation.select',
  'purchase_orders.read', 'purchase_orders.edit', 'purchase_orders.submit', 'purchase_orders.revise', 'purchase_orders.direct_purchase', 'inventory.receive',
  'client_contracts.manage', 'client_claims.create', 'client_claims.certify', 'client_invoices.issue', 'client_retention.release',
  'tenders.read', 'tenders.create', 'estimates.edit', 'tenders.submit', 'tenders.manage_outcome',
  'boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export',
  'wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze',
  'schedule.read', 'schedule.manage', 'schedule.baseline', 'schedule.progress',
  'changes.read', 'changes.create', 'changes.estimate', 'changes.submit', 'changes.approve', 'changes.apply',
  'rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close',
  'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
);

DELETE FROM "permissions"
WHERE "code" IN (
  'approvals.inbox.read', 'approvals.act', 'approval_definitions.read', 'approval_definitions.manage', 'approval_delegations.manage',
  'opportunities.read', 'opportunities.manage',
  'procurement.pr.read', 'procurement.pr.create', 'procurement.rfq.manage', 'procurement.quotation.record', 'procurement.quotation.select',
  'purchase_orders.read', 'purchase_orders.edit', 'purchase_orders.submit', 'purchase_orders.revise', 'purchase_orders.direct_purchase', 'inventory.receive',
  'client_contracts.manage', 'client_claims.create', 'client_claims.certify', 'client_invoices.issue', 'client_retention.release',
  'tenders.read', 'tenders.create', 'estimates.edit', 'tenders.submit', 'tenders.manage_outcome',
  'boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export',
  'wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze',
  'schedule.read', 'schedule.manage', 'schedule.baseline', 'schedule.progress',
  'changes.read', 'changes.create', 'changes.estimate', 'changes.submit', 'changes.approve', 'changes.apply',
  'rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close',
  'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
);
