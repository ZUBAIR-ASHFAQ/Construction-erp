import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const REPOSITORY = 'apps/api/src/modules/dashboard/dashboard.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B1.4 read-focused Dashboard repository methods remain intact after later preference-write orchestration', () => {
  const repository = read(REPOSITORY);
  for (const method of ['listProjects', 'findProjectById', 'findPreference', 'listSavedFilters']) {
    assert.match(repository, new RegExp(`async ${method}\\b`), `missing ${method}`);
  }
  assert.doesNotMatch(repository, /async (?:delete|post|calculate|aggregate)[A-Za-z]/);
});

test('B1.4 makes Company scope mandatory on every Company-owned Dashboard read', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /const where = scope\.where\(\{/);
  assert.match(repository, /where: scope\.where\(\{ id: projectId \}\)/);
  assert.match(repository, /where: scope\.where\(\{ userId \}\)/g);
  assert.doesNotMatch(repository, /companyId:\s*input\.|companyId:\s*visibility\.|companyId:\s*userId/);
});

test('B1.4 applies authenticated Project visibility before portfolio and detail reads', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /allowedProjectIds:\s*readonly string\[\] \| null/);
  assert.match(repository, /id: \{ in: allowedProjectIds \}/);
  assert.match(repository, /!visibility\.allowedProjectIds\.includes\(projectId\)/);
  assert.match(repository, /return null;/);
});

test('B1.4 keeps Project listing bounded and returns only lightweight Project master fields', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /DASHBOARD_MAX_PAGE_SIZE/);
  assert.match(repository, /assertProjectPageWindow/);
  assert.match(repository, /project\.findMany\(\{/);
  assert.match(repository, /project\.count\(\{ where \}\)/);
  assert.match(repository, /skip: input\.skip/);
  assert.match(repository, /take: input\.take/);
  for (const field of ['projectCode', 'name', 'clientId', 'status', 'currency', 'startDate', 'plannedEndDate']) {
    assert.match(repository, new RegExp(`${field}: true`), `missing lightweight Project field ${field}`);
  }
});

test('B1.4 reads user preferences and saved filters only inside the active Company', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /dashboardPreference\.findFirst/);
  assert.match(repository, /layoutJson: true/);
  assert.match(repository, /defaultProjectId: true/);
  assert.match(repository, /dashboardSavedFilter\.findMany/);
  assert.match(repository, /filterJson: true/);
  assert.match(repository, /take: DASHBOARD_MAX_PAGE_SIZE/);
});

test('B1.4 does not duplicate financial progress or report-source queries', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /costActual|clientInvoice|clientReceipt|supplierInvoice|supplierPayment|journalLine|stageProgressUpdate|progressClaim|stockLedger|attendanceEntry/);
  assert.doesNotMatch(repository, /\$queryRaw|\$executeRaw|formula|expression|dynamicSql|queryBuilder/i);
});

test('B1.4 keeps the repository independent from the later Dashboard HTTP registration', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /Fastify|authenticateRequest|registerDashboardRoutes/);
});

test('B1.4 documents the repository helper constructor and every named method', () => {
  const repository = read(REPOSITORY);
  for (const marker of [
    'function assertProjectPageWindow',
    'constructor(',
    'async listProjects',
    'async findProjectById',
    'async findPreference',
    'async listSavedFilters'
  ]) {
    const index = repository.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(repository.slice(Math.max(0, index - 240), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});

test('B1.4 exports the repository class and only its small visibility/list contracts', () => {
  const index = read('apps/api/src/modules/dashboard/index.ts');
  assert.match(index, /export \{ DashboardRepository \} from '\.\/dashboard\.repository\.js';/);
  assert.match(index, /DashboardProjectListRepositoryInput/);
  assert.match(index, /DashboardRepositoryVisibility/);
  assert.doesNotMatch(index, /DashboardRepositoryContext/);
});
