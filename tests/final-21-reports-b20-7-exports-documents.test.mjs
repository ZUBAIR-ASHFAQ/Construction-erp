import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/reports/';
const WORKER = 'apps/api/src/workers/report-export.worker.ts';

/** Read one project file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one project path exists. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B20.7 keeps the five-file Reports module and adds only the necessary export worker', () => {
  assert.deepEqual(readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort(), [
    'index.ts',
    'reports.repository.ts',
    'reports.routes.ts',
    'reports.schema.ts',
    'reports.service.ts'
  ]);
  assert.equal(exists(WORKER), true);
});

test('B20.7 freezes one durable queue contract and one bounded export row ceiling', () => {
  const schema = read(`${MODULE}reports.schema.ts`);
  assert.match(schema, /REPORT_EXPORT_QUEUE_NAME = 'report-exports'/);
  assert.match(schema, /REPORT_EXPORT_JOB_TYPE = 'reports\.export'/);
  assert.match(schema, /REPORT_EXPORT_MAX_ROWS = 10_000/);
  assert.match(read(`${MODULE}index.ts`), /REPORT_EXPORT_QUEUE_NAME/);
});

test('B20.7 creates report run queue audit and outbox state atomically', () => {
  const service = read(`${MODULE}reports.service.ts`);
  assert.match(service, /withTransaction\(this\.db, async \(tx\)/);
  assert.match(service, /new ReportsRepository\(tx\)\.createReportRun/);
  assert.match(service, /enqueueJob\(tx, \{/);
  assert.match(service, /queueName: REPORT_EXPORT_QUEUE_NAME/);
  assert.match(service, /jobType: REPORT_EXPORT_JOB_TYPE/);
  assert.match(service, /payload: \{ runId: row\.id \}/);
  assert.match(service, /action: 'report\.run_created'/);
  assert.match(service, /eventType: 'report\.run_created'/);
});

test('B20.7 export reads page through source modules and never load unbounded rows', () => {
  const service = read(`${MODULE}reports.service.ts`);
  assert.match(service, /async runExportData\b/);
  assert.match(service, /withoutPagination/);
  assert.match(service, /reportSupportsPagination/);
  assert.match(service, /pageSize: REPORTS_MAX_PAGE_SIZE/);
  assert.match(service, /REPORT_EXPORT_MAX_ROWS/);
  assert.match(service, /REPORT_EXPORT_FAILED/);
  assert.doesNotMatch(service, /\$queryRaw|\$executeRaw|eval\(|new Function|dynamicSql|formulaEngine/i);
});

test('B20.7 worker revalidates current user permissions and intersects current and queued Project scope', () => {
  const worker = read(WORKER);
  assert.match(worker, /findEffectivePermissionCodesForAuthentication/);
  assert.match(worker, /resolveProjectScopeForAuthentication/);
  assert.match(worker, /function intersectProjectScope/);
  assert.match(worker, /bindRequestSecurityContext/);
  assert.match(worker, /runWithRequestContext/);
  assert.match(worker, /new ReportsService\(database\)\.runExportData/);
});

test('B20.7 worker generates only the allow-listed CSV Excel and PDF output formats', () => {
  const worker = read(WORKER);
  assert.match(worker, /function renderCsv/);
  assert.match(worker, /function renderExcel/);
  assert.match(worker, /function renderPdf/);
  assert.match(worker, /application\/pdf/);
  assert.match(worker, /application\/vnd\.ms-excel/);
  assert.match(worker, /text\/csv/);
  assert.match(worker, /function csvField/);
  assert.match(worker, /\^\[=\+\\-@\]/);
});

test('B20.7 stores generated exports through Module 21 Documents with deterministic retry-safe object ownership', () => {
  const worker = read(WORKER);
  assert.match(worker, /new DocumentsRepository\(tx\)/);
  assert.match(worker, /buildCompanyObjectKey\(\{ namespace: 'report-exports', objectId: run\.id, versionId: run\.id \}\)/);
  assert.match(worker, /id: run\.id/);
  assert.match(worker, /category: 'REPORT_EXPORT'/);
  assert.match(worker, /createDocumentVersion\(\{/);
  assert.match(worker, /setCurrentVersion/);
  assert.match(worker, /markReportRunCompleted\(run\.id, run\.requestedBy, document\.id/);
  assert.match(worker, /eventType: 'document\.created'/);
  assert.match(worker, /eventType: 'document\.version_added'/);
  assert.match(worker, /eventType: 'report\.export_completed'/);
});

test('B20.7 retries failures through Foundation queue and records only terminal report failure state', () => {
  const worker = read(WORKER);
  assert.match(worker, /claimQueueJobs/);
  assert.match(worker, /completeQueueJob/);
  assert.match(worker, /failQueueJob/);
  assert.match(worker, /outcome === 'DEAD_LETTERED'/);
  assert.match(worker, /markReportRunFailed/);
  assert.match(worker, /eventType: 'report\.export_failed'/);
});

test('B20.7 worker scripts remain registered after B20.8 HTTP registration while Dashboard stays deferred', () => {
  const rootPackage = read('package.json');
  const apiPackage = read('apps/api/package.json');
  assert.doesNotMatch(rootPackage, /dev:report-exports|start:report-exports/);
  assert.match(apiPackage, /worker:report-exports/);
  assert.match(apiPackage, /start:report-exports/);
  assert.match(read('apps/api/src/app.ts'), /registerReportsRoutes/);
  assert.doesNotMatch(read(`${MODULE}reports.service.ts`), /DashboardService|registerDashboardRoutes/);
});

test('B20.7 adds no migration because export state already exists from B20.2', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b20[_-]?7/i.test(name)), false);
});

test('B20.7 keeps every introduced export function purpose-commented', () => {
  const combined = `${read(`${MODULE}reports.service.ts`)}\n${read(WORKER)}`;
  for (const marker of [
    'function reportSupportsPagination', 'function withoutPagination', 'async runExportData',
    'function resolveConfig', 'function readJobPayload', 'function intersectProjectScope',
    'async function resolveJobSecurity', 'async function runWithJobContext', 'function validateReportRun',
    'function cellText', 'function reportColumns', 'function csvField', 'function htmlText',
    'function exportMetadata', 'function renderCsv', 'function renderExcel', 'function pdfLines',
    'function pdfText', 'function renderPdf', 'function renderArtifact', 'async function storeArtifact',
    'async function completeReportExport', 'async function handleJob', 'function exportErrorCode',
    'async function markTerminalFailure', 'async function runBatch', 'function wait', 'function requestStop',
    'async function main'
  ]) {
    const index = combined.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(combined.slice(Math.max(0, index - 280), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});
