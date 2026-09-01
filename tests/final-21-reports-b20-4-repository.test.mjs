import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const REPOSITORY = 'apps/api/src/modules/reports/reports.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B20.4 implements only the required Reports persistence repository surface', () => {
  const repository = read(REPOSITORY);
  for (const method of [
    'listReportDefinitions',
    'findReportDefinitionByCode',
    'createReportRun',
    'findReportRunById',
    'markReportRunRunning',
    'markReportRunCompleted',
    'markReportRunFailed',
    'listSavedFilters',
    'createSavedFilter'
  ]) assert.match(repository, new RegExp(`async ${method}\\b`), `missing ${method}`);

  assert.doesNotMatch(repository, /deleteSaved|updateSaved|deleteReport|createReportDefinition/);
});

test('B20.4 keeps every Company-owned read and write tenant scoped', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /scope\.createData\(\{[\s\S]*?reportCode: input\.reportCode/);
  assert.match(repository, /scope\.where\(\{ id: runId, requestedBy \}\)/);
  assert.match(repository, /scope\.where\(\{ id: runId, requestedBy, status: 'QUEUED' \}\)/);
  assert.match(repository, /scope\.where\(\{[\s\S]*?userId,/);
  assert.doesNotMatch(repository, /companyId:\s*input\./);
});

test('B20.4 reads only active allow-listed catalog definitions and supports Company overrides', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /code: \{ in: \[\.\.\.REPORT_CODES\] \}/);
  assert.match(repository, /status: 'ACTIVE'/);
  assert.match(repository, /\{ companyId: null \}, \{ companyId: scope\.companyId \}/);
  assert.match(repository, /row\.companyId === scope\.companyId/);
  assert.match(repository, /take: REPORT_CODES\.length \* 2/);
});

test('B20.4 report run transitions are explicit and idempotency-friendly', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /status: 'QUEUED'/);
  assert.match(repository, /status: 'RUNNING'/);
  assert.match(repository, /status: 'COMPLETED'/);
  assert.match(repository, /status: 'FAILED'/);
  assert.match(repository, /status: \{ in: \['QUEUED', 'RUNNING'\] \}/);
  assert.match(repository, /return updated\.count === 1/g);
  assert.doesNotMatch(repository, /\.delete\(|\.deleteMany\(/);
});

test('B20.4 keeps saved filters owned by the authenticated Company user', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /savedReportFilter\.findMany/);
  assert.match(repository, /userId,/);
  assert.match(repository, /savedReportFilter\.create/);
  assert.match(repository, /userId: input\.userId/);
  assert.match(repository, /filtersJson: input\.filters/);
});

test('B20.4 does not duplicate operational report sources or add query engine logic', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /costActual|clientInvoice|clientReceipt|supplierInvoice|journalLine|attendanceEntry|projectStage/);
  assert.doesNotMatch(repository, /\$queryRaw|\$executeRaw|formulaEngine|queryBuilder|dynamicSql/i);
});

test('B20.4 repository stays metadata-only after later service reads and HTTP registration', () => {
  const repository = read(REPOSITORY);
  const service = read('apps/api/src/modules/reports/reports.service.ts');
  assert.match(service, /new ReportsRepository/);
  assert.match(service, /createExport\(/);
  assert.match(service, /saveFilter\(/);
  assert.match(service, /async runReport\b/);
  assert.doesNotMatch(repository, /DashboardService|registerDashboardRoutes/);
});

test('B20.4 documents the repository constructor and every named repository method', () => {
  const repository = read(REPOSITORY);
  for (const functionName of [
    'constructor',
    'listReportDefinitions',
    'findReportDefinitionByCode',
    'createReportRun',
    'findReportRunById',
    'markReportRunRunning',
    'markReportRunCompleted',
    'markReportRunFailed',
    'listSavedFilters',
    'createSavedFilter'
  ]) {
    const marker = functionName === 'constructor' ? 'constructor(' : `async ${functionName}`;
    const functionIndex = repository.indexOf(marker);
    assert.ok(functionIndex > 0, `missing ${functionName}`);
    const preceding = repository.slice(Math.max(0, functionIndex - 220), functionIndex);
    assert.match(preceding, /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${functionName}`);
  }
});

test('B20.4 exports the repository class and only its small input contracts', () => {
  const index = read('apps/api/src/modules/reports/index.ts');
  assert.match(index, /export \{ ReportsRepository \} from '\.\/reports\.repository\.js';/);
  for (const type of [
    'CreateReportRunRepositoryInput',
    'CreateSavedReportFilterRepositoryInput',
    'ReportDefinitionListInput'
  ]) assert.ok(index.includes(type), `missing export ${type}`);
});
