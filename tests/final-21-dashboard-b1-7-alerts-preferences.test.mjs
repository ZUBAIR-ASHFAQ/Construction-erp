import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/dashboard/dashboard.service.ts';
const REPOSITORY = 'apps/api/src/modules/dashboard/dashboard.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B1.7 adds one bounded permission-filtered Dashboard alert read', () => {
  const service = read(SERVICE);
  assert.match(service, /async getAlerts\b/);
  assert.match(service, /type DashboardAlertsQuery/);
  assert.match(service, /allowedProjectIds: scope\.allowedProjectIds/);
  assert.match(service, /skip: \(page - 1\) \* pageSize/);
  assert.match(service, /take: pageSize/);
  assert.match(service, /await this\.requireScope\(\['dashboard\.read', 'dashboard\.project\.read'\], project\.id\)/);
});

test('B1.7 surfaces objective source-derived exceptions without creating alert persistence', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  for (const code of ['PROJECT_OVERDUE', 'STAGE_OVERDUE', 'BUDGET_OVERRUN', 'PROJECT_LOSS']) {
    assert.ok(service.includes(`'${code}'`), `missing alert code ${code}`);
  }
  assert.match(service, /new ProjectStagesService\(this\.db\)\.listStages\(project\.id\)/);
  assert.match(service, /new BudgetsJobCostService\(this\.db\)\.getJobCost\(project\.id\)/);
  assert.match(service, /new ProjectProfitabilityService\(this\.db\)\.getProjectSummary\(project\.id, \{ asOfDate \}\)/);
  assert.doesNotMatch(repository, /createAlert|updateAlert|deleteAlert|dashboardAlert/);
});

test('B1.7 keeps deadline, cost overrun and loss concepts source-traceable and separate', () => {
  const service = read(SERVICE);
  assert.match(service, /sourceModule: 'projects'/);
  assert.match(service, /sourceModule: 'project-stages'/);
  assert.match(service, /sourceModule: 'budgets-job-cost'/);
  assert.match(service, /sourceModule: 'project-profitability'/);
  assert.match(service, /actualCost > budgetCost/);
  assert.match(service, /moneyToMinorUnits\(profitability\.profitAmount\) < 0n/);
  assert.doesNotMatch(service, /receivedAmount\s*-\s*actualCost|cash\s*-\s*cost|received\s*-\s*cost/i);
});

test('B1.7 permission-gates source alerts instead of exposing unavailable source data', () => {
  const service = read(SERVICE);
  assert.match(service, /projectScope\.permissions\.includes\('stages\.read'\)/);
  assert.match(service, /this\.canReadJobCost\(projectScope\)/);
  assert.match(service, /this\.canReadProfitability\(projectScope\)/);
  assert.ok(service.includes("'dashboard.finance.read'"));
  assert.ok(service.includes("'job_cost.read'"));
  assert.ok(service.includes("'project_profitability.finance.read'"));
});

test('B1.7 preserves the existing atomic preference audit and outbox integration', () => {
  const service = read(SERVICE);
  assert.match(service, /async updatePreferences\b/);
  assert.match(service, /withTransaction\(this\.db/);
  assert.match(service, /recordAudit\(tx/);
  assert.match(service, /recordOutboxEvent\(tx/);
  assert.match(service, /dashboard\.preferences_updated/);
});

test('B1.7 does not introduce a duplicate alert table or extra alert runtime layer', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const service = read(SERVICE);
  assert.doesNotMatch(prisma, /model DashboardAlert\b|@@map\("dashboard_alerts"\)/);
  assert.doesNotMatch(service, /class .*AlertController|class .*AlertManager/);
});

test('B1.7 keeps every new named helper and service method purpose-commented', () => {
  const service = read(SERVICE);
  for (const marker of [
    'function currentDateOnly',
    'function isAlertDueDate',
    'function isOpenProjectStatus',
    'async getAlerts'
  ]) {
    const index = service.indexOf(marker);
    assert.ok(index > 0, `missing ${marker}`);
    assert.match(service.slice(Math.max(0, index - 280), index), /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${marker}`);
  }
});
