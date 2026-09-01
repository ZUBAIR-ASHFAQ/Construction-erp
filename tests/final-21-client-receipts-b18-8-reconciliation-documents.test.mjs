import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one project text file relative to the repository root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Extract one named source region for focused ownership assertions. */
function region(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `${startToken} was not found.`);
  const end = endToken ? source.indexOf(endToken, start + startToken.length) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

const receiptRepository = read('apps/api/src/modules/client-receipts/client-receipts.repository.ts');
const receiptService = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
const receiptRoutes = read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
const stageService = read('apps/api/src/modules/project-stages/project-stages.service.ts');
const stageRepository = read('apps/api/src/modules/project-stages/project-stages.repository.ts');
const clientService = read('apps/api/src/modules/clients/clients.service.ts');
const clientRepository = read('apps/api/src/modules/clients/clients.repository.ts');
const projectService = read('apps/api/src/modules/projects/projects.service.ts');
const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');
const projectSchema = read('apps/api/src/modules/projects/projects.schema.ts');
const projectRoutes = read('apps/api/src/modules/projects/projects.routes.ts');
const documentSchema = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
const documentRepository = read('apps/api/src/modules/documents-audit/documents-audit.repository.ts');
const documentService = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
const prisma = read('packages/database/prisma/schema.prisma');
const passDoc = read('docs/PASS-B18-8-FINAL21-CLIENT-RECEIPTS-RECONCILIATION-DOCUMENTS.md');

test('B18.8 centralizes posted receipt and active allocation source reads without stored summary columns', () => {
  const summary = region(receiptRepository, 'async readReceiptFinancialTotals', '/** Find one same-Company Client');
  assert.match(summary, /status: 'POSTED'/);
  assert.match(summary, /clientReceipt\.aggregate/);
  assert.match(summary, /clientReceiptAllocation\.aggregate/);
  assert.match(summary, /receipt: receiptWhere/);
  const receiptModel = prisma.match(/model ClientReceipt \{[\s\S]*?@@map\("client_receipts"\)\n\}/)?.[0] ?? '';
  assert.doesNotMatch(receiptModel, /receivedAmount|allocatedAmount|advanceAmount|outstandingAmount/);
});

test('B18.8 keeps Stage billed owned by issued or posted Client Invoice lines', () => {
  const billed = region(stageRepository, 'async sumStageBilled', '\n  }\n}');
  assert.match(billed, /clientInvoiceLine\.aggregate/);
  assert.match(billed, /stageId/);
  assert.match(billed, /status: \{ in: \['ISSUED', 'POSTED'\] \}/);
  assert.doesNotMatch(billed, /clientReceipt|journalLine/);
});

test('B18.8 derives Stage received, allocated, advance and outstanding without double counting cash plus allocation', () => {
  const financials = region(stageService, 'private async readStageFinancials', '/** Calculate deterministic weighted overall Project progress');
  assert.match(financials, /readReceiptFinancialTotals\(\{ projectId, stageId \}\)/);
  assert.match(financials, /receivedAmount = receipts\.receivedAmount/);
  assert.match(financials, /allocatedReceiptAmount = receipts\.allocatedAmount/);
  assert.match(financials, /advanceAmount: subtractMoneyAmounts\(receivedAmount, allocatedReceiptAmount\)/);
  assert.match(financials, /outstandingAmount: subtractMoneyAmounts\(billedAmount, allocatedReceiptAmount\)/);
  assert.doesNotMatch(financials, /receivedAmount\s*\+\s*allocatedReceiptAmount|allocatedReceiptAmount\s*\+\s*receivedAmount/);
});

test('B18.8 makes explicit Stage tags the Stage cash attribution boundary', () => {
  const summary = region(receiptRepository, 'async readReceiptFinancialTotals', '/** Find one same-Company Client');
  assert.match(summary, /\.\.\.\(input\.stageId \? \{ stageId: input\.stageId \} : \{\}\)/);
  assert.match(passDoc, /untagged receipt remains Project-level for Stage reporting/i);
  assert.match(passDoc, /does not infer a Stage from a multi-line Invoice/i);
});

test('B18.8 exposes Client received, allocated, advance and outstanding as source-derived values', () => {
  assert.doesNotMatch(clientRepository, /clientInvoice\.aggregate/);
  assert.match(clientService, /canReadBilling = hasPermission\('client_billing\.read'\)/);
  assert.match(clientService, /canReadReceipts = hasPermission\('client_receipts\.read'\)/);
  assert.match(clientService, /readReceiptFinancialTotals\(\{ clientId, allowedProjectIds \}\)/);
  assert.match(clientService, /advanceAmount: subtractMoneyAmounts\(receivedAmount, allocatedAmount\)/);
  assert.match(clientService, /outstandingAmount: billedAmount === null \? null : subtractMoneyAmounts\(billedAmount, allocatedAmount\)/);
});

test('B18.8 exposes Project billing and receipt summaries only when the related permissions are effective', () => {
  assert.doesNotMatch(projectRepository, /clientInvoice\.aggregate/);
  assert.match(projectService, /canReadBilling = hasPermission\('client_billing\.read'\)/);
  assert.match(projectService, /canReadReceipts = hasPermission\('client_receipts\.read'\)/);
  assert.match(projectService, /ClientBillingService\(this\.db\)\.getProjectSummary\(projectId\)/);
  assert.match(projectService, /readReceiptFinancialTotals\(\{ projectId \}\)/);
  assert.match(projectService, /receiptSummary:/);
  assert.match(projectSchema, /billingSummary:/);
  assert.match(projectSchema, /receiptSummary:/);
  assert.match(projectRoutes, /PROJECT_RECEIPT_SUMMARY_JSON_SCHEMA/);
});

test('B18.8 keeps invoice outstanding equal to billed minus active allocated receipts while advances stay separate', () => {
  for (const source of [stageService, clientService, projectService]) {
    assert.match(source, /outstandingAmount:[\s\S]{0,120}subtractMoneyAmounts\(billedAmount, allocated/);
  }
  assert.match(clientService, /advanceAmount: subtractMoneyAmounts\(receivedAmount, allocatedAmount\)/);
  assert.match(projectService, /advanceAmount: subtractMoneyAmounts\(receivedAmount, allocatedAmount\)/);
});

test('B18.8 proves cash receipt history remains separate from revenue and profit', () => {
  const createPosting = region(receiptService, "sourceType: 'client_receipt'", "action: 'client_receipt.posted'");
  assert.match(createPosting, /CLIENT-ADVANCE|clientAdvanceAccountId/);
  assert.doesNotMatch(createPosting, /CLIENT-REVENUE|revenueAccount|costActual|profit/i);
  assert.match(passDoc, /cash received is not profit/i);
});

test('B18.8 keeps Finance source keys traceable across posting, allocation and compensating reversals', () => {
  for (const token of [
    'client_receipt:${receiptId}',
    'client_receipt_allocation:${allocationId}',
    'client_receipt_allocation_reversal:${allocationId}',
    'client_receipt_reversal:${receiptId}'
  ]) assert.ok(receiptService.includes(token), `missing ${token}`);
  assert.match(prisma, /@@unique\(\[companyId, sourceKey\]/);
  assert.match(receiptService, /requirePostedFinanceSourceJournal/);
});

test('B18.8 adds client_receipt to Module 21 with same-Project read authorization and Stage metadata', () => {
  assert.match(documentSchema, /'client_receipt'/);
  assert.match(documentRepository, /resourceType === 'client_receipt'/);
  assert.match(documentRepository, /this\.db\.clientReceipt\.findFirst/);
  assert.match(documentRepository, /select: \{ id: true, projectId: true, stageId: true \}/);
  assert.match(documentService, /resourceType === 'client_receipt'[\s\S]*'client_receipts\.read'/);
  assert.match(documentService, /link\.linkedResourceType === 'client_receipt'[\s\S]*'client_receipts\.read'/);
  assert.match(documentService, /document\.projectId && resource\.projectId && document\.projectId !== resource\.projectId/);
});

test('B18.8 keeps the exact six Client Receipts routes and leaves React implementation to B18.9', () => {
  const routeCalls = [...receiptRoutes.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)'/g)];
  const routePaths = routeCalls.map((match) => match[2]);
  assert.equal(routeCalls.length, 6);
  assert.equal(routePaths.some((routePath) => /documents|summary|financials/.test(routePath)), false);
  assert.equal(read('acceptance-evidence/pass-b18-8-client-receipts-reconciliation-documents.json').includes('B18.9 Client Receipts React completion'), true);
});

test('B18.8 adds no migration and preserves the Client Receipts five-file backend module shape', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b18_8|client_receipts.*reconciliation|client_receipts.*documents/i.test(name)), false);
  const files = readdirSync(new URL('apps/api/src/modules/client-receipts/', ROOT)).sort();
  assert.deepEqual(files, [
    'client-receipts.repository.ts',
    'client-receipts.routes.ts',
    'client-receipts.schema.ts',
    'client-receipts.service.ts',
    'index.ts'
  ]);
});
