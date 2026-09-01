import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SCHEMA = 'apps/api/src/modules/client-billing/client-billing.schema.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B17.3 keeps exactly the nine Final-21 Client Billing routes', () => {
  const schema = read(SCHEMA);
  const routes = schema.match(/method: '(?:GET|POST|PATCH|PUT|DELETE)', route: '\/api\/v1\/client-billing/g) ?? [];
  assert.equal(routes.length, 9);
  assert.doesNotMatch(schema, /client-billing\/contracts|retention\/:id\/release|method: 'DELETE'/);
});

test('B17.3 aligns billing methods with the Project commercial model instead of accepting arbitrary text', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /CLIENT_BILLING_METHOD_VALUES = Object\.freeze\(\['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'\]/);
  assert.match(schema, /billingMethodSchema = z\.enum\(CLIENT_BILLING_METHOD_VALUES\)/);
  assert.doesNotMatch(schema, /billingMethodSchema = z\.string/);
});

test('B17.3 keeps trusted ownership numbering status and totals out of write bodies', () => {
  const schema = read(SCHEMA);
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'allowedProjectIds', 'clientId',
    'claimNo', 'grossValue', 'deductions', 'retention', 'netCertified', 'invoiceNo',
    'subtotal', 'taxAmount', 'totalAmount', 'createdBy', 'postedAt'
  ]) assert.ok(schema.includes(`'${field}'`), `missing server-owned field marker ${field}`);

  const createClaim = schema.match(/createClaimBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  const createInvoice = schema.match(/createInvoiceBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  for (const forbidden of ['companyId:', 'clientId:', 'claimNo:', 'status:', 'grossValue:', 'netCertified:']) {
    assert.equal(createClaim.includes(forbidden), false, `claim create must not accept ${forbidden}`);
  }
  for (const forbidden of ['companyId:', 'clientId:', 'invoiceNo:', 'status:', 'subtotal:', 'taxAmount:', 'totalAmount:']) {
    assert.equal(createInvoice.includes(forbidden), false, `invoice create must not accept ${forbidden}`);
  }
});

test('B17.3 validates real calendar dates exact money and four-decimal percentages', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /date must be a valid calendar date/);
  assert.match(schema, /exactPositiveMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /exactNonNegativeMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /percent must use up to 4 decimal places/);
  assert.match(schema, /percent must be between 0 and 100/);
  assert.match(schema, /amount: exactPositiveMoneySchema/);
});

test('B17.3 bounds claim lines pagination and status filters without browser formulas', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /lines: z\.array\(claimLineInputSchema\)\.max\(500\)/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(CLIENT_BILLING_MAX_PAGE_SIZE\)/);
  assert.match(schema, /status: z\.enum\(PROGRESS_CLAIM_STATUS_VALUES\)\.optional\(\)/);
  assert.match(schema, /status: z\.enum\(CLIENT_INVOICE_STATUS_VALUES\)\.optional\(\)/);
  assert.doesNotMatch(schema, /userFormula|formulaExpression|customFormula|expressionSchema/i);
});

test('B17.3 rejects inverted invoice dates at the API boundary', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /createInvoiceBodySchema[\s\S]*dueDate >= value\.invoiceDate/);
  assert.match(schema, /dueDate cannot precede invoiceDate/);
});

test('B17.3 defines strict response contracts for settings claims and invoices', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /projectBillingSettingsResponseSchema = z\.object/);
  assert.match(schema, /claimLineResponseSchema = z\.object/);
  assert.match(schema, /clientInvoiceLineResponseSchema = z\.object/);
  assert.match(schema, /clientInvoiceResponseSchema: z\.ZodTypeAny = z\.object/);
  assert.match(schema, /progressClaimResponseSchema = z\.object/);
  assert.match(schema, /listClaimsResponseSchema = z\.object/);
  assert.match(schema, /listInvoicesResponseSchema = z\.object/);
  assert.match(schema, /grossValue: exactNonNegativeMoneySchema/);
  assert.match(schema, /netCertified: exactNonNegativeMoneySchema/);
  assert.match(schema, /totalAmount: exactNonNegativeMoneySchema/);
});

test('B17.3 boundary remains intact after later service and HTTP completion passes', () => {
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(service, /financePostingDeferred/);
  assert.match(routes, /operationId:/);
  assert.match(prisma, /model ProgressClaimLine \{/);
});

test('B17.3 documents B17.4 as repository-only completion', () => {
  const doc = read('docs/PASS-B17-3-FINAL21-CLIENT-BILLING-BOUNDARY-CONTRACT.md');
  assert.match(doc, /B17\.4 - Client Billing repository completion/i);
  assert.match(doc, /does not change Prisma, repositories, services, routes, or React behavior/i);
});
