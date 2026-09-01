import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BACKEND = 'apps/api/src/modules/client-billing';
const WEB = 'apps/web/src/features/client-billing';
const LIVE = 'tests/integration/final-21-client-billing-api.integration.test.mjs';
const E2E = 'tests/e2e/final-21-client-billing-browser.spec.mjs';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Freeze the simple five-file backend and four-folder React Module 15 structure. */
test('B17.10 freezes the simple Client Billing module structure', () => {
  assert.deepEqual(readdirSync(new URL(`../${BACKEND}`, import.meta.url)).sort(), [
    'client-billing.repository.ts',
    'client-billing.routes.ts',
    'client-billing.schema.ts',
    'client-billing.service.ts',
    'index.ts'
  ]);
  assert.deepEqual(readdirSync(new URL(`../${WEB}`, import.meta.url)).sort(), ['api', 'components', 'hooks', 'pages']);
});

/** Freeze exactly the nine Final Module 15 operations and reject generic CRUD expansion. */
test('B17.10 freezes exactly nine Client Billing HTTP operations', () => {
  const schema = read(`${BACKEND}/client-billing.schema.ts`);
  const expected = [
    "GET', route: '/api/v1/client-billing/projects/:projectId/settings'",
    "PUT', route: '/api/v1/client-billing/projects/:projectId/settings'",
    "GET', route: '/api/v1/client-billing/claims'",
    "POST', route: '/api/v1/client-billing/claims'",
    "PATCH', route: '/api/v1/client-billing/claims/:id'",
    "POST', route: '/api/v1/client-billing/claims/:id/finalize'",
    "POST', route: '/api/v1/client-billing/claims/:id/invoice'",
    "GET', route: '/api/v1/client-billing/invoices'",
    "GET', route: '/api/v1/client-billing/invoices/:id'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/client-billing/g) ?? []).length, 9);
  assert.doesNotMatch(schema, /\/reverse|\/delete|\/archive|\/approve|DELETE'.*client-billing|PATCH'.*invoices/);
});

/** Freeze the required Client Billing persistence without adding receipt, balance or duplicate accounting state. */
test('B17.10 freezes Client Billing persistence and forward migration history', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['ProjectBillingSetting', 'ProgressClaim', 'ProgressClaimLine', 'ClientInvoice', 'ClientInvoiceLine']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`));
  }
  for (const table of ['project_billing_settings', 'progress_claims', 'progress_claim_lines', 'client_invoices', 'client_invoice_lines']) {
    assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
  }
  assert.doesNotMatch(prisma, /clientInvoiceOutstanding|clientInvoiceReceived|clientInvoiceAdvance|receiptBalance/);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.ok(migrations.includes('20260830000300_final21_client_billing_persistence_integrity'));
  assert.ok(migrations.includes('20260830000400_final21_client_billing_cross_module_reconciliation'));
});

/** Freeze Fixed Price and Cost + Percentage billing-basis separation from physical progress. */
test('B17.10 freezes Client Billing basis and certification invariants', () => {
  const service = read(`${BACKEND}/client-billing.service.ts`);
  assert.match(service, /billingMethod !== project\.projectModel/);
  assert.match(service, /billingMethod === 'COST_PLUS_PERCENTAGE'/);
  assert.match(service, /sumProjectCostActuals/);
  assert.match(service, /sumStageCostActuals/);
  assert.match(service, /sumFinalizedClaimGross/);
  assert.match(service, /sumFinalizedClaimLinesByStage/);
  assert.match(service, /const retention = percentageOf\(gross, settings\?\.retentionPercent \?\? null\)/);
  assert.match(service, /const deductions = 0n/);
  assert.doesNotMatch(service, /stage.*progress.*create.*claim|physical.*progress.*amount/i);
});

/** Freeze Stage-preserving Client Invoice and atomic Finance/AR ownership. */
test('B17.10 freezes Client Invoice Stage and Finance reconciliation', () => {
  const service = read(`${BACKEND}/client-billing.service.ts`);
  const stageRepository = read('apps/api/src/modules/project-stages/project-stages.repository.ts');
  assert.match(service, /client_invoice:\$\{invoiceId\}/);
  assert.match(service, /allocateCertifiedInvoiceLines\(claim\.lines, subtotal, accounts\.revenue\.id\)/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /projectId: invoice\.projectId,\s*stageId: line\.stageId/);
  assert.match(stageRepository, /status: \{ in: \['ISSUED', 'POSTED'\] \}/);
  assert.doesNotMatch(stageRepository, /progressClaimLine|journalLine/);
});

/** Freeze stable permissions, errors, idempotency and Module 21 document ownership. */
test('B17.10 freezes authorization, error and Documents boundaries', () => {
  const schema = read(`${BACKEND}/client-billing.schema.ts`);
  const routes = read(`${BACKEND}/client-billing.routes.ts`);
  const documents = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  for (const code of ['client_billing.read', 'client_billing.settings.manage', 'claims.create', 'claims.edit', 'claims.finalize', 'client_invoices.create', 'client_invoices.read']) {
    assert.ok(schema.includes(`'${code}'`), `missing permission ${code}`);
  }
  for (const code of ['CLAIM_NOT_FOUND', 'CLAIM_LOCKED', 'INVOICE_NOT_FOUND', 'INVALID_BILLING_BASIS', 'BILLING_STAGE_INVALID']) {
    assert.ok(schema.includes(`'${code}'`), `missing error ${code}`);
  }
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 5);
  assert.match(documents, /resourceType === 'client_invoice'/);
  assert.match(documents, /client_invoices\.read/);
});

/** Freeze the browser workflow without moving receipt, outstanding or accounting authority into React. */
test('B17.10 freezes the Client Billing React workflow', () => {
  const workspace = read(`${WEB}/components/client-billing-workspace.tsx`);
  const api = read(`${WEB}/api/client-billing-api.ts`);
  const hooks = read(`${WEB}/hooks/client-billing.ts`);
  for (const token of ['Billing settings', 'New progress claim', 'Create claim', 'Finalize', 'Create invoice', 'Client invoices']) {
    assert.ok(workspace.includes(token), `missing UI token ${token}`);
  }
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /physical Stage progress does not auto-create billing/);
  assert.match(workspace, /Module 16 Client Receipts \/ Payments owns cash receipt and allocation history/);
  assert.match(api, /Idempotency-Key/);
  assert.match(hooks, /invalidateInvoiceEffects/);
  assert.doesNotMatch(workspace, /receivedAmount|advanceAmount|outstandingAmount/);
});

/** Require executable live API and browser gates for the final Client Billing workflow. */
test('B17.10 adds guarded live integration and Playwright workflow coverage', () => {
  assert.equal(exists(LIVE), true);
  assert.equal(exists(E2E), true);
  const live = read(LIVE);
  const e2e = read(E2E);
  const config = read('playwright.config.mjs');
  const pkg = JSON.parse(read('package.json'));
  for (const token of ['createFoundationTestDatabaseClient', 'buildApp', 'app.inject', 'INVALID_BILLING_BASIS', 'BILLING_STAGE_INVALID', '/openapi.json']) {
    assert.ok(live.includes(token), `missing live verification token ${token}`);
  }
  for (const token of ['Client Billing', 'New progress claim', 'Create claim', 'Finalize', 'Create invoice', 'Client invoices']) {
    assert.ok(e2e.includes(token), `missing browser workflow token ${token}`);
  }
  assert.match(config, /RUN_FINAL_21_CLIENT_BILLING_E2E/);
  assert.match(config, /final-21-client-billing-browser\.spec\.mjs/);
  assert.ok(pkg.scripts['test:integration:final-21-client-billing']);
  assert.ok(pkg.scripts['test:e2e:final-21-client-billing']);
  assert.ok(pkg.scripts['final-21-client-billing:b17-10:gate']);
});

/** Freeze one source-only Module 15 runtime while allowing later approved Module 16 generation. */
test('B17.10 keeps duplicate billing runtimes excluded and records Module 16 as deferred at that checkpoint', () => {
  for (const path of [
    'apps/api/src/modules/contracts',
    'apps/api/src/modules/progress-billing',
    'apps/api/src/modules/accounts-receivable',
    'apps/web/src/features/contracts'
  ]) assert.equal(exists(path), false, `${path} must remain absent from the current approved scope`);
  const app = read('apps/api/src/app.ts');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b17-10-client-billing-final-acceptance.json'));
  assert.match(app, /registerClientBillingRoutes/);
  assert.doesNotMatch(app, /registerContract|registerProgressBilling/);
  assert.match(JSON.stringify(evidence), /Client Receipts.*deferred to Module 16/);
  assert.equal(evidence.nextPass, 'B18.1 Module 16 Client Receipts / Payments alignment audit');
});

/** Keep changed B17.10 named functions purpose-commented for junior readability. */
test('B17.10 keeps new verification functions junior-readable with purpose comments', () => {
  for (const relativePath of [LIVE, E2E]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line)) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Freeze B17 and hand the corrected generation sequence to Module 16 Client Receipts / Payments. */
test('B17.10 records final acceptance evidence and B18 handoff', () => {
  const doc = read('docs/PASS-B17-10-FINAL21-CLIENT-BILLING-FINAL-ACCEPTANCE.md');
  const evidence = read('acceptance-evidence/pass-b17-10-client-billing-final-acceptance.json');
  assert.match(doc, /B17 is frozen/);
  assert.match(doc, /B18\.1 - Module 16 Client Receipts \/ Payments/);
  assert.match(doc, /Project -> Stage -> Claim -> Client Invoice -> Finance/);
  assert.match(evidence, /"backendRouteCount": 9/);
  assert.match(evidence, /"nextPass": "B18\.1 Module 16 Client Receipts \/ Payments alignment audit"/);
});
