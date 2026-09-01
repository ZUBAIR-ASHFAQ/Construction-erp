import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/reports/';

/** Read one project file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one project path exists. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B20.8 keeps the five-file Reports backend shape and adds no migration or Dashboard runtime registration', () => {
  assert.deepEqual(readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort(), [
    'index.ts',
    'reports.repository.ts',
    'reports.routes.ts',
    'reports.schema.ts',
    'reports.service.ts'
  ]);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b20[_-]?8/i.test(name)), false);
});

test('B20.8 implements exactly the seven frozen Reports HTTP routes', () => {
  const routes = read(`${MODULE}reports.routes.ts`);
  for (const route of [
    "app.get(`${REPORTS_API_BASE}/catalog`",
    "app.post(`${REPORTS_API_BASE}/run`",
    "app.post(`${REPORTS_API_BASE}/exports`",
    "app.get(`${REPORTS_API_BASE}/runs/:id`",
    "app.get(`${REPORTS_API_BASE}/runs/:id/download`",
    "app.get(`${REPORTS_API_BASE}/saved-filters`",
    "app.post(`${REPORTS_API_BASE}/saved-filters`"
  ]) {
    assert.ok(routes.includes(route), `missing ${route}`);
  }
  assert.equal((routes.match(/app\.(?:get|post)\(`/g) ?? []).length, 7);
  assert.doesNotMatch(routes, /app\.(?:put|patch|delete)\(/);
});

test('B20.8 authenticates every Reports route and keeps Zod as the authoritative HTTP boundary', () => {
  const routes = read(`${MODULE}reports.routes.ts`);
  assert.match(routes, /authenticateRequest\(request, options\.database\)/);
  assert.equal((routes.match(/preHandler: \[authenticate\]/g) ?? []).length, 7);
  for (const schema of [
    'reportCatalogQuerySchema', 'runReportBodySchema', 'createReportExportBodySchema',
    'reportRunIdParamsSchema', 'savedReportFiltersQuerySchema', 'saveReportFilterBodySchema'
  ]) {
    assert.match(routes, new RegExp(`${schema}`));
  }
  assert.match(routes, /function parseRequest/);
  assert.match(routes, /REPORT_FILTER_INVALID/);
});

test('B20.8 exposes complete OpenAPI metadata and stable error envelopes for all seven routes', () => {
  const routes = read(`${MODULE}reports.routes.ts`);
  for (const operationId of [
    'listReportCatalog', 'runReport', 'createReportExport', 'getReportRun',
    'downloadReportRun', 'listSavedReportFilters', 'saveReportFilter'
  ]) {
    assert.ok(routes.includes(`operationId: '${operationId}'`), `missing ${operationId}`);
  }
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 7);
  assert.match(routes, /COMMON_RESPONSES = \{ 400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 500: ERROR, 503: ERROR \}/);
  assert.match(routes, /REPORTS_ERROR_CODES\.join/);
  assert.match(routes, /additionalProperties: false/g);
});

test('B20.8 wires route handlers directly to the existing Reports service without new handler layers', () => {
  const routes = read(`${MODULE}reports.routes.ts`);
  assert.match(routes, /const service = new ReportsService\(options\.database\)/);
  for (const method of ['listCatalog', 'runReport', 'createExport', 'getReportRun', 'createDownloadUrl', 'listSavedFilters', 'saveFilter']) {
    assert.match(routes, new RegExp(`service\\.${method}\\(`), `missing service.${method}`);
  }
  assert.doesNotMatch(routes, /class .*Controller|class .*Handler|class .*Manager/);
});

test('B20.8 authorizes signed export downloads from the user-owned completed report run and same-company Document', () => {
  const service = read(`${MODULE}reports.service.ts`);
  assert.match(service, /async createDownloadUrl\b/);
  assert.match(service, /requireScope\(\['reports\.read', 'reports\.export'\]\)/);
  assert.match(service, /findReportRunById\(runId, baseScope\.actorUserId\)/);
  assert.match(service, /row\.status !== 'COMPLETED' \|\| !row\.fileId/);
  assert.match(service, /new DocumentsRepository\(this\.db\)\.findDocumentById\(row\.fileId\)/);
  assert.match(service, /document\.category !== 'REPORT_EXPORT'/);
  assert.match(service, /document\.createdBy !== baseScope\.actorUserId/);
  assert.match(service, /assertCompanyObjectKey\(document\.currentVersion\.storageKey\)/);
  assert.match(service, /storage\.createSignedDownloadUrl/);
  assert.match(service, /action: 'report\.export_download_authorized'/);
  assert.doesNotMatch(service, /publicUrl|permanentUrl/i);
});

test('B20.8 exports and registers Reports only when both database and object storage dependencies exist', () => {
  const index = read(`${MODULE}index.ts`);
  const app = read('apps/api/src/app.ts');
  assert.match(index, /REPORTS_HTTP_ROUTES, registerReportsRoutes/);
  assert.match(app, /import \{ registerReportsRoutes \} from '\.\/modules\/reports\/index\.js';/);
  assert.match(app, /if \(options\.database && options\.objectStorage\) \{/);
  assert.match(app, /app\.register\(registerReportsRoutes, \{/);
  assert.match(app, /signedUrlTtlSeconds: documentsUploadPolicy\.signedUrlTtlSeconds/);
});

test('B20.8 keeps every introduced named function and method purpose-commented', () => {
  const combined = `${read(`${MODULE}reports.routes.ts`)}\n${read(`${MODULE}reports.service.ts`)}`;
  for (const marker of ['function dataEnvelope', 'function parseRequest', 'function registerReportsRoutes', 'async createDownloadUrl']) {
    const index = combined.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(combined.slice(Math.max(0, index - 280), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});
