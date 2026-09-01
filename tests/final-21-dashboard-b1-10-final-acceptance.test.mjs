import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'apps/api/src/modules/dashboard';
const FEATURE = 'apps/web/src/features/dashboard';
const LIVE = 'tests/integration/final-21-dashboard-api.integration.test.mjs';
const E2E = 'tests/e2e/final-21-dashboard-browser.spec.mjs';
const PERMISSION_MIGRATION = '20260831000400_final21_reports_dashboard_permissions';
const FINAL_MODULES = [
  'administration',
  'budgets-job-cost',
  'client-billing',
  'client-receipts',
  'clients',
  'dashboard',
  'documents-audit',
  'employees',
  'equipment',
  'finance',
  'inventory',
  'labour-payroll',
  'procurement',
  'project-profitability',
  'project-stages',
  'project-team',
  'projects',
  'reports',
  'site-expenses',
  'supplier-payables',
  'vendors-subcontractors'
].sort();

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

test('B1.10 freezes exactly 21 approved backend modules and 21 matching React features', () => {
  const apiModules = readdirSync(path.join(ROOT, 'apps/api/src/modules'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const webFeatures = readdirSync(path.join(ROOT, 'apps/web/src/features'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(apiModules, FINAL_MODULES);
  assert.deepEqual(webFeatures, FINAL_MODULES);
  for (const excluded of ['crm', 'tendering', 'estimation', 'contracts', 'boq', 'wbs', 'cost-codes', 'change-orders', 'rfi', 'submittals', 'daily-site-reports', 'scheduling']) {
    assert.equal(apiModules.includes(excluded), false, `${excluded} must stay outside Final-21 scope`);
    assert.equal(webFeatures.includes(excluded), false, `${excluded} must stay outside Final-21 scope`);
  }
});

test('B1.10 freezes the standard five-file backend, four-part React feature and exact five Dashboard operations', () => {
  assert.deepEqual(readdirSync(path.join(ROOT, MODULE)).sort(), ['dashboard.repository.ts', 'dashboard.routes.ts', 'dashboard.schema.ts', 'dashboard.service.ts', 'index.ts']);
  assert.deepEqual(readdirSync(path.join(ROOT, FEATURE)).sort(), ['api', 'components', 'hooks', 'pages']);
  const routes = read(`${MODULE}/dashboard.routes.ts`);
  assert.equal(routeCount(routes), 5);
  assert.equal([...routes.matchAll(/app\.get\(/g)].length, 4);
  assert.equal([...routes.matchAll(/app\.patch\(/g)].length, 1);
  assert.doesNotMatch(routes, /app\.(?:post|put|delete)\(/);
  for (const operationId of ['getDashboardSummary', 'listDashboardProjects', 'getProjectDashboard', 'listDashboardAlerts', 'updateDashboardPreferences']) {
    assert.match(routes, new RegExp(`operationId: '${operationId}'`));
  }
});

test('B1.10 registers the final Reports and Dashboard permission vocabulary on the post-R9 permission contract', () => {
  const migration = read(`packages/database/prisma/migrations/${PERMISSION_MIGRATION}/migration.sql`);
  for (const permission of [
    'reports.read', 'reports.export', 'reports.finance.read', 'reports.hr.read', 'reports.save_filters',
    'dashboard.read', 'dashboard.project.read', 'dashboard.finance.read', 'dashboard.manage_preferences'
  ]) assert.match(migration, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(migration, /INSERT INTO "permissions" \("code", "description", "domain"\)/);
  assert.match(migration, /INSERT INTO "role_permissions" \("role_id", "permission_code"\)/);
  assert.match(migration, /role\."code" = 'system-admin'/);
  assert.doesNotMatch(migration, /"permission_id"|"permissions" \("id", "code", "name"/);

  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
  const permissionGate = gates.gates.find((gate) => gate.migrations.includes(PERMISSION_MIGRATION));
  assert.equal(permissionGate?.stage, 58);
  assert.equal(permissionGate?.gate, 'final-21-pass-b1-10-final-permission-acceptance');
  assert.deepEqual(permissionGate?.migrations, [PERMISSION_MIGRATION]);
  assert.match(checksums.migrations[PERMISSION_MIGRATION], /^[a-f0-9]{64}$/);
});

test('B1.10 keeps Dashboard read-oriented and copies stable source models instead of owning KPI truth', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const service = read(`${MODULE}/dashboard.service.ts`);
  for (const source of ['ProjectStagesService', 'BudgetsJobCostService', 'ProjectProfitabilityService', 'FinanceService']) assert.match(service, new RegExp(source));
  for (const field of ['recognizedRevenue', 'actualCost', 'profitAmount', 'billedAmount', 'receivedAmount', 'allocatedAmount', 'advanceAmount', 'outstandingAmount', 'supplierPayableAmount']) assert.match(service, new RegExp(field));
  assert.match(service, /profitAmount: values\.profitAmount/);
  assert.match(service, /receivedAmount: values\.receivedAmount/);
  assert.doesNotMatch(service, /receivedAmount\s*[-+*/]\s*actualCost|receivedAmount\s*[-+*/]\s*profitAmount/);
  assert.match(prisma, /model DashboardPreference \{/);
  assert.match(prisma, /model DashboardSavedFilter \{/);
  assert.doesNotMatch(prisma, /model Dashboard(?:Kpi|Metric|Alert|Balance|Progress|Financial|Profit)/);
});

test('B1.10 preserves Final-21 reconciliation invariants in the authoritative source modules', () => {
  const stages = read('apps/api/src/modules/project-stages/project-stages.service.ts');
  const budget = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts');
  const receipts = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const profitability = read('apps/api/src/modules/project-profitability/project-profitability.service.ts');
  assert.match(stages, /overallPhysicalProgressPercent|weightPercent/);
  assert.match(budget, /sumCostActuals|actualCost/);
  assert.match(receipts, /advance|unallocated|allocation/i);
  assert.match(profitability, /recognizedRevenue/);
  assert.match(profitability, /profitAmount/);
  assert.match(profitability, /receivedAmount/);
  assert.match(profitability, /outstandingAmount/);
});

test('B1.10 final workspace regression now verifies the five-file and four-folder shape for all 21 modules', () => {
  const workspace = read('tests/workspace.test.mjs');
  for (const moduleName of ['project-profitability', 'reports', 'dashboard']) assert.match(workspace, new RegExp(`'${moduleName}'`));
  assert.match(workspace, /current backend modules keep the approved five-file shape/);
  assert.match(workspace, /current React features keep api hooks components and pages folders/);
});

test('B1.10 adds one guarded live Dashboard reconciliation suite and registers it in the current-schema runner', () => {
  const liveTest = read(LIVE);
  for (const text of ['weighted progress', 'Project cost', 'cash and profit', 'source-derived', 'cross-Company', 'preference writes', 'five frozen Dashboard operations']) {
    assert.match(liveTest, new RegExp(text, 'i'));
  }
  assert.match(read('scripts/testing/run-integration.mjs'), /final-21-dashboard-api\.integration\.test\.mjs/);
});

test('B1.10 adds one guarded Playwright workflow for Project health, Stage Progress, source alerts and preference saving', () => {
  const e2e = read(E2E);
  const config = read('playwright.config.mjs');
  for (const text of ['Project health', 'Stage Progress', 'source alerts', 'Current Project View', 'Cash received is not profit']) assert.match(e2e, new RegExp(text, 'i'));
  assert.match(e2e, /isAllowedDashboardRequest/);
  assert.match(config, /RUN_FINAL_21_DASHBOARD_E2E/);
  assert.match(config, /final-21-dashboard-browser\.spec\.mjs/);
});

test('B1.10 keeps verification helpers junior-readable with short purpose comments', () => {
  for (const relativePath of [LIVE, E2E, 'tests/final-21-dashboard-b1-10-final-acceptance.test.mjs']) assertPurposeComments(relativePath);
});

test('B1.10 closes the Final-21 build without expanding the compact root command surface', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '0.38.0');
  assert.equal(Object.keys(pkg.scripts).length < 100, true);
  assert.equal(existsSync(path.join(ROOT, 'tests/final-21-dashboard-b1-9-react.test.mjs')), true);
  assert.equal(existsSync(path.join(ROOT, 'tests/final-21-dashboard-b1-10-final-acceptance.test.mjs')), true);
});
