import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/reports/';
const SERVICE = `${MODULE}reports.service.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B20.5 preserves the required five-file Reports backend shape', () => {
  assert.deepEqual(readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort(), [
    'index.ts',
    'reports.repository.ts',
    'reports.routes.ts',
    'reports.schema.ts',
    'reports.service.ts'
  ]);
});

test('B20.5 adds one simple Reports service for catalog export-run and saved-filter workflows', () => {
  const service = read(SERVICE);
  assert.match(service, /export class ReportsService/);
  for (const method of ['listCatalog', 'createExport', 'getReportRun', 'listSavedFilters', 'saveFilter']) {
    assert.match(service, new RegExp(`async ${method}\\b`), `missing ${method}`);
  }
  assert.doesNotMatch(service, /class .*Manager|class .*Handler|class .*Engine/);
});

test('B20.5 revalidates trusted request scope and active Administration permissions', () => {
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /security\.projectScope\.kind === 'not-resolved'/);
  assert.match(service, /security\.projectScope\.kind === 'restricted'/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /findEffectivePermissionCodes\(lookup\)/);
  assert.match(service, /ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE'/);
  assert.match(service, /ROLE_ACTIVE = 'ACTIVE'/);
  assert.match(service, /REPORT_SCOPE_FORBIDDEN/g);
});

test('B20.5 validates server-owned report definition permission and export metadata without a query engine', () => {
  const service = read(SERVICE);
  assert.match(service, /function parseReportDefinition/);
  assert.match(service, /REPORTS_PERMISSION_CODES/);
  assert.match(service, /REPORT_OUTPUT_FORMATS/);
  assert.match(service, /definition\.requiredPermissions/);
  assert.match(service, /definition\.outputFormats\.includes\(input\.outputFormat\)/);
  assert.doesNotMatch(service, /eval\(|new Function|\$queryRaw|\$executeRaw|dynamicSql|formulaEngine|queryBuilder/i);
});

test('B20.5 catalog returns only active repository definitions allowed by current permissions', () => {
  const service = read(SERVICE);
  assert.match(service, /listReportDefinitions\(query\)/);
  assert.match(service, /hasAllPermissions\(scope\.permissions, \[/);
  assert.match(service, /\.\.\.definition\.requiredPermissions/);
  assert.match(service, /\.\.\.REPORT_SOURCE_PERMISSIONS\[definition\.code\]/);
  assert.match(service, /reportCatalogResponseSchema\.parse/);
});

test('B20.5 export ownership remains intact after the later B20.7 durable enqueue integration', () => {
  const service = read(SERVICE);
  assert.match(service, /'reports\.export'/);
  assert.match(service, /REPORT_SOURCE_PERMISSIONS\[input\.reportCode\]/);
  assert.match(service, /createReportRun\(\{/);
  assert.match(service, /requestedBy: scope\.actorUserId/);
  assert.match(service, /enqueueJob\(tx/);
  assert.doesNotMatch(service, /markReportRunRunning|markReportRunCompleted|queue\.add/i);
});

test('B20.5 keeps report runs and saved filters user scoped and validates persisted filter JSON', () => {
  const service = read(SERVICE);
  assert.match(service, /findReportRunById\(runId, baseScope\.actorUserId\)/);
  assert.match(service, /listSavedFilters\(scope\.actorUserId, query\.reportCode\)/);
  assert.match(service, /userId: scope\.actorUserId/);
  assert.match(service, /reportFiltersSchema\.safeParse/);
  assert.match(service, /REPORT_FILTER_INVALID/);
});

test('B20.5 enforces explicit Project filters before later report-source reads', () => {
  const service = read(SERVICE);
  assert.match(service, /projectId && security\.projectScope\.kind === 'restricted'/);
  assert.match(service, /requiredPermissions, filters\.projectId/);
  assert.match(service, /allowedProjectIds = projectId/);
});

test('B20.5 service foundation remains intact after B20.8 adds the HTTP and signed-download boundary', () => {
  const service = read(SERVICE);
  const routes = read(`${MODULE}reports.routes.ts`);
  const app = read('apps/api/src/app.ts');
  assert.match(service, /async runReport\b/);
  assert.match(service, /REPORT_SOURCE_PERMISSIONS/);
  assert.match(service, /async createDownloadUrl\b/);
  assert.match(routes, /new ReportsService/);
  assert.match(app, /registerReportsRoutes/);
});

test('B20.5 documents every named service helper constructor and method', () => {
  const service = read(SERVICE);
  for (const marker of [
    'function isReportsPermissionCode',
    'function isReportOutputFormat',
    'function isReportCode',
    'function parseReportDefinition',
    'function hasAllPermissions',
    'function parseStoredFilters',
    'function reportRunResponse',
    'function savedFilterResponse',
    'constructor(',
    'private async requireScope',
    'private async requireReportAccess',
    'async listCatalog',
    'async createExport',
    'async getReportRun',
    'async createDownloadUrl',
    'async listSavedFilters',
    'async saveFilter'
  ]) {
    const index = service.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(service.slice(Math.max(0, index - 240), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});

test('B20.5 exports the service and adds no migration or Dashboard work', () => {
  const index = read(`${MODULE}index.ts`);
  assert.match(index, /export \{ ReportsService \} from '\.\/reports\.service\.js';/);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b20[_-]?5/i.test(name)), false);
  assert.doesNotMatch(read(`${MODULE}reports.service.ts`), /DashboardService|registerDashboardRoutes/);
});
