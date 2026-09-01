import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260829000200_final21_simple_cost_categories/migration.sql', 'utf8');
const budgetSchema = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts', 'utf8');
const budgetRepository = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts', 'utf8');
const budgetService = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts', 'utf8');
const budgetRoutes = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts', 'utf8');
const budgetWebApi = await readFile('apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts', 'utf8');
const budgetWorkspace = await readFile('apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx', 'utf8');
const billingSchema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const billingRepository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const billingService = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const billingRoutes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const billingWebApi = await readFile('apps/web/src/features/client-billing/api/client-billing-api.ts', 'utf8');
const billingWorkspace = await readFile('apps/web/src/features/client-billing/components/client-billing-workspace.tsx', 'utf8');
const purchaseOrderRepository = await readFile('apps/api/src/modules/procurement/procurement.repository.ts', 'utf8');
const purchaseOrderService = await readFile('apps/api/src/modules/procurement/procurement.service.ts', 'utf8');
const inventoryRepository = await readFile('apps/api/src/modules/inventory/inventory.repository.ts', 'utf8');
const inventoryService = await readFile('apps/api/src/modules/inventory/inventory.service.ts', 'utf8');
const equipmentRepository = await readFile('apps/api/src/modules/equipment/equipment.repository.ts', 'utf8');

/** Extract one Prisma model block for focused Final-21 assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

test('Budget and source-cost persistence use simple category dimensions instead of WBS or Cost Codes', () => {
  const budgetLine = prismaModel('BudgetLine');
  const commitment = prismaModel('CostCommitment');
  const actual = prismaModel('CostActual');

  assert.match(budgetLine, /stageId\s+String\?\s+@map\("stage_id"\)/);
  assert.match(budgetLine, /category\s+String\s+@db\.VarChar\(32\)/);
  assert.match(budgetLine, /description\s+String\s+@db\.VarChar\(500\)/);
  assert.match(budgetLine, /plannedAmount\s+Decimal\s+@map\("planned_amount"\)/);
  assert.doesNotMatch(budgetLine, /wbsNodeId|costCodeId|costTypeId|revenueAmount/);

  for (const model of [commitment, actual]) {
    assert.match(model, /stageId\s+String\?/);
    assert.match(model, /category\s+String/);
    assert.match(model, /sourceKey\s+String/);
    assert.doesNotMatch(model, /costStructureId|ProjectCostCode/);
  }
});

test('forward migration preserves old history while moving active cost rows to Final-21 categories', () => {
  assert.match(migration, /ADD COLUMN "stage_id" UUID/);
  assert.match(migration, /ADD COLUMN "category" VARCHAR\(32\)/);
  assert.match(migration, /ADD COLUMN "planned_amount" DECIMAL\(18,2\)/);
  assert.match(migration, /DROP COLUMN "wbs_node_id"/);
  assert.match(migration, /DROP COLUMN "cost_code_id"/);
  assert.match(migration, /DROP COLUMN "cost_type_id"/);
  assert.match(migration, /DROP COLUMN "cost_structure_id"/);
  assert.match(migration, /cost_commitments_company_source_key_uq/);
  assert.match(migration, /cost_actuals_company_source_key_uq/);
  assert.match(migration, /CHECK \("category" IN \('material','labour','security','equipment','subcontract','site_expense','other'\)\)/);
});

test('Budget API, service, repository and React workspace expose only stage/category cost planning', () => {
  const activeBudgetSources = [budgetSchema, budgetRepository, budgetService, budgetRoutes, budgetWebApi, budgetWorkspace];
  for (const source of activeBudgetSources) {
    assert.doesNotMatch(source, /wbsNodeId|costCodeId|costTypeId|costStructureId|revenueAmount/);
  }

  assert.match(budgetSchema, /'material',[\s\S]*'labour',[\s\S]*'security',[\s\S]*'equipment',[\s\S]*'subcontract',[\s\S]*'site_expense',[\s\S]*'other'/);
  assert.match(budgetSchema, /stageId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(budgetSchema, /plannedAmount: nonNegativeMoneySchema/);
  assert.match(budgetRepository, /plannedAmount: line\.plannedAmount/);
  assert.match(budgetRepository, /_sum: \{ plannedAmount: true \}/);
  assert.match(budgetWorkspace, /<th>Category<\/th>/);
});

test('Project Budget actual and commitment writes remain source-derived and source-key idempotent', () => {
  assert.match(purchaseOrderRepository, /companyId: scope\.companyId, sourceKey: input\.sourceKey/);
  assert.match(purchaseOrderRepository, /category: 'material'/);
  assert.match(purchaseOrderService, /purchase_order:\$\{issued\.id\}:\$\{item\.id\}/);
  assert.match(budgetSchema, /'subcontract'/);
  assert.match(inventoryRepository, /sourceKey: input\.sourceKey/);
  assert.match(inventoryRepository, /category: 'material'/);
  assert.match(inventoryRepository, /this\.db\.costActual\.create/);
  assert.match(equipmentRepository, /category: 'equipment'/);
});

test('Client Billing claim lines no longer depend on BOQ and are ready for optional stage attribution', () => {
  const claimLine = prismaModel('ProgressClaimLine');
  assert.match(claimLine, /stageId\s+String\?\s+@map\("stage_id"\)/);
  assert.doesNotMatch(claimLine, /boqItemId|BoqItem/);

  for (const source of [billingSchema, billingRepository, billingService, billingRoutes, billingWebApi, billingWorkspace]) {
    assert.doesNotMatch(source, /boqItemId|BOQ item|BOQ Item/);
  }
  assert.match(billingSchema, /stageId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(billingRepository, /stageId: line\.stageId \?\? null/);
});
