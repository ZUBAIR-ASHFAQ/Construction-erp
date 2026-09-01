import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/project-profitability/';
const SERVICE = `${MODULE}project-profitability.service.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B19.6 keeps the five-file backend shape and preserves its service checkpoint after B19.7 registration', () => {
  const files = readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'index.ts',
    'project-profitability.repository.ts',
    'project-profitability.routes.ts',
    'project-profitability.schema.ts',
    'project-profitability.service.ts'
  ]);
  const service = read(SERVICE);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-6-project-profitability-stage-trend-portfolio.json'));
  for (const method of ['getProjectSummary', 'getProjectStages', 'getProjectTrend', 'getPortfolio']) {
    assert.match(service, new RegExp(`async ${method}\\(`), `missing service method ${method}`);
  }
  assert.equal(evidence.pass, 'B19.6');
  assert.match(read(`${MODULE}project-profitability.routes.ts`), /export async function registerProjectProfitabilityRoutes/);
  assert.match(read('apps/api/src/app.ts'), /registerProjectProfitabilityRoutes/);
});
test('B19.6 Stage read keeps Stage identity progress and all financial source concepts separate', () => {
  const service = read(SERVICE);
  const stages = service.match(/async getProjectStages[\s\S]*?\n  }\n\n  \/\*\* Return bounded revenue/)?.[0] ?? '';
  assert.match(stages, /listProjectStages/);
  assert.match(stages, /weightPercent: stage\.weightPercent\.toString\(\)/);
  assert.match(stages, /physicalProgressPercent: stage\.progressUpdates\[0\]\?\.progressPercent\.toString\(\) \?\? '0'/);
  assert.match(stages, /plannedAmount: stage\.plannedAmount\?\.toString\(\) \?\? null/);
  assert.match(stages, /projectOnly/);
  assert.match(stages, /projectTotal/);
});

test('B19.6 rejects source Stage IDs that do not resolve to the requested Project Stage set', () => {
  const service = read(SERVICE);
  assert.match(service, /const stageIds = new Set\(stageSources\.map\(\(stage\) => stage\.id\)\)/);
  assert.match(service, /sourceStageIds\.some\(\(stageId\) => !stageIds\.has\(stageId\)\)/);
  assert.match(service, /PROFITABILITY_SOURCE_INCOMPLETE/);
});

test('B19.6 uses explicit Receipt Journal Project and Stage attribution and never guesses mixed Finance lines', () => {
  const service = read(SERVICE);
  const attribution = service.match(/function receiptJournalAttribution[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(attribution, /new Set\(journal\.lines\.map\(\(line\) => line\.projectId\)/);
  assert.match(attribution, /new Set\(journal\.lines\.map\(\(line\) => line\.stageId \?\? ''\)\)/);
  assert.match(attribution, /projectIds\.size !== 1 \|\| stageIds\.size !== 1/);
  assert.match(service, /function receiptSourcesFor/);
});

test('B19.6 keeps Supplier payable Project-only because payment allocation has no Stage allocation authority', () => {
  const service = read(SERVICE);
  assert.match(service, /financialBucketFor\(sources, projectId, stage\.id, false\)/);
  assert.match(service, /financialBucketFor\(sources, projectId, null, true\)/);
  assert.match(service, /financialBucketFor\(sources, projectId, undefined, true\)/);
});

test('B19.6 Stage financial buckets keep advance and outstanding non-negative instead of inventing allocation', () => {
  const service = read(SERVICE);
  assert.match(service, /allocatedAmount > receivedAmount \|\| allocatedAmount > billedAmount/);
  assert.match(service, /const advanceAmount = receivedAmount - allocatedAmount/);
  assert.match(service, /const outstandingAmount = billedAmount - allocatedAmount/);
  assert.match(service, /const profitAmount = recognizedRevenue - actualCost/);
});

test('B19.6 explicitly reconciles every Stage financial field plus Project-only to Project total', () => {
  const service = read(SERVICE);
  for (const field of [
    'recognizedRevenue', 'actualCost', 'profitAmount', 'billedAmount', 'receivedAmount',
    'allocatedAmount', 'advanceAmount', 'outstandingAmount', 'supplierPayableAmount'
  ]) assert.ok(service.includes(`'${field}'`), `missing reconciliation field ${field}`);
  assert.match(service, /function requireStageReconciliation/);
  assert.match(service, /stageTotal \+ moneyToMinorUnits\(projectOnly\[field\]\)/);
  assert.match(service, /reconciled !== moneyToMinorUnits\(projectTotal\[field\]\)/);
  assert.match(service, /requireStageReconciliation\(stages, projectOnly, projectTotal\)/);
});

test('B19.6 trend creates deterministic DAY WEEK and MONTH buckets including empty periods', () => {
  const service = read(SERVICE);
  assert.match(service, /function trendBucketKey/);
  assert.match(service, /granularity === 'DAY'/);
  assert.match(service, /granularity === 'MONTH'/);
  assert.match(service, /const mondayOffset = day === 0 \? -6 : 1 - day/);
  assert.match(service, /function createTrendBuckets/);
  assert.match(service, /for \(let current = inputDate\(query\.fromDate\); current <= toDate; current = addUtcDays\(current, 1\)\)/);
  assert.match(service, /recognizedRevenue: 0n, actualCost: 0n/);
});

test('B19.6 trend uses only Finance-confirmed recognized revenue and Module 9 actual cost by business posting date', () => {
  const service = read(SERVICE);
  const trend = service.match(/async getProjectTrend[\s\S]*?\n  }\n\n  \/\*\* Return one bounded permission/)?.[0] ?? '';
  assert.match(trend, /listActualCostSources/);
  assert.match(trend, /listBilledSources/);
  assert.match(trend, /listRecognizedRevenueSources/);
  assert.match(trend, /requireRecognizedRevenueOwnership\(billedSources, revenueSources\)/);
  assert.match(trend, /source\.postingDate/);
  assert.match(trend, /source\.journal\.postingDate/);
  assert.match(trend, /profitAmount: minorUnitsToMoney\(bucket\.recognizedRevenue - bucket\.actualCost\)/);
  assert.doesNotMatch(trend, /receivedAmount|allocatedAmount|supplierPayableAmount/);
});

test('B19.6 portfolio intersects request Project scope with all three frozen permissions', () => {
  const service = read(SERVICE);
  const access = service.match(/private async requirePortfolioReadAccess[\s\S]*?\n  }\n\n  \/\*\* Read the five approved/)?.[0] ?? '';
  assert.match(access, /security\.projectScope\.kind === 'not-resolved'/);
  assert.match(access, /security\.projectScope\.kind === 'all' \? null : security\.projectScope\.projectIds/);
  for (const permission of [
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  ]) assert.ok(access.includes(`'${permission}'`), `missing portfolio permission ${permission}`);
  assert.match(access, /intersectProjectIds\(projectIdSets\)/);
});

test('B19.6 portfolio remains bounded and batch-reads financial sources for only the returned Project page', () => {
  const service = read(SERVICE);
  const portfolio = service.match(/async getPortfolio[\s\S]*?\n  }\n}/)?.[0] ?? '';
  assert.match(portfolio, /const page = query\.page \?\? 1/);
  assert.match(portfolio, /const pageSize = query\.pageSize \?\? DEFAULT_PORTFOLIO_PAGE_SIZE/);
  assert.match(portfolio, /listPortfolioProjects/);
  assert.match(portfolio, /const projectIds = result\.items\.map\(\(project\) => project\.id\)/);
  assert.match(portfolio, /readFinancialSources\(repository, projectIds, asOfDate, visibility\)/);
  assert.match(portfolio, /financialBucketFor\(sources, project\.id\)/);
});

test('B19.6 portfolio keeps currencies per Project and does not create unsafe cross-currency totals', () => {
  const service = read(SERVICE);
  const portfolio = service.match(/async getPortfolio[\s\S]*?\n  }\n}/)?.[0] ?? '';
  assert.match(portfolio, /currency: project\.currency/);
  assert.doesNotMatch(portfolio, /grandTotal|portfolioTotal|exchangeRate|currencyConversion/);
});

test('B19.6 stays read-only and adds no Project Profitability persistence or migration', () => {
  const service = read(SERVICE);
  assert.doesNotMatch(service, /\.create\(|\.update\(|\.delete\(|\.upsert\(|\$transaction\(/);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model ProjectProfitability|model ProjectProfitabilitySnapshot/);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b19_6/i.test(name)), false);
});

test('B19.6 evidence records the Stage trend portfolio checkpoint and hands off to B19.7 HTTP OpenAPI', () => {
  const doc = read('docs/PASS-B19-6-FINAL21-PROJECT-PROFITABILITY-STAGE-TREND-PORTFOLIO.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-6-project-profitability-stage-trend-portfolio.json'));
  assert.match(doc, /Stage[\s\S]*Project-only[\s\S]*reconcil/i);
  assert.match(doc, /Monday-based WEEK/i);
  assert.match(doc, /B19\.7.*HTTP.*OpenAPI/i);
  assert.equal(evidence.pass, 'B19.6');
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.nextPass, 'B19.7 Project Profitability HTTP, RBAC and OpenAPI');
});
