import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const passDoc = await readFile('docs/PASS-B17-7-FINAL21-CLIENT-BILLING-HTTP-OPENAPI.md', 'utf8');

/** Count one literal token in the Client Billing route source. */
function count(token) {
  return routes.split(token).length - 1;
}

test('B17.7 keeps exactly nine public Client Billing routes and documents each operation', () => {
  assert.equal(count('app.get(') + count('app.post(') + count('app.patch(') + count('app.put(') + count('app.delete('), 9);
  assert.equal(count('operationId:'), 9);
  assert.equal(count("security: BEARER_SECURITY"), 9);
  assert.equal(count('response: {'), 9);
  assert.doesNotMatch(routes, /client-billing\/contracts|retention\/:id\/release|app\.delete\(/);
});

test('B17.7 documents params queries bodies and idempotency only where the nine-route contract needs them', () => {
  assert.equal(count('params:'), 6);
  assert.equal(count('querystring:'), 2);
  assert.equal(count('body:'), 5);
  assert.equal(count('headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA'), 5);
  assert.match(routes, /required: \['idempotency-key'\]/);
  assert.match(routes, /maxLength: 200/);
});

test('B17.7 fixes the protected-route authentication hook to pass the configured database', () => {
  assert.match(routes, /const authenticate = async \(request: FastifyRequest\): Promise<void> => authenticateRequest\(request, options\.database\)/);
  assert.equal(count('preHandler: [authenticate]'), 9);
  assert.doesNotMatch(routes, /preHandler:\s*\[authenticateRequest\]/);
});

test('B17.7 exposes bounded request schemas without trusting ownership totals or arbitrary formulas', () => {
  assert.match(routes, /CLAIMS_QUERY_JSON_SCHEMA/);
  assert.match(routes, /INVOICES_QUERY_JSON_SCHEMA/);
  assert.match(routes, /maximum: 100/);
  assert.match(routes, /maxItems: 500/);
  assert.match(routes, /BILLING_METHOD_JSON_SCHEMA = \{ type: 'string', enum: \['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'\] \}/);
  for (const forbidden of ['companyId:', 'actorUserId:', 'grossValue:', 'netCertified:', 'subtotal:', 'totalAmount:']) {
    const bodies = routes.slice(routes.indexOf('const SETTINGS_BODY_JSON_SCHEMA'), routes.indexOf('const CLAIM_LINE_JSON_SCHEMA'));
    assert.equal(bodies.includes(forbidden), false, `HTTP write schemas must not accept ${forbidden}`);
  }
});

test('B17.7 documents strict success envelopes for settings claims and invoices', () => {
  assert.match(routes, /SETTINGS_JSON_SCHEMA/);
  assert.match(routes, /CLAIM_JSON_SCHEMA/);
  assert.match(routes, /INVOICE_JSON_SCHEMA/);
  assert.match(routes, /CLAIM_LIST_JSON_SCHEMA/);
  assert.match(routes, /INVOICE_LIST_JSON_SCHEMA/);
  assert.equal(count('dataEnvelope('), 10); // helper declaration plus nine route responses
});

test('B17.7 validates service output through the B17.3 Zod response contracts before sending', () => {
  assert.match(routes, /projectBillingSettingsResponseSchema\.parse/);
  assert.match(routes, /progressClaimResponseSchema\.parse/);
  assert.match(routes, /listClaimsResponseSchema\.parse/);
  assert.match(routes, /clientInvoiceResponseSchema\.parse/);
  assert.match(routes, /listInvoicesResponseSchema\.parse/);
});

test('B17.7 documents the stable error envelope and Client Billing business error vocabulary', () => {
  for (const code of ['CLAIM_NOT_FOUND', 'CLAIM_LOCKED', 'INVOICE_NOT_FOUND', 'INVALID_BILLING_BASIS', 'BILLING_STAGE_INVALID']) {
    assert.ok(schema.includes(`'${code}'`), `missing stable business error ${code}`);
  }
  assert.match(routes, /CLIENT_BILLING_ERROR_CODES\.join/);
  assert.match(routes, /required: \['code', 'message', 'requestId'\]/);
  assert.match(routes, /400: ERROR_JSON_SCHEMA/);
  assert.match(routes, /401: ERROR_JSON_SCHEMA/);
  assert.match(routes, /403: ERROR_JSON_SCHEMA/);
  assert.match(routes, /404: ERROR_JSON_SCHEMA/);
  assert.match(routes, /409: ERROR_JSON_SCHEMA/);
  assert.match(routes, /500: ERROR_JSON_SCHEMA/);
  assert.match(routes, /503: ERROR_JSON_SCHEMA/);
});

test('B17.7 keeps finalization an explicit empty command and invoice dates documented', () => {
  assert.match(routes, /EMPTY_COMMAND_BODY_JSON_SCHEMA = \{ type: 'object', additionalProperties: false, maxProperties: 0 \}/);
  assert.match(routes, /Due date in YYYY-MM-DD; the API requires it to be on or after invoiceDate/);
  assert.match(routes, /finalizeClaimBodySchema/);
  assert.match(routes, /createInvoiceBodySchema/);
});

test('B17.7 remains HTTP-only and documents B17.8 as the next cross-module reconciliation pass', () => {
  assert.match(passDoc, /No Prisma schema or migration change/i);
  assert.match(passDoc, /No repository or service business-rule change/i);
  assert.match(passDoc, /exact nine-route boundary/i);
  assert.match(passDoc, /B17\.8/i);
  assert.match(passDoc, /cross-module reconciliation/i);
});
