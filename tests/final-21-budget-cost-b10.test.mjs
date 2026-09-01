import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/budgets-job-cost';
const web = 'apps/web/src/features/budgets-job-cost';
const migrationPath = 'packages/database/prisma/migrations/20260829001400_final21_budget_job_cost_hardening/migration.sql';

/** Extract one Prisma model block for focused persistence checks. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm Module 9 remains a simple five-file backend and follows Finance in registration order. */
test('B10 keeps Project Budget and Cost Tracking as one five-file backend after Finance Core', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'budgets-job-cost.repository.ts',
    'budgets-job-cost.routes.ts',
    'budgets-job-cost.schema.ts',
    'budgets-job-cost.service.ts',
    'index.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.ok(app.indexOf('registerFinanceRoutes') < app.indexOf('registerBudgetsJobCostRoutes'));
  assert.ok(app.indexOf('registerBudgetsJobCostRoutes') < app.indexOf('registerProcurementRoutes'));
});

/** Confirm the public Module 9 route catalog exactly matches the controlling Final-21 contract. */
test('B10 exposes the exact seven Module 9 routes and removes the obsolete draft read endpoint', () => {
  const schema = read(`${backend}/budgets-job-cost.schema.ts`);
  const routes = read(`${backend}/budgets-job-cost.routes.ts`);
  for (const route of [
    "GET', route: '/api/v1/projects/:projectId/budgets/current'",
    "POST', route: '/api/v1/projects/:projectId/budgets'",
    "PUT', route: '/api/v1/projects/:projectId/budgets/:id/lines'",
    "POST', route: '/api/v1/projects/:projectId/budgets/:id/freeze'",
    "GET', route: '/api/v1/projects/:projectId/job-cost'",
    "GET', route: '/api/v1/projects/:projectId/job-cost/ledger'",
    "PUT', route: '/api/v1/projects/:projectId/forecast'"
  ]) assert.ok(schema.includes(route), `missing ${route}`);
  assert.doesNotMatch(schema, /budgets\/draft|generic|DELETE', route:/);
  assert.doesNotMatch(routes, /\/budgets\/draft|app\.delete\(/);
});

/** Confirm final persistence uses Project/Stage categories and source-keyed commitment/actual rows only. */
test('B10 aligns budget commitment actual and forecast tables to the final Project Stage category model', () => {
  const budget = prismaModel('ProjectBudget');
  const line = prismaModel('BudgetLine');
  const commitment = prismaModel('CostCommitment');
  const actual = prismaModel('CostActual');
  const forecast = prismaModel('ForecastLine');

  assert.match(budget, /currency\s+String/);
  assert.match(budget, /totalAmount\s+Decimal/);
  assert.match(budget, /createdBy\s+String/);
  assert.match(budget, /frozenAt\s+DateTime\?/);
  assert.doesNotMatch(budget, /budgetType|totalRevenue|totalCost|approvedAt/);

  assert.match(line, /stageId\s+String\?/);
  assert.match(line, /category\s+String/);
  assert.match(line, /plannedAmount\s+Decimal/);
  assert.doesNotMatch(line, /wbsNodeId|costCodeId|costTypeId/);

  assert.match(commitment, /sourceKey\s+String/);
  assert.match(commitment, /amount\s+Decimal/);
  assert.doesNotMatch(commitment, /sourceLineId|originalAmount|remainingAmount/);

  assert.match(actual, /sourceKey\s+String/);
  assert.match(actual, /amount\s+Decimal/);
  assert.doesNotMatch(actual, /sourceLineId|wbsNodeId|costCodeId|costTypeId/);

  assert.match(forecast, /stageId\s+String\?/);
  assert.match(forecast, /category\s+String/);
  assert.match(forecast, /forecastAmount\s+Decimal/);
  assert.match(forecast, /updatedBy\s+String/);
  assert.doesNotMatch(forecast, /budgetLineId|asOfDate|estimateToComplete|forecastFinalCost|forecastFinalRevenue|notes/);
});

/** Confirm the forward migration preserves useful history while dropping only obsolete Module 9 columns. */
test('B10 migration converts existing Module 9 data forward without editing historical migrations', () => {
  const migration = read(migrationPath);
  assert.match(migration, /RENAME COLUMN "approved_at" TO "frozen_at"/);
  assert.match(migration, /RENAME COLUMN "total_cost" TO "total_amount"/);
  assert.match(migration, /ADD COLUMN "currency" CHAR\(3\)/);
  assert.match(migration, /ADD COLUMN "created_by" UUID/);
  assert.match(migration, /DROP COLUMN "budget_type"/);
  assert.match(migration, /DROP COLUMN "total_revenue"/);
  assert.match(migration, /RENAME COLUMN "remaining_amount" TO "amount"/);
  assert.match(migration, /DROP COLUMN "original_amount"/);
  assert.match(migration, /DROP COLUMN "source_line_id"/);
  assert.match(migration, /forecast_lines_project_stage_category_uq/);
  assert.match(migration, /module_9_validate_budget_line_stage_scope/);
  assert.match(migration, /module_9_validate_forecast_actor_scope/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"?(project_budgets|budget_lines|cost_commitments|cost_actuals)"?/i);
});

/** Confirm service logic keeps actual cost source-derived, stages scoped and frozen budgets immutable. */
test('B10 service enforces Stage scope freeze immutability idempotency audit and source-derived actuals', () => {
  const service = read(`${backend}/budgets-job-cost.service.ts`);
  const repository = read(`${backend}/budgets-job-cost.repository.ts`);
  for (const permission of ['budgets.read', 'budgets.create', 'budgets.edit', 'budgets.freeze', 'job_cost.read', 'forecast.update']) {
    assert.ok(service.includes(`'${permission}'`), `missing ${permission}`);
  }
  assert.match(service, /requireValidStages/);
  assert.match(service, /BUDGET_DRAFT/);
  assert.match(service, /BUDGET_FROZEN/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(repository, /listJobCostLedger/);
  assert.doesNotMatch(repository, /createCostActual|updateCostActual|deleteCostActual/);
  assert.doesNotMatch(service, /wbsNodeId|costCodeId|costTypeId|budgetType|forecastFinalRevenue/);
});

/** Confirm source adapters use the simplified source-key amount contract after the Module 9 migration. */
test('B10 updates Procurement Inventory and Equipment cost adapters to the simplified source-key contract', () => {
  const procurement = read('apps/api/src/modules/procurement/procurement.repository.ts');
  const inventory = read('apps/api/src/modules/inventory/inventory.repository.ts');
  const equipment = read('apps/api/src/modules/equipment/equipment.repository.ts');
  assert.match(procurement, /sourceKey: input\.sourceKey/);
  assert.match(procurement, /amount: input\.amount/);
  assert.doesNotMatch(procurement, /sourceLineId: input\.sourceLineId|originalAmount: input\.amount|remainingAmount: input\.amount/);
  assert.match(inventory, /sourceKey/);
  assert.match(equipment, /sourceKey/);
  assert.doesNotMatch(inventory, /sourceLineId: input\.sourceLineId/);
  assert.doesNotMatch(equipment, /sourceLineId: input\.usageId/);
});

/** Confirm the React workspace uses final Project Stage category inputs and no legacy forecast or cost dimensions. */
test('B10 React workspace uses Stage category budget and forecast forms with bounded job-cost reads', () => {
  const api = read(`${web}/api/budgets-job-cost-api.ts`);
  const hooks = read(`${web}/hooks/budgets-job-cost.ts`);
  const workspace = read(`${web}/components/budget-job-cost-workspace.tsx`);
  assert.match(api, /projects\/\$\{projectId\}\/budgets\/current/);
  assert.match(api, /projects\/\$\{projectId\}\/job-cost\/ledger/);
  assert.match(api, /projects\/\$\{projectId\}\/forecast/);
  assert.doesNotMatch(api, /budgets\/draft|budgetType|estimateToComplete|forecastFinalCost|forecastFinalRevenue/);
  assert.match(hooks, /\['module-9', 'project-budget-cost'\]/);
  assert.match(workspace, /Project level/);
  assert.match(workspace, /Stage/);
  assert.match(workspace, /Category/);
  assert.match(workspace, /Source cost ledger/);
  assert.doesNotMatch(workspace, /WBS|Cost Code|Cost Type|budgetType|estimateToComplete|forecastFinalRevenue/);
});

/** Confirm B10 named functions stay junior-readable with short purpose comments. */
test('B10 keeps changed Module 9 named functions documented with short purpose comments', () => {
  const paths = [
    `${backend}/budgets-job-cost.schema.ts`,
    `${backend}/budgets-job-cost.repository.ts`,
    `${backend}/budgets-job-cost.service.ts`,
    `${backend}/budgets-job-cost.routes.ts`,
    `${web}/api/budgets-job-cost-api.ts`,
    `${web}/hooks/budgets-job-cost.ts`,
    `${web}/components/budget-job-cost-workspace.tsx`,
    `${web}/pages/budgets-job-cost-page.tsx`
  ];
  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});
