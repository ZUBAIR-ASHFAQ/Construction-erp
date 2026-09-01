import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** List direct entries inside one repository directory in stable order. */
function list(relativePath) {
  return readdirSync(new URL(relativePath, ROOT)).sort();
}

const dashboardRoutes = read('apps/api/src/modules/dashboard/dashboard.routes.ts');
const dashboardSchema = read('apps/api/src/modules/dashboard/dashboard.schema.ts');

const expectedRouteFragments = [
  "{ method: 'GET', path: `${DASHBOARD_API_BASE}/summary`",
  "{ method: 'GET', path: `${DASHBOARD_API_BASE}/projects`",
  "{ method: 'GET', path: `${DASHBOARD_API_BASE}/projects/:projectId`",
  "{ method: 'GET', path: `${DASHBOARD_API_BASE}/alerts`",
  "{ method: 'PATCH', path: `${DASHBOARD_API_BASE}/preferences`"
];

test('B1.1 creates only the required five-file Dashboard backend module scaffold', () => {
  assert.deepEqual(list('apps/api/src/modules/dashboard/'), [
    'dashboard.repository.ts',
    'dashboard.routes.ts',
    'dashboard.schema.ts',
    'dashboard.service.ts',
    'index.ts'
  ]);
});

test('B1.1 freezes the exact Final-21 Dashboard API base and five-route surface', () => {
  assert.match(dashboardSchema, /DASHBOARD_API_BASE = '\/api\/v1\/dashboard'/);
  for (const fragment of expectedRouteFragments) {
    assert.ok(dashboardRoutes.includes(fragment), `missing route contract ${fragment}`);
  }
  assert.equal((dashboardRoutes.match(/method: '(?:GET|PATCH)'/g) ?? []).length, 5);
});

test('B1.1 preserves the required four-part Dashboard React feature boundary for later passes', () => {
  for (const folder of ['api', 'hooks', 'components', 'pages']) {
    assert.equal(exists(`apps/web/src/features/dashboard/${folder}/`), true, `missing ${folder} folder`);
  }
});

test('B1.1 keeps the frozen Dashboard route contract intact as later HTTP passes register it', () => {
  const routes = read('apps/api/src/modules/dashboard/dashboard.routes.ts');
  assert.equal((routes.match(/method: '(?:GET|PATCH)'/g) ?? []).length, 5);
});

test('B1.1 keeps the Dashboard scaffold read-oriented and free of duplicate source-of-truth logic', () => {
  const dashboardFiles = list('apps/api/src/modules/dashboard/')
    .map((file) => read(`apps/api/src/modules/dashboard/${file}`))
    .join('\n');

  assert.doesNotMatch(dashboardFiles, /\bPOST\b|\bPUT\b|\bDELETE\b/);
  assert.doesNotMatch(dashboardFiles, /\$queryRaw|\$executeRaw|raw sql|user[- ]defined formula|arbitrary formula/i);
});

test('B1.1 leaves excluded legacy business modules out of the Dashboard contract', () => {
  const dashboardFiles = list('apps/api/src/modules/dashboard/')
    .map((file) => read(`apps/api/src/modules/dashboard/${file}`))
    .join('\n');

  assert.doesNotMatch(dashboardFiles, /tender|estimate|proposal|\bboq\b|\bwbs\b|cost code|rfq/i);
});
