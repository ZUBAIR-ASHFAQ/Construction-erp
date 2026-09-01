import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BACKEND = 'apps/api/src/modules/site-expenses';
const ROUTES = `${BACKEND}/site-expenses.routes.ts`;
const INDEX = `${BACKEND}/index.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B15.6 completes the required five-file Site Expense backend with the later approved React layer now present. */
test('B15.6 completes the five-file Site Expense backend and keeps the frozen backend intact after React is added', () => {
  assert.deepEqual(readdirSync(new URL(`../${BACKEND}`, import.meta.url)).sort(), [
    'index.ts',
    'site-expenses.repository.ts',
    'site-expenses.routes.ts',
    'site-expenses.schema.ts',
    'site-expenses.service.ts'
  ]);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);
});

/** Confirm the runtime route layer implements exactly the six frozen Final Module 14 endpoints. */
test('B15.6 registers exactly the six frozen Site Expense routes and no generic CRUD additions', () => {
  const routes = read(ROUTES);
  const expected = [
    "app.get('/api/v1/site-expenses'",
    "app.post('/api/v1/site-expenses'",
    "app.get('/api/v1/site-expenses/:id'",
    "app.patch('/api/v1/site-expenses/:id'",
    "app.post('/api/v1/site-expenses/:id/post'",
    "app.post('/api/v1/site-expenses/:id/reverse'"
  ];
  for (const route of expected) assert.ok(routes.includes(route), `missing ${route}`);
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/site-expenses/g) ?? []).length, 6);
  assert.doesNotMatch(routes, /app\.delete\(|\/approve|\/submit|\/finalize|\/archive/);
});

/** Confirm authentication and the frozen Zod request/response contracts guard every HTTP handler. */
test('B15.6 authenticates all routes and parses params query body and response through frozen schemas', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 6);
  for (const schemaName of [
    'listSiteExpensesQuerySchema',
    'listSiteExpensesResponseSchema',
    'createSiteExpenseBodySchema',
    'siteExpenseIdParamsSchema',
    'updateSiteExpenseBodySchema',
    'postSiteExpenseBodySchema',
    'reverseSiteExpenseBodySchema',
    'siteExpenseResponseSchema'
  ]) {
    assert.ok(routes.includes(schemaName), `missing ${schemaName}`);
  }
  assert.match(routes, /code: 'INVALID_REQUEST'/);
  assert.match(routes, /fieldErrors:/);
});

/** Confirm all four state-changing commands require Foundation idempotency keys. */
test('B15.6 requires Idempotency-Key on create update post and reverse only', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 4);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 4);
  assert.match(routes, /required: \['idempotency-key'\]/);
  assert.match(routes, /maxLength: 200/);
});

/** Confirm create returns 201 while reads and commands use the standard data envelope. */
test('B15.6 keeps HTTP success envelopes consistent with existing Final-21 modules', () => {
  const routes = read(ROUTES);
  assert.match(routes, /reply\.code\(201\)\.send\(\{ data \}\)/);
  assert.equal((routes.match(/send\(\{ data \}\)/g) ?? []).length, 6);
  assert.doesNotMatch(routes, /companyId|actorUserId|allowedProjectIds/);
});

/** Confirm OpenAPI metadata has unique operation IDs and bearer security for all six routes. */
test('B15.6 exposes Site Expense routes through Fastify Swagger metadata', () => {
  const routes = read(ROUTES);
  const operationIds = [...routes.matchAll(/operationId: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(operationIds, [
    'listSiteExpenses',
    'createSiteExpense',
    'getSiteExpense',
    'updateSiteExpense',
    'postSiteExpense',
    'reverseSiteExpense'
  ]);
  assert.equal(new Set(operationIds).size, 6);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 6);
  assert.equal((routes.match(/tags: \['Site Expenses'\]/g) ?? []).length, 6);
});

/** Confirm the module barrel exports schema repository service routes and route option type. */
test('B15.6 adds one simple Site Expense module barrel', () => {
  const index = read(INDEX);
  assert.match(index, /SiteExpensesRepository/);
  assert.match(index, /SiteExpensesService/);
  assert.match(index, /registerSiteExpensesRoutes/);
  assert.match(index, /SiteExpensesRoutesOptions/);
  assert.match(index, /SITE_EXPENSE_HTTP_ROUTES/);
  assert.match(index, /siteExpenseResponseSchema/);
});

/** Confirm app.ts registers Site Expense only when the database runtime is supplied. */
test('B15.6 registers Site Expense with the Fastify application and Swagger route graph', () => {
  const app = read('apps/api/src/app.ts');
  assert.match(app, /import \{ registerSiteExpensesRoutes \} from '\.\/modules\/site-expenses\/index\.js';/);
  assert.match(app, /app\.register\(registerSiteExpensesRoutes, \{ database: options\.database \}\);/);
  assert.match(app, /app\.register\(swagger/);
  assert.match(app, /app\.get\('\/openapi\.json'/);
});

/** Confirm B15.6 does not alter the frozen database shape or add a new migration. */
test('B15.6 is HTTP-only and adds no new Site Expense migration', () => {
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  const siteExpenseMigrations = migrations.filter((name) => name.includes('final21_site_expense'));
  assert.deepEqual(siteExpenseMigrations.sort(), [
    '20260829001900_final21_site_expenses',
    '20260829002000_final21_site_expense_contract'
  ]);
});

/** Confirm every named helper and route registration function changed by B15.6 has a short purpose comment. */
test('B15.6 keeps HTTP functions junior-readable with purpose comments', () => {
  const lines = read(ROUTES).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
    if (!isFunction) continue;
    const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
    assert.match(previous, /\/\*\*[^]*\*\//, `${ROUTES}:${index + 1} needs a short purpose comment`);
  }
});
