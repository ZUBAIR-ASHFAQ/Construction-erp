import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/** Read one repository file as UTF-8 text for the integration-completion contract gate. */
async function read(relativePath) {
  return readFile(relativePath, 'utf8');
}

const projectStagesService = await read('apps/api/src/modules/project-stages/project-stages.service.ts');
const procurementService = await read('apps/api/src/modules/procurement/procurement.service.ts');
const procurementRepository = await read('apps/api/src/modules/procurement/procurement.repository.ts');
const inventoryService = await read('apps/api/src/modules/inventory/inventory.service.ts');
const equipmentService = await read('apps/api/src/modules/equipment/equipment.service.ts');
const equipmentRepository = await read('apps/api/src/modules/equipment/equipment.repository.ts');
const labourPayrollService = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
const siteExpensesService = await read('apps/api/src/modules/site-expenses/site-expenses.service.ts');
const supplierPayablesService = await read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
const clientBillingService = await read('apps/api/src/modules/client-billing/client-billing.service.ts');
const clientReceiptsService = await read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
const profitabilityService = await read('apps/api/src/modules/project-profitability/project-profitability.service.ts');
const profitabilityRepository = await read('apps/api/src/modules/project-profitability/project-profitability.repository.ts');
const financeService = await read('apps/api/src/modules/finance/finance.service.ts');
const prismaSchema = await read('packages/database/prisma/schema.prisma');
const integrationRunner = await read('scripts/testing/run-integration.mjs');
const billingLive = await read('tests/integration/final-21-client-billing-api.integration.test.mjs');
const receiptsLive = await read('tests/integration/final-21-client-receipts-api.integration.test.mjs');
const siteExpenseLive = await read('tests/integration/final-21-site-expenses-api.integration.test.mjs');
const supplierPayablesLive = await read('tests/integration/final-21-supplier-payables-api.integration.test.mjs');
const profitabilityLive = await read('tests/integration/final-21-project-profitability-api.integration.test.mjs');

/** Require one source file to contain every contract fragment for a single integration seam. */
function includesAll(source, fragments, label) {
  for (const fragment of fragments) assert.ok(source.includes(fragment), `${label} is missing ${fragment}`);
}

test('R14 completes the current live integration runner across billing receipts payables expenses profitability and Foundation', () => {
  includesAll(integrationRunner, [
    'foundation-database.integration.test.mjs',
    'final-21-site-expenses-api.integration.test.mjs',
    'final-21-supplier-payables-api.integration.test.mjs',
    'final-21-client-billing-api.integration.test.mjs',
    'final-21-client-receipts-api.integration.test.mjs',
    'final-21-project-profitability-api.integration.test.mjs'
  ], 'current live integration runner');
  assert.match(integrationRunner, /--test-concurrency=1/);
  assert.match(integrationRunner, /RUN_FOUNDATION_DB_TESTS/);
});

test('R14 freezes Client -> Project -> 100 percent Stage baseline and deterministic approved weighted progress', () => {
  assert.match(projectStagesService, /percentToUnits\(totals\._sum\.weightPercent\?\.toString\(\) \?\? '0'\) !== HUNDRED_PERCENT_UNITS/);
  assert.match(projectStagesService, /createFrozenBaseline\(projectId, 1,/);
  assert.match(projectStagesService, /weightedUnits \+= \(percentToUnits\(stage\.weightPercent\) \* percentToUnits\(progress\)\) \/ HUNDRED_PERCENT_UNITS/);
  assert.match(projectStagesService, /listApprovedProgress\(projectId\)/);
  assert.match(projectStagesService, /action: 'project_stage\.progress_approved'/);
});

test('R14 freezes Requirement -> PO -> commitment -> Goods Receipt -> stock -> Material Issue -> actual-cost ownership', () => {
  includesAll(procurementService, [
    'issuePurchaseOrder',
    'upsertMaterialCommitment',
    'purchase_order:${issued.id}:${item.id}',
    'new InventoryService(this.db).receiveInventory',
    'createGoodsReceipt'
  ], 'Procurement service');
  assert.match(procurementRepository, /companyId_sourceKey|sourceKey/);
  includesAll(inventoryService, [
    "movementType: 'RECEIPT'",
    "sourceType: 'goods_receipt'",
    'createMaterialIssueOnce',
    'createMaterialCostActual',
    'inventory_issue:${issue.id}:${issueItem.id}',
    "eventType: 'inventory.material_issued'"
  ], 'Inventory service');
});

test('R14 freezes Employee -> Assignment -> Attendance -> Payroll -> labour cost plus Finance as one finalization transaction', () => {
  includesAll(labourPayrollService, [
    'requireAttendanceAssignment',
    'attendance.create',
    'calculateDraftLines',
    'payroll.finalize',
    'upsertPayrollCostActual',
    'payroll:${payrollRunId}:${line.id}:${allocation.projectId}:${allocation.stageId ?? \'project\'}',
    'postSourceJournalInTransaction(tx',
    'payroll_run:${payrollRunId}',
    "eventType: 'payroll.posted'"
  ], 'Labour/Payroll service');
  assert.match(labourPayrollService, /findOverlappingFinalizedPayrollRun/);
  assert.match(labourPayrollService, /payrollDraftFingerprint\(recalculated\) !== payrollDraftFingerprint\(persistedDrafts\)/);
});

test('R14 keeps Equipment usage as one source-keyed Project or Stage actual cost without profitability-owned edits', () => {
  assert.match(equipmentService, /executeIdempotentCommand/);
  assert.match(equipmentService, /createUsageCostActual/);
  assert.match(equipmentRepository, /category: 'equipment'/);
  assert.match(equipmentRepository, /sourceType: 'equipment_usage'/);
  assert.match(equipmentRepository, /sourceKey: `equipment_usage:\$\{input\.usageId\}`/);
});

test('R14 freezes Site Expense -> Finance + Project Cost atomic posting and compensating reversal history', () => {
  assert.match(siteExpensesService, /const sourceKey = siteExpenseSourceKey\(expenseId\)/);
  assert.match(siteExpensesService, /upsertSiteExpenseCostActual/);
  assert.match(siteExpensesService, /postSourceJournalInTransaction\(tx/);
  assert.match(siteExpensesService, /financeSourceKey: sourceKey, costSourceKey: sourceKey/);
  assert.match(siteExpensesService, /reversalSourceKey/);
  assert.match(siteExpensesService, /site_expense\.reversed/);
});

test('R14 freezes Supplier Invoice -> AP and Project cost -> Supplier Payment -> allocation without silent posted-history deletion', () => {
  includesAll(supplierPayablesService, [
    'supplierInvoiceFinanceSourceKey',
    'supplierInvoiceCostSourceKey',
    'supplierPaymentFinanceSourceKey',
    'postSourceJournalInTransaction(tx',
    'projectCostSourceKeys',
    'allocateSupplierPayment'
  ], 'Supplier Payables service');
  assert.match(supplierPayablesService, /status === 'POSTED'|POSTED/);
  assert.doesNotMatch(supplierPayablesService, /deleteMany\(\{\s*where:\s*\{[^}]*supplierInvoice/i);
});

test('R14 freezes Stage or Project Billing -> Client Invoice -> Receipt plus random advance later allocation without cash-as-profit', () => {
  includesAll(clientBillingService, [
    'clientInvoiceFinanceSourceKey',
    'postSourceJournalInTransaction(tx',
    "eventType: 'client_invoice.posted'"
  ], 'Client Billing service');
  includesAll(clientReceiptsService, [
    'clientReceiptFinanceSourceKey',
    'clientReceiptAllocationFinanceSourceKey',
    'clientReceiptAllocationReversalFinanceSourceKey',
    'clientReceiptReversalFinanceSourceKey',
    'allocateClientReceipt',
    'unallocateClientReceipt',
    'reverseClientReceipt',
    'postSourceJournalInTransaction(tx'
  ], 'Client Receipts service');
  assert.match(receiptsLive, /random advance of Rs\. 500,000 remains advance cash and does not create revenue/);
  assert.match(receiptsLive, /client_receipt_allocation:/);
  assert.match(receiptsLive, /client_receipt_allocation_reversal:/);
});

test('R14 freezes Project and Stage profitability to approved source modules with cash and profit kept separate', () => {
  includesAll(profitabilityRepository, [
    'costActual.findMany',
    'clientInvoice.findMany',
    'listClientReceiptFinanceSources',
    'supplierInvoice.findMany',
    'journal.findMany'
  ], 'Project Profitability repository');
  assert.match(profitabilityService, /const profitAmount = recognizedRevenue - actualCost/);
  assert.match(profitabilityService, /const advanceAmount = receiptFinancials\.received - receiptFinancials\.allocated/);
  assert.match(profitabilityService, /const outstandingAmount = billedAmount - receiptFinancials\.allocated/);
  assert.match(profitabilityService, /requireStageReconciliation/);
  assert.match(profitabilityLive, /reconciles Modules 9, 15, 16, 17 and 18 without double counting/);
  assert.match(profitabilityLive, /random Rs\. 500,000 Client advance changes cash position but not Project profit/);
});

test('R14 freezes company-scoped source-key uniqueness and balanced Finance source posting for retry safety', () => {
  assert.match(prismaSchema, /@@unique\(\[companyId, sourceKey\], map: "journals_company_source_key_uq"\)/);
  assert.match(prismaSchema, /@@unique\(\[companyId, sourceKey\], map: "cost_commitments_company_source_key_uq"\)/);
  assert.match(prismaSchema, /@@unique\(\[companyId, sourceKey\], map: "cost_actuals_company_source_key_uq"\)/);
  assert.match(financeService, /findJournalBySourceKey\(input\.sourceKey\)/);
  assert.match(financeService, /if \(existing\) return existing/);
  assert.match(financeService, /totals\.debitMinorUnits !== totals\.creditMinorUnits/);
  assert.match(financeService, /resolveOpenPeriod/);
});

test('R14 keeps negative permissions Project scope and cross-Company isolation in the live financial integration chain', () => {
  assert.match(billingLive, /cross-Company|cross-company|Foreign Project/i);
  assert.match(receiptsLive, /cross-Company|cross-company|foreignToken/i);
  assert.match(siteExpenseLive, /cross-Company|cross-company|foreign/i);
  assert.match(supplierPayablesLive, /cross-Company|cross-company|foreign/i);
  assert.match(profitabilityLive, /cross-Company isolation|foreign Company administrator/i);
  for (const source of [billingLive, receiptsLive, siteExpenseLive, supplierPayablesLive, profitabilityLive]) {
    assert.match(source, /403|FORBIDDEN|forbidden/i);
  }
});
