import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/client-receipts/client-receipts.service.ts';
const REPOSITORY = 'apps/api/src/modules/client-receipts/client-receipts.repository.ts';

/** Read one source file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B18.5 evidence records that HTTP publication was deferred to a later pass', () => {
  const service = read(SERVICE);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-5-client-receipt-create-finance.json'));
  assert.match(service, /export class ClientReceiptsService/);
  assert.match(service, /constructor\(private readonly db: DatabaseClient\)/);
  assert.ok(evidence.deferred.includes('Fastify route publication'));
});

test('B18.5 derives Company actor and Project permission instead of trusting request ownership', () => {
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodes/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /projectScope\.kind === 'not-resolved'/);
  assert.match(service, /client_receipts\.create/);
  assert.doesNotMatch(service, /input\.companyId|input\.actorUserId|input\.permissions|input\.allowedProjectIds/);
});

test('B18.5 validates Client to Project and optional Stage ownership before posting cash', () => {
  const service = read(SERVICE);
  assert.match(service, /findClientById\(input\.clientId\)/);
  assert.match(service, /findProjectById\(input\.projectId, input\.clientId, visibility\)/);
  assert.match(service, /findStageById\(input\.projectId, input\.stageId, visibility\)/);
  assert.match(service, /createClientReceiptError\('RECEIPT_SCOPE_MISMATCH'\)/);
});

test('B18.5 validates the selected Cash or Bank account and its mapped asset GL', () => {
  const service = read(SERVICE);
  assert.match(service, /findCashBankAccountById\(input\.cashBankAccountId\)/);
  assert.match(service, /cashBankAccount\.status !== ACCOUNT_ACTIVE/);
  assert.match(service, /cashBankAccount\.accountType !== input\.paymentMethod/);
  assert.match(service, /cashBankAccount\.glAccount\.status !== ACCOUNT_ACTIVE/);
  assert.match(service, /cashBankAccount\.glAccount\.accountType !== CASH_ACCOUNT_TYPE/);
  assert.match(service, /const CASH_ACCOUNT_TYPE = 'ASSET'/);
});

test('B18.5 makes the unallocated Client Advance Finance mapping explicit and validated', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /const CLIENT_ADVANCE_ACCOUNT_CODE = 'CLIENT-ADVANCE'/);
  assert.match(service, /const CLIENT_ADVANCE_ACCOUNT_TYPE = 'LIABILITY'/);
  assert.match(service, /findGlAccountByCode\(CLIENT_ADVANCE_ACCOUNT_CODE\)/);
  assert.match(service, /clientAdvanceAccount\.accountType !== CLIENT_ADVANCE_ACCOUNT_TYPE/);
  assert.match(repository, /async findGlAccountByCode\(accountCode: string\)/);
  assert.match(repository, /where: scope\.where\(\{ accountCode \}\)/);
});

test('B18.5 creates one server-numbered posted receipt through the Foundation idempotency transaction', () => {
  const service = read(SERVICE);
  assert.match(service, /executeIdempotentCommand\(this\.db/);
  assert.match(service, /operation: 'client-receipts\.create'/);
  assert.match(service, /fingerprintInput: input/);
  assert.match(service, /const CLIENT_RECEIPT_SEQUENCE_KEY = 'client-receipt'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: CLIENT_RECEIPT_SEQUENCE_KEY \}\)/);
  assert.match(service, /receiptNo: number\.formatted/);
  assert.match(service, /createdBy: security\.actorUserId/);
  assert.match(service, /postedAt: now/);
});

test('B18.5 posts Cash debit and unapplied Client Advance credit atomically through Finance', () => {
  const service = read(SERVICE);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /sourceType: 'client_receipt'/);
  assert.match(service, /return `client_receipt:\$\{receiptId\}`/);
  assert.match(service, /accountId: cashGlAccountId[\s\S]*debit:[\s\S]*credit: ZERO_MONEY/);
  assert.match(service, /accountId: clientAdvanceAccountId[\s\S]*debit: ZERO_MONEY[\s\S]*credit:/);
  assert.match(service, /projectId: receipt\.projectId/);
  assert.match(service, /stageId: receipt\.stageId/);
});

test('B18.5 receipt creation does not treat cash as revenue, profit or AR before later allocation', () => {
  const service = read(SERVICE);
  const start = service.indexOf('private async postReceiptToFinance');
  const end = service.indexOf('/** Create and post one Client Receipt exactly once. */', start);
  const createFinanceBlock = service.slice(start, end);
  assert.doesNotMatch(createFinanceBlock, /CLIENT-REVENUE|CLIENT_REVENUE|profit/i);
  assert.doesNotMatch(createFinanceBlock, /CLIENT-RECEIVABLE/);
  assert.match(createFinanceBlock, /unapplied client advance/i);
});

test('B18.5 records one receipt-posted audit and outbox event in the same transaction', () => {
  const service = read(SERVICE);
  assert.match(service, /recordAudit\(tx, \{[\s\S]*action: 'client_receipt\.posted'/);
  assert.match(service, /recordOutboxEvent\(tx, \{[\s\S]*eventType: 'client_receipt\.posted'/);
  assert.match(service, /financeSourceKey/);
});

test('B18.5 keeps derived receipt balances out of persistence and derives the new-receipt unallocated amount', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /allocatedAmount: minorUnitsToMoney\(allocated\)/);
  assert.match(service, /unallocatedAmount: minorUnitsToMoney\(amount - allocated\)/);
  assert.doesNotMatch(repository, /advanceBalance|outstandingAmount|profitAmount/);
});

test('B18.5 adds no migration and records B18.6 as the dedicated later allocation/reversal pass', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b18_5|client_receipt.*finance/i.test(name)), false);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-5-client-receipt-create-finance.json'));
  assert.equal(evidence.migrationAdded, false);
  assert.equal(evidence.nextPass, 'B18.6 Invoice allocation, unallocation and receipt reversal');
  const b18_6 = JSON.parse(read('acceptance-evidence/pass-b18-6-client-receipt-allocation-reversal.json'));
  assert.equal(b18_6.pass, 'B18.6');
});
