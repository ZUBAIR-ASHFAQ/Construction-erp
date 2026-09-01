import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260829000500_final21_safe_legacy_database_cleanup/migration.sql',
  'utf8'
);
const r3Migration = await readFile(
  'packages/database/prisma/migrations/20260830000100_final21_remove_excluded_legacy_scope/migration.sql',
  'utf8'
);

const REMOVED_PRISMA_MODELS = [
  'ApprovalDefinition', 'ApprovalStep', 'ApprovalRequest', 'ApprovalAction', 'ApprovalDelegation',
  'Opportunity', 'OpportunityNote',
  'Tender', 'EstimateVersion', 'EstimateItem', 'TenderSubmission',
  'Rfq', 'RfqItem', 'RfqVendor', 'SupplierQuotation', 'SupplierQuotationItem',
  'PurchaseOrderRevision', 'PurchaseOrderRevisionItem',
  'ProjectSchedule', 'ScheduleActivity', 'ScheduleDependency', 'ScheduleBaseline', 'ScheduleProgressUpdate',
  'ChangeRequest', 'ChangeRequestLine', 'ChangeOrder', 'ChangeOrderImpact',
  'Submittal', 'SubmittalRevision', 'SubmittalReview', 'Rfi', 'RfiResponse'
];

/** Extract one Prisma model block for focused Final-21 assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

test('A11 removes safe excluded-module models from the active Prisma client surface', () => {
  for (const model of REMOVED_PRISMA_MODELS) {
    assert.doesNotMatch(prisma, new RegExp(`model ${model} \\{`), `${model} still exists in the active Prisma schema.`);
  }
});

test('A11 removes Tender, quotation, and Contract-era columns from retained final models', () => {
  const project = prismaModel('Project');
  const purchaseOrder = prismaModel('PurchaseOrder');
  const claim = prismaModel('ProgressClaim');
  const invoice = prismaModel('ClientInvoice');

  assert.doesNotMatch(project, /tenderId|Tender/);
  assert.doesNotMatch(purchaseOrder, /quotationId|directPurchaseReason|SupplierQuotation|PurchaseOrderRevision/);
  assert.doesNotMatch(claim, /contractId|previousValue|currentValue/);
  assert.doesNotMatch(invoice, /contractId|retentionAmount/);
  assert.match(invoice, /dueDate\s+DateTime\?/);
});

test('A11 forward migration drops only database owners already disconnected by A2-A10', () => {
  for (const table of [
    'approval_definitions', 'approval_steps', 'approval_requests', 'approval_actions', 'approval_delegations',
    'opportunities', 'opportunity_notes',
    'tenders', 'estimate_versions', 'estimate_items', 'tender_submissions',
    'rfqs', 'rfq_items', 'rfq_vendors', 'supplier_quotations', 'supplier_quotation_items',
    'purchase_order_revisions', 'purchase_order_revision_items',
    'project_schedules', 'schedule_activities', 'schedule_dependencies', 'schedule_baselines', 'schedule_progress_updates',
    'change_requests', 'change_request_lines', 'change_orders', 'change_order_impacts',
    'submittals', 'submittal_revisions', 'submittal_reviews', 'rfis', 'rfi_responses',
    'client_contracts', 'retention_ledger'
  ]) {
    assert.match(migration, new RegExp(`DROP TABLE IF EXISTS "${table}"`), `${table} is not removed by the A11 migration.`);
  }
});

test('A11 defers BOQ/WBS/Cost Code cleanup and R3 completes it with a new forward migration', () => {
  for (const table of ['boqs', 'boq_revisions', 'boq_items', 'wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes']) {
    assert.doesNotMatch(migration, new RegExp(`DROP TABLE IF EXISTS "${table}"`), `${table} was intentionally deferred by A11.`);
    assert.match(r3Migration, new RegExp(`DROP TABLE "${table}"`), `${table} must be removed by R3.`);
  }

  for (const model of ['Boq', 'BoqRevision', 'BoqItem', 'WbsNode', 'CostCode', 'CostType', 'ProjectCostCode']) {
    assert.doesNotMatch(prisma, new RegExp(`model ${model} \{`), `${model} must not remain active after R3.`);
  }
});

test('A11 removes legacy Client Billing triggers and rebuilds invoice immutability for final fields', () => {
  assert.match(migration, /DROP TRIGGER IF EXISTS "client_invoices_claim_scope_integrity"/);
  assert.match(migration, /DROP TRIGGER IF EXISTS "progress_claim_lines_scope_integrity"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "contract_id"/);
  assert.match(migration, /ALTER COLUMN "due_date" DROP NOT NULL/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION "module_16_validate_client_invoice_update"/);
  assert.match(migration, /NEW\."client_id" IS DISTINCT FROM OLD\."client_id"/);
  assert.doesNotMatch(
    migration.match(/CREATE OR REPLACE FUNCTION "module_16_validate_client_invoice_update"[\s\S]*?CREATE TRIGGER "client_invoices_history_integrity"/)?.[0] ?? '',
    /contract_id|retention_amount/
  );
});

test('A11 removes historical grants for excluded module permissions after final mappings exist', () => {
  assert.match(migration, /DELETE FROM "role_permissions"/);
  assert.match(migration, /DELETE FROM "permissions"/);
  for (const code of ['opportunities.read', 'tenders.read', 'procurement.rfq.manage', 'client_contracts.manage', 'schedule.read', 'changes.read', 'rfi.read']) {
    assert.match(migration, new RegExp(code.replaceAll('.', '\\.')));
  }
});
