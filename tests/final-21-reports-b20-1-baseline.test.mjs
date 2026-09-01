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

const reportsRoutes = read('apps/api/src/modules/reports/reports.routes.ts');
const reportsSchema = read('apps/api/src/modules/reports/reports.schema.ts');

const expectedRouteFragments = [
  "{ method: 'GET', path: `${REPORTS_API_BASE}/catalog`",
  "{ method: 'POST', path: `${REPORTS_API_BASE}/run`",
  "{ method: 'POST', path: `${REPORTS_API_BASE}/exports`",
  "{ method: 'GET', path: `${REPORTS_API_BASE}/runs/:id`",
  "{ method: 'GET', path: `${REPORTS_API_BASE}/runs/:id/download`",
  "{ method: 'GET', path: `${REPORTS_API_BASE}/saved-filters`",
  "{ method: 'POST', path: `${REPORTS_API_BASE}/saved-filters`"
];

test('B20.1 creates only the required five-file Reports backend module scaffold', () => {
  assert.deepEqual(list('apps/api/src/modules/reports/'), [
    'index.ts',
    'reports.repository.ts',
    'reports.routes.ts',
    'reports.schema.ts',
    'reports.service.ts'
  ]);
});

test('B20.1 freezes the exact Final-21 Reports API base and seven-route surface', () => {
  assert.match(reportsSchema, /REPORTS_API_BASE = '\/api\/v1\/reports'/);
  for (const fragment of expectedRouteFragments) {
    assert.ok(reportsRoutes.includes(fragment), `missing route contract ${fragment}`);
  }
  assert.equal((reportsRoutes.match(/method: '(?:GET|POST)'/g) ?? []).length, 7);
});

test('B20.1 preserves the required four-part Reports React feature boundary for later passes', () => {
  for (const folder of ['api', 'hooks', 'components', 'pages']) {
    assert.equal(exists(`apps/web/src/features/reports/${folder}/`), true, `missing ${folder} folder`);
  }
});

test('B20.1 keeps Reports source files independent from Dashboard runtime code', () => {
  const reports = list('apps/api/src/modules/reports/').map((file) => read(`apps/api/src/modules/reports/${file}`)).join('\n');
  assert.doesNotMatch(reports, /modules\/dashboard|registerDashboardRoutes/);
});

test('B20.1 keeps the Reports scaffold free of generic CRUD, raw SQL, or a user formula engine', () => {
  const reportsFiles = list('apps/api/src/modules/reports/')
    .map((file) => read(`apps/api/src/modules/reports/${file}`))
    .join('\n');

  assert.doesNotMatch(reportsFiles, /\bDELETE\b|\bPATCH\b|\bPUT\b/);
  assert.doesNotMatch(reportsFiles, /\$queryRaw|\$executeRaw|raw sql|user[- ]defined formula|arbitrary formula/i);
});

test('B20.1 leaves excluded legacy business modules out of the new Reports contract', () => {
  const reportsFiles = list('apps/api/src/modules/reports/')
    .map((file) => read(`apps/api/src/modules/reports/${file}`))
    .join('\n');

  assert.doesNotMatch(reportsFiles, /tender|estimate|proposal|\bboq\b|\bwbs\b|cost code|rfq/i);
});
