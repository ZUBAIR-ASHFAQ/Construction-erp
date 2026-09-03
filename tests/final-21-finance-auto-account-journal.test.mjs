import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one project source file for focused Finance regression evidence. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('Finance account create contract remains server-numbered while Finance Core keeps account setup without the account chart', () => {
  const schema = read('apps/api/src/modules/finance/finance.schema.ts');
  const routes = read('apps/api/src/modules/finance/finance.routes.ts');
  const api = read('apps/web/src/features/finance/api/finance-api.ts');
  const page = read('apps/web/src/features/finance/pages/finance-page.tsx');
  const createSchema = schema.slice(schema.indexOf('export const createFinanceAccountBodySchema'), schema.indexOf('/** One manual Journal line'));
  assert.doesNotMatch(createSchema, /accountCode|parentId/);
  assert.match(createSchema, /z\.enum\(\['CASH', 'BANK'\]\)/);
  assert.match(createSchema, /openingBalance: nonNegativeMoneySchema/);
  assert.match(routes, /required: \['name', 'accountType', 'openingBalance'\]/);
  assert.doesNotMatch(api.match(/CreateFinanceAccountInput[^;]+;/)?.[0] ?? '', /accountCode|parentId/);
  assert.doesNotMatch(page, /<h2>Chart of Accounts<\/h2>/);
  assert.match(page, /<h2>Create Account<\/h2>/);
  assert.match(page, /Account name<input/);
  assert.match(page, /Opening balance<input/);
  assert.match(page, /Create account<\/button>/);
  assert.match(page, /useCreateFinanceAccount/);
  assert.match(page, /finance\.accounts\.manage/);
});

test('Finance service allocates account codes and posts opening balances as balanced source Journals', () => {
  const service = read('apps/api/src/modules/finance/finance.service.ts');
  const repository = read('apps/api/src/modules/finance/finance.repository.ts');
  assert.match(service, /ACCOUNT_SEQUENCE_KEY = 'finance.account'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: ACCOUNT_SEQUENCE_KEY \}\)/);
  assert.match(repository, /ensureAccountNumberSequence/);
  assert.match(repository, /sequenceKey: 'finance.account'/);
  assert.match(repository, /ensureJournalNumberSequence/);
  assert.match(repository, /prefix: 'ACC-'/);
  assert.match(service, /sourceType: JOURNAL_SOURCE_ACCOUNT_OPENING/);
  assert.match(service, /sourceKey: `finance_account_opening:\$\{account\.id\}`/);
  assert.match(service, /accountId: account\.id[\s\S]*debit: input\.openingBalance[\s\S]*accountId: openingEquity\.id[\s\S]*credit: input\.openingBalance/);
  assert.match(repository, /OPENING-BALANCE-EQUITY/);
  assert.match(repository, /journalLine\.groupBy/);
  assert.match(repository, /debit - credit/);
});

test('Manual Journal backend remains available while Finance Core keeps records only', () => {
  const service = read('apps/api/src/modules/finance/finance.service.ts');
  const routes = read('apps/api/src/modules/finance/finance.routes.ts');
  const workspace = read('apps/web/src/features/finance/components/finance-journal-workspace.tsx');
  const block = service.slice(service.indexOf('private async createManualJournalOnce'), service.indexOf('/** Post one draft Journal'));
  assert.match(block, /finance\.journals\.create/);
  assert.match(block, /finance\.journals\.post/);
  assert.match(block, /JOURNAL_UNBALANCED/);
  assert.match(block, /status: JOURNAL_POSTED/);
  assert.match(block, /postedAt/);
  assert.match(block, /recordOutboxEvent/);
  assert.match(routes, /finance\/journals\/:id\/post/);
  assert.match(workspace, /<h2>Journal Records<\/h2>/);
  assert.match(workspace, /Journal entries are created automatically/);
  assert.doesNotMatch(workspace, /Post transaction|useCreateManualJournal|react-hook-form|zodResolver/);
});

test('New Cash Bank GL account types remain compatible with Client Receipts and Supplier Payments', () => {
  const receipts = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const supplier = read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  assert.match(receipts, /cashBankGlType !== LEGACY_CASH_ACCOUNT_TYPE && cashBankGlType !== input\.paymentMethod/);
  assert.match(supplier, /\['CASH', 'BANK'\]\.includes\(cashBank\.accountType\.trim\(\)\.toUpperCase\(\)\)/);
  assert.match(supplier, /cashBank\.glAccount\.accountType\.trim\(\)\.toUpperCase\(\) !== cashBank\.accountType\.trim\(\)\.toUpperCase\(\)/);
});
