import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

const schema = read('apps/api/src/modules/dashboard/dashboard.schema.ts');
const index = read('apps/api/src/modules/dashboard/index.ts');
const routes = read('apps/api/src/modules/dashboard/dashboard.routes.ts');

const permissionCodes = [
  'dashboard.read',
  'dashboard.project.read',
  'dashboard.finance.read',
  'dashboard.manage_preferences'
];

const errorCodes = [
  'DASHBOARD_SCOPE_FORBIDDEN',
  'DASHBOARD_WIDGET_NOT_AVAILABLE',
  'INVALID_DASHBOARD_FILTER'
];

const widgetCodes = [
  'executive-summary',
  'project-health',
  'stage-progress',
  'budget-vs-actual',
  'billed-received-outstanding',
  'supplier-payable',
  'cash-bank',
  'profit-loss',
  'alerts'
];

test('B1.3 defines the exact documented Dashboard permission vocabulary', () => {
  for (const code of permissionCodes) assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  assert.equal((schema.match(/'dashboard\.[a-z_.]+'/g) ?? []).length, permissionCodes.length);
});

test('B1.3 defines the three documented stable Dashboard error codes', () => {
  for (const code of errorCodes) assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  assert.match(schema, /createDashboardError\(code: DashboardErrorCode\): AppError/);
  assert.match(schema, /new AuthorizationError\(\{ code, message \}\)/);
  assert.match(schema, /new NotFoundError\(\{ code, message \}\)/);
  assert.match(schema, /new ValidationError\(\{ code, message \}\)/);
});

test('B1.3 allow-lists Dashboard widgets instead of accepting report expressions', () => {
  for (const code of widgetCodes) assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  assert.match(schema, /z\.enum\(DASHBOARD_WIDGET_CODES\)/);
  for (const forbidden of ['formula', 'expression', 'metricExpression', 'sql', 'queryText']) {
    assert.ok(schema.includes(`'${forbidden}'`), `missing server-owned guard ${forbidden}`);
  }
});

test('B1.3 validates bounded Dashboard pagination and date windows', () => {
  assert.match(schema, /DASHBOARD_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /DASHBOARD_MAX_DATE_RANGE_DAYS = 366/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(DASHBOARD_MAX_PAGE_SIZE\)/);
  assert.match(schema, /validateDashboardDateRange/);
  assert.match(schema, /date must use a valid YYYY-MM-DD calendar date/);
});

test('B1.3 provides strict schemas for every documented Dashboard request shape', () => {
  for (const contract of [
    'dashboardSummaryQuerySchema',
    'dashboardProjectsQuerySchema',
    'dashboardProjectParamsSchema',
    'dashboardProjectQuerySchema',
    'dashboardAlertsQuerySchema',
    'updateDashboardPreferencesBodySchema'
  ]) {
    assert.match(schema, new RegExp(`export const ${contract} = z\\.object`), `missing ${contract}`);
  }
  assert.ok((schema.match(/\.strict\(\)/g) ?? []).length >= 7);
});

test('B1.3 keeps ownership and KPI totals out of browser request authority', () => {
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'allowedProjectIds',
    'overallProgress', 'actualCost', 'billed', 'received', 'outstanding', 'payable', 'profit'
  ]) {
    assert.ok(schema.includes(`'${field}'`), `missing server-owned field ${field}`);
  }
  assert.doesNotMatch(schema, /companyId:\s*z\.|actorUserId:\s*z\.|permissions:\s*z\.|allowedProjectIds:\s*z\./);
});

test('B1.3 preference schema accepts only allow-listed layout/filter values', () => {
  assert.match(schema, /widgetCodes: z\.array\(widgetCodeSchema\)\.min\(1\)/);
  assert.match(schema, /defaultProjectId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /defaultFilters: dashboardPreferenceFiltersSchema\.optional\(\)/);
  assert.match(schema, /At least one Dashboard preference must be provided\./);
});

test('B1.3 exports its request contracts without adding routes or runtime source logic', () => {
  for (const exported of [
    'DASHBOARD_PERMISSION_CODES',
    'DASHBOARD_ERROR_CODES',
    'DASHBOARD_WIDGET_CODES',
    'dashboardSummaryQuerySchema',
    'dashboardProjectsQuerySchema',
    'dashboardProjectParamsSchema',
    'dashboardProjectQuerySchema',
    'dashboardAlertsQuerySchema',
    'updateDashboardPreferencesBodySchema',
    'createDashboardError'
  ]) {
    assert.ok(index.includes(exported), `index does not export ${exported}`);
  }
  assert.equal((routes.match(/method: '(?:GET|PATCH)'/g) ?? []).length, 5);
});
