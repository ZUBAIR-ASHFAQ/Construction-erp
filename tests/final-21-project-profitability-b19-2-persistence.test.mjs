import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Return all forward migration directory names in stable order. */
function migrationNames() {
  return readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Extract one Prisma model block for focused source assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let index = start; index < schema.length; index += 1) {
    if (schema[index] === '{') depth += 1;
    if (schema[index] === '}') {
      depth -= 1;
      if (depth === 0) return schema.slice(start, index + 1);
    }
  }
  return '';
}

test('B19.2 freezes a no-authoritative-persistence read-model decision', () => {
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');
  assert.match(doc, /read-only derived module with no authoritative table/i);
  assert.match(doc, /no snapshot table/i);
  assert.match(doc, /no SQL\/materialized view/i);
  assert.match(doc, /no database migration/i);
  assert.match(doc, /build the read model at request time/i);
});

test('B19.2 adds no profitability model, snapshot model, SQL view or migration', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model\s+ProjectProfitability\b/);
  assert.doesNotMatch(prisma, /model\s+ProjectProfitabilitySnapshot\b/);
  assert.doesNotMatch(prisma, /@@map\("project_profitability_snapshots"\)/);

  const migrations = migrationNames();
  assert.ok(migrations.length >= 88);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-2-project-profitability-persistence-read-model.json'));
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(migrations.some((name) => /b19_2/i.test(name)), false);
  const migrationText = migrations.map((name) => read(`packages/database/prisma/migrations/${name}/migration.sql`)).join('\n');
  assert.doesNotMatch(migrationText, /CREATE\s+(?:MATERIALIZED\s+)?VIEW\s+[^;]*project[_-]?profitability/i);
});

test('B19.2 preserves its historical production-folder deferral evidence after the B19.9 React handoff', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-2-project-profitability-persistence-read-model.json'));
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');
  assert.equal(evidence.productionFilesChanged, false);
  assert.equal(exists('apps/api/src/modules/project-profitability/'), true);
  assert.equal(exists('apps/web/src/features/project-profitability/'), true);
  assert.match(doc, /does not add:[\s\S]*apps\/api\/src\/modules\/project-profitability\//i);
  assert.match(doc, /B19\.3 - Project Profitability boundary contract/i);
});

test('B19.2 freezes actual cost as source-derived CostActual posting-date history', () => {
  const actual = prismaModel('CostActual');
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');
  assert.match(actual, /projectId\s+String/);
  assert.match(actual, /stageId\s+String\?/);
  assert.match(actual, /amount\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.match(actual, /postingDate\s+DateTime/);
  assert.doesNotMatch(actual, /\bstatus\b/);
  assert.match(doc, /postingDate <= asOfDate/);
  assert.match(doc, /stageId = null.*Project-only cost/i);
});

test('B19.2 separates billed Client Invoices from Finance-confirmed recognized revenue', () => {
  const invoice = prismaModel('ClientInvoice');
  const billingService = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const financeService = read('apps/api/src/modules/finance/finance.service.ts');
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');

  assert.match(invoice, /invoiceDate\s+DateTime/);
  assert.match(invoice, /status\s+String/);
  assert.match(billingService, /sourceType:\s*'client_invoice'/);
  assert.match(billingService, /sourceKey/);
  assert.match(financeService, /sourceType:\s*JOURNAL_SOURCE_REVERSAL/);
  assert.match(financeService, /postedAt/);
  assert.match(doc, /Billed is a receivable\/billing measure, not cash and not automatically profit/i);
  assert.match(doc, /Recognized Client Billing revenue is the net revenue-account effect/i);
});

test('B19.2 requires durable Finance history for historical receipt and allocation as-of calculations', () => {
  const receiptRepository = read('apps/api/src/modules/client-receipts/client-receipts.repository.ts');
  const receiptService = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');

  assert.match(receiptRepository, /status:\s*'POSTED'/);
  assert.match(receiptRepository, /deleteAllocation\(/);
  assert.match(receiptRepository, /status:\s*'REVERSED'/);
  assert.match(receiptService, /sourceType:\s*'client_receipt_reversal'/);
  assert.match(receiptService, /sourceType:\s*'client_receipt_allocation_reversal'/);
  assert.match(doc, /historical Project Profitability `asOfDate` calculations must reconstruct cash\/allocation effects from durable Finance posting history/i);
});

test('B19.2 preserves Supplier Payables as posted invoice/payment allocation history', () => {
  const repository = read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts');
  const service = read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');
  assert.match(repository, /status:\s*'POSTED'/);
  assert.match(repository, /invoiceDate:\s*\{\s*lte:\s*input\.invoiceDateThrough/);
  assert.match(repository, /allocatedAt:\s*\{\s*lte:\s*input\.allocatedThrough/);
  assert.match(repository, /supplierPayment:\s*\{\s*companyId:\s*scope\.companyId,\s*status:\s*'POSTED'/);
  assert.match(service, /endOfInputDate/);
  assert.match(doc, /Supplier payable is a financial-position value and is separate from Project profit/i);
});

test('B19.2 freezes non-guessing Stage reconciliation for Project-only source rows', () => {
  const doc = read('docs/PASS-B19-2-FINAL21-PROJECT-PROFITABILITY-PERSISTENCE-READ-MODEL.md');
  assert.match(doc, /Project-only actual cost.*must not be distributed across Stages/i);
  assert.match(doc, /Project-level invoice\/revenue lines remain Project-only/i);
  assert.match(doc, /sum\(stages\) \+ projectOnly = projectTotal/i);
});

test('B19.2 evidence records zero production and migration change with B19.3 handoff', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-2-project-profitability-persistence-read-model.json'));
  assert.equal(evidence.pass, 'B19.2');
  assert.equal(evidence.productionFilesChanged, false);
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.persistenceDecision.authoritativeProfitabilityTable, false);
  assert.equal(evidence.persistenceDecision.snapshotCache, false);
  assert.equal(evidence.persistenceDecision.sqlOrMaterializedView, false);
  assert.equal(evidence.persistenceDecision.runtimeReadModel, true);
  assert.equal(evidence.nextPass, 'B19.3 Project Profitability boundary contract');
});
