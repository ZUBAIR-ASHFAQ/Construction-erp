import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/site-expenses/site-expenses.service.ts';
const REPOSITORY = 'apps/api/src/modules/site-expenses/site-expenses.repository.ts';
const FINANCE_SERVICE = 'apps/api/src/modules/finance/finance.service.ts';

/** Read one project file relative to the repository root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one project path exists. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B15.5 service remains isolated while the later B15.6 HTTP layer is added. */
test('B15.5 Site Expense service remains intact after the B15.6 HTTP pass', () => {
  assert.equal(exists(SERVICE), true);
  assert.equal(exists(REPOSITORY), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.routes.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/index.ts'), true);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);
});

/** Confirm service permission decisions are revalidated from Administration and authenticated Project scope. */
test('B15.5 revalidates Site Expense permissions and Project visibility server-side', () => {
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodes\(/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(service, /site_expenses\.read/);
  assert.match(service, /site_expenses\.create/);
  assert.match(service, /site_expenses\.update/);
  assert.match(service, /site_expenses\.post/);
  assert.match(service, /site_expenses\.reverse/);
});

/** Confirm create/update validation covers active Project, same-Project Stage, category, Finance account and evidence. */
test('B15.5 validates Project Stage category Finance account and evidence before persistence', () => {
  const service = read(SERVICE);
  assert.match(service, /private async validateDependencies/);
  assert.match(service, /project\.status !== ACTIVE/);
  assert.match(service, /findStage\(input\.projectId, input\.stageId, visibility\)/);
  assert.match(service, /INVALID_EXPENSE_STAGE/);
  assert.match(service, /findExpenseCategoryById/);
  assert.match(service, /category\.status !== ACTIVE/);
  assert.match(service, /findProjectEvidenceDocument/);
  assert.match(service, /findCashBankAccountById/);
  assert.match(service, /account\.accountType !== input\.paymentMode/);
});

/** Confirm the expense number is server-owned and allocated through Foundation numbering. */
test('B15.5 creates server-numbered draft expenses through Foundation numbering', () => {
  const service = read(SERVICE);
  assert.match(service, /SITE_EXPENSE_SEQUENCE_KEY = 'site-expense'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: SITE_EXPENSE_SEQUENCE_KEY \}\)/);
  assert.match(service, /createdBy: security\.actorUserId/);
  assert.match(service, /statusCode: 201/);
  assert.doesNotMatch(service, /expenseNo: input\.expenseNo|companyId: input\.companyId/);
});

/** Confirm direct CASH/BANK and PAYABLE settlement use Finance-owned accounts only. */
test('B15.5 resolves Finance posting accounts without introducing a duplicate account master', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /SITE_EXPENSE_PAYABLE_ACCOUNT_CODE = 'SITE-EXPENSE-PAYABLE'/);
  assert.match(service, /input\.paymentMode === 'CASH' \|\| input\.paymentMode === 'BANK'/);
  assert.match(service, /account\.glAccount\.status !== ACTIVE/);
  assert.match(service, /findGlAccountByCode\(SITE_EXPENSE_PAYABLE_ACCOUNT_CODE\)/);
  assert.match(repository, /async findGlAccountByCode/);
  assert.doesNotMatch(read('packages/database/prisma/schema.prisma'), /model SiteExpenseAccount|model SiteExpensePayableAccount/);
});

/** Confirm posting creates exactly one idempotent cost source and one Finance source in the same command transaction. */
test('B15.5 posts Site Expense to Project Cost and Finance atomically with the same stable source key', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /executeIdempotentCommand\(this\.db/);
  assert.match(service, /siteExpenseSourceKey\(expenseId\)/);
  assert.match(service, /upsertSiteExpenseCostActual/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /sourceType: 'site_expense'/);
  assert.match(service, /financeSourceKey: sourceKey, costSourceKey: sourceKey/);
  assert.match(repository, /category: 'site_expense'/);
  assert.match(repository, /companyId_sourceKey/);
});

/** Confirm Project actual cost remains source-derived and no Profitability total is written. */
test('B15.5 writes only source-derived site_expense cost actuals', () => {
  const repository = read(REPOSITORY);
  const service = read(SERVICE);
  assert.match(repository, /this\.db\.costActual\.upsert/);
  assert.match(repository, /sourceType: input\.sourceType/);
  assert.doesNotMatch(service, /projectProfit|profitabilitySnapshot|profitTotal/i);
  assert.doesNotMatch(repository, /projectProfit|profitabilitySnapshot|profitTotal/i);
});

/** Confirm posted expenses are immutable and repeated post commands cannot create duplicate financial effects. */
test('B15.5 keeps posted Site Expense history immutable and retry-safe', () => {
  const service = read(SERVICE);
  assert.match(service, /if \(locked\.status === POSTED\)/);
  assert.match(service, /if \(locked\.status !== DRAFT\) throw createSiteExpenseError\('EXPENSE_LOCKED'\)/);
  assert.match(service, /operation: 'site-expenses\.post'/);
  assert.match(service, /sourceKey,\n\s+postingDate: locked\.expenseDate/);
  assert.doesNotMatch(service, /\.delete\(|deleteMany/);
});

/** Confirm reversal appends compensating Finance and negative cost history with a distinct stable source key. */
test('B15.5 reverses through compensating Finance and Project cost entries instead of deletion', () => {
  const service = read(SERVICE);
  const finance = read(FINANCE_SERVICE);
  assert.match(service, /siteExpenseReversalSourceKey\(expenseId\)/);
  assert.match(service, /postSourceReversalInTransaction\(tx/);
  assert.match(service, /reversalSourceType: 'site_expense_reversal'/);
  assert.match(service, /negativeMoneyString\(originalCost\.amount\)/);
  assert.match(finance, /debit: line\.credit\.toString\(\)/);
  assert.match(finance, /credit: line\.debit\.toString\(\)/);
  assert.match(service, /markReversed/);
  assert.match(service, /eventType: 'site_expense\.reversed'/);
  assert.doesNotMatch(service, /\.delete\(|deleteMany/);
});

/** Confirm meaningful create/update/post/reverse writes remain auditable and domain events use the Foundation outbox. */
test('B15.5 records audit and outbox evidence for Site Expense lifecycle writes', () => {
  const service = read(SERVICE);
  for (const action of ['site_expense.created', 'site_expense.updated', 'site_expense.posted', 'site_expense.reversed']) {
    assert.ok(service.includes(`action: '${action}'`), `missing audit action ${action}`);
  }
  for (const event of ['site_expense.created', 'site_expense.posted', 'site_expense.reversed']) {
    assert.ok(service.includes(`eventType: '${event}'`), `missing outbox event ${event}`);
  }
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
});

/** Confirm every named helper and service/repository method changed by B15.5 has a short purpose comment. */
test('B15.5 keeps changed functions junior-readable with purpose comments', () => {
  for (const path of [SERVICE, REPOSITORY]) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm the B15.5 historical boundary added no migration and explicitly handed HTTP work to B15.6. */
test('B15.5 keeps persistence frozen and defers route registration to B15.6', () => {
  const doc = read('docs/PASS-B15-5-FINAL21-SITE-EXPENSE-SERVICE.md');
  assert.match(doc, /No Prisma model or migration is added in B15\.5/i);
  assert.match(doc, /B15\.6.*Fastify routes/i);
  assert.equal(read('apps/api/src/app.ts').includes('registerSiteExpensesRoutes'), true);
});
