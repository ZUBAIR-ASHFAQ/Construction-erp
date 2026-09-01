import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/dashboard';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B1.9 adds only the standard four-part Dashboard React feature', () => {
  for (const relativePath of [
    `${FEATURE}/api/dashboard-api.ts`,
    `${FEATURE}/hooks/dashboard.ts`,
    `${FEATURE}/components/dashboard-workspace.tsx`,
    `${FEATURE}/pages/dashboard-page.tsx`
  ]) assert.equal(exists(relativePath), true, `missing ${relativePath}`);

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

test('B1.9 browser client uses exactly the five frozen Dashboard HTTP operations', () => {
  const api = read(`${FEATURE}/api/dashboard-api.ts`);
  for (const functionName of [
    'getDashboardSummary', 'listDashboardProjects', 'getProjectDashboard',
    'listDashboardAlerts', 'updateDashboardPreferences'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));

  for (const path of ['dashboard/summary', 'dashboard/projects', 'dashboard/alerts', 'dashboard/preferences']) {
    assert.match(api, new RegExp(path.replace(/[/-]/g, (value) => `\\${value}`)));
  }
  assert.doesNotMatch(api, /companyId|actorUserId|allowedProjectIds|formula|metricExpression|sql|queryText/);
});

test('B1.9 keeps Dashboard server state in TanStack Query and preferences in one mutation', () => {
  const hooks = read(`${FEATURE}/hooks/dashboard.ts`);
  assert.match(hooks, /useQuery/);
  assert.match(hooks, /useMutation/);
  assert.match(hooks, /DASHBOARD_QUERY_KEY = \['module-1', 'dashboard'\]/);
  for (const hook of [
    'useDashboardSummary', 'useDashboardProjects', 'useProjectDashboard',
    'useDashboardAlerts', 'useUpdateDashboardPreferences'
  ]) assert.match(hooks, new RegExp(`export function ${hook}\\b`));
});

test('B1.9 validates Project and date filters with React Hook Form and Zod without raw Project ID entry', () => {
  const workspace = read(`${FEATURE}/components/dashboard-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useForm<DashboardFilterValues>/);
  assert.match(workspace, /type="date"/);
  assert.match(workspace, /Select a valid Project/);
  assert.match(workspace, /<select \{\.\.\.form\.register\('projectId'\)\}>/);
  assert.doesNotMatch(workspace, /placeholder="UUID|Enter.*Project.*ID/i);
});

test('B1.9 renders all required Dashboard management views from server-returned source values', () => {
  const workspace = read(`${FEATURE}/components/dashboard-workspace.tsx`);
  for (const label of [
    'Executive summary', 'Project health & progress', 'Stage progress snapshot',
    'Budget', 'Actual cost', 'Billed', 'Received', 'Outstanding',
    'Supplier payable', 'Profit / loss', 'Alerts', 'Saved filters & preferences'
  ]) assert.match(workspace, new RegExp(label.replace(/[&/]/g, (value) => `\\${value}`), 'i'));

  assert.match(workspace, /Cash received is not profit/);
  assert.match(workspace, /overallPhysicalProgressPercent/);
  assert.match(workspace, /stage\.weightPercent/);
  assert.match(workspace, /stage\.approvedPhysicalProgressPercent/);
  assert.doesNotMatch(workspace, /receivedAmount\s*[-+*/]|recognizedRevenue\s*[-+]\s*actualCost|reduce\([^)]*(?:cost|profit|billed|received)/i);
});

test('B1.9 keeps Dashboard permissions visible in the page and API authoritative for preference writes', () => {
  const page = read(`${FEATURE}/pages/dashboard-page.tsx`);
  const workspace = read(`${FEATURE}/components/dashboard-workspace.tsx`);
  for (const permission of [
    'dashboard.read', 'dashboard.project.read', 'dashboard.finance.read', 'dashboard.manage_preferences'
  ]) assert.match(page, new RegExp(permission.replace('.', '\\.')));
  assert.match(workspace, /props\.canReadProjects/);
  assert.match(workspace, /props\.canReadFinance/);
  assert.match(workspace, /props\.canManagePreferences/);
  assert.match(workspace, /API remains authoritative/);
});

test('B1.9 integrates Dashboard as the first permission-aware workspace while preserving Reports after Project Profitability', () => {
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(shell, /DashboardPage/);
  assert.match(shell, /'dashboard'/);
  assert.match(shell, /usePermission\('dashboard\.read'\)/);
  assert.match(shell, /useState<WorkspaceView>\('dashboard'\)/);
  const dashboardIndex = shell.indexOf('>Dashboard<');
  const documentsIndex = shell.indexOf('>Documents<');
  const profitabilityIndex = shell.indexOf('>Project Profitability<');
  const reportsIndex = shell.indexOf('>Reports & Analytics<');
  assert.ok(dashboardIndex > 0 && documentsIndex > dashboardIndex, 'Dashboard should be the first visible workspace');
  assert.ok(profitabilityIndex > 0 && reportsIndex > profitabilityIndex, 'Reports must remain after Project Profitability');
});

test('B1.9 changes no frozen Dashboard backend route or migration surface', () => {
  const routes = read('apps/api/src/modules/dashboard/dashboard.routes.ts');
  assert.equal((routes.match(/app\.(?:get|patch)\(`/g) ?? []).length, 5);
  assert.doesNotMatch(routes, /app\.(?:post|put|delete)\(/);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b1[_-]?9|dashboard.*react/i.test(name)), false);
});

test('B1.9 keeps every named frontend function changed in this pass purpose-commented', () => {
  for (const relativePath of [
    `${FEATURE}/api/dashboard-api.ts`,
    `${FEATURE}/hooks/dashboard.ts`,
    `${FEATURE}/components/dashboard-workspace.tsx`,
    `${FEATURE}/pages/dashboard-page.tsx`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});
