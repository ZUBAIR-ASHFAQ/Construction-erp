import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const INTEGRATION = 'tests/integration/final-21-site-expenses-api.integration.test.mjs';
const ROUTES = 'apps/api/src/modules/site-expenses/site-expenses.routes.ts';
const SERVICE = 'apps/api/src/modules/site-expenses/site-expenses.service.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B15.9 adds a real Fastify.inject/PostgreSQL test while keeping it opt-in for disposable databases. */
test('B15.9 adds gated live Site Expense API integration coverage', () => {
  assert.equal(exists(INTEGRATION), true);
  const integration = read(INTEGRATION);
  assert.match(integration, /const live = process\.env\.RUN_FOUNDATION_DB_TESTS === '1'/);
  assert.match(integration, /createFoundationTestDatabaseClient/);
  assert.match(integration, /buildApp/);
  assert.match(integration, /app\.inject/);
  assert.match(integration, /resetFoundationTestData/);
});

/** Confirm the live suite exercises the exact six Final Module 14 HTTP operations without adding another route. */
test('B15.9 live verification covers the frozen six-route Site Expense contract', () => {
  const integration = read(INTEGRATION);
  for (const token of [
    "'POST', '/api/v1/site-expenses'",
    '`/api/v1/site-expenses/${created.id}/post`',
    '`/api/v1/site-expenses/${created.id}/reverse`',
    '`/api/v1/site-expenses/${projectA2Expense.id}`',
    "method: 'GET'",
    "method: 'POST'"
  ]) assert.ok(integration.includes(token), `missing ${token}`);
  const routes = read(ROUTES);
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/site-expenses/g) ?? []).length, 6);
  assert.doesNotMatch(routes, /app\.delete\('\/api\/v1\/site-expenses|site-expenses\/categories/);
});

/** Confirm negative permission, Project-scope and cross-company evidence is executable rather than comment-only. */
test('B15.9 verifies permission Project-scope and cross-company isolation', () => {
  const integration = read(INTEGRATION);
  for (const token of [
    'b15-9-reader-a@example.test',
    'b15-9-admin-b@example.test',
    'PROJECT_A2_ID',
    "assert.equal(response.statusCode, 403",
    "assert.equal(response.statusCode, 404",
    "assert.equal(errorCode(response), 'EXPENSE_NOT_FOUND')"
  ]) assert.ok(integration.includes(token), `missing scope assertion ${token}`);
});

/** Confirm posting/reversal retries reconcile to one source effect and compensating history. */
test('B15.9 verifies idempotent Finance and Job Cost reconciliation', () => {
  const integration = read(INTEGRATION);
  const service = read(SERVICE);
  for (const token of [
    'b15-9-post-second-key',
    'site_expense:${created.id}',
    'site_expense_reversal:${created.id}',
    'client.costActual.findMany',
    'client.journal.findMany',
    'moneyMinorUnits',
    'site_expense.posted',
    'site_expense.reversed'
  ]) assert.ok(integration.includes(token), `missing reconciliation assertion ${token}`);
  assert.match(service, /siteExpenseSourceKey\(expenseId/);
  assert.match(service, /siteExpenseReversalSourceKey\(expenseId/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /postSourceReversalInTransaction\(tx/);
  assert.match(service, /upsertSiteExpenseCostActual/);
});

/** Confirm a Finance posting failure proves the Site Expense/Cost transaction rolls back atomically. */
test('B15.9 verifies Finance failure rolls back Project Cost and posting state', () => {
  const integration = read(INTEGRATION);
  assert.match(integration, /fiscalPeriod\.update[\s\S]*status: 'CLOSED'/);
  assert.match(integration, /FISCAL_PERIOD_CLOSED/);
  assert.match(integration, /client\.costActual\.count[\s\S]*, 0\)/);
  assert.match(integration, /client\.journal\.count[\s\S]*, 0\)/);
  assert.match(integration, /siteExpense\.count[\s\S]*status: 'DRAFT'/);
});

/** Confirm B15.9 closes the Swagger gap by documenting query, params, body, response and idempotency headers. */
test('B15.9 completes the Site Expense OpenAPI request and response contract', () => {
  const routes = read(ROUTES);
  for (const token of [
    'LIST_SITE_EXPENSES_QUERY_JSON_SCHEMA',
    'SITE_EXPENSE_PARAMS_JSON_SCHEMA',
    'CREATE_SITE_EXPENSE_BODY_JSON_SCHEMA',
    'UPDATE_SITE_EXPENSE_BODY_JSON_SCHEMA',
    'EMPTY_BODY_JSON_SCHEMA',
    'SITE_EXPENSE_SUCCESS_JSON_SCHEMA',
    'SITE_EXPENSE_LIST_SUCCESS_JSON_SCHEMA',
    'COMMON_RESPONSES'
  ]) assert.ok(routes.includes(token), `missing OpenAPI token ${token}`);
  assert.match(routes, /querystring: LIST_SITE_EXPENSES_QUERY_JSON_SCHEMA/);
  assert.equal((routes.match(/params: SITE_EXPENSE_PARAMS_JSON_SCHEMA/g) ?? []).length, 4);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 4);
  assert.equal((routes.match(/response: \{/g) ?? []).length, 6);
});

/** Confirm the live test inspects generated Swagger rather than relying only on route source text. */
test('B15.9 verifies generated OpenAPI through the runtime endpoint', () => {
  const integration = read(INTEGRATION);
  assert.match(integration, /url: '\/openapi\.json'/);
  for (const operationId of ['listSiteExpenses', 'createSiteExpense', 'getSiteExpense', 'updateSiteExpense', 'postSiteExpense', 'reverseSiteExpense']) {
    assert.ok(integration.includes(operationId), `missing OpenAPI operation ${operationId}`);
  }
  assert.match(integration, /parameter\.name === 'idempotency-key'/);
  assert.match(integration, /parameter\.name === 'pageSize'/);
});

/** Confirm B15.9 adds verification only plus OpenAPI metadata and does not change persistence history. */
test('B15.9 preserves the two Site Expense migrations and business route count', () => {
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.deepEqual(migrations.filter((name) => name.includes('final21_site_expense')).sort(), [
    '20260829001900_final21_site_expenses',
    '20260829002000_final21_site_expense_contract'
  ]);
  assert.equal(exists('docs/PASS-B15-9-FINAL21-SITE-EXPENSE-INTEGRATION.md'), true);
  assert.equal(exists('acceptance-evidence/pass-b15-9-site-expense-integration.json'), true);
});

/** Confirm package commands expose both static B15.9 and explicit disposable-DB live verification. */
test('B15.9 wires static and live verification commands', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts['test:final-21-site-expenses'], /b15-9-integration\.test\.mjs/);
  assert.match(packageJson.scripts['test:integration:final-21-site-expenses'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(packageJson.scripts['test:integration:final-21-site-expenses'], /final-21-site-expenses-api\.integration\.test\.mjs/);
  assert.match(packageJson.scripts['final-21-site-expenses:b15-9:gate'], /migration-system\.test\.mjs/);
  assert.match(packageJson.scripts['final-21-site-expenses:b15-9:gate'], /workspace\.test\.mjs/);
});

/** Confirm every named B15.9 helper keeps the short purpose comments required by the project coding standard. */
test('B15.9 keeps new and changed named functions purpose-commented', () => {
  for (const relativePath of [ROUTES, INTEGRATION, 'tests/final-21-site-expenses-b15-9-integration.test.mjs']) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});
