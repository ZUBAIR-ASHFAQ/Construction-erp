import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/dashboard/';

/** Read one project file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B1.8 keeps the required five-file Dashboard backend shape and adds no migration', () => {
  assert.deepEqual(readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort(), [
    'dashboard.repository.ts',
    'dashboard.routes.ts',
    'dashboard.schema.ts',
    'dashboard.service.ts',
    'index.ts'
  ]);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b1[_-]?8/i.test(name)), false);
});

test('B1.8 implements exactly the five frozen Dashboard HTTP routes', () => {
  const routes = read(`${MODULE}dashboard.routes.ts`);
  for (const route of [
    "app.get(`${DASHBOARD_API_BASE}/summary`",
    "app.get(`${DASHBOARD_API_BASE}/projects`",
    "app.get(`${DASHBOARD_API_BASE}/projects/:projectId`",
    "app.get(`${DASHBOARD_API_BASE}/alerts`",
    "app.patch(`${DASHBOARD_API_BASE}/preferences`"
  ]) {
    assert.ok(routes.includes(route), `missing ${route}`);
  }
  assert.equal((routes.match(/app\.(?:get|patch)\(`/g) ?? []).length, 5);
  assert.doesNotMatch(routes, /app\.(?:post|put|delete)\(/);
});

test('B1.8 authenticates every route and keeps Zod as the authoritative boundary', () => {
  const routes = read(`${MODULE}dashboard.routes.ts`);
  assert.match(routes, /authenticateRequest\(request, options\.database\)/);
  assert.equal((routes.match(/preValidation: \[authenticate/g) ?? []).length, 5);
  for (const schema of [
    'dashboardSummaryQuerySchema',
    'dashboardProjectsQuerySchema',
    'dashboardProjectParamsSchema',
    'dashboardProjectQuerySchema',
    'dashboardAlertsQuerySchema',
    'updateDashboardPreferencesBodySchema'
  ]) {
    assert.match(routes, new RegExp(schema), `missing ${schema}`);
  }
  assert.match(routes, /function parseRequest/);
  assert.match(routes, /INVALID_DASHBOARD_FILTER/);
});

test('B1.8 publishes bearer-secured OpenAPI metadata and stable error envelopes', () => {
  const routes = read(`${MODULE}dashboard.routes.ts`);
  for (const operationId of [
    'getDashboardSummary',
    'listDashboardProjects',
    'getProjectDashboard',
    'listDashboardAlerts',
    'updateDashboardPreferences'
  ]) {
    assert.ok(routes.includes(`operationId: '${operationId}'`), `missing ${operationId}`);
  }
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 5);
  assert.match(routes, /DASHBOARD_ERROR_CODES\.join/);
  assert.match(routes, /COMMON_RESPONSES = \{ 400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 500: ERROR, 503: ERROR \}/);
  assert.match(routes, /additionalProperties: false/g);
});

test('B1.8 wires HTTP handlers directly to the existing Dashboard service', () => {
  const routes = read(`${MODULE}dashboard.routes.ts`);
  assert.match(routes, /const service = new DashboardService\(options\.database\)/);
  for (const method of ['getSummary', 'getProjects', 'getProjectDashboard', 'getAlerts', 'updatePreferences']) {
    assert.match(routes, new RegExp(`service\\.${method}\\(`), `missing service.${method}`);
  }
  assert.doesNotMatch(routes, /class .*Controller|class .*Handler|class .*Manager/);
});

test('B1.8 registers Dashboard with the database dependency only', () => {
  const index = read(`${MODULE}index.ts`);
  const app = read('apps/api/src/app.ts');
  assert.match(index, /DASHBOARD_HTTP_ROUTES, registerDashboardRoutes/);
  assert.match(app, /import \{ registerDashboardRoutes \} from '\.\/modules\/dashboard\/index\.js';/);
  assert.match(app, /if \(options\.database\) \{[\s\S]*app\.register\(registerDashboardRoutes, \{ database: options\.database \}\);/);
  assert.doesNotMatch(routesRegistrationBlock(app), /objectStorage|signedUrlTtlSeconds/);
});

/** Extract the one-line Dashboard registration statement for dependency checks. */
function routesRegistrationBlock(app) {
  return app.split('\n').find((line) => line.includes('registerDashboardRoutes')) ?? '';
}

test('B1.8 keeps every introduced named function purpose-commented', () => {
  const routes = read(`${MODULE}dashboard.routes.ts`);
  for (const marker of ['function dataEnvelope', 'function parseRequest', 'function validateBoundary', 'function registerDashboardRoutes']) {
    const index = routes.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(routes.slice(Math.max(0, index - 300), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});
