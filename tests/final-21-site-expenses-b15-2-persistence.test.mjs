import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION = 'packages/database/prisma/migrations/20260829001900_final21_site_expenses/migration.sql';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Extract one Prisma model block for focused persistence assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm B15.2 persistence remains intact while later B15 passes keep business runtime deferred. */
test('B15.2 keeps ExpenseCategory and SiteExpense while later approved runtime layers are added', () => {
  assert.ok(prismaModel('ExpenseCategory'));
  assert.ok(prismaModel('SiteExpense'));
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.repository.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.routes.ts'), true);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);
  assert.equal(exists(MIGRATION), true);
});

/** Confirm ExpenseCategory stays Company-owned and Finance owns its optional GL default. */
test('B15.2 keeps expense categories company-scoped with same-company GL ownership', () => {
  const model = prismaModel('ExpenseCategory');
  assert.match(model, /companyId\s+String/);
  assert.match(model, /code\s+String/);
  assert.match(model, /name\s+String/);
  assert.match(model, /defaultGlAccountId\s+String\?/);
  assert.match(model, /status\s+String/);
  assert.match(model, /defaultGlAccount\s+GlAccount\?\s+@relation\(fields: \[defaultGlAccountId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /@@unique\(\[companyId, code\]/);
  assert.match(model, /@@unique\(\[id, companyId\]/);
});

/** Confirm SiteExpense uses exactly the required business persistence fields. */
test('B15.2 stores the required Site Expense fields with exact decimal money', () => {
  const model = prismaModel('SiteExpense');
  for (const field of ['companyId', 'projectId', 'expenseNo', 'expenseDate', 'categoryId', 'description', 'amount', 'paymentMode', 'status', 'createdBy']) {
    assert.match(model, new RegExp(`\\b${field}\\s+`), `missing ${field}`);
  }
  for (const optionalField of ['stageId', 'cashBankAccountId', 'documentId', 'postedAt']) {
    assert.match(model, new RegExp(`\\b${optionalField}\\s+[^\\n]*\\?`), `missing optional ${optionalField}`);
  }
  assert.match(model, /amount\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.doesNotMatch(model, /journalId|costActualId|profit|blob|fileData/);
});

/** Confirm all cross-module Site Expense ownership is enforced by relational keys. */
test('B15.2 enforces Project Stage Finance Document Category and creator ownership', () => {
  const model = prismaModel('SiteExpense');
  assert.match(model, /project\s+Project\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /stage\s+ProjectStage\?\s+@relation\(fields: \[stageId, projectId\], references: \[id, projectId\]/);
  assert.match(model, /category\s+ExpenseCategory\s+@relation\(fields: \[categoryId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /cashBankAccount\s+CashBankAccount\?\s+@relation\(fields: \[cashBankAccountId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /document\s+Document\?\s+@relation\(fields: \[documentId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /creator\s+User\s+@relation\(fields: \[createdBy, companyId\], references: \[id, companyId\]/);
});

/** Confirm the forward migration creates only the required Module 14 tables and hard integrity. */
test('B15.2 migration creates the two required tables with positive amount and scoped foreign keys', () => {
  const migration = read(MIGRATION);
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 2);
  assert.match(migration, /CREATE TABLE "expense_categories"/);
  assert.match(migration, /CREATE TABLE "site_expenses"/);
  assert.match(migration, /"amount" DECIMAL\(18,2\) NOT NULL/);
  assert.match(migration, /site_expenses_amount_positive" CHECK \("amount" > 0\)/);
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("stage_id", "project_id"\) REFERENCES "project_stages"\("id", "project_id"\)/);
  assert.match(migration, /FOREIGN KEY \("cash_bank_account_id", "company_id"\) REFERENCES "cash_bank_accounts"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("document_id", "company_id"\) REFERENCES "documents"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("created_by", "company_id"\) REFERENCES "users"\("id", "company_id"\)/);
});

/** Confirm numbering and practical bounded-read indexes are present without adding unsupported runtime vocabulary. */
test('B15.2 adds company expense-number uniqueness and bounded read indexes only', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /site_expenses_company_expense_no_uq/);
  assert.match(migration, /site_expenses_company_project_status_date_idx/);
  assert.match(migration, /site_expenses_project_stage_date_idx/);
  assert.match(migration, /site_expenses_company_category_date_idx/);
  assert.doesNotMatch(migration, /INSERT INTO "permissions"|CREATE TRIGGER|CREATE FUNCTION|site_expenses\.read/);
});

/** Confirm migration policy locks the new forward migration without changing historical migration checksums. */
test('B15.2 registers the new migration in gate and checksum manifests', () => {
  const gates = read('packages/database/prisma/migration-gates.json');
  const checksums = read('packages/database/prisma/migration-checksums.json');
  assert.match(gates, /final-21-pass-b15-2-site-expense-persistence/);
  assert.match(gates, /20260829001900_final21_site_expenses/);
  assert.match(checksums, /20260829001900_final21_site_expenses/);
});

/** Confirm B15.2 documents the precise next boundary rather than prematurely building runtime logic. */
test('B15.2 hands off schemas permissions and errors to B15.3', () => {
  const doc = read('docs/PASS-B15-2-FINAL21-SITE-EXPENSE-PERSISTENCE.md');
  assert.match(doc, /B15\.3 - add Site Expense Zod boundary schemas, stable permissions and stable error vocabulary only/i);
  assert.match(doc, /does not add Zod schemas, repositories, services, Fastify routes, permissions, React UI/i);
});
