import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const REPOSITORY = 'apps/api/src/modules/site-expenses/site-expenses.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm the B15.4 repository remains intact while later approved service and HTTP layers are added. */
test('B15.4 repository remains intact through later approved B15 runtime passes', () => {
  assert.equal(exists(REPOSITORY), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.routes.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/index.ts'), true);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);
});

/** Confirm every Project-scoped read is bounded by Company and trusted allowed Project scope. */
test('B15.4 applies Company and allowed Project scope to register and detail reads', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /normalizeAllowedProjectIds/);
  assert.match(repository, /isProjectAllowed/);
  assert.match(repository, /projectScopeWhere/);
  assert.match(repository, /async listSiteExpenses/);
  assert.match(repository, /this\.db\.siteExpense\.count\(\{ where \}\)/);
  assert.match(repository, /async findSiteExpenseById/);
  assert.match(repository, /scope\.where\(\{ id: expenseId, \.\.\.projectScopeWhere\(allowedProjectIds\) \}\)/);
});

/** Confirm repository pagination is bounded by the frozen Module 14 page-size contract. */
test('B15.4 rejects unbounded Site Expense repository pagination', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /SITE_EXPENSE_MAX_PAGE_SIZE/);
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /Repository take must be between 1 and/);
  assert.match(repository, /skip: input\.skip/);
  assert.match(repository, /take: input\.take/);
});

/** Confirm Project Stage category Finance-account and evidence lookups remain Company safe. */
test('B15.4 provides simple same-Company dependency validation reads', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async findProjectById\(projectId: string, visibility:/);
  assert.match(repository, /async findStage\(projectId: string, stageId: string, visibility:/);
  assert.match(repository, /where: scope\.where\(\{ id: stageId, projectId \}\)/);
  assert.match(repository, /async findExpenseCategoryById\(categoryId: string\)/);
  assert.match(repository, /include: \{ defaultGlAccount: true \}/);
  assert.match(repository, /async findCashBankAccountById\(cashBankAccountId: string\)/);
  assert.match(repository, /include: \{ glAccount: true \}/);
  assert.match(repository, /async findProjectEvidenceDocument/);
  assert.match(repository, /links: \{ some: \{ companyId: scope\.companyId, projectId \} \}/);
});

/** Confirm creation is server-numbered and can create only DRAFT rows in allowed Project scope. */
test('B15.4 creates server-numbered draft Site Expenses without accepting lifecycle authority', () => {
  const repository = read(REPOSITORY);
  const createMethod = repository.match(/async createDraftSiteExpense[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(repository, /async createDraftSiteExpense/);
  assert.match(repository, /expenseNo: string/);
  assert.match(createMethod, /if \(!isProjectAllowed\(input\.projectId, allowedProjectIds\)\) return null/);
  assert.match(createMethod, /status: 'DRAFT'/);
  assert.match(createMethod, /postedAt: null/);
  assert.doesNotMatch(createMethod, /status: input\.status|postedAt: input\.postedAt|companyId: input\.companyId/);
});

/** Confirm draft editing cannot mutate ownership outside allowed Project scope or bypass DRAFT state. */
test('B15.4 updates only visible draft Site Expenses', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async updateDraftSiteExpense/);
  assert.match(repository, /existing\.status !== 'DRAFT'/);
  assert.match(repository, /if \(input\.projectId && !isProjectAllowed\(input\.projectId, allowedProjectIds\)\) return null/);
  assert.match(repository, /where: scope\.where\(\{ id: expenseId, status: 'DRAFT', \.\.\.projectScopeWhere\(allowedProjectIds\) \}\)/);
  assert.doesNotMatch(repository, /deleteMany|\.delete\(/);
});

/** Confirm state-sensitive writes have a row lock and narrow state transitions for B15.5. */
test('B15.4 exposes lock post and reverse persistence primitives without business posting logic', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async lockSiteExpenseForWrite/);
  assert.match(repository, /FROM site_expenses/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /async markPosted/);
  assert.match(repository, /status: 'DRAFT'/);
  assert.match(repository, /data: \{ status: 'POSTED', postedAt \}/);
  assert.match(repository, /async markReversed/);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /data: \{ status: 'REVERSED' \}/);
  assert.doesNotMatch(repository, /journal|costActual\.create|audit|outbox|idempotency/i);
});

/** Confirm every named repository helper/function remains documented for junior-readable maintenance. */
test('B15.4 keeps short purpose comments on named helpers and repository methods', () => {
  const repository = read(REPOSITORY);
  for (const name of [
    'assertPageWindow',
    'normalizeAllowedProjectIds',
    'isProjectAllowed',
    'projectScopeWhere',
    'listSiteExpenses',
    'findSiteExpenseById',
    'findProjectById',
    'findStage',
    'findExpenseCategoryById',
    'findCashBankAccountById',
    'findProjectEvidenceDocument',
    'createDraftSiteExpense',
    'updateDraftSiteExpense',
    'lockSiteExpenseForWrite',
    'markPosted',
    'markReversed'
  ]) {
    assert.match(repository, new RegExp(`/\\*\\*[\\s\\S]{0,180}\\*/\\s+(?:async\\s+)?(?:function\\s+)?${name}\\b`), `missing purpose comment for ${name}`);
  }
});

/** Confirm the repository pass makes no schema or migration change. */
test('B15.4 does not add a new database migration or alter the frozen B15 persistence contract', () => {
  const doc = read('docs/PASS-B15-4-FINAL21-SITE-EXPENSE-REPOSITORY.md');
  assert.match(doc, /No Prisma model or migration is added in B15\.4/i);
  assert.match(doc, /B15\.5 - implement Site Expense service business logic/i);
});
