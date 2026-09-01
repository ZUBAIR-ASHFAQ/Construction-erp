import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B19.1 records a non-destructive Module 19 alignment audit and frozen build sequence', () => {
  assert.equal(exists('docs/PASS-B19-1-FINAL21-PROJECT-PROFITABILITY-ALIGNMENT-AUDIT.md'), true);
  const audit = read('docs/PASS-B19-1-FINAL21-PROJECT-PROFITABILITY-ALIGNMENT-AUDIT.md');
  assert.match(audit, /non-destructive alignment audit/i);
  assert.match(audit, /no Project Profitability production implementation change and no database migration/i);
  for (let pass = 2; pass <= 10; pass += 1) assert.match(audit, new RegExp(`B19\\.${pass}`));
  assert.match(audit, /READY FOR B19\.2/);
});

test('B19.1 freezes the exact four-route read-only Project Profitability surface', () => {
  const audit = read('docs/PASS-B19-1-FINAL21-PROJECT-PROFITABILITY-ALIGNMENT-AUDIT.md');
  for (const route of [
    'GET /api/v1/project-profitability/projects/:projectId',
    'GET /api/v1/project-profitability/projects/:projectId/stages',
    'GET /api/v1/project-profitability/projects/:projectId/trend',
    'GET /api/v1/project-profitability/portfolio'
  ]) assert.ok(audit.includes(route), `missing route ${route}`);
  assert.match(audit, /zero write routes/i);
  assert.match(audit, /No POST, PUT, PATCH or DELETE endpoint/i);
});

test('B19.1 freezes the Final-21 permission and error vocabulary', () => {
  const audit = read('docs/PASS-B19-1-FINAL21-PROJECT-PROFITABILITY-ALIGNMENT-AUDIT.md');
  for (const permission of [
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  ]) assert.ok(audit.includes(permission), `missing permission ${permission}`);
  for (const code of [
    'PROFITABILITY_SCOPE_FORBIDDEN',
    'PROFITABILITY_SOURCE_INCOMPLETE',
    'INVALID_PROFITABILITY_FILTER'
  ]) assert.ok(audit.includes(code), `missing error ${code}`);
});

test('B19.1 confirms every hard source module is registered before Project Profitability begins', () => {
  const app = read('apps/api/src/app.ts');
  for (const registration of [
    'registerProjectStagesRoutes',
    'registerBudgetsJobCostRoutes',
    'registerClientBillingRoutes',
    'registerClientReceiptsRoutes',
    'registerSupplierPayablesRoutes',
    'registerFinanceRoutes'
  ]) assert.ok(app.includes(registration), `missing prerequisite ${registration}`);
});

test('B19.1 confirms actual cost is source-derived and not profitability-owned', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const repository = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts');
  assert.match(prisma, /model CostActual\b/);
  assert.match(prisma, /@@unique\(\[companyId, sourceKey\]/);
  assert.match(repository, /sumCostActuals\(projectId: string\)/);
  assert.match(repository, /listJobCostLedger/);
  assert.doesNotMatch(prisma, /model ProjectProfitability\b/);
});

test('B19.1 confirms Billing and Stage sources expose approved billed values without equating them to cash', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const billing = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const stages = read('apps/api/src/modules/project-stages/project-stages.repository.ts');
  assert.match(prisma, /model ClientInvoice\b/);
  assert.match(prisma, /model ClientInvoiceLine\b/);
  assert.match(billing, /status: 'ISSUED'/);
  assert.match(stages, /sumStageBilled/);
  assert.match(stages, /status: \{ in: \['ISSUED', 'POSTED'\] \}/);
});

test('B19.1 confirms Client Receipts remains the cash and allocation source and never a profit shortcut', () => {
  const repository = read('apps/api/src/modules/client-receipts/client-receipts.repository.ts');
  const audit = read('docs/PASS-B19-1-FINAL21-PROJECT-PROFITABILITY-ALIGNMENT-AUDIT.md');
  assert.match(repository, /readReceiptFinancialTotals/);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /receivedAmount/);
  assert.match(repository, /allocatedAmount/);
  assert.match(audit, /cash received is \*\*not profit\*\* by itself/i);
});

test('B19.1 confirms Supplier Payables and Finance provide source-owned payable and accounting history', () => {
  const payablesRepository = read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts');
  const payablesService = read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  const financeService = read('apps/api/src/modules/finance/finance.service.ts');
  assert.match(payablesRepository, /listSupplierAgingSources/);
  assert.match(payablesRepository, /status: 'POSTED'/);
  assert.match(payablesService, /outstandingAmount/);
  assert.match(financeService, /postSourceJournalInTransaction/);
  assert.match(financeService, /getLedger/);
});

test('B19.1 preserves the originally observed absence of Module 19 as audit evidence without adding persistence', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-1-project-profitability-alignment-audit.json'));
  const audit = read('docs/PASS-B19-1-FINAL21-PROJECT-PROFITABILITY-ALIGNMENT-AUDIT.md');
  assert.equal(evidence.baseline.backendModulePresent, false);
  assert.equal(evidence.baseline.reactFeaturePresent, false);
  assert.equal(evidence.baseline.authoritativeProfitabilityModelPresent, false);
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.match(audit, /optional cache/i);
  assert.match(audit, /prefer.*no new profitability table and no migration/i);
});

test('B19.1 evidence freezes source ownership, critical rules and B19.2 handoff', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-1-project-profitability-alignment-audit.json'));
  assert.equal(evidence.pass, 'B19.1');
  assert.equal(evidence.productionFilesChanged, false);
  assert.equal(evidence.baseline.requiredRouteCount, 4);
  assert.equal(evidence.baseline.writeRouteCount, 0);
  assert.equal(evidence.nextPass, 'B19.2 Project Profitability persistence / read-model decision');
  assert.ok(evidence.criticalRules.includes('client cash received is not profit by itself'));
  assert.match(evidence.persistenceRecommendation, /no Project Profitability table or migration/i);
});
