import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const REPOSITORY = 'apps/api/src/modules/client-receipts/client-receipts.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B18.4 completes the exact five-file Client Receipts backend module shape', () => {
  const files = readdirSync(new URL('apps/api/src/modules/client-receipts/', ROOT)).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'client-receipts.repository.ts',
    'client-receipts.routes.ts',
    'client-receipts.schema.ts',
    'client-receipts.service.ts',
    'index.ts'
  ]);
});

test('B18.4 repository is transaction-capable and Company-scoped', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /type RepositoryClient = DatabaseClient \| TransactionClient/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /constructor\(private readonly db: RepositoryClient\)/);
  assert.doesNotMatch(repository, /companyId:\s*input\./);
});

test('B18.4 repository keeps all receipt reads inside trusted Project scope and bounded pagination', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /CLIENT_RECEIPT_MAX_PAGE_SIZE/);
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /function normalizeAllowedProjectIds/);
  assert.match(repository, /function isProjectAllowed/);
  assert.match(repository, /function projectScopeWhere/);
  assert.match(repository, /async listClientReceipts/);
  assert.match(repository, /async findClientReceiptById/);
  assert.match(repository, /clientReceipt\.count\(\{ where \}\)/);
});

test('B18.4 adds only the dependency lookups required by later receipt services', () => {
  const repository = read(REPOSITORY);
  for (const method of [
    'findClientById',
    'findProjectById',
    'findStageById',
    'findCashBankAccountById',
    'findClientInvoiceById'
  ]) assert.match(repository, new RegExp(`async ${method}\\(`), `missing ${method}`);
  assert.match(repository, /where: scope\.where\(\{ id: projectId, clientId \}\)/);
  assert.match(repository, /where: scope\.where\(\{ id: stageId, projectId \}\)/);
  assert.match(repository, /include: \{ glAccount: true \}/);
  assert.match(repository, /where: scope\.where\(\{ id: clientInvoiceId, clientId, projectId \}\)/);
});

test('B18.4 creates one posted receipt without storing derived balances or browser-owned authority', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async createClientReceipt/);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /postedAt: input\.postedAt/);
  assert.match(repository, /scope\.createData/);
  assert.doesNotMatch(repository, /outstandingAmount|advanceBalance|profitAmount|invoiceOutstanding/);
});

test('B18.4 adds receipt and invoice row locks for race-safe later allocation commands', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async lockClientReceiptForWrite/);
  assert.match(repository, /FROM client_receipts[\s\S]*FOR UPDATE/);
  assert.match(repository, /async lockClientInvoiceForAllocation/);
  assert.match(repository, /FROM client_invoices[\s\S]*FOR UPDATE/);
  assert.match(repository, /total_receivable AS "totalAmount"/);
});

test('B18.4 exposes source allocation totals without calculating business policy in the repository', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async sumAllocatedAmountForReceipt/);
  assert.match(repository, /async sumAllocatedAmountForInvoice/);
  assert.match(repository, /receipt: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(repository, /_sum: \{ amount: true \}/);
  assert.doesNotMatch(repository, /ALLOCATION_EXCEEDS_RECEIPT|ALLOCATION_EXCEEDS_INVOICE/);
});

test('B18.4 supports append allocation, controlled unallocation persistence and receipt reversal state only', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async findAllocationById/);
  assert.match(repository, /async createAllocation/);
  assert.match(repository, /clientReceiptAllocation\.create/);
  assert.match(repository, /async deleteAllocation/);
  assert.match(repository, /clientReceiptAllocation\.delete/);
  assert.match(repository, /async markClientReceiptReversed/);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /data: \{ status: 'REVERSED' \}/);
});

test('B18.4 reuses Finance ownership later instead of duplicating Journal persistence here', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /journal\.create|FinanceRepository|FinanceService|sourceKey/);
  const doc = read('docs/PASS-B18-4-FINAL21-CLIENT-RECEIPTS-REPOSITORY.md');
  assert.match(doc, /FinanceRepository\.findJournalBySourceKey/i);
  assert.match(doc, /B18\.5/i);
});

test('B18.4 established the service/route shape while routes stay unpublished until B18.7', () => {
  const service = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const routes = read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-4-client-receipts-repository.json'));
  assert.match(service, /client-receipts\.schema\.js|ClientReceiptsService/);
  assert.match(routes, /ClientReceiptsRoutesOptions/);
  assert.ok(evidence.deferred.includes('Fastify route registration'));
  assert.ok(evidence.deferred.includes('React Client Receipts feature'));
});

test('B18.4 adds no migration and leaves B18.2 persistence as the current database authority', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b18_4|client_receipts_repository/i.test(name)), false);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-4-client-receipts-repository.json'));
  assert.equal(evidence.migrationAdded, false);
  assert.equal(evidence.nextPass, 'B18.5 Client Receipt creation and atomic Finance posting');
});
