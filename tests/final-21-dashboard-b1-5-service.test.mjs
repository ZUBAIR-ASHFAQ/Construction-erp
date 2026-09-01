import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/dashboard/dashboard.service.ts';
const REPOSITORY = 'apps/api/src/modules/dashboard/dashboard.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B1.5 adds one small Dashboard service with the planned orchestration methods', () => {
  const service = read(SERVICE);
  assert.match(service, /export class DashboardService/);
  for (const method of ['getSummary', 'getProjects', 'getProjectDashboard', 'updatePreferences']) {
    assert.match(service, new RegExp(`async ${method}\\b`), `missing ${method}`);
  }
  assert.doesNotMatch(service, /class Dashboard[A-Za-z]+Manager|class Dashboard[A-Za-z]+Engine|class Dashboard[A-Za-z]+Factory/);
});

test('B1.5 revalidates Dashboard permissions and authenticated Project scope in the service', () => {
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /findEffectivePermissionCodes\(lookup\)/);
  assert.match(service, /projectScope\.kind === 'not-resolved'/);
  assert.match(service, /projectScope\.kind === 'restricted'/);
  assert.match(service, /DASHBOARD_SCOPE_FORBIDDEN/);
  for (const permission of ['dashboard.read', 'dashboard.project.read', 'dashboard.finance.read', 'dashboard.manage_preferences']) {
    assert.ok(service.includes(`'${permission}'`), `missing service permission ${permission}`);
  }
});

test('B1.5 keeps financial widgets permission-gated and source permissions visible', () => {
  const service = read(SERVICE);
  for (const permission of [
    'stages.read',
    'job_cost.read',
    'finance.read',
    'project_profitability.read',
    'project_profitability.finance.read'
  ]) {
    assert.ok(service.includes(`'${permission}'`), `missing source permission ${permission}`);
  }
  assert.match(service, /DASHBOARD_WIDGET_NOT_AVAILABLE/);
  assert.match(service, /WIDGET_SOURCE_PERMISSIONS/);
});

test('B1.5 reuses Stage and Project Profitability services instead of duplicating KPI formulas', () => {
  const service = read(SERVICE);
  assert.match(service, /new ProjectStagesService\(this\.db\)\.getProjectSummary/);
  assert.match(service, /new ProjectStagesService\(this\.db\)\.listStages/);
  assert.match(service, /new ProjectProfitabilityService\(this\.db\)\.getProjectSummary/);
  assert.match(service, /new ProjectProfitabilityService\(this\.db\)\.getPortfolio/);
  assert.doesNotMatch(service, /\b(?:const|let|var)\s+profit\s*=|receivedAmount\s*-\s*actualCost|billedAmount\s*-\s*receivedAmount|stageWeight\s*\*/i);
  assert.doesNotMatch(service, /\$queryRaw|\$executeRaw|raw sql|formula engine|query builder/i);
});

test('B1.5 keeps Project portfolio reads bounded and server-scoped', () => {
  const service = read(SERVICE);
  assert.match(service, /DEFAULT_PROJECT_PAGE_SIZE = 25/);
  assert.match(service, /allowedProjectIds: scope\.allowedProjectIds/);
  assert.match(service, /skip: \(page - 1\) \* pageSize/);
  assert.match(service, /take: pageSize/);
});

test('B1.5 persists only presentation preferences and validates default Project scope', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /updateDashboardPreferencesBodySchema\.parse\(input\)/);
  assert.match(service, /findProjectById\(parsed\.defaultProjectId/);
  assert.match(repository, /async upsertPreference\b/);
  assert.match(repository, /dashboardPreference\.upsert/);
  assert.match(repository, /companyId_userId/);
  assert.doesNotMatch(repository, /actualCost|billedAmount|receivedAmount|profitAmount|payableAmount/);
});

test('B1.5 makes preference writes atomic with audit and outbox evidence', () => {
  const service = read(SERVICE);
  assert.match(service, /withTransaction\(this\.db/);
  assert.match(service, /recordAudit\(tx/);
  assert.match(service, /recordOutboxEvent\(tx/);
  assert.match(service, /dashboard\.preferences_updated/);
});

test('B1.5 keeps Dashboard service orchestration independent from the HTTP layer', () => {
  const service = read(SERVICE);
  assert.doesNotMatch(service, /Fastify|authenticateRequest|registerDashboardRoutes/);
});

test('B1.5 keeps short purpose comments on every new named helper and service method', () => {
  const service = read(SERVICE);
  for (const marker of [
    'function hasAllPermissions',
    'function uniqueStrings',
    'function requestsFinancialWidget',
    'function preferenceResponse',
    'function dashboardAsOfDate',
    'constructor(',
    'async requireScope',
    'requireRequestedWidgetAccess',
    'canReadProfitability',
    'async getSummary',
    'async getProjects',
    'async getProjectDashboard',
    'async updatePreferences'
  ]) {
    const index = service.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(service.slice(Math.max(0, index - 260), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});

test('B1.5 exports the Dashboard service without adding unnecessary module files', () => {
  const index = read('apps/api/src/modules/dashboard/index.ts');
  assert.match(index, /export \{ DashboardService \} from '\.\/dashboard\.service\.js';/);
  assert.match(index, /DashboardServiceScope/);
  assert.match(index, /DashboardPreferenceRepositoryInput/);
});
