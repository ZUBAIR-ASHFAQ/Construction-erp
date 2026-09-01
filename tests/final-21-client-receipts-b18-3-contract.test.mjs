import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SCHEMA = 'apps/api/src/modules/client-receipts/client-receipts.schema.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B18.3 preserves its boundary-schema checkpoint as historical generation evidence', () => {
  const schema = read(SCHEMA);
  const doc = read('docs/PASS-B18-3-FINAL21-CLIENT-RECEIPTS-BOUNDARY-CONTRACT.md');
  assert.match(schema, /CLIENT_RECEIPT_HTTP_ROUTES/);
  assert.match(doc, /B18\.3 intentionally creates only/i);
  assert.match(doc, /becomes a complete five-file backend module in B18\.4/i);
});

test('B18.3 freezes exactly the four Final-21 Client Receipt permissions', () => {
  const schema = read(SCHEMA);
  for (const permission of [
    'client_receipts.read',
    'client_receipts.create',
    'client_receipts.allocate',
    'client_receipts.reverse'
  ]) assert.match(schema, new RegExp(`'${permission.replace('.', '\\.')}'`));
  const section = schema.match(/CLIENT_RECEIPT_PERMISSION_CODES = Object\.freeze\(\[[\s\S]*?\]\s+as const\)/)?.[0] ?? '';
  assert.equal((section.match(/client_receipts\./g) ?? []).length, 4);
});

test('B18.3 freezes exactly the five stable Module 16 business errors', () => {
  const schema = read(SCHEMA);
  for (const code of [
    'RECEIPT_NOT_FOUND',
    'ALLOCATION_EXCEEDS_RECEIPT',
    'ALLOCATION_EXCEEDS_INVOICE',
    'RECEIPT_SCOPE_MISMATCH',
    'RECEIPT_LOCKED'
  ]) assert.match(schema, new RegExp(`'${code}'`));
  const section = schema.match(/CLIENT_RECEIPT_ERROR_CODES = Object\.freeze\(\[[\s\S]*?\]\s+as const\)/)?.[0] ?? '';
  assert.equal((section.match(/'RECEIPT_|'ALLOCATION_/g) ?? []).length, 5);
});

test('B18.3 keeps exactly the six required Client Receipt HTTP routes', () => {
  const schema = read(SCHEMA);
  const routes = schema.match(/method: '(?:GET|POST|PATCH|PUT|DELETE)', route: '\/api\/v1\/client-receipts/g) ?? [];
  assert.equal(routes.length, 6);
  assert.match(schema, /route: '\/api\/v1\/client-receipts' \}/);
  assert.match(schema, /route: '\/api\/v1\/client-receipts\/:id' \}/);
  assert.match(schema, /route: '\/api\/v1\/client-receipts\/:id\/allocations' \}/);
  assert.match(schema, /route: '\/api\/v1\/client-receipts\/:id\/unallocate' \}/);
  assert.match(schema, /route: '\/api\/v1\/client-receipts\/:id\/reverse' \}/);
  assert.doesNotMatch(schema, /method: 'PATCH'|method: 'PUT'|method: 'DELETE'/);
});

test('B18.3 freezes Cash Bank, receipt classification, and immutable lifecycle vocabularies', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /CLIENT_RECEIPT_PAYMENT_METHOD_VALUES = Object\.freeze\(\['CASH', 'BANK'\]/);
  assert.match(schema, /CLIENT_RECEIPT_TYPE_VALUES = Object\.freeze\(\['ADVANCE', 'INVOICE_PAYMENT'\]/);
  assert.match(schema, /CLIENT_RECEIPT_STATUS_VALUES = Object\.freeze\(\['POSTED', 'REVERSED'\]/);
  assert.match(schema, /paymentMethodSchema = z\.enum\(CLIENT_RECEIPT_PAYMENT_METHOD_VALUES\)/);
  assert.match(schema, /receiptTypeSchema = z\.enum\(CLIENT_RECEIPT_TYPE_VALUES\)/);
  assert.match(schema, /receiptStatusSchema = z\.enum\(CLIENT_RECEIPT_STATUS_VALUES\)/);
});

test('B18.3 validates real dates exact positive money and bounded list filters', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /date must be a valid calendar date/);
  assert.match(schema, /exactPositiveMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /exactNonNegativeMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(CLIENT_RECEIPT_MAX_PAGE_SIZE\)/);
  assert.match(schema, /toDate cannot precede fromDate/);
});

test('B18.3 receipt creation accepts only business inputs and never trusts server-owned authority', () => {
  const schema = read(SCHEMA);
  const body = schema.match(/createClientReceiptBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  for (const required of [
    'clientId:', 'projectId:', 'stageId:', 'receiptDate:', 'amount:', 'paymentMethod:',
    'cashBankAccountId:', 'reference:', 'receiptType:'
  ]) assert.ok(body.includes(required), `missing receipt input ${required}`);
  for (const forbidden of [
    'companyId:', 'receiptNo:', 'status:', 'createdBy:', 'postedAt:', 'allocatedAmount:',
    'unallocatedAmount:', 'invoiceOutstanding:', 'financeSourceKey:'
  ]) assert.equal(body.includes(forbidden), false, `receipt create must not accept ${forbidden}`);
});

test('B18.3 separates receipt posting from allocation, unallocation and reversal commands', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /allocateClientReceiptBodySchema = z\.object\(\{[\s\S]*clientInvoiceId: uuidSchema,[\s\S]*amount: exactPositiveMoneySchema/);
  assert.match(schema, /unallocateClientReceiptBodySchema = z\.object\(\{[\s\S]*allocationId: uuidSchema/);
  assert.match(schema, /reverseClientReceiptBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  const createBody = schema.match(/createClientReceiptBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  assert.doesNotMatch(createBody, /clientInvoiceId:/);
});

test('B18.3 marks authority totals and allocation metadata as server-owned fields', () => {
  const schema = read(SCHEMA);
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'allowedProjectIds', 'receiptNo',
    'status', 'createdBy', 'postedAt', 'allocatedAt', 'allocatedBy', 'allocatedAmount',
    'unallocatedAmount', 'invoiceOutstanding', 'financeSourceKey'
  ]) assert.ok(schema.includes(`'${field}'`), `missing server-owned marker ${field}`);
});

test('B18.3 defines strict receipt allocation detail and paginated response contracts', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /clientReceiptAllocationResponseSchema = z\.object/);
  assert.match(schema, /clientReceiptResponseSchema = z\.object/);
  assert.match(schema, /listClientReceiptsResponseSchema = z\.object/);
  assert.match(schema, /allocatedAmount: exactNonNegativeMoneySchema/);
  assert.match(schema, /unallocatedAmount: exactNonNegativeMoneySchema/);
  assert.match(schema, /allocations: z\.array\(clientReceiptAllocationResponseSchema\)/);
});

test('B18.3 maps all stable receipt errors into the shared error envelope', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /export function createClientReceiptError\(code: ClientReceiptErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError\(\{ code, message: 'Client receipt was not found\.' \}\)/);
  assert.equal((schema.match(/new ConflictError/g) ?? []).length >= 4, true);
});

test('B18.3 documents B18.4 as repository and five-file module completion', () => {
  const doc = read('docs/PASS-B18-3-FINAL21-CLIENT-RECEIPTS-BOUNDARY-CONTRACT.md');
  assert.match(doc, /B18\.4 - Client Receipts repository completion/i);
  assert.match(doc, /five-file backend module/i);
  assert.match(doc, /does not add a repository, service, routes, route registration, React feature, or migration/i);
});
