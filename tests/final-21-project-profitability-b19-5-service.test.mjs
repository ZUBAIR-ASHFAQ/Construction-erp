import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/project-profitability/';
const SERVICE = `${MODULE}project-profitability.service.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B19.5 keeps the five-file backend shape and preserves its service checkpoint after B19.7 registration', () => {
  const files = readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'index.ts',
    'project-profitability.repository.ts',
    'project-profitability.routes.ts',
    'project-profitability.schema.ts',
    'project-profitability.service.ts'
  ]);
  const service = read(SERVICE);
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-5-project-profitability-service.json'));
  assert.match(service, /export class ProjectProfitabilityService/);
  assert.match(service, /async getProjectSummary\(/);
  assert.equal(evidence.pass, 'B19.5');
  assert.match(read(`${MODULE}project-profitability.routes.ts`), /export async function registerProjectProfitabilityRoutes/);
  assert.match(read('apps/api/src/app.ts'), /registerProjectProfitabilityRoutes/);
});

test('B19.5 revalidates trusted Project scope plus read and finance permissions in the service', () => {
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /security\.projectScope\.kind === 'not-resolved'/);
  assert.match(service, /security\.projectScope\.kind === 'restricted'/);
  assert.match(service, /project_profitability\.read/);
  assert.match(service, /project_profitability\.finance\.read/);
  assert.match(service, /PROFITABILITY_SCOPE_FORBIDDEN/g);
});

test('B19.5 uses signed integer minor-unit arithmetic and no floating-point money helpers', () => {
  const service = read(SERVICE);
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /BigInt/);
  assert.match(service, /const sign = match\[1\] === '-' \? -1n : 1n/);
  assert.match(service, /function minorUnitsToMoney/);
  assert.doesNotMatch(service, /parseFloat\(|toFixed\(|Math\.round\(|Number\(.*amount/i);
});

test('B19.5 builds an inclusive UTC as-of window for business and durable posting history', () => {
  const service = read(SERVICE);
  assert.match(service, /T00:00:00\.000Z/);
  assert.match(service, /T23:59:59\.999Z/);
  assert.match(service, /throughDate: inputDate\(asOfDate\)/);
  assert.match(service, /postedThrough: endOfInputDate\(asOfDate\)/);
});

test('B19.5 Project summary reads all five frozen source groups in parallel', () => {
  const service = read(SERVICE);
  assert.match(service, /Promise\.all\(\[/);
  for (const method of [
    'listActualCostSources',
    'listBilledSources',
    'listRecognizedRevenueSources',
    'listClientReceiptFinanceSources',
    'listSupplierPayableSources'
  ]) assert.ok(service.includes(method), `missing source read ${method}`);
});

test('B19.5 requires Finance-confirmed ownership for every billed Client Invoice', () => {
  const service = read(SERVICE);
  assert.match(service, /function requireRecognizedRevenueOwnership/);
  assert.match(service, /source\.journal\.sourceType === 'client_invoice'/);
  assert.match(service, /if \(!financeInvoiceIds\.has\(invoiceId\)\).*PROFITABILITY_SOURCE_INCOMPLETE/);
  assert.match(service, /requireRecognizedRevenueOwnership\(billedSources, revenueSources\)/);
});

test('B19.5 recognized revenue is Revenue credits minus debits and remains independent of cash received', () => {
  const service = read(SERVICE);
  const recognized = service.match(/function calculateRecognizedRevenue[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(recognized, /moneyToMinorUnits\(row\.credit\) - moneyToMinorUnits\(row\.debit\)/);
  assert.doesNotMatch(recognized, /received|receiptFinancials/);
  const profitLine = service.match(/const profitAmount = .*;/)?.[0] ?? '';
  assert.equal(profitLine.trim(), 'const profitAmount = recognizedRevenue - actualCost;');
  assert.doesNotMatch(profitLine, /received|allocated|billed|payable/i);
});

test('B19.5 reconstructs receipt cash and allocations from durable Finance source and reversal history', () => {
  const service = read(SERVICE);
  for (const sourceType of [
    "case 'client_receipt':",
    "case 'client_receipt_reversal':",
    "case 'client_receipt_allocation':",
    "case 'client_receipt_allocation_reversal':",
    "case 'REVERSAL':"
  ]) assert.ok(service.includes(sourceType), `missing receipt Finance behavior ${sourceType}`);
  assert.match(service, /return \{ received: -originalEffect\.received, allocated: -originalEffect\.allocated \}/);
  assert.match(service, /calculateReceiptFinancials\(receiptSources\)/);
});

test('B19.5 keeps advance and outstanding separate and rejects impossible negative positions', () => {
  const service = read(SERVICE);
  assert.match(service, /receiptFinancials\.allocated > receiptFinancials\.received/);
  assert.match(service, /receiptFinancials\.allocated > billedAmount/);
  assert.match(service, /const advanceAmount = receiptFinancials\.received - receiptFinancials\.allocated/);
  assert.match(service, /const outstandingAmount = billedAmount - receiptFinancials\.allocated/);
  assert.doesNotMatch(service, /outstandingAmount\s*=\s*billedAmount\s*-\s*receiptFinancials\.received/);
});

test('B19.5 derives Supplier payable from posted invoice totals less posted payment allocations', () => {
  const service = read(SERVICE);
  const payable = service.match(/function calculateSupplierPayable[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(payable, /totalAmount/);
  assert.match(payable, /invoice\.allocations/);
  assert.match(payable, /allocated > total/);
  assert.match(payable, /total - allocated/);
  assert.doesNotMatch(payable, /recognizedRevenue|receiptFinancials|receivedAmount/i);
});

test('B19.5 emits the frozen response contract with all nine financial concepts kept separate', () => {
  const service = read(SERVICE);
  assert.match(service, /projectProfitabilitySummaryResponseSchema\.parse\(\{/);
  for (const field of [
    'recognizedRevenue',
    'actualCost',
    'profitAmount',
    'billedAmount',
    'receivedAmount',
    'allocatedAmount',
    'advanceAmount',
    'outstandingAmount',
    'supplierPayableAmount'
  ]) assert.ok(service.includes(`${field}:`), `missing response field ${field}`);
});

test('B19.5 remains read-only and adds no profitability persistence or migration', () => {
  const service = read(SERVICE);
  assert.doesNotMatch(service, /\.create\(|\.update\(|\.delete\(|\.upsert\(|\$transaction\(/);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model ProjectProfitability|model ProjectProfitabilitySnapshot/);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b19_5/i.test(name)), false);
});

test('B19.5 exports the service and records the B19.6 handoff', () => {
  const index = read(`${MODULE}index.ts`);
  const doc = read('docs/PASS-B19-5-FINAL21-PROJECT-PROFITABILITY-SERVICE.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b19-5-project-profitability-service.json'));
  assert.match(index, /export \{ ProjectProfitabilityService \}/);
  assert.match(doc, /profit = recognized revenue - actual cost/i);
  assert.match(doc, /Client cash.*not profit/i);
  assert.match(doc, /Stage, trend and portfolio.*B19\.6/i);
  assert.equal(evidence.pass, 'B19.5');
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.nextPass, 'B19.6 Stage, trend and portfolio service');
});
