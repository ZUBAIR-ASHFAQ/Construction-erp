import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/project-profitability';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B19.9 adds only the standard four-part Project Profitability React feature. */
test('B19.9 adds the simple four-part Project Profitability React feature', () => {
  for (const relativePath of [
    `${FEATURE}/api/project-profitability-api.ts`,
    `${FEATURE}/hooks/project-profitability.ts`,
    `${FEATURE}/components/project-profitability-workspace.tsx`,
    `${FEATURE}/pages/project-profitability-page.tsx`
  ]) assert.equal(exists(relativePath), true, `missing ${relativePath}`);

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

/** Confirm the typed browser client uses exactly the four frozen read-only Module 19 operations. */
test('B19.9 keeps the exact four read-only Project Profitability API operations', () => {
  const api = read(`${FEATURE}/api/project-profitability-api.ts`);
  for (const functionName of [
    'getProjectProfitabilitySummary',
    'getProjectProfitabilityStages',
    'getProjectProfitabilityTrend',
    'listProjectProfitabilityPortfolio'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));
  assert.match(api, /project-profitability\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(api, /\/stages/);
  assert.match(api, /\/trend/);
  assert.match(api, /project-profitability\/portfolio/);
  assert.doesNotMatch(api, /method:\s*'(?:POST|PATCH|PUT|DELETE)'/);
});

/** Confirm TanStack Query owns all Module 19 server state and no mutation hook is invented. */
test('B19.9 uses TanStack Query for summary Stage trend and portfolio reads only', () => {
  const hooks = read(`${FEATURE}/hooks/project-profitability.ts`);
  assert.match(hooks, /useQuery/);
  assert.doesNotMatch(hooks, /useMutation/);
  for (const hook of [
    'useProjectProfitabilitySummary',
    'useProjectProfitabilityStages',
    'useProjectProfitabilityTrend',
    'useProjectProfitabilityPortfolio'
  ]) assert.match(hooks, new RegExp(`export function ${hook}\\b`));
  assert.match(hooks, /PROJECT_PROFITABILITY_QUERY_KEY = \['module-19', 'project-profitability'\]/);
});

/** Confirm the Project view exposes every frozen financial measure without browser-owned formulas. */
test('B19.9 displays all Project financial measures and keeps cash separate from profit', () => {
  const workspace = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  for (const token of [
    'Recognized revenue', 'Actual cost', 'Profit / loss', 'Billed', 'Received',
    'Allocated receipts', 'Advance / unallocated', 'Outstanding', 'Supplier payable'
  ]) assert.match(workspace, new RegExp(token.replace(/[\/]/g, '\\/')));
  assert.match(workspace, /Cash is separate from profit/);
  assert.match(workspace, /Profit remains recognized revenue minus actual cost/);
  assert.doesNotMatch(workspace, /Number\([^)]*recognizedRevenue[^)]*\)\s*-\s*Number\([^)]*actualCost/);
  assert.doesNotMatch(workspace, /receivedAmount\s*[-+*/]/);
});

/** Confirm Stage weight, physical progress and financial values remain distinct with Project-only reconciliation. */
test('B19.9 keeps Stage physical and financial concepts separate and shows reconciliation buckets', () => {
  const workspace = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  assert.match(workspace, /weightPercent/);
  assert.match(workspace, /physicalProgressPercent/);
  assert.match(workspace, /plannedAmount/);
  assert.match(workspace, /projectOnly/);
  assert.match(workspace, /projectTotal/);
  assert.match(workspace, /Values without an authoritative Stage tag stay here/);
  assert.match(workspace, /never distributed by Stage weight/);
});

/** Confirm the trend UI uses only server-returned recognized revenue, actual cost and profit points. */
test('B19.9 renders the bounded trend response without adding receipts or payables to trend', () => {
  const workspace = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  assert.match(workspace, /Revenue, cost and profit trend/);
  assert.match(workspace, /point\.recognizedRevenue/);
  assert.match(workspace, /point\.actualCost/);
  assert.match(workspace, /point\.profitAmount/);
  const trendSection = workspace.slice(workspace.indexOf('Revenue, cost and profit trend'), workspace.indexOf('Portfolio comparison'));
  assert.doesNotMatch(trendSection, /receivedAmount|advanceAmount|supplierPayableAmount/);
});

/** Confirm portfolio comparison preserves per-Project currency and provides no cross-currency grand total. */
test('B19.9 renders bounded portfolio comparison without cross-currency aggregation', () => {
  const workspace = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  assert.match(workspace, /Portfolio comparison/);
  assert.match(workspace, /item\.currency/);
  assert.match(workspace, /does not create unsafe cross-currency grand totals/);
  assert.doesNotMatch(workspace, /portfolioTotal|grandTotal|reduce\([^)]*portfolio/i);
});

/** Confirm Project selection reuses authorized reads and does not expose a raw Project identifier field. */
test('B19.9 uses permission-scoped Project selection instead of raw Project ID entry', () => {
  const workspace = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  assert.match(workspace, /useProjects\(/);
  assert.match(workspace, /useProjectProfitabilityPortfolio\(/);
  assert.match(workspace, /Select a Project/);
  assert.match(workspace, /No raw Project ID field is exposed/);
  assert.doesNotMatch(workspace, /register\('projectId'\)|name="projectId"|placeholder="UUID|Enter.*Project.*ID/i);
});

/** Confirm read filters use React Hook Form and Zod while all finance values remain server-owned. */
test('B19.9 validates bounded read filters with React Hook Form and Zod', () => {
  const workspace = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useForm<FiltersForm>/);
  assert.match(workspace, /z\.enum\(\['DAY', 'WEEK', 'MONTH'\]\)/);
  assert.match(workspace, /type="date"/);
  assert.match(workspace, /Apply filters/);
});

/** Confirm all three Module 19 permissions are wired into the existing shell and page. */
test('B19.9 integrates Project Profitability into permission-aware navigation', () => {
  const page = read(`${FEATURE}/pages/project-profitability-page.tsx`);
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  for (const permission of [
    'project_profitability.read',
    'project_profitability.finance.read',
    'project_profitability.portfolio.read'
  ]) {
    assert.match(page + shell, new RegExp(permission.replace('.', '\\.')));
  }
  assert.match(shell, /ProjectProfitabilityPage/);
  assert.match(shell, /'project-profitability'/);
  assert.match(shell, />Project Profitability</);
  assert.doesNotMatch(shell, /react-router|BrowserRouter|Routes>/);
});

/** Confirm B19.9 does not change the frozen backend or migration surface. */
test('B19.9 changes no Project Profitability backend route or migration surface', () => {
  const routes = read('apps/api/src/modules/project-profitability/project-profitability.routes.ts');
  assert.equal((routes.match(/app\.get\('\/api\/v1\/project-profitability/g) ?? []).length, 4);
  assert.doesNotMatch(routes, /app\.(?:post|patch|put|delete)\('\/api\/v1\/project-profitability/);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b19_9|project_profitability.*react/i.test(name)), false);
});

/** Confirm every named frontend function changed in B19.9 keeps a short purpose comment. */
test('B19.9 keeps changed named functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    `${FEATURE}/api/project-profitability-api.ts`,
    `${FEATURE}/hooks/project-profitability.ts`,
    `${FEATURE}/components/project-profitability-workspace.tsx`,
    `${FEATURE}/pages/project-profitability-page.tsx`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm B19.9 records its read-only React boundaries and hands final freeze to B19.10. */
test('B19.9 records React evidence and hands final verification to B19.10', () => {
  const doc = read('docs/PASS-B19-9-FINAL21-PROJECT-PROFITABILITY-REACT.md');
  const evidence = read('acceptance-evidence/pass-b19-9-project-profitability-react.json');
  assert.match(doc, /four read-only/i);
  assert.match(doc, /cross-currency/i);
  assert.match(doc, /B19\.10/i);
  assert.match(evidence, /"databaseMigrationAdded": false/);
  assert.match(evidence, /"backendRouteCount": 4/);
  assert.match(evidence, /"browserProfitFormulaAdded": false/);
});
