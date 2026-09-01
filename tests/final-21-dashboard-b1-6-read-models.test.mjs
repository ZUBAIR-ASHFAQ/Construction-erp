import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/dashboard/dashboard.service.ts';

/** Read one source file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B1.6 composes core Dashboard models from existing source services only', () => {
  const service = read(SERVICE);
  assert.match(service, /BudgetsJobCostService/);
  assert.match(service, /FinanceService/);
  assert.match(service, /ProjectStagesService/);
  assert.match(service, /ProjectProfitabilityService/);
  assert.match(service, /getJobCost\(query\.projectId\)/);
  assert.match(service, /listCashBankAccounts\(\{ page: 1, pageSize: 100 \}\)/);
  assert.match(service, /getProjectSummary\(query\.projectId/);
  assert.match(service, /listStages\(projectId\)/);
  assert.doesNotMatch(service, /\$queryRaw|\$executeRaw|raw sql|formula engine|query builder/i);
});

test('B1.6 project portfolio exposes weighted physical progress from Module 7', () => {
  const service = read(SERVICE);
  assert.match(service, /async getProjects\b/);
  assert.match(service, /getProjectSummary\(project\.id\)/);
  assert.match(service, /overallPhysicalProgressPercent: progress\[index\]\?\.overallPhysicalProgressPercent \?\? null/);
  assert.match(service, /stageBaselineStatus: progress\[index\]\?\.baselineStatus \?\? null/);
  assert.doesNotMatch(service, /weightPercent\s*\*|stageWeight\s*\*/i);
});

test('B1.6 single-Project model keeps physical, budget/cost and financial position separate', () => {
  const service = read(SERVICE);
  assert.match(service, /async getProjectDashboard\b/);
  assert.match(service, /stageProgress,/);
  assert.match(service, /budgetVsActual: jobCost\?\.totals \?\? null/);
  assert.match(service, /financialPosition: profitability \? financialPosition\(profitability\) : null/);
  assert.match(service, /cashBank/);
});

test('B1.6 financial position preserves received, advance, outstanding, payable and profit as distinct values', () => {
  const service = read(SERVICE);
  for (const field of [
    'profitAmount',
    'billedAmount',
    'receivedAmount',
    'allocatedAmount',
    'advanceAmount',
    'outstandingAmount',
    'supplierPayableAmount'
  ]) {
    assert.match(service, new RegExp(`${field}: values\\.${field}`), `missing distinct ${field}`);
  }
  assert.doesNotMatch(service, /receivedAmount\s*-\s*actualCost|receivedAmount\s*[-+]\s*values\.actualCost/i);
});

test('B1.6 Company financial summary never mixes currencies and exposes bounded coverage', () => {
  const service = read(SERVICE);
  assert.match(service, /function aggregateFinancialsByCurrency/);
  assert.match(service, /new Map<string, CurrencyFinancialAccumulator>/);
  assert.match(service, /totals\.get\(item\.currency\)/);
  assert.match(service, /financialsByCurrency: profitability \? aggregateFinancialsByCurrency\(profitability\.items\) : null/);
  assert.match(service, /DASHBOARD_FINANCIAL_PORTFOLIO_PAGE_SIZE = 100/);
  assert.match(service, /includedProjects: profitability\.items\.length/);
  assert.match(service, /complete: profitability\.items\.length === profitability\.total/);
});

test('B1.6 uses exact integer minor units for Dashboard-only summation', () => {
  const service = read(SERVICE);
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /function minorUnitsToMoney/);
  assert.match(service, /BigInt/);
  assert.doesNotMatch(service, /parseFloat|Number\(item\.(?:recognizedRevenue|actualCost|profitAmount|billedAmount|receivedAmount)/);
});

test('B1.6 skips unavailable sources by permission and requested widget instead of duplicating authority', () => {
  const service = read(SERVICE);
  assert.match(service, /function wantsAnyWidget/);
  assert.match(service, /private canReadJobCost/);
  assert.match(service, /private canReadCashBank/);
  assert.match(service, /this\.canReadProfitability\(scope\)/);
  assert.match(service, /this\.canReadJobCost\(scope\)/);
  assert.match(service, /this\.canReadCashBank\(scope\)/);
});

test('B1.6 keeps core read-model orchestration independent from the HTTP layer', () => {
  const service = read(SERVICE);
  assert.doesNotMatch(service, /Fastify|authenticateRequest|registerDashboardRoutes/);
});

test('B1.6 keeps purpose comments on every added named helper and method', () => {
  const service = read(SERVICE);
  for (const marker of [
    'function wantsAnyWidget',
    'function moneyToMinorUnits',
    'function minorUnitsToMoney',
    'function financialPosition',
    'function aggregateFinancialsByCurrency',
    'private canReadJobCost',
    'private canReadCashBank',
    'async getSummary',
    'async getProjects',
    'async getProjectDashboard'
  ]) {
    const index = service.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(service.slice(Math.max(0, index - 280), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});
