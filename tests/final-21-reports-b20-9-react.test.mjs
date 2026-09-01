import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/reports';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B20.9 adds only the standard four-part Reports React feature', () => {
  for (const relativePath of [
    `${FEATURE}/api/reports-api.ts`,
    `${FEATURE}/hooks/reports.ts`,
    `${FEATURE}/components/reports-workspace.tsx`,
    `${FEATURE}/pages/reports-page.tsx`
  ]) assert.equal(exists(relativePath), true, `missing ${relativePath}`);

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

test('B20.9 browser client uses exactly the seven frozen Reports HTTP operations', () => {
  const api = read(`${FEATURE}/api/reports-api.ts`);
  for (const functionName of [
    'listReportCatalog', 'runReport', 'createReportExport', 'getReportRun',
    'getReportDownload', 'listSavedReportFilters', 'saveReportFilter'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));

  for (const path of [
    'reports/catalog', 'reports/run', 'reports/exports', 'reports/runs/',
    '/download', 'reports/saved-filters'
  ]) assert.match(api, new RegExp(path.replace(/[/-]/g, (value) => `\\${value}`)));
  assert.doesNotMatch(api, /companyId|actorUserId|allowedProjectIds|formula|metricExpression|sql|queryText/);
});

test('B20.9 keeps Reports server state in TanStack Query and polls only active export runs', () => {
  const hooks = read(`${FEATURE}/hooks/reports.ts`);
  assert.match(hooks, /useQuery/);
  assert.match(hooks, /useMutation/);
  assert.match(hooks, /REPORTS_QUERY_KEY = \['module-20', 'reports'\]/);
  assert.match(hooks, /status === 'QUEUED' \|\| status === 'RUNNING' \? 2_000 : false/);
  for (const hook of [
    'useReportCatalog', 'useRunReport', 'useCreateReportExport', 'useReportRun',
    'useReportDownload', 'useSavedReportFilters', 'useSaveReportFilter'
  ]) assert.match(hooks, new RegExp(`export function ${hook}\\b`));
});

test('B20.9 validates report filters with React Hook Form and Zod and sends only allow-listed fields', () => {
  const workspace = read(`${FEATURE}/components/reports-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useForm<FilterFormValues>/);
  assert.match(workspace, /REPORT_FILTER_FIELDS/);
  assert.match(workspace, /REQUIRED_FILTER_FIELDS/);
  assert.match(workspace, /businessFiltersFromValues/);
  assert.match(workspace, /Company, permissions and Project scope stay server-derived/);
  assert.doesNotMatch(workspace, /register\('companyId'\)|formula|metricExpression|raw SQL|queryText/i);
});

test('B20.9 exposes catalog results saved filters exports and signed-download status without browser formulas', () => {
  const workspace = read(`${FEATURE}/components/reports-workspace.tsx`);
  for (const label of ['Report Catalog', 'Report Filters', 'Report Results', 'Saved Filters', 'Export Status', 'Download export']) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /reportColumns/);
  assert.match(workspace, /displayReportValue/);
  assert.match(workspace, /window\.location\.assign\(download\.url\)/);
  assert.doesNotMatch(workspace, /recognizedRevenue\s*[-+]\s*actualCost|receivedAmount\s*[-+*/]|reduce\([^)]*(?:cost|profit|billed|received)/i);
});

test('B20.9 keeps export and saved-filter controls permission-aware while the server remains authoritative', () => {
  const page = read(`${FEATURE}/pages/reports-page.tsx`);
  const workspace = read(`${FEATURE}/components/reports-workspace.tsx`);
  for (const permission of ['reports.read', 'reports.export', 'reports.save_filters']) {
    assert.match(page, new RegExp(permission.replace('.', '\\.')));
  }
  assert.match(workspace, /props\.canExport/);
  assert.match(workspace, /props\.canSaveFilters/);
  assert.match(workspace, /permission-filtered Module 20 catalog/i);
});

test('B20.9 integrates Reports immediately after Project Profitability without registering Dashboard runtime', () => {
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  const profitabilityIndex = shell.indexOf('>Project Profitability<');
  const reportsIndex = shell.indexOf('>Reports & Analytics<');
  assert.ok(profitabilityIndex > 0 && reportsIndex > profitabilityIndex, 'Reports must follow Project Profitability in navigation');
  assert.match(shell, /ReportsPage/);
  assert.match(shell, /'reports'/);
  assert.match(shell, /usePermission\('reports\.read'\)/);
});

test('B20.9 changes no Reports backend route or migration surface', () => {
  const routes = read('apps/api/src/modules/reports/reports.routes.ts');
  assert.equal((routes.match(/app\.(?:get|post)\(`/g) ?? []).length, 7);
  assert.doesNotMatch(routes, /app\.(?:put|patch|delete)\(/);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b20[_-]?9|reports.*react/i.test(name)), false);
});

test('B20.9 keeps every named frontend function changed in this pass purpose-commented', () => {
  for (const relativePath of [
    `${FEATURE}/api/reports-api.ts`,
    `${FEATURE}/hooks/reports.ts`,
    `${FEATURE}/components/reports-workspace.tsx`,
    `${FEATURE}/pages/reports-page.tsx`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});
