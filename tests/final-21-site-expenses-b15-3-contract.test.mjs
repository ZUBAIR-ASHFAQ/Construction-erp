import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SCHEMA = 'apps/api/src/modules/site-expenses/site-expenses.schema.ts';
const MIGRATION = 'packages/database/prisma/migrations/20260829002000_final21_site_expense_contract/migration.sql';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm the B15.3 boundary remains present while the approved repository/service layers are added later. */
test('B15.3 Site Expense boundary remains intact through later approved runtime passes', () => {
  assert.equal(exists(SCHEMA), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.repository.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.routes.ts'), true);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);
});

/** Confirm the exact six Final Module 14 routes are frozen without generic CRUD additions. */
test('B15.3 freezes exactly the six Site Expense HTTP routes', () => {
  const schema = read(SCHEMA);
  const expected = [
    "GET', route: '/api/v1/site-expenses'",
    "POST', route: '/api/v1/site-expenses'",
    "GET', route: '/api/v1/site-expenses/:id'",
    "PATCH', route: '/api/v1/site-expenses/:id'",
    "POST', route: '/api/v1/site-expenses/:id/post'",
    "POST', route: '/api/v1/site-expenses/:id/reverse'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PATCH|PUT|DELETE)', route: '\/api\/v1\/site-expenses/g) ?? []).length, 6);
  assert.doesNotMatch(schema, /DELETE', route: '\/api\/v1\/site-expenses|approve|approval-workflow/i);
});

/** Confirm the Final Module 14 permission and stable error vocabulary is exact. */
test('B15.3 exposes the exact Site Expense permissions and stable errors', () => {
  const schema = read(SCHEMA);
  for (const permission of ['site_expenses.read', 'site_expenses.create', 'site_expenses.update', 'site_expenses.post', 'site_expenses.reverse']) {
    assert.ok(schema.includes(`'${permission}'`), `missing ${permission}`);
  }
  for (const code of ['EXPENSE_NOT_FOUND', 'EXPENSE_LOCKED', 'INVALID_EXPENSE_ACCOUNT', 'INVALID_EXPENSE_STAGE']) {
    assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  }
  assert.match(schema, /createSiteExpenseError/);
  assert.match(schema, /new NotFoundError\(\{ code, message \}\)/);
  assert.match(schema, /new ConflictError\(\{ code, message \}\)/);
});

/** Confirm client input cannot supply trusted ownership or posting fields. */
test('B15.3 keeps company actor numbering status and posting authority server-owned', () => {
  const schema = read(SCHEMA);
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'allowedProjectIds', 'expenseNo', 'status', 'createdBy', 'postedAt']) {
    assert.match(schema, new RegExp(`'${field}'`));
  }
  const createBlock = schema.match(/createSiteExpenseBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)\.superRefine/)?.[0] ?? '';
  for (const forbidden of ['companyId:', 'actorUserId:', 'expenseNo:', 'status:', 'createdBy:', 'postedAt:']) {
    assert.equal(createBlock.includes(forbidden), false, `create body must not accept ${forbidden}`);
  }
});

/** Confirm exact money, calendar dates, bounded pagination and evidence-by-ID rules. */
test('B15.3 validates precise positive money bounded reads and document references', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /exactPositiveMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /date must use YYYY-MM-DD/);
  assert.match(schema, /SITE_EXPENSE_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(SITE_EXPENSE_MAX_PAGE_SIZE\)/);
  assert.match(schema, /documentId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.doesNotMatch(schema, /blob|fileData|base64|multipart/i);
});

/** Confirm direct cash/bank treatment requires a Finance account while payable remains supported. */
test('B15.3 freezes CASH BANK PAYABLE and direct-payment account validation', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /SITE_EXPENSE_PAYMENT_MODE_VALUES = Object\.freeze\(\['CASH', 'BANK', 'PAYABLE'\]/);
  assert.match(schema, /value\.paymentMode === 'CASH' \|\| value\.paymentMode === 'BANK'/);
  assert.match(schema, /cashBankAccountId is required for CASH or BANK payment mode/);
  assert.match(schema, /SITE_EXPENSE_STATUS_VALUES = Object\.freeze\(\['DRAFT', 'POSTED', 'REVERSED'\]/);
});

/** Confirm draft edit is non-empty and post/reverse remain explicit bodyless commands. */
test('B15.3 keeps draft update bounded and post reverse as command bodies', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /updateSiteExpenseBodySchema[\s\S]*Object\.keys\(value\)\.length > 0/);
  assert.match(schema, /postSiteExpenseBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /reverseSiteExpenseBodySchema = z\.object\(\{\}\)\.strict\(\)/);
});

/** Confirm the permission-only migration is forward-only and grants upgraded system administrators safely. */
test('B15.3 permission migration adds no business table or runtime trigger', () => {
  const migration = read(MIGRATION);
  assert.equal((migration.match(/site_expenses\.(?:read|create|update|post|reverse)/g) ?? []).length >= 10, true);
  assert.match(migration, /INSERT INTO "permissions"/);
  assert.match(migration, /role\."code" = 'system-admin'/);
  assert.match(migration, /role\."is_system" = TRUE/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE TRIGGER|CREATE FUNCTION/);
});

/** Confirm migration gate/checksum metadata includes B15.3 without removing B15.2. */
test('B15.3 registers its forward migration and preserves the B15.2 lock', () => {
  const gates = read('packages/database/prisma/migration-gates.json');
  const checksums = read('packages/database/prisma/migration-checksums.json');
  assert.match(gates, /final-21-pass-b15-2-site-expense-persistence/);
  assert.match(gates, /final-21-pass-b15-3-site-expense-contract/);
  assert.match(gates, /20260829001900_final21_site_expenses/);
  assert.match(gates, /20260829002000_final21_site_expense_contract/);
  assert.match(checksums, /20260829001900_final21_site_expenses/);
  assert.match(checksums, /20260829002000_final21_site_expense_contract/);
});

/** Confirm the B15.3 handoff keeps repository and service logic for the next passes. */
test('B15.3 documents B15.4 as repository-only next work', () => {
  const doc = read('docs/PASS-B15-3-FINAL21-SITE-EXPENSE-CONTRACT.md');
  assert.match(doc, /B15\.4 - implement the company\/project-scoped Site Expense repository only/i);
  assert.match(doc, /does not add a repository, service, Fastify route registration/i);
});
