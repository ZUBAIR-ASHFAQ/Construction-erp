import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/client-receipts/client-receipts.service.ts';
const REPOSITORY = 'apps/api/src/modules/client-receipts/client-receipts.repository.ts';

/** Read one project text file relative to the repository root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B18.6 implements allocation, unallocation and receipt reversal before its recorded HTTP handoff', () => {
  const service = read(SERVICE);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-6-client-receipt-allocation-reversal.json'));
  assert.match(service, /async allocateClientReceipt\(/);
  assert.match(service, /async unallocateClientReceipt\(/);
  assert.match(service, /async reverseClientReceipt\(/);
  assert.equal(evidence.publicRouteCount, 0);
});

test('B18.6 resolves persisted allocation and reversal permissions from trusted request scope', () => {
  const service = read(SERVICE);
  assert.match(service, /private async resolveVisibility/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(service, /'client_receipts\.allocate'/);
  assert.match(service, /'client_receipts\.reverse'/);
  assert.doesNotMatch(service, /input\.companyId|input\.actorUserId|input\.allowedProjectIds|input\.permissions/);
});

test('B18.6 serializes concurrent allocation work by locking the receipt and invoice rows', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /lockClientReceiptForWrite\(receiptId, visibility\)/);
  assert.match(service, /lockClientInvoiceForAllocation\(input\.clientInvoiceId, receipt\.clientId, receipt\.projectId, visibility\)/);
  assert.match(repository, /FROM client_receipts[\s\S]*FOR UPDATE/);
  assert.match(repository, /FROM client_invoices[\s\S]*FOR UPDATE/);
});

test('B18.6 enforces both receipt remaining amount and invoice outstanding before allocation', () => {
  const service = read(SERVICE);
  assert.match(service, /sumAllocatedAmountForReceipt\(receipt\.id\)/);
  assert.match(service, /receiptAllocated \+ requested > moneyToMinorUnits\(receipt\.amount\)/);
  assert.match(service, /ALLOCATION_EXCEEDS_RECEIPT/);
  assert.match(service, /sumAllocatedAmountForInvoice\(invoice\.id\)/);
  assert.match(service, /invoiceAllocated \+ requested > moneyToMinorUnits\(invoice\.totalAmount\)/);
  assert.match(service, /ALLOCATION_EXCEEDS_INVOICE/);
});

test('B18.6 preserves Stage attribution and prevents stage-tagged cash exceeding Stage billed value', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /if \(receipt\.stageId\)/);
  assert.match(service, /line\.stageId === receipt\.stageId/);
  assert.match(service, /stageBilled === 0n/);
  assert.match(service, /sumAllocatedAmountForInvoiceStage\(invoice\.id, receipt\.stageId\)/);
  assert.match(service, /stageAllocated \+ requested > stageBilled/);
  assert.match(repository, /async sumAllocatedAmountForInvoiceStage/);
  assert.match(repository, /receipt: \{ companyId: scope\.companyId, status: 'POSTED', stageId \}/);
});

test('B18.6 allocation reclassifies Client Advance to Client Receivable with no second cash movement', () => {
  const service = read(SERVICE);
  assert.match(service, /const CLIENT_ADVANCE_ACCOUNT_CODE = 'CLIENT-ADVANCE'/);
  assert.match(service, /const CLIENT_RECEIVABLE_ACCOUNT_CODE = 'CLIENT-RECEIVABLE'/);
  assert.match(service, /sourceType: 'client_receipt_allocation'/);
  assert.match(service, /clientAdvanceAccountId[\s\S]*debit: input\.amount[\s\S]*credit: ZERO_MONEY/);
  assert.match(service, /clientReceivableAccountId[\s\S]*debit: ZERO_MONEY[\s\S]*credit: input\.amount/);
  const allocationBlock = service.slice(service.indexOf("sourceType: 'client_receipt_allocation'"), service.indexOf("action: 'client_receipt.allocated'"));
  assert.doesNotMatch(allocationBlock, /cashGlAccountId|cashBankAccountId/);
});

test('B18.6 allocation is idempotent and records the required audit/outbox event', () => {
  const service = read(SERVICE);
  assert.match(service, /operation: 'client-receipts\.allocate'/);
  assert.match(service, /fingerprintInput: \{ receiptId, \.\.\.input \}/);
  assert.match(service, /return `client_receipt_allocation:\$\{allocationId\}`/);
  assert.match(service, /action: 'client_receipt\.allocated'/);
  assert.match(service, /eventType: 'client_receipt\.allocated'/);
});

test('B18.6 unallocation compensates the exact original allocation Journal before removing the active link', () => {
  const service = read(SERVICE);
  assert.match(service, /operation: 'client-receipts\.unallocate'/);
  assert.match(service, /requirePostedFinanceSourceJournal\(tx, originalSourceKey, 'client_receipt_allocation', allocation\.id, allocation\.amount\)/);
  assert.match(service, /sourceType: 'client_receipt_allocation_reversal'/);
  assert.match(service, /reverseJournalLines\(originalJournal\.lines/);
  const financeIndex = service.indexOf("sourceType: 'client_receipt_allocation_reversal'");
  const deleteIndex = service.indexOf('repository.deleteAllocation', financeIndex);
  assert.ok(financeIndex >= 0 && deleteIndex > financeIndex, 'Finance compensation must be written before active allocation removal');
  assert.match(service, /action: 'client_receipt\.allocation_reversed'/);
  assert.match(service, /eventType: 'client_receipt\.allocation_reversed'/);
});

test('B18.6 receipt reversal is blocked while allocations remain and compensates original cash history', () => {
  const service = read(SERVICE);
  assert.match(service, /operation: 'client-receipts\.reverse'/);
  assert.match(service, /const allocated = moneyToMinorUnits\(await repository\.sumAllocatedAmountForReceipt\(receipt\.id\)/);
  assert.match(service, /if \(allocated !== 0n\) throw createClientReceiptError\('RECEIPT_LOCKED'\)/);
  assert.match(service, /requirePostedFinanceSourceJournal\(tx, originalSourceKey, 'client_receipt', receipt\.id, receipt\.amount\)/);
  assert.match(service, /sourceType: 'client_receipt_reversal'/);
  assert.match(service, /reverseJournalLines\(originalJournal\.lines/);
  assert.match(service, /markClientReceiptReversed\(receipt\.id, visibility\)/);
});

test('B18.6 keeps original receipt amount, date, reference and posted accounting immutable', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.doesNotMatch(service, /updateClientReceipt|deleteClientReceipt/);
  const reversalStart = repository.indexOf('async markClientReceiptReversed');
  const reversalBlock = repository.slice(reversalStart);
  assert.match(reversalBlock, /data: \{ status: 'REVERSED' \}/);
  assert.doesNotMatch(reversalBlock, /amount:|receiptDate:|reference:/);
  assert.match(service, /client_receipt_reversal:/);
  assert.match(service, /client_receipt_allocation_reversal:/);
});

test('B18.6 requires the original posted Finance source before any compensating reversal', () => {
  const service = read(SERVICE);
  assert.match(service, /private async requirePostedFinanceSourceJournal/);
  assert.match(service, /FinanceRepository\(tx\)\.findJournalBySourceKey\(sourceKey\)/);
  assert.match(service, /journal\.sourceType !== sourceType/);
  assert.match(service, /journal\.sourceId !== sourceId/);
  assert.match(service, /journal\.status !== JOURNAL_POSTED/);
  assert.match(service, /createClientReceiptError\('RECEIPT_LOCKED'\)/);
});

test('B18.6 adds no migration and hands the unchanged six-route HTTP contract to B18.7', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b18_6|client_receipt.*allocation.*reversal/i.test(name)), false);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-6-client-receipt-allocation-reversal.json'));
  assert.equal(evidence.migrationAdded, false);
  assert.equal(evidence.publicRouteCount, 0);
  assert.equal(evidence.nextPass, 'B18.7 Client Receipts Fastify routes and OpenAPI');
});
