import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/finance';
const web = 'apps/web/src/features/finance';
const migrationPath = 'packages/database/prisma/migrations/20260829001300_final21_finance_core_alignment/migration.sql';

/** Confirm Finance is a small five-file module in the corrected Final-21 generation order. */
test('B9 keeps the final five-file Finance backend between Project Team and Budget', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'finance.repository.ts', 'finance.routes.ts', 'finance.schema.ts', 'finance.service.ts', 'index.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.ok(app.indexOf('registerProjectTeamRoutes') < app.indexOf('registerFinanceRoutes'));
  assert.ok(app.indexOf('registerFinanceRoutes') < app.indexOf('registerBudgetsJobCostRoutes'));
});

/** Confirm final Finance persistence has Project/Stage Journals plus Cash/Bank and reconciliation ownership. */
test('B9 aligns Finance Prisma models and removes legacy Cost Structure ownership from Journal lines', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const journalLine = prisma.match(/model JournalLine \{[\s\S]*?@@map\("journal_lines"\)\n\}/)?.[0] ?? '';
  assert.match(prisma, /model CashBankAccount \{[\s\S]*@@map\("cash_bank_accounts"\)/);
  assert.match(prisma, /model BankReconciliation \{[\s\S]*@@map\("bank_reconciliations"\)/);
  assert.match(prisma, /model Journal \{[\s\S]*sourceKey\s+String\?[\s\S]*createdBy\s+String\?[\s\S]*postedAt\s+DateTime\?/);
  assert.match(journalLine, /projectId\s+String\?/);
  assert.match(journalLine, /stageId\s+String\?/);
  assert.doesNotMatch(journalLine, /costStructureId|wbsNodeId|costCodeId|costTypeId/);
});

/** Confirm the forward migration preserves Journal history while moving Finance onto final dimensions. */
test('B9 migration adds source keys Stage dimensions Cash Bank and reconciliation without rewriting history', () => {
  const migration = read(migrationPath);
  assert.match(migration, /ADD COLUMN "source_key"/);
  assert.match(migration, /SET "source_key" = "source_type" \|\| ':' \|\| "source_id"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "cost_structure_id"/);
  assert.match(migration, /ADD COLUMN "stage_id" UUID/);
  assert.match(migration, /CREATE TABLE "cash_bank_accounts"/);
  assert.match(migration, /CREATE TABLE "bank_reconciliations"/);
  assert.match(migration, /final21_validate_journal_line_scope/);
});

/** Confirm the Finance route catalog keeps the Final-21 commands plus the R10 period selector read. */
test('B9 exposes the approved Final Module 18 route surface and removes repair CRUD aliases', () => {
  const schema = read(`${backend}/finance.schema.ts`);
  for (const route of [
    "GET', route: '/api/v1/finance/accounts'",
    "POST', route: '/api/v1/finance/accounts'",
    "GET', route: '/api/v1/finance/journals'",
    "POST', route: '/api/v1/finance/journals'",
    "POST', route: '/api/v1/finance/journals/:id/post'",
    "POST', route: '/api/v1/finance/journals/:id/reverse'",
    "GET', route: '/api/v1/finance/ledger'",
    "GET', route: '/api/v1/finance/trial-balance'",
    "GET', route: '/api/v1/finance/cash-bank'",
    "GET', route: '/api/v1/finance/periods'",
    "POST', route: '/api/v1/finance/reconciliations'",
    "POST', route: '/api/v1/finance/periods/:id/close'"
  ]) assert.ok(schema.includes(route), `missing ${route}`);
  assert.doesNotMatch(schema, /general-ledger|accounts\/:id|periods\/:id\/reopen|POST', route: '\/api\/v1\/finance\/periods'/);
});

/** Confirm stable permission, error and event vocabulary matches Final Module 18. */
test('B9 uses the required Finance permissions errors and events and retires old read aliases', () => {
  const schema = read(`${backend}/finance.schema.ts`);
  const administration = read('apps/api/src/modules/administration/administration.schema.ts');
  const permissionMigration = read('packages/database/prisma/migrations/20260829001300_final21_finance_core_alignment/migration.sql');
  for (const value of ['finance.read', 'finance.accounts.manage', 'finance.journals.create', 'finance.journals.post', 'finance.journals.reverse', 'finance.periods.close', 'finance.reconcile']) assert.ok(schema.includes(`'${value}'`));
  for (const value of ['JOURNAL_UNBALANCED', 'FISCAL_PERIOD_CLOSED', 'DUPLICATE_POSTING_SOURCE', 'GL_ACCOUNT_INVALID', 'FINANCE_SCOPE_FORBIDDEN']) assert.ok(schema.includes(`'${value}'`));
  for (const value of ['journal.posted', 'journal.reversed', 'period.closed', 'bank_reconciliation.completed']) assert.ok(schema.includes(`'${value}'`));
  for (const value of ['finance.accounts.read', 'finance.journals.read', 'finance.reports.read']) {
    assert.doesNotMatch(administration, new RegExp(`'${value.replaceAll('.', '\\.')}'`));
    assert.match(permissionMigration, new RegExp(`'${value.replaceAll('.', '\\.')}'`));
  }
});

/** Confirm posting is balanced open-period idempotent scoped and immutable through compensating reversal. */
test('B9 Finance service enforces balanced posting stable source keys Project Stage scope audit and reversal', () => {
  const service = read(`${backend}/finance.service.ts`);
  assert.match(service, /calculateJournalTotals/);
  assert.match(service, /JOURNAL_UNBALANCED/);
  assert.match(service, /resolveOpenPeriod/);
  assert.match(service, /resolveLineProjectScope/);
  assert.match(service, /stageId/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /postSourceJournal/);
  assert.match(service, /sourceKey/);
  assert.match(service, /finance-reversal:/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.doesNotMatch(service, /costStructureId|wbsNodeId|costCodeId|costTypeId/);
});

/** Confirm repository reads and writes are Company scoped and Cash/Bank balances are GL-derived. */
test('B9 Finance repository is Company scoped and has final ledger Cash Bank reconciliation persistence', () => {
  const repository = read(`${backend}/finance.repository.ts`);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /findStagesByIds/);
  assert.match(repository, /listFiscalPeriods/);
  assert.match(repository, /listLedger/);
  assert.match(repository, /getTrialBalance/);
  assert.match(repository, /listCashBankAccounts/);
  assert.match(repository, /createCashBankAccountForGl/);
  assert.match(repository, /getCashBankBalanceAsOf/);
  assert.match(repository, /createBankReconciliation/);
  assert.doesNotMatch(repository, /costStructureId|wbsNodeId|costCodeId|costTypeId/);
});

/** Confirm Cash/Bank GL accounts become usable Finance-owned Cash/Bank masters. */
test('B9 creates minimal Cash Bank masters for CASH or BANK GL accounts and preserves legacy ones in migration', () => {
  const service = read(`${backend}/finance.service.ts`);
  const migration = read(migrationPath);
  assert.match(service, /accountType === 'CASH' \|\| accountType === 'BANK'/);
  assert.match(service, /createCashBankAccountForGl/);
  assert.match(migration, /upper\(account\."account_type"\) IN \('CASH', 'BANK'\)/);
});

/** Confirm the React feature calls only final Finance APIs and uses Stage rather than Cost Structure. */
test('B9 aligns Finance React API hooks and workspace to ledger Cash Bank reconciliation and Stage dimensions', () => {
  for (const file of ['api/finance-api.ts', 'hooks/finance.ts', 'components/finance-journal-workspace.tsx', 'pages/finance-page.tsx']) {
    assert.equal(existsSync(new URL(`../${web}/${file}`, import.meta.url)), true, `${file} must exist`);
  }
  const api = read(`${web}/api/finance-api.ts`);
  const hooks = read(`${web}/hooks/finance.ts`);
  const workspace = read(`${web}/components/finance-journal-workspace.tsx`);
  const page = read(`${web}/pages/finance-page.tsx`);
  assert.match(api, /finance\/ledger/);
  assert.match(api, /finance\/cash-bank/);
  assert.match(api, /finance\/periods/);
  assert.match(api, /finance\/reconciliations/);
  assert.match(api, /stageId/);
  assert.doesNotMatch(api, /general-ledger|costStructureId|updateFinanceAccount|reopenFinancePeriod|createFinancePeriod/);
  assert.match(hooks, /@tanstack\/react-query/);
  assert.match(workspace, /react-hook-form/);
  assert.match(workspace, /zodResolver/);
  assert.match(page, /Cash \/ Bank & Reconciliation/);
  assert.match(page, /useFinancePeriods/);
  assert.match(page, /<select \{\.\.\.ledgerForm\.register\('periodId'\)\}/);
  assert.doesNotMatch(page, /Fiscal period ID<input/);
});

/** Confirm the B9 migration safely maps old Finance permission grants before removing obsolete codes. */
test('B9 migrates old Finance grants to final permissions before removing obsolete aliases', () => {
  const migration = read(migrationPath);
  assert.match(migration, /finance\.accounts\.read', 'finance\.journals\.read', 'finance\.reports\.read/);
  assert.match(migration, /finance\.accounts\.manage/);
  assert.match(migration, /finance\.journals\.reverse/);
  assert.match(migration, /finance\.reconcile/);
  assert.ok(migration.indexOf("new_permission.\"code\" = 'finance.read'") < migration.lastIndexOf('DELETE FROM "permissions"'));
});

/** Confirm every named B9 function or async method has a nearby short purpose comment. */
test('B9 keeps Finance code junior-readable with short purpose comments on named functions', () => {
  const paths = [
    `${backend}/finance.schema.ts`, `${backend}/finance.repository.ts`, `${backend}/finance.service.ts`, `${backend}/finance.routes.ts`,
    `${web}/api/finance-api.ts`, `${web}/hooks/finance.ts`, `${web}/components/finance-journal-workspace.tsx`, `${web}/pages/finance-page.tsx`
  ];
  for (const path of paths) {
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
