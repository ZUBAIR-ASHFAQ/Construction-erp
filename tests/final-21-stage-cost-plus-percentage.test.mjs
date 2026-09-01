import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Confirm the nullable Stage override is forward-only and bounded without changing source-derived costs. */
test('Stage Cost + Percentage adds only an optional bounded Stage rate', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const migration = read('packages/database/prisma/migrations/20260901000100_stage_cost_plus_percentage/migration.sql');
  const stageModel = prisma.match(/model ProjectStage \{[\s\S]*?@@map\("project_stages"\)\n\}/)?.[0] ?? '';
  assert.match(stageModel, /costPlusPercent\s+Decimal\?\s+@map\("cost_plus_percent"\)\s+@db\.Decimal\(7, 4\)/);
  assert.match(migration, /ADD COLUMN "cost_plus_percent" DECIMAL\(7,4\)/);
  assert.match(migration, /"cost_plus_percent" IS NULL OR \("cost_plus_percent" > 0 AND "cost_plus_percent" <= 100\)/);
  assert.doesNotMatch(stageModel, /actualCost|billableAmount|billingProgressPercent|progressPercent/);
});

/** Confirm Module 7 accepts, persists and returns the Stage-specific rate independently of Stage weight. */
test('Project Stages round-trip Profit / Markup separately from Stage weight and physical progress', () => {
  const schema = read('apps/api/src/modules/project-stages/project-stages.schema.ts');
  const repository = read('apps/api/src/modules/project-stages/project-stages.repository.ts');
  const service = read('apps/api/src/modules/project-stages/project-stages.service.ts');
  const routes = read('apps/api/src/modules/project-stages/project-stages.routes.ts');
  assert.match(schema, /costPlusPercent: costPlusPercentSchema\.nullable\(\)\.optional\(\)/);
  assert.match(repository, /costPlusPercent: input\.costPlusPercent \?\? null/);
  assert.match(repository, /input\.costPlusPercent === undefined/);
  assert.match(service, /costPlusPercent: stage\.costPlusPercent\?\.toString\(\) \?\? null/);
  assert.match(service, /requireStageCostPlusModel\(project\.projectModel, input\.costPlusPercent\)/);
  assert.match(routes, /costPlusPercent:/);
  assert.match(service, /weightPercent: stage\.weightPercent\.toString\(\)/);
  assert.match(service, /approvedPhysicalProgressPercent/);
});

/** Confirm Client Billing uses Module 9 actual costs and a Stage override with Project fallback. */
test('Client Billing applies Stage Profit / Markup to source-derived posted Stage cost with Project fallback', () => {
  const repository = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const budgetRepository = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts');
  assert.match(repository, /this\.db\.costActual\.aggregate/);
  assert.match(repository, /this\.db\.costActual\.groupBy/);
  assert.match(budgetRepository, /this\.db\.costActual\.aggregate/);
  assert.match(service, /stage\.costPlusPercent \?\? project\.costPlusPercent/);
  assert.match(service, /percentageOf\(cost, percent\)/);
  assert.match(service, /percentageOf\(untaggedCost, project\.costPlusPercent\)/);
  assert.match(service, /const projectLimit = projectCost \+ markup/);
  assert.doesNotMatch(service, /update.*costActual|create.*costActual|actualCost\s*:/i);
});

/** Confirm Project fallback remains authoritative and model switches preserve auditable Stage overrides. */
test('Project commercial model remains fallback authority and requires Stage overrides to be cleared explicitly', () => {
  const projectService = read('apps/api/src/modules/projects/projects.service.ts');
  const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');
  assert.match(projectService, /assertValidCommercialModel\(nextProjectModel, nextProjectValue, nextCostPlusPercent\)/);
  assert.match(projectService, /before\.projectModel === PROJECT_MODEL_COST_PLUS_PERCENTAGE/);
  assert.match(projectService, /nextProjectModel === PROJECT_MODEL_FIXED_PRICE/);
  assert.match(projectService, /await repository\.hasStageCostPlusPercent\(projectId\)/);
  assert.match(projectService, /Clear Stage Profit \/ Markup overrides before switching this Project to Fixed Price/);
  assert.match(projectRepository, /hasStageCostPlusPercent\(projectId: string\)/);
  assert.doesNotMatch(projectRepository, /data: \{ costPlusPercent: null \}/);
});

/** Confirm both Stage setup and Client Billing browser flows expose the effective Profit / Markup rate without deriving cost totals. */
test('React Stage and Billing UIs expose Profit / Markup separately without owning cost totals', () => {
  const stageApi = read('apps/web/src/features/project-stages/api/project-stages-api.ts');
  const stageUi = read('apps/web/src/features/project-stages/components/project-stages-workspace.tsx');
  const billingUi = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  assert.match(stageApi, /costPlusPercent: string \| null/);
  assert.match(stageUi, /Profit \/ Markup/);
  assert.match(stageUi, /Project .*%/);
  assert.match(billingUi, /Profit \/ Markup/);
  assert.match(billingUi, /stage\.costPlusPercent \?\? selectedProject\.costPlusPercent/);
  assert.doesNotMatch(billingUi, /actualCost\s*\*|Number\([^)]*costPlusPercent[^)]*\)/);
});
