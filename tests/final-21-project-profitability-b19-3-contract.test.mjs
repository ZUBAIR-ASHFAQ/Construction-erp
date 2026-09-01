import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/project-profitability/';
const SCHEMA = `${MODULE}project-profitability.schema.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B19.3 creates exactly the required five-file Project Profitability backend shell', () => {
  assert.equal(exists(MODULE), true);
  const files = readdirSync(new URL(MODULE, ROOT)).sort();
  assert.deepEqual(files, [
    'index.ts',
    'project-profitability.repository.ts',
    'project-profitability.routes.ts',
    'project-profitability.schema.ts',
    'project-profitability.service.ts'
  ]);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-3-project-profitability-boundary-contract.json'));
  assert.ok(evidence.deferred.includes('React feature until B19.9'));
  assert.equal(exists('apps/web/src/features/project-profitability/'), true);
});

test('B19.3 freezes exactly three Module 19 permissions and three stable errors', () => {
  const schema = read(SCHEMA);
  for (const permission of [
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  ]) assert.ok(schema.includes(`'${permission}'`), `missing permission ${permission}`);
  const permissionSection = schema.match(/PROJECT_PROFITABILITY_PERMISSION_CODES = Object\.freeze\(\[[\s\S]*?\]\s+as const\)/)?.[0] ?? '';
  assert.equal((permissionSection.match(/project_profitability\./g) ?? []).length, 3);

  for (const code of [
    'PROFITABILITY_SCOPE_FORBIDDEN',
    'PROFITABILITY_SOURCE_INCOMPLETE',
    'INVALID_PROFITABILITY_FILTER'
  ]) assert.ok(schema.includes(`'${code}'`), `missing error ${code}`);
  const errorSection = schema.match(/PROJECT_PROFITABILITY_ERROR_CODES = Object\.freeze\(\[[\s\S]*?\]\s+as const\)/)?.[0] ?? '';
  assert.equal((errorSection.match(/'PROFITABILITY_|'INVALID_PROFITABILITY_/g) ?? []).length, 3);
});

test('B19.3 freezes exactly four GET routes and zero write routes', () => {
  const schema = read(SCHEMA);
  const routes = schema.match(/method: '(?:GET|POST|PATCH|PUT|DELETE)', route: '\/api\/v1\/project-profitability/g) ?? [];
  assert.equal(routes.length, 4);
  for (const route of [
    '/api/v1/project-profitability/projects/:projectId',
    '/api/v1/project-profitability/projects/:projectId/stages',
    '/api/v1/project-profitability/projects/:projectId/trend',
    '/api/v1/project-profitability/portfolio'
  ]) assert.ok(schema.includes(`route: '${route}'`), `missing route ${route}`);
  assert.doesNotMatch(schema, /method: 'POST'|method: 'PUT'|method: 'PATCH'|method: 'DELETE'/);
});

test('B19.3 validates Project IDs real dates and bounded trend windows', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /projectProfitabilityProjectParamsSchema = z\.object\(\{ projectId: uuidSchema \}\)\.strict\(\)/);
  assert.match(schema, /date must use a valid YYYY-MM-DD calendar date/);
  assert.match(schema, /PROJECT_PROFITABILITY_MAX_TREND_DAYS = 366/);
  assert.match(schema, /trend date range cannot exceed/);
  assert.match(schema, /toDate cannot precede fromDate/);
  assert.match(schema, /PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES = Object\.freeze\(\[[\s\S]*?'DAY'[\s\S]*?'WEEK'[\s\S]*?'MONTH'/);
});

test('B19.3 keeps portfolio reads bounded and rejects arbitrary request expressions through strict schemas', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /PROJECT_PROFITABILITY_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(PROJECT_PROFITABILITY_MAX_PAGE_SIZE\)/);
  const portfolio = schema.match(/projectProfitabilityPortfolioQuerySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(portfolio, /asOfDate:/);
  assert.match(portfolio, /search:/);
  assert.match(portfolio, /clientId:/);
  assert.doesNotMatch(portfolio, /formula:|expression:|metricExpression:/);
  for (const field of ['formula', 'expression', 'metricExpression']) {
    assert.ok(schema.includes(`'${field}'`), `missing forbidden authority marker ${field}`);
  }
});

test('B19.3 freezes precision-safe money and separate Project profitability measures', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /exactMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /exactNonNegativeMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  const financial = schema.match(/projectProfitabilityFinancialValuesSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  for (const field of [
    'recognizedRevenue', 'actualCost', 'profitAmount', 'billedAmount', 'receivedAmount',
    'allocatedAmount', 'advanceAmount', 'outstandingAmount', 'supplierPayableAmount'
  ]) assert.ok(financial.includes(`${field}:`), `missing financial measure ${field}`);
  assert.match(schema, /profitAmount: exactMoneySchema/);
  assert.match(schema, /receivedAmount: exactNonNegativeMoneySchema/);
});

test('B19.3 keeps Stage weight physical progress and financial values distinct with a Project-only bucket', () => {
  const schema = read(SCHEMA);
  const stage = schema.match(/projectProfitabilityStageRowResponseSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(stage, /weightPercent:/);
  assert.match(stage, /physicalProgressPercent:/);
  assert.match(stage, /plannedAmount:/);
  assert.match(schema, /projectProfitabilityProjectOnlyResponseSchema = projectProfitabilityFinancialValuesSchema/);
  assert.match(schema, /projectOnly: projectProfitabilityProjectOnlyResponseSchema/);
  assert.match(schema, /projectTotal: projectProfitabilityFinancialValuesSchema/);
});

test('B19.3 trend output is limited to recognized revenue actual cost and profit', () => {
  const schema = read(SCHEMA);
  const trendPoint = schema.match(/projectProfitabilityTrendPointResponseSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  for (const field of ['periodStart:', 'periodEnd:', 'recognizedRevenue:', 'actualCost:', 'profitAmount:']) {
    assert.ok(trendPoint.includes(field), `missing trend field ${field}`);
  }
  assert.doesNotMatch(trendPoint, /receivedAmount:|supplierPayableAmount:|formula:/);
});

test('B19.3 portfolio response keeps Project currencies separate and adds no cross-currency grand total', () => {
  const schema = read(SCHEMA);
  const item = schema.match(/projectProfitabilityPortfolioItemResponseSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(item, /currency:/);
  const response = schema.match(/projectProfitabilityPortfolioResponseSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(response, /items: z\.array\(projectProfitabilityPortfolioItemResponseSchema\)/);
  assert.doesNotMatch(response, /grandTotal|totalProfitAmount|portfolioCurrency/);
});

test('B19.3 maps all stable profitability errors into shared API errors', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /export function createProjectProfitabilityError\(code: ProjectProfitabilityErrorCode\): AppError/);
  assert.match(schema, /new AuthorizationError/);
  assert.match(schema, /new ConflictError/);
  assert.match(schema, /new ValidationError/);
});

test('B19.3 preserves its historical boundary checkpoint after the planned B19.7 HTTP handoff', () => {
  const routes = read(`${MODULE}project-profitability.routes.ts`);
  const app = read('apps/api/src/app.ts');
  const doc = read('docs/PASS-B19-3-FINAL21-PROJECT-PROFITABILITY-BOUNDARY-CONTRACT.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-3-project-profitability-boundary-contract.json'));
  assert.match(doc, /No repository aggregation, profitability service calculation, Fastify registration, React feature or migration is added in this pass/i);
  assert.equal(evidence.pass, 'B19.3');
  assert.match(routes, /export async function registerProjectProfitabilityRoutes/);
  assert.match(app, /registerProjectProfitabilityRoutes/);
});

test('B19.3 evidence records the boundary freeze and B19.4 handoff', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-3-project-profitability-boundary-contract.json'));
  assert.equal(evidence.pass, 'B19.3');
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.backendShellFileCount, 5);
  assert.equal(evidence.routeCount, 4);
  assert.equal(evidence.writeRouteCount, 0);
  assert.equal(evidence.permissionCount, 3);
  assert.equal(evidence.errorCount, 3);
  assert.equal(evidence.nextPass, 'B19.4 Project Profitability repository source aggregation');
});
