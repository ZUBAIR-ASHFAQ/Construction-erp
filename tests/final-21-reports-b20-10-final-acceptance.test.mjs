import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'apps/api/src/modules/reports';
const FEATURE = 'apps/web/src/features/reports';
const LIVE = 'tests/integration/final-21-reports-api.integration.test.mjs';
const E2E = 'tests/e2e/final-21-reports-browser.spec.mjs';

/** Read one project file as UTF-8 text. */
function read(relativePath) { return readFileSync(path.join(ROOT, relativePath), 'utf8'); }

/** Count literal Fastify route registrations in one module source file. */
function routeCount(text) { return [...text.matchAll(/app\.(?:get|post|put|patch|delete)\(/g)].length; }

/** Verify named functions in one changed verification file have nearby purpose comments. */
function assertPurposeComments(relativePath) {
  const lines = read(relativePath).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
    assert.match(lines.slice(Math.max(0, index - 4), index).join('\n'), /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
  }
}

test('B20.10 freezes the standard five-file backend and four-part React Reports feature', () => {
  assert.deepEqual(readdirSync(path.join(ROOT, MODULE)).sort(), ['index.ts', 'reports.repository.ts', 'reports.routes.ts', 'reports.schema.ts', 'reports.service.ts']);
  assert.deepEqual(readdirSync(path.join(ROOT, FEATURE)).sort(), ['api', 'components', 'hooks', 'pages']);
});

test('B20.10 freezes exactly seven Reports HTTP operations and no generic CRUD surface', () => {
  const routes = read(`${MODULE}/reports.routes.ts`);
  assert.equal(routeCount(routes), 7);
  assert.equal([...routes.matchAll(/app\.get\(/g)].length, 4);
  assert.equal([...routes.matchAll(/app\.post\(/g)].length, 3);
  assert.doesNotMatch(routes, /app\.(?:put|patch|delete)\(/);
  for (const operationId of ['listReportCatalog', 'runReport', 'createReportExport', 'getReportRun', 'downloadReportRun', 'listSavedReportFilters', 'saveReportFilter']) {
    assert.match(routes, new RegExp(`operationId: '${operationId}'`));
  }
});

test('B20.10 freezes 26 allow-listed reports, five permissions and four stable errors', () => {
  const schema = read(`${MODULE}/reports.schema.ts`);
  assert.equal([...schema.matchAll(/^\s{2}'?[a-z][a-z-]*'?,?$/gm)].length >= 26, true);
  for (const permission of ['reports.read', 'reports.export', 'reports.finance.read', 'reports.hr.read', 'reports.save_filters']) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  for (const code of ['REPORT_NOT_FOUND', 'REPORT_SCOPE_FORBIDDEN', 'REPORT_FILTER_INVALID', 'REPORT_EXPORT_FAILED']) assert.match(schema, new RegExp(code));
  for (const reportCode of ['project-cost', 'stage-progress', 'client-outstanding', 'supplier-aging', 'attendance', 'general-ledger', 'cash-flow']) assert.match(schema, new RegExp(`'${reportCode}'`));
});

test('B20.10 keeps Reports persistence limited to definitions, runs and saved filters', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['ReportDefinition', 'ReportRun', 'SavedReportFilter']) assert.match(prisma, new RegExp(`model ${model} \\{`));
  assert.doesNotMatch(prisma, /model ReportResult|model ReportRow|model ReportBalance/);
  const migrations = readdirSync(path.join(ROOT, 'packages/database/prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b20[_-]?10/i.test(name)), false);
});

test('B20.10 hardens catalog visibility with source permissions and applies Project filters to Client position reports', () => {
  const service = read(`${MODULE}/reports.service.ts`);
  const billingRepository = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  assert.match(service, /\.\.\.REPORT_SOURCE_PERMISSIONS\[definition\.code\]/);
  assert.match(service, /readClientBillingSummary\(clientId, visibility, filters\.projectId\)/);
  assert.match(service, /\.\.\.\(filters\.projectId \? \{ projectId: filters\.projectId \} : \{\}\)/);
  assert.match(billingRepository, /readClientBillingSummary\(clientId: string, visibility: ClientBillingVisibility, projectId\?: string\)/);
  assert.match(billingRepository, /\.\.\.\(projectId \? \{ projectId \} : \{\}\)/);
});

test('B20.10 freezes source-derived report dispatch without browser-owned formulas or report-owned source copies', () => {
  const service = read(`${MODULE}/reports.service.ts`);
  for (const source of [
    'BudgetsJobCostService', 'ProjectProfitabilityService', 'SiteExpensesService', 'InventoryService', 'ProjectStagesService',
    'ClientBillingRepository', 'ClientReceiptsService', 'ProcurementService', 'SupplierPayablesService', 'LabourPayrollService', 'FinanceService'
  ]) assert.match(service, new RegExp(source));
  assert.match(service, /Profit =|recognizedRevenue|actualCost|outstandingAmount|advanceAmount/i);
  assert.doesNotMatch(read(`${FEATURE}/components/reports-workspace.tsx`), /recognizedRevenue\s*[-+]\s*actualCost|receivedAmount\s*[-+*/]|raw SQL|metricExpression/i);
});

test('B20.10 keeps queued exports bounded, retryable and stored through Module 21 Documents', () => {
  const service = read(`${MODULE}/reports.service.ts`);
  const worker = read('apps/api/src/workers/report-export.worker.ts');
  assert.match(service, /REPORT_EXPORT_MAX_ROWS/);
  assert.match(service, /enqueueJob/);
  assert.match(worker, /new DocumentsRepository\(tx\)/);
  assert.match(worker, /eventType: 'report\.export_completed'/);
  assert.match(worker, /eventType: 'report\.export_failed'/);
  assert.match(worker, /\['Source', 'Approved Final-21 source modules'\]/);
  for (const renderer of ['renderCsv', 'renderExcel', 'renderPdf']) assert.match(worker, new RegExp(`function ${renderer}\\b`));
});

test('B20.10 adds one guarded live Reports integration suite and registers it in the current-schema runner', () => {
  const liveTest = read(LIVE);
  for (const text of ['source-module read permission', 'Stage Progress and Project Cost', 'Client outstanding and advance', 'cross-Company', 'saved filters and queued exports', 'seven frozen Reports operations']) {
    assert.match(liveTest, new RegExp(text, 'i'));
  }
  assert.match(read('scripts/testing/run-integration.mjs'), /final-21-reports-api\.integration\.test\.mjs/);
});

test('B20.10 adds one guarded Playwright workflow for catalog, report, saved filter and export queue', () => {
  const e2e = read(E2E);
  const config = read('playwright.config.mjs');
  for (const text of ['catalog -> Stage Progress -> saved filter -> queued export', 'Grey Structure', 'Current Project Progress', 'QUEUED']) assert.match(e2e, new RegExp(text, 'i'));
  assert.match(e2e, /isAllowedReportsRequest/);
  assert.match(config, /RUN_FINAL_21_REPORTS_E2E/);
  assert.match(config, /final-21-reports-browser\.spec\.mjs/);
});

test('B20.10 remains independent from the later Module 1 Dashboard runtime implementation', () => {
  const reports = read('apps/api/src/modules/reports/reports.service.ts');
  assert.doesNotMatch(reports, /registerDashboardRoutes|DashboardService/);
});

test('B20.10 keeps verification helpers junior-readable with short purpose comments', () => {
  for (const relativePath of [LIVE, E2E, 'tests/final-21-reports-b20-10-final-acceptance.test.mjs']) assertPurposeComments(relativePath);
});

test('B20.10 preserves the compact package-script surface and hands off to Module 1 Dashboard', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(Object.keys(pkg.scripts).length < 100, true);
  assert.equal(existsSync(path.join(ROOT, 'tests/final-21-reports-b20-9-react.test.mjs')), true);
  assert.equal(existsSync(path.join(ROOT, 'tests/final-21-reports-b20-10-final-acceptance.test.mjs')), true);
});
