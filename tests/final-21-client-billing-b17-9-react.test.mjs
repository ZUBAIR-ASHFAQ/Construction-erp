import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/client-billing';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B17.9 keeps the required four-part Client Billing React feature only. */
test('B17.9 keeps the simple four-part Client Billing React feature', () => {
  for (const relativePath of [
    `${FEATURE}/api/client-billing-api.ts`,
    `${FEATURE}/hooks/client-billing.ts`,
    `${FEATURE}/components/client-billing-workspace.tsx`,
    `${FEATURE}/pages/client-billing-page.tsx`
  ]) assert.equal(exists(relativePath), true, `missing ${relativePath}`);

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

/** Confirm the browser client exposes the current Client Billing API operations and typed status vocabulary. */
test('B17.9 keeps the current Client Billing API operations and typed status vocabulary', () => {
  const api = read(`${FEATURE}/api/client-billing-api.ts`);
  for (const functionName of [
    'getBillingSettings', 'updateBillingSettings', 'listBillingClaims', 'createBillingClaim',
    'updateBillingClaim', 'finalizeBillingClaim', 'createClientInvoice', 'createDirectClientInvoice',
    'listClientInvoices', 'getClientInvoice'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));
  assert.match(api, /BillingMethod = 'FIXED_PRICE' \| 'COST_PLUS_PERCENTAGE'/);
  assert.match(api, /BillingClaimStatus = 'DRAFT' \| 'FINALIZED'/);
  assert.match(api, /ClientInvoiceStatus = 'ISSUED'/);
  assert.doesNotMatch(api, /client-billing\/contracts|client-receipts|method:\s*'DELETE'/);
});

/** Confirm direct Invoice lines select permitted Project Stages instead of raw IDs. */
test('Client Invoice entry selects only permitted Project Stages', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  const page = read(`${FEATURE}/pages/client-billing-page.tsx`);
  assert.match(workspace, /useProjectStages\(projectId \|\| null, props\.canReadStages/);
  assert.match(workspace, /<select \{\.\.\.invoiceForm\.register\(`lines\.\$\{index\}\.stageId`\)\}/);
  assert.match(workspace, /Project level/);
  assert.match(workspace, /stage\.code} · \{stage\.name}/);
  assert.doesNotMatch(workspace, /Stage ID \(optional\)|placeholder="UUID|Enter a valid UUID/);
  assert.match(page, /canReadStages=\{usePermission\('stages\.read'\) \|\| Boolean\(hasRestrictedProjects\)\}/);
});

/** Confirm Billing Settings and Progress Claim workflows are absent from the Client Invoice page. */
test('Client Invoice page contains only direct Invoice functionality', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  const page = read(`${FEATURE}/pages/client-billing-page.tsx`);
  assert.match(workspace, /useCreateDirectClientInvoice/);
  assert.match(workspace, /Create client invoice/);
  assert.doesNotMatch(workspace, /Billing settings|New progress claim|Claims<\/h2>|claimForm|settingsForm/);
  assert.doesNotMatch(page, /canManageSettings|canCreateClaims|canEditClaims|canFinalizeClaims/);
});

/** Confirm Client Invoice entry and detail preserve Stage attribution. */
test('Client Invoice entry and detail preserve Stage attribution', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  assert.match(workspace, /function stageLabel\(stageId: string \| null\)/);
  assert.match(workspace, /selectedInvoiceQuery\.data\.lines\.map/);
  assert.match(workspace, /stageLabel\(line\.stageId\)/);
  assert.match(workspace, /Invoice lines/);
});

/** Confirm Client Invoice paid/due values come from server-owned receipt allocations instead of browser arithmetic. */
test('B17.9 renders server-derived Client Invoice paid and due balances', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  const api = read(`${FEATURE}/api/client-billing-api.ts`);
  assert.match(workspace, /Paid and outstanding values are calculated by the server from posted Client Payment allocations/);
  assert.match(workspace, /invoice\.allocatedAmount/);
  assert.match(workspace, /invoice\.outstandingAmount/);
  assert.match(api, /allocatedAmount: string/);
  assert.match(api, /outstandingAmount: string/);
  assert.doesNotMatch(workspace, /receivedAmount|advanceAmount|totalAmount\s*-\s*allocatedAmount/);
});

/** Confirm issued invoices invalidate Stage and Finance reads affected by the same source transaction. */
test('B17.9 refreshes Client Billing Stage and Finance query state after invoice creation', () => {
  const hooks = read(`${FEATURE}/hooks/client-billing.ts`);
  assert.match(hooks, /PROJECT_STAGES_QUERY_KEY = \['module-7', 'project-stages'\]/);
  assert.match(hooks, /FINANCE_QUERY_KEY = \['final21', 'finance'\]/);
  assert.match(hooks, /invalidateInvoiceEffects/);
  assert.match(hooks, /queryClient\.invalidateQueries\(\{ queryKey: PROJECT_STAGES_QUERY_KEY \}\)/);
  assert.match(hooks, /queryClient\.invalidateQueries\(\{ queryKey: FINANCE_QUERY_KEY \}\)/);
});

/** Confirm direct Invoice writes remain React Hook Form plus Zod and bounded. */
test('Client Invoice entry uses React Hook Form plus Zod with bounded lines', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useFieldArray/);
  assert.match(workspace, /positiveMoneySchema/);
  assert.match(workspace, /max\(500\)/);
  assert.doesNotMatch(workspace, /amount: '0\.00'/);
});

/** Confirm the current Client Billing route surface and migration boundary remain stable. */
test('B17.9 changes no backend route or migration surface', () => {
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/client-billing/g) ?? []).length, 10);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b17_9|client_billing_react/i.test(name)), false);
});

/** Confirm the invoice register opens server-loaded, accessible line and balance detail. */
test('Client Invoice register exposes a complete detail dialog', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  const hooks = read(`${FEATURE}/hooks/client-billing.ts`);
  assert.match(workspace, /<th>Invoice<\/th><th>Date<\/th><th>Status<\/th><th>Total<\/th><th>Allocated<\/th><th>Outstanding<\/th><th>Project<\/th><th>Action<\/th>/);
  assert.match(workspace, /setSelectedInvoiceId\(invoice\.id\)/);
  assert.match(workspace, /aria-labelledby="client-invoice-detail-title"/);
  assert.match(workspace, /Invoice lines/);
  assert.match(workspace, /Paid \/ allocated/);
  assert.match(hooks, /export function useClientInvoice/);
  assert.match(hooks, /getClientInvoice\(invoiceId as string\)/);
});

/** Confirm every named frontend function changed in B17.9 keeps a short purpose comment. */
test('B17.9 keeps changed named functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    `${FEATURE}/api/client-billing-api.ts`,
    `${FEATURE}/hooks/client-billing.ts`,
    `${FEATURE}/components/client-billing-workspace.tsx`,
    `${FEATURE}/pages/client-billing-page.tsx`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line)) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm B17.9 records its boundaries and hands final verification to B17.10. */
test('B17.9 records React acceptance evidence and hands final verification to B17.10', () => {
  const doc = read('docs/PASS-B17-9-FINAL21-CLIENT-BILLING-REACT.md');
  const evidence = read('acceptance-evidence/pass-b17-9-client-billing-react.json');
  assert.match(doc, /React Hook Form/i);
  assert.match(doc, /Module 16 Client Receipts \/ Payments/);
  assert.match(doc, /B17\.10/i);
  assert.match(evidence, /"databaseMigrationAdded": false/);
  assert.match(evidence, /"backendRouteCount": 9/);
});
