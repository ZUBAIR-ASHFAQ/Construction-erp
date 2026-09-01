import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const passDoc = await readFile('docs/PASS-B17-6-FINAL21-CLIENT-BILLING-INVOICE-FINANCE.md', 'utf8');

/** Extract one function or method region for focused B17.6 assertions. */
function region(source, name, nextName) {
  const start = source.indexOf(`${name}(`);
  assert.ok(start >= 0, `${name} was not found.`);
  const end = nextName ? source.indexOf(`${nextName}(`, start + 1) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test('B17.6 preserves finalized claim Stage attribution when allocating certified invoice lines', () => {
  const allocation = region(service, 'allocateCertifiedInvoiceLines', 'claimedMinorUnitsByStage');
  assert.match(allocation, /stageId: item\.line\.stageId \?\? null/);
  assert.match(allocation, /description: item\.line\.description/);
  assert.match(allocation, /revenueAccountId/);
  assert.match(allocation, /targetAmount/);
  assert.match(allocation, /remainder/);
  assert.doesNotMatch(allocation, /stageId: null,\s*description: `Certified claim/);
});

test('B17.6 derives invoice lines from the complete finalized claim instead of one Project-only line', () => {
  const create = region(service, 'createInvoiceOnce', 'listInvoices');
  assert.match(create, /claim\.lines\.reduce/);
  assert.match(create, /allocateCertifiedInvoiceLines\(claim\.lines, subtotal, accounts\.revenue\.id\)/);
  assert.match(create, /lines: invoiceLines/);
  assert.doesNotMatch(create, /lines: \[\{\s*stageId: null/);
});

test('B17.6 requires configured active Client receivable and revenue accounts', () => {
  const accounts = region(service, 'requireInvoicePostingAccounts', 'postInvoiceToFinance');
  assert.match(service, /CLIENT_RECEIVABLE_ACCOUNT_CODE = 'CLIENT-RECEIVABLE'/);
  assert.match(service, /CLIENT_REVENUE_ACCOUNT_CODE = 'CLIENT-REVENUE'/);
  assert.match(accounts, /findGlAccountByCode\(CLIENT_RECEIVABLE_ACCOUNT_CODE\)/);
  assert.match(accounts, /findGlAccountByCode\(CLIENT_REVENUE_ACCOUNT_CODE\)/);
  assert.match(accounts, /accountType\.toUpperCase\(\) !== 'ASSET'/);
  assert.match(accounts, /accountType\.toUpperCase\(\) !== 'REVENUE'/);
});

test('B17.6 posts one balanced AR journal using Project and Stage dimensions from the invoice', () => {
  const posting = region(service, 'postInvoiceToFinance', 'createInvoice');
  assert.match(posting, /postSourceJournalInTransaction\(tx/);
  assert.match(posting, /sourceType: 'client_invoice'/);
  assert.match(posting, /sourceId: invoice\.id/);
  assert.match(posting, /sourceKey/);
  assert.match(posting, /accountId: receivableAccountId, projectId: invoice\.projectId, stageId: null, debit:/);
  assert.match(posting, /accountId: line\.revenueAccountId \?\? defaultRevenueAccountId/);
  assert.match(posting, /stageId: line\.stageId/);
  assert.match(posting, /credit: minorUnitsToMoney\(moneyToMinorUnits\(line\.amount\)\)/);
});

test('B17.6 protects the Finance source key from conflicting ownership', () => {
  const posting = region(service, 'postInvoiceToFinance', 'createInvoice');
  assert.match(service, /client_invoice:\$\{invoiceId\}/);
  assert.match(posting, /findJournalBySourceKey\(sourceKey\)/);
  assert.match(posting, /existingJournal\.sourceType !== 'client_invoice'/);
  assert.match(posting, /existingJournal\.sourceId !== invoice\.id/);
  assert.match(posting, /existingJournal\.totalDebit/);
  assert.match(posting, /existingJournal\.totalCredit/);
  assert.match(posting, /Client Invoice Finance source key is already owned by different posting data/);
});

test('B17.6 rejects unreconciled stored claim or invoice totals before accounting', () => {
  const create = region(service, 'createInvoiceOnce', 'listInvoices');
  const posting = region(service, 'postInvoiceToFinance', 'createInvoice');
  assert.match(create, /gross !== storedGross/);
  assert.match(create, /subtotal !== gross - moneyToMinorUnits\(claim\.retention\) - moneyToMinorUnits\(claim\.deductions\)/);
  assert.match(posting, /subtotal !== lineTotal/);
  assert.match(posting, /total !== subtotal \+ tax/);
  assert.match(posting, /tax !== 0n/);
});

test('B17.6 keeps invoice persistence and Finance posting inside the same idempotent business transaction', () => {
  const create = region(service, 'createInvoiceOnce', 'listInvoices');
  assert.match(service, /executeIdempotentCommand\(this\.db/);
  assert.match(create, /repository\.createInvoice\(/);
  assert.match(create, /postInvoiceToFinance\(tx, invoice/);
  assert.ok(create.indexOf('repository.createInvoice') < create.indexOf('postInvoiceToFinance(tx, invoice'), 'Invoice must persist before its source journal is posted in the same transaction.');
});

test('B17.6 repairs a pre-existing unposted invoice without duplicating an existing Finance journal', () => {
  const create = region(service, 'createInvoiceOnce', 'listInvoices');
  assert.match(create, /if \(existing\)/);
  assert.match(create, /postInvoiceToFinance\(tx, existing/);
  assert.match(create, /if \(!finance\.alreadyPosted\)/);
  assert.match(create, /return \{ statusCode: 200, body: invoiceResponse\(existing\) \}/);
});

test('B17.6 emits Client Invoice created and posted evidence and removes the deferred Finance flag', () => {
  const create = region(service, 'createInvoiceOnce', 'listInvoices');
  assert.match(create, /eventType: 'client_invoice\.created'/);
  assert.match(create, /eventType: 'client_invoice\.posted'/);
  assert.match(create, /action: 'client_invoice\.posted'/);
  assert.match(create, /financeSourceKey: finance\.sourceKey/);
  assert.doesNotMatch(service, /financePostingDeferred/);
});

test('B17.6 keeps the existing nine-route boundary and adds no repository-side Finance posting abstraction', () => {
  const routeMatches = [...routes.matchAll(/app\.(get|post|put|patch|delete)\('/g)];
  assert.equal(routeMatches.length, 9);
  assert.equal((schema.match(/route: '\/api\/v1\/client-billing/g) ?? []).length, 9);
  assert.doesNotMatch(repository, /FinanceService|postSourceJournalInTransaction/);
});


test('B17.6 documents the completed invoice posting boundary and keeps B17.7 HTTP/OpenAPI-only', () => {
  assert.match(passDoc, /Stage-aware invoice lines/i);
  assert.match(passDoc, /same idempotent business transaction posts the issued invoice to Module 18 Finance \/ AR/i);
  assert.match(passDoc, /No Prisma schema change/);
  assert.match(passDoc, /B17\.7 - Client Billing HTTP \/ OpenAPI completion/i);
});
