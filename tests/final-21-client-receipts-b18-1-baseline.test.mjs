import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('B18.1 records a non-destructive Module 16 alignment audit and frozen build sequence', () => {
  assert.equal(exists('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md'), true);
  const audit = read('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md');
  assert.match(audit, /non-destructive alignment audit/i);
  assert.match(audit, /no production Client Receipts implementation change and no database migration/i);
  for (let pass = 2; pass <= 10; pass += 1) assert.match(audit, new RegExp(`B18\\.${pass}`));
  assert.match(audit, /READY FOR B18\.2/);
});

test('B18.1 freezes the exact Final-21 Client Receipts route, permission and error vocabulary', () => {
  const audit = read('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md');
  for (const route of [
    'GET /api/v1/client-receipts',
    'POST /api/v1/client-receipts',
    'GET /api/v1/client-receipts/:id',
    'POST /api/v1/client-receipts/:id/allocations',
    'POST /api/v1/client-receipts/:id/unallocate',
    'POST /api/v1/client-receipts/:id/reverse'
  ]) assert.ok(audit.includes(route), `missing route ${route}`);

  for (const permission of [
    'client_receipts.read',
    'client_receipts.create',
    'client_receipts.allocate',
    'client_receipts.reverse'
  ]) assert.ok(audit.includes(permission), `missing permission ${permission}`);

  for (const code of [
    'RECEIPT_NOT_FOUND',
    'ALLOCATION_EXCEEDS_RECEIPT',
    'ALLOCATION_EXCEEDS_INVOICE',
    'RECEIPT_SCOPE_MISMATCH',
    'RECEIPT_LOCKED'
  ]) assert.ok(audit.includes(code), `missing error ${code}`);
});

test('B18.1 confirms all hard prerequisite modules are registered before Module 16 begins', () => {
  const app = read('apps/api/src/app.ts');
  for (const registration of [
    'registerClientsRoutes',
    'registerProjectsRoutes',
    'registerProjectStagesRoutes',
    'registerFinanceRoutes',
    'registerClientBillingRoutes',
    'registerDocumentsRoutes'
  ]) assert.ok(app.includes(registration), `missing prerequisite ${registration}`);
});

test('B18.1 confirms Client Billing exposes immutable Stage-aware source invoices for later allocation', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const billingService = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  assert.match(prisma, /model ClientInvoice\b/);
  assert.match(prisma, /model ClientInvoiceLine\b/);
  assert.match(prisma, /stage\s+ProjectStage\?/);
  assert.match(billingService, /postSourceJournalInTransaction/);
  assert.match(billingService, /client_invoice:/);
});

test('B18.1 confirms Finance and Foundation seams required by receipt posting are already available', () => {
  const financeRepository = read('apps/api/src/modules/finance/finance.repository.ts');
  const financeService = read('apps/api/src/modules/finance/finance.service.ts');
  const numberingTypes = read('packages/numbering/src/types.ts');
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(financeRepository, /findCashBankAccountById/);
  assert.match(financeService, /postSourceJournalInTransaction/);
  assert.match(numberingTypes, /'client-receipt'/);
  assert.match(prisma, /model CashBankAccount\b/);
  assert.match(prisma, /@@unique\(\[companyId, sourceKey\]/);
});

test('B18.1 historical Stage hook is fulfilled only after Module 16 becomes the receipt source', () => {
  const stageService = read('apps/api/src/modules/project-stages/project-stages.service.ts');
  const stageRepository = read('apps/api/src/modules/project-stages/project-stages.repository.ts');
  const audit = read('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md');
  assert.match(stageRepository, /sumStageBilled/);
  assert.match(audit, /Client Receipts is generated later in the approved sequence/i);
  assert.match(stageService, /readReceiptFinancialTotals\(\{ projectId, stageId \}\)/);
  assert.match(stageService, /allocatedReceiptAmount/);
});

test('B18.1 historical Client summary gap is fulfilled from source-derived Module 16 totals', () => {
  const clientService = read('apps/api/src/modules/clients/clients.service.ts');
  const clientRepository = read('apps/api/src/modules/clients/clients.repository.ts');
  const audit = read('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md');
  assert.doesNotMatch(clientRepository, /clientInvoice\.aggregate/);
  assert.match(audit, /receipt summary as unavailable/i);
  assert.match(clientService, /canReadReceipts = hasPermission\('client_receipts\.read'\)/);
  assert.match(clientService, /receiptSummary:/);
  assert.match(clientService, /readReceiptFinancialTotals\(\{ clientId, allowedProjectIds \}\)/);
  assert.doesNotMatch(clientService, /manualReceiptBalance|storedReceiptBalance/);
});

test('B18.1 historical Module 21 gap is fulfilled by B18.8 after the receipt owner exists', () => {
  const documentSchema = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  const audit = read('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md');
  assert.match(documentSchema, /'client_receipt'/);
  assert.match(audit, /does not yet allow `client_receipt`/i);
  assert.match(audit, /B18\.8 should extend the existing Documents authorization seam/i);
});

test('B18.1 preserves the originally observed missing Module 16 persistence as historical audit evidence', () => {
  const audit = read('docs/PASS-B18-1-FINAL21-CLIENT-RECEIPTS-ALIGNMENT-AUDIT.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-1-client-receipts-alignment-audit.json'));
  assert.match(audit, /no `ClientReceipt` or `ClientReceiptAllocation` model exists yet/i);
  assert.match(audit, /B18\.2 must add only the two required ownership records/i);
  assert.equal(evidence.baseline.backendModulePresent, false);
  assert.equal(evidence.baseline.reactFeaturePresent, false);
  assert.match(audit, /Gap 3 - Receipt repository does not exist/i);
});

test('B18.1 evidence records the expected source-of-truth boundaries', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-1-client-receipts-alignment-audit.json'));
  assert.equal(evidence.pass, 'B18.1');
  assert.equal(evidence.productionFilesChanged, false);
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.baseline.requiredRouteCount, 6);
  assert.equal(evidence.nextPass, 'B18.2 Client Receipts persistence integrity');
  assert.ok(evidence.criticalRules.includes('received cash is not profit by itself'));
});
