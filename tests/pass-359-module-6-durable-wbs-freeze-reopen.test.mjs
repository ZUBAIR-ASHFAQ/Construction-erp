import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pass = await readFile('docs/PASS-359-MODULE-6-DURABLE-WBS-FREEZE-REOPEN.md', 'utf8');
const contract = await readFile('docs/modules/wbs-cost-codes/STAGE-9-MODULE-6-CONTRACT.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260826000400_module_6_durable_cost_structure_state/migration.sql', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const schema = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/wbs-cost-codes/components/wbs-cost-structure-workspace.tsx', 'utf8');
const integration = await readFile('tests/integration/module-6-api.integration.test.mjs', 'utf8');
const e2e = await readFile('tests/e2e/module-6-browser.spec.mjs', 'utf8');

const repairMigration = '20260826000400_module_6_durable_cost_structure_state';

test('Pass 359 stays inside the single Module-6 M6-01 repair boundary', () => {
  assert.match(pass, /M6-01 — WBS freeze is not durable/);
  assert.match(pass, /does not start the separate Cost Type, Budget, Procurement/);
  assert.match(pass, /no new permission is created/);
  assert.match(contract, /Pass 359 post-Stage-23 repair amendment/);
  assert.match(contract, /This repair does \*\*not\*\* add Cost Type CRUD/);
});

test('Pass 359 adds one durable Project cost-structure model with same-company ownership', () => {
  assert.match(prisma, /model ProjectCostStructureState \{/);
  assert.match(prisma, /projectId\s+String\s+@id/);
  assert.match(prisma, /companyId\s+String/);
  assert.match(prisma, /revisionNo\s+Int\s+@default\(1\)/);
  assert.match(prisma, /frozenAt\s+DateTime\?/);
  assert.match(prisma, /frozenBy\s+String\?/);
  assert.match(prisma, /project\s+Project\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
  assert.match(prisma, /frozenByUser User\?\s+@relation\("ProjectCostStructureFrozenBy", fields: \[frozenBy, companyId\]/);
});

test('Pass 359 migration backfills old freezes and rejects direct writes while frozen', () => {
  assert.match(migration, /CREATE TABLE "project_cost_structure_states"/);
  assert.match(migration, /status" IN \('OPEN', 'FROZEN'\)/);
  assert.match(migration, /revision_no" >= 1/);
  assert.match(migration, /project_cost_structure_states_project_company_fkey/);
  assert.match(migration, /project_cost_structure_states_frozen_by_company_fkey/);
  assert.match(migration, /a\."action" = 'project\.cost_structure_frozen'/);
  assert.match(migration, /WHEN EXISTS \([\s\S]*FROM "users" u[\s\S]*u\."company_id" = a\."company_id"/);
  assert.match(migration, /CREATE FUNCTION "module_6_reject_frozen_cost_structure_write"/);
  assert.match(migration, /TG_OP = 'UPDATE'/);
  assert.match(migration, /wbs_nodes_reject_frozen_cost_structure_write/);
  assert.match(migration, /project_cost_codes_reject_frozen_cost_structure_write/);
});

test('Pass 359 migration is append-only, checksum locked and assigned to one post-Stage-23 repair gate', () => {
  const gate = gates.gates.find((item) => item.gate === 'post-stage-23-module-6-durable-cost-structure-state-repair');
  assert.ok(gate);
  assert.equal(gate.stage, 23);
  assert.deepEqual(gate.migrations, [repairMigration]);
  assert.match(checksums.migrations[repairMigration], /^[a-f0-9]{64}$/);
});

test('Pass 359 keeps request authority server-owned and adds only state/reopen API vocabulary', () => {
  assert.match(schema, /WBS_COST_STRUCTURE_FROZEN/);
  assert.match(schema, /project\.cost_structure_reopened/);
  assert.match(schema, /costStructureStatusSchema = z\.enum\(\['OPEN', 'FROZEN'\]\)/);
  assert.match(schema, /reopenWbsBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /costStructureStateResponseSchema[\s\S]*revisionNo:[\s\S]*frozenAt:/);
  assert.doesNotMatch(schema, /cost_types\.manage|cost_types\.read/);
});

test('Pass 359 durable-state repository methods remain intact after the later Pass 360 Module 6 repair', () => {
  for (const method of ['findProjectCostStructureState', 'freezeProjectCostStructure', 'reopenProjectCostStructure']) {
    assert.match(repository, new RegExp(`async ${method}\\(`));
  }
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /companyId: scope\.companyId/);
  assert.doesNotMatch(repository, /deleteProjectCostStructureState|listProjectCostStructureStates|deleteCostType|deleteCostCode|deleteWbsNode/);
});

test('Pass 359 service blocks mutable WBS/mapping paths and keeps freeze/reopen transition idempotent', () => {
  assert.match(service, /private async requireOpenCostStructure/);
  assert.ok((service.match(/await this\.requireOpenCostStructure\(repository, projectId\)/g) ?? []).length >= 3);
  assert.match(service, /if \(beforeState\?\.status === COST_STRUCTURE_FROZEN\)[\s\S]*return publicCostStructureState/);
  assert.match(service, /if \(!beforeState \|\| beforeState\.status !== COST_STRUCTURE_FROZEN\)[\s\S]*return publicCostStructureState/);
  assert.match(service, /freezeProjectCostStructure/);
  assert.match(service, /reopenProjectCostStructure/);
  assert.match(service, /action: 'project\.cost_structure_reopened'/);
  assert.match(service, /eventType: 'project\.cost_structure_reopened'/);
  assert.match(service, /WBS_COST_STRUCTURE_FROZEN/);
});

test('Pass 359 reopen route remains intact after the later Pass 360 Module 6 repair routes', () => {
  const routeCalls = [...routes.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.ok(routeCalls.length >= 8);
  assert.ok(routeCalls.includes('POST /api/v1/projects/:projectId/wbs/reopen'));
  assert.match(routes, /operationId: 'module6ReopenWbs'/);
  assert.match(routes, /WBS_WRITE_CONFLICT_RESPONSE[\s\S]*WBS_COST_STRUCTURE_FROZEN/);
  assert.match(routes, /COST_STRUCTURE_FROZEN_RESPONSE = errorResponseSchema\(\['WBS_COST_STRUCTURE_FROZEN'\]\)/);
  assert.doesNotMatch(routes, /app\.delete\(/i);
});

test('Pass 359 React flow reads durable state and removes mutation controls while frozen', () => {
  assert.match(webApi, /export type CostStructureState/);
  assert.match(webApi, /export function reopenWbs\(/);
  assert.match(webHooks, /export function useReopenWbs\(/);
  assert.match(workspace, /costStructureState/);
  assert.match(workspace, /const isFrozen = costStructureState\?\.status === 'FROZEN'/);
  assert.match(workspace, /const canEditCostStructure = canManageWbs && !isFrozen/);
  assert.match(workspace, /Reopen cost structure/);
  assert.match(workspace, /revision \$\{costStructureState\.revisionNo\}/);
  assert.doesNotMatch(workspace, /createCostType|updateCostType|deleteCostType|archiveCostType/);
});

test('Pass 359 live integration and browser scenarios cover durable freeze, defensive database guard and reopen', () => {
  assert.match(integration, /Pass 359 durable freeze blocks WBS and mapping writes until controlled reopen/);
  assert.match(integration, /WBS_COST_STRUCTURE_FROZEN/);
  assert.match(integration, /Project cost structure is frozen/);
  assert.match(integration, /projectCostStructureState\.findUnique/);
  assert.match(integration, /project\.cost_structure_reopened/);
  assert.match(integration, /module6ReopenWbs/);
  assert.match(e2e, /FROZEN · revision 1/);
  assert.match(e2e, /OPEN · revision 2/);
  assert.match(e2e, /Reopen cost structure/);
  assert.match(e2e, /reopenRequest\?\.body/);
});
