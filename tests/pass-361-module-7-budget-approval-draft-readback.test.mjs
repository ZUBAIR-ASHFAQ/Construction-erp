import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const pass = await readFile('docs/PASS-361-MODULE-7-BUDGET-APPROVAL-DRAFT-READBACK.md', 'utf8');
const repairContract = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const moduleContract = await readFile('docs/modules/budgets-job-cost/STAGE-12-MODULE-7-CONTRACT.md', 'utf8');
const config = await readFile('packages/config/src/server.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const main = await readFile('apps/api/src/main.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx', 'utf8');
const integration = await readFile('tests/integration/module-7-api.integration.test.mjs', 'utf8');
const e2e = await readFile('tests/e2e/module-7-browser.spec.mjs', 'utf8');
const migrations = (await readdir('packages/database/prisma/migrations', { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

test('Pass 361 closes only M7-01 and M7-02 and does not start Pass 362 or Stage-26/27 work', () => {
  assert.match(pass, /M7-01/);
  assert.match(pass, /M7-02/);
  assert.match(repairContract, /M7-01[\s\S]*implemented in Pass 361/);
  assert.match(repairContract, /M7-02[\s\S]*implemented in Pass 361/);
  assert.match(pass, /does \*\*not\*\* start Pass 362/);
  assert.match(moduleContract, /Pass 361 post-Stage-23 repair amendment/);
});

test('Pass 361 adds no database table or Pass-361 migration', () => {
  assert.ok(migrations.includes('20260826000400_module_6_durable_cost_structure_state'));
  assert.ok(!migrations.some((name) => name.includes('pass_361') || name.includes('budget_approval_draft')));
  assert.match(pass, /Database tables added:\s+0/);
  assert.match(pass, /Migrations added:\s+0/);
});

test('Pass 361 adds optional server-owned Budget approval configuration with safe validation', () => {
  assert.match(config, /budgetApprovalDefinitionCode: string \| null/);
  assert.match(config, /'BUDGET_APPROVAL_DEFINITION_CODE'/);
  assert.match(config, /\^\[A-Za-z0-9_\.\-\]\{1,100\}\$/);
  assert.match(app, /budgetApprovalDefinitionCode\?: string \| null/);
  assert.match(app, /budgetApprovalDefinitionCode: options\.budgetApprovalDefinitionCode \?\? null/);
  assert.match(main, /budgetApprovalDefinitionCode: config\.budgetApprovalDefinitionCode/);
});

test('Pass 361 reuses Module 22 and fingerprints the exact Budget snapshot before configured freeze', () => {
  assert.match(service, /ApprovalsService/);
  assert.match(service, /fingerprintRequest/);
  assert.match(service, /BUDGET_APPROVAL_RESOURCE_TYPE = 'project_budget'/);
  assert.match(service, /function budgetApprovalSnapshot/);
  assert.match(service, /function buildBudgetApprovalInput/);
  assert.match(service, /sourceLineId: fingerprintRequest\(payloadSnapshot\)/);
  assert.match(service, /requestApprovalInTransaction/);
  assert.match(service, /if \(!hasStatus\(approval\.status, 'APPROVED'\)\)[\s\S]*return budgetResponse\(withTotals\)/);
  assert.match(service, /updateProjectBudgetStatus\([\s\S]*BUDGET_DRAFT,[\s\S]*BUDGET_FROZEN/);
  assert.doesNotMatch(service, /createBudgetApproval|budgetApprover|customApproval/);
});

test('Pass 361 adds one bounded latest-DRAFT schema and no new permission or error vocabulary', () => {
  assert.match(schema, /GET'[\s\S]*\/api\/v1\/projects\/:projectId\/budgets\/draft/);
  assert.match(schema, /getDraftBudgetQuerySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /getDraftBudgetResponseSchema = projectBudgetResponseSchema/);
  for (const permission of ['budgets.read', 'budgets.create', 'budgets.edit', 'budgets.freeze', 'job_cost.read', 'forecast.update']) {
    assert.ok(schema.includes(`'${permission}'`), permission);
  }
  assert.doesNotMatch(schema, /budget\.approve|budgets\.approve|budget_approval\.read/);
  assert.doesNotMatch(schema, /BUDGET_APPROVAL_REQUIRED|BUDGET_APPROVAL_PENDING/);
});

test('Pass 361 reuses the existing latest-by-status repository function instead of adding unnecessary repository logic', () => {
  assert.match(repository, /async findLatestProjectBudgetByStatus\(/);
  assert.match(service, /getDraftBudget[\s\S]*findLatestProjectBudgetByStatus\(projectId, BUDGET_DRAFT\)/);
  assert.doesNotMatch(repository, /findRecoverableDraft|listDraftBudgets|searchDraftBudgets/);
});

test('Pass 361 exposes exactly one repair read while preserving all seven source operations', () => {
  const routeCalls = [...routes.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.equal(routeCalls.length, 8);
  assert.ok(routeCalls.includes('GET /api/v1/projects/:projectId/budgets/draft'));
  assert.match(routes, /module7GetDraftBudget/);
  assert.match(routes, /getDraftBudgetQuerySchema/);
  assert.match(routes, /getDraftBudgetResponseSchema\.parse/);
  assert.match(service, /'budgets\.read'/);
  assert.doesNotMatch(routes, /budgets\/:id\/(?:approve|submit|reopen)|job-cost\/(?:commitments|actuals|reconcile)/);
});

test('Pass 361 React restores the latest DRAFT and freezes only when the server returns FROZEN', () => {
  assert.match(webApi, /export function getDraftBudget\(/);
  assert.match(webHooks, /export function useDraftBudget\(/);
  assert.match(workspace, /useDraftBudget\(project\.id, canReadBudget\)/);
  assert.match(workspace, /if \(!draftBudget && draftBudgetQuery\.data\) setDraftBudget\(draftBudgetQuery\.data\)/);
  assert.match(workspace, /result\.status\.trim\(\)\.toUpperCase\(\) === 'FROZEN'/);
  assert.match(workspace, /Budget remains DRAFT until the configured approval workflow returns APPROVED/);
  assert.match(workspace, /Request approval \/ freeze/);
});

test('Pass 361 live integration coverage proves DRAFT recovery and Module-22 approval replay', () => {
  assert.match(integration, /configured approval keeps a recoverable DRAFT until Module 22 approves the same snapshot/);
  assert.match(integration, /budgetApprovalDefinitionCode: options\.budgetApprovalDefinitionCode \?\? null/);
  assert.match(integration, /resourceType: 'project_budget'/);
  assert.match(integration, /approvalRequest\.count/);
  assert.match(integration, /budgets\/draft/);
  assert.match(integration, /approveBudgetFreeze/);
  assert.match(integration, /status, 'PENDING'/);
  assert.match(integration, /status, 'FROZEN'/);
});

test('Pass 361 Playwright coverage reloads the page and resumes the same DRAFT before freeze', () => {
  assert.match(e2e, /budgets\/draft/);
  assert.match(e2e, /page\.reload\(\)/);
  assert.match(e2e, /Editing budget v1/);
  assert.match(e2e, /Request approval \/ freeze/);
  assert.match(e2e, /assertModule7AuthorityBoundary/);
});

test('Pass 361 keeps the repair intentionally small and preserves Stage-26/27 source-adapter deferrals', () => {
  assert.match(pass, /Permissions added:\s+0/);
  assert.match(pass, /Stable Module-7 errors added:\s+0/);
  assert.match(pass, /Module-7 events added:\s+0/);
  assert.match(moduleContract, /job_cost\.source_posted.*deferred/);
  assert.match(moduleContract, /Stage-26\/27 boundaries remain frozen/);
});
