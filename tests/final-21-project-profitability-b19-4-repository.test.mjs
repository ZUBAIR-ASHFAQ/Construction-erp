import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/project-profitability/';
const REPOSITORY = `${MODULE}project-profitability.repository.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B19.4 keeps the exact five-file backend shape and preserves its repository checkpoint after B19.7', () => {
  const files = readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'index.ts',
    'project-profitability.repository.ts',
    'project-profitability.routes.ts',
    'project-profitability.schema.ts',
    'project-profitability.service.ts'
  ]);
  assert.match(read('docs/PASS-B19-4-FINAL21-PROJECT-PROFITABILITY-REPOSITORY.md'), /does .*not.* calculate profit, advance, outstanding, Stage reconciliation, trend buckets or portfolio metrics/i);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-4-project-profitability-repository.json'));
  assert.equal(evidence.pass, 'B19.4');
  assert.match(read(`${MODULE}project-profitability.routes.ts`), /export async function registerProjectProfitabilityRoutes/);
});

test('B19.4 repository is transaction-capable and derives Company scope server-side', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /type RepositoryClient = DatabaseClient \| TransactionClient/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /constructor\(private readonly db: RepositoryClient\)/);
  assert.doesNotMatch(repository, /companyId:\s*input\./);
});

test('B19.4 intersects every requested Project set with trusted allowed Project IDs', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /function visibleProjectIds/);
  assert.match(repository, /new Set\(visibility\.allowedProjectIds\)/);
  assert.match(repository, /requested\.filter\(\(projectId\) => allowed\.has\(projectId\)\)/);
  assert.match(repository, /function projectIsVisible/);
  assert.match(repository, /allowedProjectIds === null/);
});

test('B19.4 provides bounded portfolio Project discovery without cross-currency aggregation', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /PROJECT_PROFITABILITY_MAX_PAGE_SIZE/);
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /async listPortfolioProjects/);
  assert.match(repository, /project\.count\(\{ where \}\)/);
  assert.match(repository, /clientId: input\.clientId/);
  assert.match(repository, /projectCode: \{ contains: input\.search/);
  assert.doesNotMatch(repository, /portfolioTotal|grandTotal|currencyConversion|exchangeRate/);
});

test('B19.4 reads Project and Stage identity only inside Company and Project scope', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async findProject\(/);
  assert.match(repository, /where: scope\.where\(\{ id: projectId \}\)/);
  assert.match(repository, /async listProjectStages\(/);
  assert.match(repository, /where: scope\.where\(\{ projectId: \{ in: ids \} \}\)/);
});

test('B19.4 Stage context reads only latest approved physical progress through the as-of business date', () => {
  const repository = read(REPOSITORY);
  const stages = repository.match(/async listProjectStages[\s\S]*?\n  }\n\n  \/\*\* List Module 9/)?.[0] ?? '';
  assert.match(stages, /status: 'APPROVED'/);
  assert.match(stages, /progressDate: \{ lte: throughDate \}/);
  assert.match(stages, /orderBy: \[\{ progressDate: 'desc' \}, \{ approvedAt: 'desc' \}, \{ id: 'desc' \}\]/);
  assert.match(stages, /take: 1/);
});

test('B19.4 reads Module 9 CostActual history with Project Stage source identity and business dates', () => {
  const repository = read(REPOSITORY);
  const actuals = repository.match(/async listActualCostSources[\s\S]*?\n  }\n\n  \/\*\* List issued\/posted/)?.[0] ?? '';
  assert.match(actuals, /db\.costActual\.findMany/);
  assert.match(actuals, /postingDate: businessDateFilter\(window\)/);
  for (const field of ['projectId: true', 'stageId: true', 'amount: true', 'sourceType: true', 'sourceId: true', 'sourceKey: true']) {
    assert.ok(actuals.includes(field), `missing CostActual source field ${field}`);
  }
});

test('B19.4 reads billed amount only from issued or compatible posted Client Invoice lines', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /BILLABLE_INVOICE_STATUSES = Object\.freeze\(\['ISSUED', 'POSTED'\]/);
  const billed = repository.match(/async listBilledSources[\s\S]*?\n  }\n\n  \/\*\* List Finance-confirmed/)?.[0] ?? '';
  assert.match(billed, /db\.clientInvoiceLine\.findMany/);
  assert.match(billed, /companyId: scope\.companyId/);
  assert.match(billed, /status: \{ in: \[\.\.\.BILLABLE_INVOICE_STATUSES\] \}/);
  assert.match(billed, /invoiceDate: businessDateFilter\(window\)/);
});

test('B19.4 recognized revenue starts from Client Invoice ownership and includes Finance compensating reversal history', () => {
  const repository = read(REPOSITORY);
  const revenue = repository.match(/async listRecognizedRevenueSources[\s\S]*?\n  }\n\n  \/\*\* List durable Finance/)?.[0] ?? '';
  assert.match(revenue, /db\.clientInvoice\.findMany/);
  assert.match(revenue, /sourceType: 'client_invoice'/);
  assert.match(revenue, /sourceId: \{ in: invoiceIds \}/);
  assert.match(revenue, /sourceType: 'REVERSAL'/);
  assert.match(revenue, /sourceId: \{ in: sourceJournalIds \}/);
  assert.match(revenue, /postedAt: \{ lte: window\.postedThrough \}/);
  assert.match(revenue, /accountType: 'REVENUE'/);
  assert.match(revenue, /debit: true/);
  assert.match(revenue, /credit: true/);
});

test('B19.4 reconstructs Client receipt and allocation history from durable Finance source journals', () => {
  const repository = read(REPOSITORY);
  for (const sourceType of [
    'client_receipt',
    'client_receipt_reversal',
    'client_receipt_allocation',
    'client_receipt_allocation_reversal'
  ]) assert.ok(repository.includes(`'${sourceType}'`), `missing receipt Finance source ${sourceType}`);
  const receipts = repository.match(/async listClientReceiptFinanceSources[\s\S]*?\n  }\n\n  \/\*\* List posted Supplier/)?.[0] ?? '';
  assert.match(receipts, /postedAt: \{ lte: window\.postedThrough \}/);
  assert.match(receipts, /sourceType: 'REVERSAL'/);
  assert.match(receipts, /lines: \{ some: \{ projectId: \{ in: ids \} \} \}/);
  assert.match(receipts, /accountCode: true/);
  assert.match(receipts, /accountType: true/);
});

test('B19.4 Supplier payable sources include only posted invoices and allocations from posted Supplier Payments', () => {
  const repository = read(REPOSITORY);
  const payables = repository.match(/async listSupplierPayableSources[\s\S]*?\n  }\n}\n/)?.[0] ?? '';
  assert.match(payables, /db\.supplierInvoice\.findMany/);
  assert.match(payables, /status: 'POSTED'/);
  assert.match(payables, /invoiceDate: \{ lte: window\.throughDate \}/);
  assert.match(payables, /allocatedAt: \{ lte: window\.postedThrough \}/);
  assert.match(payables, /supplierPayment: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(payables, /stageId: true/);
  assert.match(payables, /totalAmount: true/);
});

test('B19.4 repository exposes source rows but contains no profitability or advance calculation policy', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /profitAmount|recognizedRevenue\s*=|advanceAmount|outstandingAmount|supplierPayableAmount\s*=/);
  assert.doesNotMatch(repository, /received\s*-\s*allocated|billed\s*-\s*allocated|revenue\s*-\s*actual/i);
  assert.doesNotMatch(repository, /createProjectProfitabilityError|PROFITABILITY_SOURCE_INCOMPLETE/);
});

test('B19.4 repository remains read-only and adds no Project Profitability persistence or migration', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /\.create\(|\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(|\.upsert\(/);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model ProjectProfitability|model ProjectProfitabilitySnapshot/);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b19_4/i.test(name)), false);
});

test('B19.4 exports the repository contract and hands calculation policy to B19.5', () => {
  const index = read(`${MODULE}index.ts`);
  const doc = read('docs/PASS-B19-4-FINAL21-PROJECT-PROFITABILITY-REPOSITORY.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-4-project-profitability-repository.json'));
  assert.match(index, /export \{ ProjectProfitabilityRepository \}/);
  assert.match(index, /ProjectProfitabilityRepositoryVisibility/);
  assert.match(index, /ProjectProfitabilityRepositoryDateWindow/);
  assert.match(doc, /Profitability arithmetic remains B19\.5 service work/i);
  assert.equal(evidence.pass, 'B19.4');
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.nextPass, 'B19.5 Core Project profitability service');
});
