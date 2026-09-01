import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/project-profitability/';
const ROUTES = `${MODULE}project-profitability.routes.ts`;
const SERVICE = `${MODULE}project-profitability.service.ts`;
const SCHEMA = `${MODULE}project-profitability.schema.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Extract one source section between two stable markers for focused assertions. */
function section(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) return '';
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? source.slice(from) : source.slice(from, to);
}

test('B19.7 preserves the required five-file backend module and historical React deferral evidence', () => {
  const files = readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'index.ts',
    'project-profitability.repository.ts',
    'project-profitability.routes.ts',
    'project-profitability.schema.ts',
    'project-profitability.service.ts'
  ]);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-7-project-profitability-http-rbac-openapi.json'));
  assert.equal(evidence.reactFeatureAdded, false);
  assert.equal(readdirSync(new URL('apps/web/src/features/project-profitability/', ROOT)).length, 4);
});

test('B19.7 registers exactly four Project Profitability GET routes and zero write routes', () => {
  const routes = read(ROUTES);
  const getRoutes = [...routes.matchAll(/app\.get\('([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(getRoutes, [
    '/api/v1/project-profitability/projects/:projectId',
    '/api/v1/project-profitability/projects/:projectId/stages',
    '/api/v1/project-profitability/projects/:projectId/trend',
    '/api/v1/project-profitability/portfolio'
  ]);
  assert.equal((routes.match(/app\.(?:post|put|patch|delete)\(/gi) ?? []).length, 0);
});

test('B19.7 authenticates every route before boundary checks while service RBAC remains authoritative', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/preValidation: \[authenticate,/g) ?? []).length, 4);
  assert.match(routes, /authenticateRequest\(request, options\.database\)/);
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  for (const permission of [
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  ]) assert.ok(service.includes(`'${permission}'`), `missing service permission ${permission}`);
});

test('B19.7 keeps invalid params and filters on the stable INVALID_PROFITABILITY_FILTER error', () => {
  const routes = read(ROUTES);
  assert.match(routes, /new ValidationError\(\{/);
  assert.match(routes, /code: 'INVALID_PROFITABILITY_FILTER'/);
  assert.match(routes, /fieldErrors: parsed\.error\.issues\.map/);
  assert.match(routes, /validateBoundary/);
  assert.match(routes, /pre-validation hook so Zod rejects unknown input before Fastify can normalize/i);
});

test('B19.7 maps each frozen route to exactly one completed service read', () => {
  const routes = read(ROUTES);
  for (const call of [
    'service.getProjectSummary(projectId, query)',
    'service.getProjectStages(projectId, query)',
    'service.getProjectTrend(projectId, query)',
    'service.getPortfolio(query)'
  ]) assert.ok(routes.includes(call), `missing HTTP service call ${call}`);
});

test('B19.7 publishes bearer-secured OpenAPI metadata with four unique operation IDs', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 4);
  assert.equal((routes.match(/tags: \['Project Profitability'\]/g) ?? []).length, 4);
  const operationIds = [...routes.matchAll(/operationId: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(operationIds, [
    'getProjectProfitabilitySummary',
    'getProjectProfitabilityStages',
    'getProjectProfitabilityTrend',
    'getProjectProfitabilityPortfolio'
  ]);
});

test('B19.7 OpenAPI request schemas document UUID, dates, bounded portfolio and bounded trend granularity', () => {
  const routes = read(ROUTES);
  assert.match(routes, /const UUID = \{ type: 'string', format: 'uuid' \}/);
  assert.match(routes, /const DATE = \{ type: 'string', pattern: '\^\\\\d\{4\}-\\\\d\{2\}-\\\\d\{2\}\$' \}/);
  assert.match(routes, /required: \['fromDate', 'toDate', 'granularity'\]/);
  assert.match(routes, /PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES/);
  assert.match(routes, /maximum: PROJECT_PROFITABILITY_MAX_PAGE_SIZE/);
  const schema = read(SCHEMA);
  assert.match(schema, /PROJECT_PROFITABILITY_MAX_TREND_DAYS = 366/);
  assert.match(schema, /PROJECT_PROFITABILITY_MAX_PAGE_SIZE = 100/);
});

test('B19.7 summary OpenAPI keeps profit, cash, receivable and payable measures distinct', () => {
  const routes = read(ROUTES);
  const financial = section(routes, 'const FINANCIAL_VALUES = {', '} as const;');
  for (const field of [
    'recognizedRevenue', 'actualCost', 'profitAmount', 'billedAmount', 'receivedAmount',
    'allocatedAmount', 'advanceAmount', 'outstandingAmount', 'supplierPayableAmount'
  ]) assert.ok(financial.includes(`${field}:`), `missing OpenAPI financial field ${field}`);
  assert.match(financial, /profitAmount: MONEY/);
  assert.match(financial, /receivedAmount: NON_NEGATIVE_MONEY/);
});

test('B19.7 Stage OpenAPI keeps weight, physical progress and Project-only reconciliation explicit', () => {
  const routes = read(ROUTES);
  const stage = section(routes, 'const STAGE_ROW = {', 'const FINANCIAL_VALUES_OBJECT');
  assert.match(stage, /weightPercent: PERCENT/);
  assert.match(stage, /physicalProgressPercent: PERCENT/);
  assert.match(stage, /plannedAmount: NULLABLE_MONEY/);
  const response = section(routes, 'const STAGES_RESPONSE = {', 'const TREND_POINT');
  assert.match(response, /projectOnly: FINANCIAL_VALUES_OBJECT/);
  assert.match(response, /projectTotal: FINANCIAL_VALUES_OBJECT/);
});

test('B19.7 trend OpenAPI exposes only date, recognized revenue, actual cost and profit per point', () => {
  const routes = read(ROUTES);
  const point = section(routes, 'const TREND_POINT = {', 'const TREND_RESPONSE');
  for (const field of ['periodStart:', 'periodEnd:', 'recognizedRevenue:', 'actualCost:', 'profitAmount:']) {
    assert.ok(point.includes(field), `missing trend field ${field}`);
  }
  assert.doesNotMatch(point, /receivedAmount|allocatedAmount|advanceAmount|supplierPayableAmount/);
});

test('B19.7 portfolio OpenAPI is paginated and keeps currency on each Project without cross-currency totals', () => {
  const routes = read(ROUTES);
  const item = section(routes, 'const PORTFOLIO_ITEM = {', 'const PORTFOLIO_RESPONSE');
  assert.match(item, /currency: CURRENCY/);
  const response = section(routes, 'const PORTFOLIO_RESPONSE = {', 'const ERROR_DESCRIPTION');
  assert.match(response, /items: \{ type: 'array', items: PORTFOLIO_ITEM \}/);
  assert.match(response, /pageSize:/);
  assert.doesNotMatch(response, /grandTotal|portfolioTotal|exchangeRate|currencyConversion/);
});

test('B19.7 documents all three stable Module 19 errors inside the shared API error envelope', () => {
  const routes = read(ROUTES);
  assert.match(routes, /PROJECT_PROFITABILITY_ERROR_CODES\.join\(', '\)/);
  assert.match(routes, /required: \['code', 'message', 'requestId'\]/);
  assert.match(routes, /fieldErrors:/);
  for (const status of ['400', '401', '403', '404', '409', '500', '503']) {
    assert.ok(routes.includes(`${status}: ERROR`), `missing documented status ${status}`);
  }
});

test('B19.7 validates service responses against the frozen Zod response contracts before sending', () => {
  const routes = read(ROUTES);
  for (const schemaName of [
    'projectProfitabilitySummaryResponseSchema',
    'projectProfitabilityStagesResponseSchema',
    'projectProfitabilityTrendResponseSchema',
    'projectProfitabilityPortfolioResponseSchema'
  ]) assert.match(routes, new RegExp(`${schemaName}\\.parse\\(`), `missing response parser ${schemaName}`);
});

test('B19.7 exports and app-registers the module without changing prerequisite route ownership', () => {
  const index = read(`${MODULE}index.ts`);
  const app = read('apps/api/src/app.ts');
  assert.match(index, /export \{ registerProjectProfitabilityRoutes \}/);
  assert.match(index, /ProjectProfitabilityRoutesOptions/);
  assert.match(app, /import \{ registerProjectProfitabilityRoutes \} from '\.\/modules\/project-profitability\/index\.js'/);
  assert.match(app, /app\.register\(registerProjectProfitabilityRoutes, \{ database: options\.database \}\)/);
  const prerequisiteRegistration = app.indexOf('app.register(registerClientReceiptsRoutes');
  const profitabilityRegistration = app.indexOf('app.register(registerProjectProfitabilityRoutes');
  assert.ok(prerequisiteRegistration >= 0 && profitabilityRegistration > prerequisiteRegistration);
});

test('B19.7 remains read-only while adding only the required permission vocabulary migration', () => {
  const routes = read(ROUTES);
  assert.doesNotMatch(routes, /idempotency|app\.(?:post|put|patch|delete)\(/i);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model ProjectProfitability|model ProjectProfitabilitySnapshot/);
  const migration = read('packages/database/prisma/migrations/20260830000600_final21_project_profitability_permissions/migration.sql');
  for (const permission of [
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  ]) assert.ok(migration.includes(`'${permission}'`), `missing permission migration ${permission}`);
  assert.match(migration, /role\."code" = 'system-admin'/);
  assert.doesNotMatch(migration, /CREATE TABLE|CREATE VIEW|CREATE MATERIALIZED VIEW|ALTER TABLE/i);
});

test('B19.7 evidence records the HTTP/RBAC/OpenAPI checkpoint and hands off to B19.8 integration security', () => {
  const doc = read('docs/PASS-B19-7-FINAL21-PROJECT-PROFITABILITY-HTTP-RBAC-OPENAPI.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-7-project-profitability-http-rbac-openapi.json'));
  assert.match(doc, /exactly four read-only GET routes/i);
  assert.match(doc, /service-level authorization remains authoritative/i);
  assert.match(doc, /OpenAPI/i);
  assert.equal(evidence.pass, 'B19.7');
  assert.equal(evidence.routeCount, 4);
  assert.equal(evidence.writeRouteCount, 0);
  assert.equal(evidence.databaseMigrationAdded, true);
  assert.equal(evidence.nextPass, 'B19.8 Project Profitability cross-module reconciliation and security');
});
