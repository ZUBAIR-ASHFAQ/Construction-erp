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

/** Confirm the browser client remains on the exact nine-route Module 15 contract. */
test('B17.9 keeps the exact nine Client Billing API operations and typed status vocabulary', () => {
  const api = read(`${FEATURE}/api/client-billing-api.ts`);
  for (const functionName of [
    'getBillingSettings', 'updateBillingSettings', 'listBillingClaims', 'createBillingClaim',
    'updateBillingClaim', 'finalizeBillingClaim', 'createClientInvoice', 'listClientInvoices', 'getClientInvoice'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));
  assert.match(api, /BillingMethod = 'FIXED_PRICE' \| 'COST_PLUS_PERCENTAGE'/);
  assert.match(api, /BillingClaimStatus = 'DRAFT' \| 'FINALIZED'/);
  assert.match(api, /ClientInvoiceStatus = 'ISSUED'/);
  assert.doesNotMatch(api, /client-billing\/contracts|client-receipts|method:\s*'DELETE'/);
});

/** Confirm Project Stage selection replaces raw UUID entry and is permission-aware. */
test('B17.9 selects only permitted Project Stages instead of asking for raw Stage IDs', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  const page = read(`${FEATURE}/pages/client-billing-page.tsx`);
  assert.match(workspace, /useProjectStages\(projectId \|\| null, props\.canReadStages/);
  assert.match(workspace, /<select \{\.\.\.claimForm\.register\(`lines\.\$\{index\}\.stageId`\)\}>/);
  assert.match(workspace, /Project level/);
  assert.match(workspace, /Linked Stage \(restricted\)/);
  assert.match(workspace, /stage\.code} · \{stage\.name} · \{stage\.status}/);
  assert.doesNotMatch(workspace, /Stage ID \(optional\)|placeholder="UUID|Enter a valid UUID/);
  assert.match(page, /canReadStages=\{usePermission\('stages\.read'\) \|\| Boolean\(hasRestrictedProjects\)\}/);
});

/** Confirm billing-basis visibility follows Project ownership without a browser-owned formula. */
test('B17.9 makes Fixed Price and Cost + Percentage basis visible but server-owned', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  assert.match(workspace, /selectedProject\.projectModel/);
  assert.match(workspace, /Project value/);
  assert.match(workspace, /physical Stage progress does not auto-create billing/);
  assert.match(workspace, /posted actual Project\/Stage cost through the claim period end plus/);
  assert.match(workspace, /project\.costPlusPercent/);
  assert.match(workspace, /billingMethod: selectedProject\.projectModel/);
  assert.match(workspace, /readOnly aria-readonly="true"/);
  assert.doesNotMatch(workspace, /actualCost\s*\*|projectValue\s*\*|Number\([^)]*costPlusPercent[^)]*\)/);
});

/** Confirm Claim and Client Invoice views preserve Stage attribution. */
test('B17.9 renders Stage-aware Claim and immutable Client Invoice line detail', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  assert.match(workspace, /function stageLabel\(stageId: string \| null\)/);
  assert.match(workspace, /claim\.lines\.map/);
  assert.match(workspace, /stageLabel\(line\.stageId\)/);
  assert.match(workspace, /invoice\.lines\.map/);
  assert.match(workspace, /The issued invoice preserves the finalized Claim lines and their optional Stage attribution/);
});

/** Confirm Client Receipt and outstanding values are not fabricated before Module 16. */
test('B17.9 leaves received advance and outstanding ownership to Module 16', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  assert.match(workspace, /Received, advance and outstanding values are intentionally not calculated here/);
  assert.match(workspace, /Module 16 Client Receipts \/ Payments owns cash receipt and allocation history/);
  assert.doesNotMatch(workspace, /receivedAmount|advanceAmount|outstandingAmount|totalAmount\s*-\s*received/);
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

/** Confirm browser write forms remain React Hook Form plus Zod and match the positive Claim amount boundary. */
test('B17.9 keeps React Hook Form plus Zod and aligns Claim amount validation', () => {
  const workspace = read(`${FEATURE}/components/client-billing-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useFieldArray/);
  assert.match(workspace, /positiveMoneySchema/);
  assert.match(workspace, /max\(500, 'A claim can contain at most 500 lines\.'\)/);
  assert.doesNotMatch(workspace, /amount: '0\.00'/);
});

/** Confirm B17.9 is frontend-only and keeps backend persistence and route count frozen. */
test('B17.9 changes no backend route or migration surface', () => {
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/client-billing/g) ?? []).length, 9);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b17_9|client_billing_react/i.test(name)), false);
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
