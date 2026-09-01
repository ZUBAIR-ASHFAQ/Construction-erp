import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const browserApi = await readFile('apps/web/src/features/client-billing/api/client-billing-api.ts', 'utf8');
const browserHooks = await readFile('apps/web/src/features/client-billing/hooks/client-billing.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/client-billing/components/client-billing-workspace.tsx', 'utf8');
const repairContract = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const passDoc = await readFile('docs/PASS-375-MODULE-16-CLAIM-SUBMIT-CONTRACT-MAINTENANCE.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Count one literal token inside source text. */
function count(source, token) {
  return source.split(token).length - 1;
}

test('Pass 375 closes exactly the two planned Module-16 repair items', () => {
  assert.match(repairContract, /M16-01[\s\S]{0,500}IMPLEMENTED_PASS_375/);
  assert.match(repairContract, /M16-02[\s\S]{0,500}IMPLEMENTED_PASS_375/);
  assert.match(repairContract, /M16-03[\s\S]{0,500}DEFER_STAGE_26/);
  assert.match(repairContract, /M16-04[\s\S]{0,500}DEFER_STAGE_27/);
});

test('Pass 375 preserves seven reviewed routes and adds exactly two repair routes', () => {
  const reviewed = schema.match(/MODULE_16_HTTP_ROUTES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '';
  const repair = schema.match(/MODULE_16_PASS_375_HTTP_ROUTES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.equal(count(reviewed, 'Object.freeze({ method:'), 7);
  assert.equal(count(repair, 'Object.freeze({ method:'), 2);
  assert.match(repair, /PATCH[\s\S]*contracts\/:id/);
  assert.match(repair, /POST[\s\S]*claims\/:id\/submit/);
});

test('Pass 375 adds no migration permission stable error or domain event vocabulary', () => {
  assert.match(passDoc, /No new Module-16 permission, stable business error, domain event, Prisma model or migration is added/);
  assert.equal(count(schema.match(/MODULE_16_PERMISSION_CODES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '', "'"), 12);
  assert.equal(count(schema.match(/MODULE_16_ERROR_CODES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '', "'"), 10);
  assert.equal(count(schema.match(/MODULE_16_EVENT_TYPES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '', "'"), 10);
});

test('Pass 375 Contract maintenance keeps revised value server-owned and locks terms after submission', () => {
  assert.match(schema, /updateClientContractBodySchema = z\.object\(\{[\s\S]*contractValue[\s\S]*billingMethod[\s\S]*retentionPercent[\s\S]*currency/);
  assert.doesNotMatch(schema.match(/updateClientContractBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\);/)?.[0] ?? '', /revisedValue|projectId|clientId|status/);
  assert.match(repository, /async updateClientContract\b/);
  assert.match(service, /async updateClientContract\b/);
  assert.match(service, /claims\.some\(\(claim\) => !hasStatus\(claim\.status, PROGRESS_CLAIM_DRAFT\)\)/);
  assert.match(service, /revisedValue !== originalValue/);
  assert.match(service, /action: 'client_contract\.updated'/);
  assert.doesNotMatch(service, /eventType: 'client_contract\.updated'/);
});

test('Pass 375 Claim submission creates one durable submitted state before certification', () => {
  assert.match(service, /PROGRESS_CLAIM_SUBMITTED = 'SUBMITTED'/);
  assert.match(service, /operation: 'client-billing\.claim-submit'/);
  assert.match(service, /async submitProgressClaim\b/);
  assert.match(repository, /async updateProgressClaimSubmission\b/);
  assert.match(service, /current\.lines\.length === 0/);
  assert.match(service, /grossValue > moneyToMinorUnits\(lockedContract\.revisedValue\)/);
  assert.match(service, /status: PROGRESS_CLAIM_SUBMITTED/);
  assert.match(service, /eventType: 'progress_claim\.submitted'/);
});

test('Pass 375 certification requires submitted state and no longer emits implicit submit evidence', () => {
  assert.match(service, /!hasStatus\(lockedClaim\.status, PROGRESS_CLAIM_SUBMITTED\)/);
  assert.match(service, /Progress Claim must be submitted before certification/);
  assert.doesNotMatch(service, /implicitSubmitAtCertification/);
  const certificationSection = service.slice(service.indexOf('private async certifyProgressClaimOnce'), service.indexOf('/** Generate one immutable Client Invoice'));
  assert.doesNotMatch(certificationSection, /eventType: 'progress_claim\.submitted'/);
  assert.match(certificationSection, /eventType: 'progress_claim\.certified'/);
});

test('Pass 375 registers both repair routes with existing idempotency and permission-backed services', () => {
  assert.match(routes, /app\.patch\('\/api\/v1\/client-billing\/contracts\/:id'/);
  assert.match(routes, /service\.updateClientContract\(params\.id, body, readIdempotencyKey\(request\)\)/);
  assert.match(routes, /app\.post\('\/api\/v1\/client-billing\/claims\/:id\/submit'/);
  assert.match(routes, /service\.submitProgressClaim\(params\.id, body, readIdempotencyKey\(request\)\)/);
  assert.match(service, /'client_contracts\.manage'/);
  assert.match(service, /'client_claims\.create'/);
});

test('Pass 375 browser API hooks and workspace expose Contract maintenance and Claim submission only', () => {
  for (const fn of ['updateClientContract', 'submitProgressClaim']) assert.match(browserApi, new RegExp(`export function ${fn}\\(`));
  for (const fn of ['useUpdateClientContract', 'useSubmitProgressClaim']) assert.match(browserHooks, new RegExp(`export function ${fn}\\(`));
  assert.match(workspace, /Save Contract terms/);
  assert.match(workspace, /Submit Progress Claim/);
  assert.match(workspace, /selectedClaimIsSubmitted/);
  assert.doesNotMatch(browserApi, /createBillingPayment|postToAr|applyApprovedChange/);
});

test('Pass 375 keeps Stage-26 and Stage-27 integrations deferred', () => {
  assert.match(passDoc, /Client Invoice payment\/AR settlement[\s\S]*Stage 26/);
  assert.match(passDoc, /Change Order -> Client Contract revised-value mapping[\s\S]*Stage 27/);
  assert.doesNotMatch(routes, /\/payments|\/post-ar|\/apply-change/);
});

test('Pass 375 registers one focused gate command', () => {
  assert.equal(rootPackage.scripts['pass-375:module-16-claim-submit-contract-maintenance:gate'], 'node --test tests/pass-375-module-16-claim-submit-contract-maintenance.test.mjs tests/module-16-static.test.mjs');
});
