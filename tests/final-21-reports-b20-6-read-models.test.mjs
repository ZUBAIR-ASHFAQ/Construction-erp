import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/reports/';

/** Read one project file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B20.6 keeps the five-file Reports backend shape while Dashboard remains deferred', () => {
  assert.deepEqual(readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort(), [
    'index.ts',
    'reports.repository.ts',
    'reports.routes.ts',
    'reports.schema.ts',
    'reports.service.ts'
  ]);
  assert.match(read(`${MODULE}reports.routes.ts`), /new ReportsService/);
  assert.doesNotMatch(read(`${MODULE}reports.service.ts`), /DashboardService|registerDashboardRoutes/);
});

test('B20.6 implements one bounded runReport dispatcher for every Final-21 report code', () => {
  const service = read(`${MODULE}reports.service.ts`);
  assert.match(service, /async runReport\b/);
  const codes = [
    'project-cost', 'budget-vs-actual', 'project-profit-loss', 'project-expenses', 'project-material',
    'stage-progress', 'stage-cost', 'stage-billing', 'stage-receipts', 'client-billing', 'client-payments',
    'client-outstanding', 'client-advance', 'client-aging', 'supplier-purchases', 'supplier-payables',
    'supplier-payments', 'supplier-aging', 'attendance', 'payroll', 'labour-cost', 'cash-bank',
    'general-ledger', 'profit-loss', 'balance-sheet', 'cash-flow'
  ];
  for (const code of codes) assert.ok(service.includes(`'${code}'`) || service.includes(`${code}:`), `missing ${code}`);
  assert.match(service, /REPORT_SOURCE_PERMISSIONS/);
  assert.match(service, /REPORT_ALLOWED_FILTERS/);
  assert.match(service, /REPORT_REQUIRED_FILTERS/);
  assert.match(service, /REPORT_FILTER_INVALID/);
});

test('B20.6 reuses source-module services and repositories instead of creating a duplicate report data store', () => {
  const service = read(`${MODULE}reports.service.ts`);
  for (const source of [
    'BudgetsJobCostService', 'ProjectProfitabilityService', 'SiteExpensesService', 'InventoryService',
    'ProjectStagesService', 'ClientReceiptsService', 'ProcurementService', 'SupplierPayablesService',
    'LabourPayrollService', 'FinanceService'
  ]) assert.match(service, new RegExp(source), `missing source ${source}`);
  assert.doesNotMatch(read(`${MODULE}reports.repository.ts`), /costActual|clientInvoice|clientReceipt|supplierInvoice|journalLine|attendanceEntry|projectStage/);
  assert.doesNotMatch(service, /eval\(|new Function|dynamicSql|formulaEngine|queryBuilder|\$queryRaw|\$executeRaw/i);
});

test('B20.6 keeps progress cost billing receipts and cash/profit concepts source-derived and separate', () => {
  const service = read(`${MODULE}reports.service.ts`);
  assert.match(service, /getStageFinancials/);
  assert.match(service, /getProjectSummary/);
  assert.match(service, /billedAmount/);
  assert.match(service, /receivedAmount/);
  assert.match(service, /allocatedAmount/);
  assert.match(service, /outstandingAmount/);
  assert.match(service, /advanceAmount/);
  assert.match(service, /ProjectProfitabilityService/);
});

test('B20.6 adds built-in allow-listed definitions and Finance period/account filters without browser formulas', () => {
  const schema = read(`${MODULE}reports.schema.ts`);
  const repository = read(`${MODULE}reports.repository.ts`);
  assert.match(schema, /REPORT_DEFINITION_DEFAULTS/);
  assert.match(schema, /periodId: uuidSchema\.optional\(\)/);
  assert.match(schema, /accountId: uuidSchema\.optional\(\)/);
  assert.match(repository, /REPORT_DEFINITION_DEFAULTS\.find/);
  assert.match(repository, /REPORT_CODES\.length \* 2/);
  assert.doesNotMatch(schema, /formulaSchema|sqlSchema|expressionSchema/);
});

test('B20.6 extends source-owned reads only where bounded report reconciliation needs them', () => {
  const billing = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const receipts = read('apps/api/src/modules/client-receipts/client-receipts.repository.ts');
  const cost = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts');
  assert.match(billing, /clientId\?: string/);
  assert.match(billing, /statuses\?: readonly string\[\]/);
  assert.match(billing, /invoiceDate:/);
  assert.match(receipts, /async sumAllocatedAmountsForInvoices/);
  assert.match(receipts, /status: 'POSTED'/);
  assert.match(cost, /async listActualCostSources/);
  assert.match(cost, /category: \{ in: \[\.\.\.input\.categories\] \}/);
});

test('B20.6 derives Finance statements from posted Finance reads with exact minor-unit arithmetic', () => {
  const service = read(`${MODULE}reports.service.ts`);
  assert.match(service, /getTrialBalance/);
  assert.match(service, /findAccountsByIds/);
  assert.match(service, /accountType === 'REVENUE'/);
  assert.match(service, /accountType === 'ASSET'/);
  assert.match(service, /NET_PROFIT_LOSS/);
  assert.match(service, /BALANCE_CHECK/);
  assert.match(service, /periodMovement/);
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /function minorUnitsToMoney/);
});

test('B20.6 purpose-comments every named function and method introduced or materially changed', () => {
  const files = [
    `${MODULE}reports.service.ts`,
    'apps/api/src/modules/client-billing/client-billing.repository.ts',
    'apps/api/src/modules/client-receipts/client-receipts.repository.ts',
    'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts'
  ];
  const markers = [
    'function parseSourceQuery', 'function validateReportFilters', 'function inputDate', 'function endOfInputDate',
    'function dateOnly', 'function pageWindow', 'function moneyToMinorUnits', 'function minorUnitsToMoney',
    'function toJsonSafe', 'function normalizeReportResult', 'function clientAgingBucket',
    'private async readClientPosition', 'private async readClientAging', 'private async readLabourCost',
    'private async readFinancialStatement', 'private async readReport', 'async runReport',
    'async sumAllocatedAmountsForInvoices', 'async listActualCostSources'
  ];
  const combined = files.map(read).join('\n');
  for (const marker of markers) {
    const index = combined.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(combined.slice(Math.max(0, index - 260), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});

test('B20.6 adds no migration because read models remain source-derived', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b20[_-]?6/i.test(name)), false);
});
