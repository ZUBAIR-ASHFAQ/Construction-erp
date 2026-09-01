import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const freeze = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const projectSchema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const projectRoutes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const budgetService = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts', 'utf8');
const procurementEvidence = JSON.parse(await readFile('module-8-evidence/stage-13-static.json', 'utf8'));
const purchaseOrderService = await readFile('apps/api/src/modules/purchase-orders/purchase-orders.service.ts', 'utf8');
const equipmentService = await readFile('apps/api/src/modules/equipment/equipment.service.ts', 'utf8');
const payrollSchema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const billingService = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const billingRoutes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const workspaceStaticTest = await readFile('tests/workspace.test.mjs', 'utf8');

test('Pass 358 is an explicit documentation-and-verification-only gate', () => {
  for (const phrase of [
    'documentation and verification only',
    'changes no production runtime',
    'zero production runtime files',
    'zero database files',
    'Pass 359 — Module 6 durable WBS freeze/reopen state'
  ]) assert.ok(freeze.includes(phrase), `Missing Pass-358 boundary phrase: ${phrase}`);
});

test('Pass 358 historically freezes the WBS durable-freeze defect for Pass 359 repair', () => {
  assert.match(freeze, /M6-01 — WBS freeze is not durable/);
  assert.match(freeze, /planned Pass 359 — highest-priority repair/);
  assert.match(freeze, /intentionally persists no frozen-state row\/field/);
  assert.match(freeze, /Later WBS\/mapping mutations therefore have no durable state to reject against/);
});

test('Pass 358 Project suspended-state finding remains traceable after the dedicated Pass-366 repair', () => {
  assert.match(projectSchema, /'SUSPENDED'/);
  assert.match(projectRoutes, /\/suspend['"]/);
  assert.match(projectRoutes, /\/resume['"]/);
  assert.match(freeze, /M5-01 — Suspended lifecycle is represented but has no controlled command/);
  assert.match(freeze, /IMPLEMENTED_PASS_366/);
});

test('Pass 358 Budget approval finding is closed only by the dedicated Pass-361 Module-22 repair', () => {
  assert.match(budgetService, /async freezeBudget\(projectId: string, budgetId: string\)/);
  const freezeBudgetBlock = budgetService.slice(
    budgetService.indexOf('async freezeBudget(projectId: string, budgetId: string)'),
    budgetService.indexOf('async applyApprovedChangeOrderInTransaction')
  );
  assert.match(freezeBudgetBlock, /ApprovalsService/);
  assert.match(freezeBudgetBlock, /requestApprovalInTransaction/);
  assert.match(freeze, /M7-01 — Budget freeze bypasses conditional approval/);
  assert.match(freeze, /implemented in Pass 361/);
});

test('Pass 358 RFQ-item repair decision remains traceable after Pass 362 resolves the gap', () => {
  assert.match(freeze, /M8-01 — `supplier_quotation_items\.rfq_item_id` has no enforceable target/);
  assert.match(freeze, /IMPLEMENTED_PASS_362/);
  assert.match(freeze, /Pass 362 adds the smallest `rfq_items` persistence/);
  assert.ok(!procurementEvidence.unresolvedSourceContract.some((item) => item.includes('rfq_items table')));
});

test('Pass 358 Direct-Purchase finding stays traceable after the dedicated Pass-364 repair', () => {
  assert.match(purchaseOrderService, /purchase_orders\.direct_purchase/);
  assert.match(purchaseOrderService, /requireDirectPurchaseException/);
  assert.match(freeze, /M9-01 — Direct-purchase exception is explicitly fail-closed/);
  assert.match(freeze, /IMPLEMENTED_PASS_364/);
});

test('Pass 358 Equipment gaps are closed only by the explicit Pass-371 repair', () => {
  assert.match(equipmentService, /async submitUsage/);
  assert.match(equipmentService, /async postUsageCost/);
  assert.match(equipmentService, /createUsageCostActual/);
  assert.match(freeze, /M12-01 — Usage approval authority is missing/);
  assert.match(freeze, /M12-02 — Equipment usage does not yet create Module-7 actual cost/);
  assert.match(freeze, /IMPLEMENTED_PASS_371/);
});

test('Pass 358 recognizes Stage-20 compensation/source-consumption amendments and does not duplicate them', () => {
  assert.match(payrollSchema, /model EmployeeCompensationPeriod/);
  assert.match(payrollSchema, /model PayrollSourceConsumption/);
  assert.match(freeze, /M14A-03 — Effective compensation history/);
  assert.match(freeze, /M13-04 — Payroll source consumption identity/);
  assert.match(freeze, /Do not re-add another compensation table/);
  assert.match(freeze, /Do not create duplicate source-key tables/);
});

test('Pass 358 Client Billing submit finding stays traceable after the dedicated Pass-375 repair', () => {
  assert.match(freeze, /M16-01 — Explicit Progress Claim submit lifecycle/);
  assert.match(freeze, /IMPLEMENTED_PASS_375/);
  assert.match(billingService, /operation: 'client-billing\.claim-submit'/);
  assert.match(billingService, /eventType: 'progress_claim\.submitted'/);
  assert.match(billingRoutes, /claims\/:id\/submit/);
  assert.doesNotMatch(billingService, /implicitSubmitAtCertification/);
});

test('Pass 358 keeps corrected Stage-26 and Stage-27 boundaries frozen', () => {
  for (const phrase of [
    'Stage 26 — frozen Finance deferrals',
    'Client Invoice → AR adapter/reconciliation',
    'Stage 27 — frozen integration deferrals',
    'Tender → BOQ → Project',
    'Employee → Timesheet → Payroll → labor-cost posting proof',
    'Change → Budget/Client Contract/Subcontract/Schedule'
  ]) assert.ok(freeze.includes(phrase), `Missing deferred boundary: ${phrase}`);
});

test('Pass 358 preserves the existing function-comment gate and freezes junior-readable repair rules', () => {
  assert.match(workspaceStaticTest, /every named production function has a short purpose comment/);
  assert.match(freeze, /existing cumulative static suite already proves that \*\*every named production function has a short purpose comment\*\*/);
  for (const phrase of [
    'Every named function/method introduced or materially edited receives a short purpose comment',
    'Prefer one clear function over multiple wrappers that only forward arguments',
    'Do not split a required five-file module into many extra helper files',
    'Remove a function/file only when static/runtime evidence proves it is redundant or unused'
  ]) assert.ok(freeze.includes(phrase), `Missing readability rule: ${phrase}`);
});

test('Pass 358 freezes the dependency-aware repair sequence through cumulative Pass 379', () => {
  for (let pass = 359; pass <= 379; pass += 1) {
    assert.match(freeze, new RegExp(`\\| ${pass} \\|`), `Missing repair-sequence Pass ${pass}`);
  }
  assert.match(freeze, /Only after Pass 379 passes should Stage 24 \/ Module 19 RFI & Submittals begin/);
});
