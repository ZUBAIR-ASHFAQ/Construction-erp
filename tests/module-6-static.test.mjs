import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/wbs-cost-codes/STAGE-9-MODULE-6-CONTRACT.md', 'utf8');
const contractGate = await readFile('scripts/module-6/verify-stage-9-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-6/verify-stage-9-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-6/verify-stage-9-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-6/verify-stage-9-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-6/verify-stage-9-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-6/verify-stage-9-http.mjs', 'utf8');
const integrationGate = await readFile('scripts/module-6/verify-stage-9-integration.mjs', 'utf8');
const securityGate = await readFile('scripts/module-6/verify-stage-9-security.mjs', 'utf8');
const apiContractGate = await readFile('scripts/module-6/verify-stage-9-api-contract.mjs', 'utf8');
const reactRegisterGate = await readFile('scripts/module-6/verify-stage-9-react-register.mjs', 'utf8');
const reactWorkflowGate = await readFile('scripts/module-6/verify-stage-9-react-workflow.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-6/verify-stage-9-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-6/verify-stage-9-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-6/verify-stage-9.mjs', 'utf8');
const module6BrowserTest = await readFile('tests/e2e/module-6-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const integrationTest = await readFile('tests/integration/module-6-api.integration.test.mjs', 'utf8');
const schema = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/wbs-cost-codes/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts', 'utf8');
const webWorkspace = await readFile('apps/web/src/features/wbs-cost-codes/components/wbs-cost-structure-workspace.tsx', 'utf8');
const webPage = await readFile('apps/web/src/features/wbs-cost-codes/pages/wbs-cost-codes-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260823000700_module_6_wbs_cost_codes_core/migration.sql', 'utf8');
const pass359Migration = await readFile('packages/database/prisma/migrations/20260826000400_module_6_durable_cost_structure_state/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const migrationChecksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));

/** Return true when a repository path currently exists. */
async function pathExists(relativePath) {
  try {
    await access(relativePath);
    return true;
  } catch {
    return false;
  }
}

test('Pass 176 keeps Module 6 at Stage 9 after Module 24B and before Module 4B', () => {
  assert.match(contract, /Stage 8  Module 24B - Project Scope Activation/);
  assert.match(contract, /Stage 9  Module 6 - WBS & Cost Codes/);
  assert.match(contract, /Stage 10 Module 4B - BOQ Project Mapping/);
  assert.match(contract, /Module 6 depends on the existing Project master/);
});

test('Pass 176 freezes exactly the four source-owned Module 6 tables', () => {
  for (const table of ['wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes']) {
    assert.match(contract, new RegExp(`\\b${table}\\b`));
  }
  assert.match(contract, /Module 6 does not own:[\s\S]*projects[\s\S]*project_members[\s\S]*budgets/);
  assert.match(contract, /BOQ Project\/WBS\/cost-code relationship belongs to the following \*\*Module 4B\*\*/);
});

test('Pass 176 keeps exactly seven reviewed routes and no invented Cost Type or reopen CRUD', () => {
  const reviewedRoutes = [
    'GET   /api/v1/projects/:projectId/wbs',
    'POST  /api/v1/projects/:projectId/wbs/nodes',
    'PATCH /api/v1/projects/:projectId/wbs/nodes/:id',
    'GET   /api/v1/cost-codes',
    'POST  /api/v1/cost-codes',
    'PUT   /api/v1/projects/:projectId/cost-code-assignments',
    'POST  /api/v1/projects/:projectId/wbs/freeze'
  ];
  for (const route of reviewedRoutes) assert.ok(contract.includes(route), route);
  assert.match(contract, /Do not add generic CRUD or undocumented commands/);
  assert.match(contract, /GET    \/api\/v1\/cost-types/);
  assert.match(contract, /POST   \/api\/v1\/cost-types/);
  assert.match(contract, /POST   \/api\/v1\/projects\/:projectId\/wbs\/reopen/);
});

test('Pass 176 keeps source permissions, errors and events without unsupported vocabulary', () => {
  for (const permission of ['wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze']) {
    assert.ok(contract.includes(permission), permission);
  }
  for (const code of ['WBS_NODE_NOT_FOUND', 'DUPLICATE_WBS_CODE', 'WBS_CYCLE_DETECTED', 'COST_CODE_IN_USE', 'INVALID_POSTING_COMBINATION']) {
    assert.ok(contract.includes(code), code);
  }
  for (const event of ['wbs.node_created', 'wbs.updated', 'cost_code.created', 'project.cost_structure_frozen']) {
    assert.ok(contract.includes(event), event);
  }
  assert.match(contract, /source does not define a separate Cost Type permission/);
  assert.match(contract, /does not define a dedicated frozen\/reopen error/);
});

test('Pass 176 source ambiguities remain explicit after persistence preparation', () => {
  assert.match(contract, /Cost Type master vs API route table/);
  assert.match(contract, /Archive unused codes vs API route table/);
  assert.match(contract, /Frozen baseline reopen\/revision vs API route table/);
  assert.match(contract, /Public status\/category values/);
  assert.match(contract, /WBS `level` ownership/);
  assert.match(contractGate, /unresolvedSourceAmbiguities/);
  assert.match(persistenceGate, /unresolvedPersistenceContract/);
});

test('Pass 181 keeps exactly the four Module 6 Prisma models and adds routes/index after the service', async () => {
  for (const model of ['WbsNode', 'CostCode', 'CostType', 'ProjectCostCode']) {
    assert.match(prisma, new RegExp(`model ${model} \{`));
  }
  for (const file of [
    'wbs-cost-codes.schema.ts',
    'wbs-cost-codes.repository.ts',
    'wbs-cost-codes.service.ts',
    'wbs-cost-codes.routes.ts',
    'index.ts'
  ]) {
    assert.equal(await pathExists(`apps/api/src/modules/wbs-cost-codes/${file}`), true, file);
  }
  assert.doesNotMatch(prisma, /model\s+ProjectCostStructure\s*\{/);
});

test('Pass 177 migration creates only source-owned Module 6 tables and leaves Module 4B absent', () => {
  for (const table of ['wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes']) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(migration, /CREATE TABLE "(?:project_cost_structures|budgets|commitments|cost_actuals)"/);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:boqs|boq_items)"/);
  assert.doesNotMatch(migration, /ADD COLUMN "(?:wbs_node_id|cost_code_id|project_id)"/);
});

test('Pass 177 WBS persistence enforces Project ownership, sibling uniqueness and hierarchy safety', () => {
  assert.match(migration, /wbs_nodes_project_company_fkey[\s\S]*FOREIGN KEY \("project_id", "company_id"\)[\s\S]*REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /wbs_nodes_parent_fkey[\s\S]*FOREIGN KEY \("parent_id"\)[\s\S]*REFERENCES "wbs_nodes"\("id"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "wbs_nodes_root_code_uq"[\s\S]*WHERE "parent_id" IS NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX "wbs_nodes_child_code_uq"[\s\S]*WHERE "parent_id" IS NOT NULL/);
  assert.match(migration, /CREATE FUNCTION "module_6_validate_wbs_parent"/);
  assert.match(migration, /parent_project_id <> NEW\."project_id"/);
  assert.match(migration, /WITH RECURSIVE ancestors/);
  assert.match(migration, /WBS hierarchy cycle detected/);
});

test('Pass 177 Cost Code and Cost Type persistence stays Company-owned without invented enums', () => {
  assert.match(migration, /cost_codes_company_fkey[\s\S]*REFERENCES "companies"\("id"\)/);
  assert.match(migration, /cost_types_company_fkey[\s\S]*REFERENCES "companies"\("id"\)/);
  assert.match(migration, /cost_codes_company_code_uq/);
  assert.match(migration, /cost_types_company_code_uq/);
  assert.match(migration, /cost_codes_category_not_blank/);
  assert.match(migration, /cost_codes_status_not_blank/);
  assert.match(migration, /cost_types_status_not_blank/);
  assert.doesNotMatch(migration, /CREATE TYPE .*cost|CHECK \("status" IN \(/i);
});

test('Pass 177 Project cost-code mappings enforce one valid Project/WBS/Company combination', () => {
  for (const constraint of [
    'project_cost_codes_project_fkey',
    'project_cost_codes_wbs_node_fkey',
    'project_cost_codes_cost_code_fkey',
    'project_cost_codes_cost_type_fkey'
  ]) assert.ok(migration.includes(constraint), constraint);
  assert.match(migration, /project_cost_codes_combination_uq/);
  assert.match(migration, /CREATE FUNCTION "module_6_validate_project_cost_code"/);
  assert.match(migration, /wbs_project_id IS DISTINCT FROM NEW\."project_id"/);
  assert.match(migration, /cost_code_company_id IS DISTINCT FROM project_company_id/);
  assert.match(migration, /cost_type_company_id IS DISTINCT FROM project_company_id/);
});

test('Pass 177 core migration remains unchanged while Pass 359 adds the later durable-freeze repair', () => {
  assert.doesNotMatch(migration, /is_frozen|frozen_at|project_cost_structure_states/);
  assert.match(contract, /no `is_frozen`, `frozen_at` or extra `project_cost_structures` table is invented/);
  assert.match(prisma, /model ProjectCostStructureState \{/);
  assert.match(pass359Migration, /CREATE TABLE "project_cost_structure_states"/);
  assert.match(contract, /Pass 359 post-Stage-23 repair amendment/);
});

test('Pass 177 migration remains registered as the Stage-9 immutable migration gate', () => {
  const gate = migrationGates.gates.find((item) => item.gate === 'module-6-wbs-cost-codes-core-persistence');
  assert.ok(gate);
  assert.equal(gate.stage, 9);
  assert.deepEqual(gate.migrations, ['20260823000700_module_6_wbs_cost_codes_core']);
  assert.match(migrationChecksums.migrations['20260823000700_module_6_wbs_cost_codes_core'], /^[a-f0-9]{64}$/);
});

test('Pass 177 persistence gate stays honest while Stage-8 live handoff is pending', () => {
  assert.match(persistenceGate, /PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6/);
  assert.match(persistenceGate, /STAGE_8_ACCEPTED_READY_FOR_STAGE_9/);
  assert.match(persistenceGate, /STAGE_8_REPAIR_HOLD_CLEARED/);
  assert.match(persistenceGate, /STAGE_9_PERSISTENCE_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(persistenceGate, /runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted/);
  assert.equal(rootPackage.scripts['module-6:contract:gate'], 'node scripts/module-6/verify-stage-9-contract.mjs');
  assert.equal(rootPackage.scripts['module-6:persistence:gate'], 'node scripts/module-6/verify-stage-9-persistence.mjs');
});


test('Pass 178 source routes remain present while later reviewed repairs extend the Module 6 boundary', () => {
  for (const route of [
    '/api/v1/projects/:projectId/wbs',
    '/api/v1/projects/:projectId/wbs/nodes',
    '/api/v1/projects/:projectId/wbs/nodes/:id',
    '/api/v1/cost-codes',
    '/api/v1/projects/:projectId/cost-code-assignments',
    '/api/v1/projects/:projectId/wbs/freeze'
  ]) assert.ok(schema.includes(route), route);
  assert.match(schema, /MODULE_6_HTTP_ROUTES/);
  for (const permission of ['wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze']) {
    assert.ok(schema.includes(permission), permission);
  }
  assert.match(schema, /route: '\/api\/v1\/projects\/:projectId\/wbs\/reopen'/);
  assert.match(schema, /route: '\/api\/v1\/cost-types'/);
  assert.doesNotMatch(schema, /method: 'DELETE'/);
});

test('Pass 178 request schemas stay strict and never accept nested Company, actor, permission or Project authority', () => {
  for (const name of [
    'module6ProjectParamsSchema',
    'module6WbsNodeParamsSchema',
    'getWbsTreeQuerySchema',
    'createWbsNodeBodySchema',
    'updateWbsNodeBodySchema',
    'listCostCodesQuerySchema',
    'createCostCodeBodySchema',
    'projectCostCodeAssignmentInputSchema',
    'replaceProjectCostCodeAssignmentsBodySchema',
    'freezeWbsBodySchema'
  ]) assert.match(schema, new RegExp(`export const ${name} = [\\s\\S]*?\\.strict\\(\\)`));

  assert.match(schema, /MODULE_6_SERVER_OWNED_REQUEST_FIELDS[\s\S]*companyId[\s\S]*actorUserId[\s\S]*permissions[\s\S]*projectScope/);
  const createNode = schema.match(/export const createWbsNodeBodySchema =[\s\S]*?\.strict\(\);/);
  assert.ok(createNode);
  assert.doesNotMatch(createNode[0], /companyId|actorUserId|permissions|projectScope|projectId|level/);
  const assignment = schema.match(/export const projectCostCodeAssignmentInputSchema =[\s\S]*?\.strict\(\);/);
  assert.ok(assignment);
  assert.doesNotMatch(assignment[0], /companyId|actorUserId|permissions|projectScope|projectId/);
});

test('Pass 178 resolves WBS level as server-derived without inventing status/category enums', () => {
  assert.match(contract, /`level` is response-only and will be server-derived from hierarchy/);
  assert.match(schema, /wbsNodeResponseSchema[\s\S]*level: nonNegativeIntegerSchema/);
  assert.doesNotMatch(schema, /createWbsNodeBodySchema[\s\S]{0,500}level:/);
  assert.doesNotMatch(schema, /updateWbsNodeBodySchema[\s\S]{0,500}level:/);
  assert.match(schema, /const statusSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(32\)/);
  assert.match(schema, /const categorySchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/);
  assert.doesNotMatch(schema, /wbsStatusSchema\s*=\s*z\.enum|costCodeStatusSchema\s*=\s*z\.enum|costCodeCategorySchema\s*=\s*z\.enum/);
});

test('Pass 178 makes replace-all Project mappings readable without adding another HTTP route', () => {
  assert.match(schema, /wbsTreeResponseSchema[\s\S]*nodes: z\.array\(wbsNodeResponseSchema\)[\s\S]*assignments: z\.array\(projectCostCodeAssignmentResponseSchema\)/);
  assert.match(schema, /validateUniqueProjectCostCodeAssignments/);
  assert.match(schema, /Each WBS, Cost Code and Cost Type combination may appear only once/);
  assert.match(schema, /replaceProjectCostCodeAssignmentsResponseSchema/);
  assert.doesNotMatch(schema, /GET[^\n]*cost-code-assignments/);
});

test('Pass 178 historical Cost Type gap remains documented while Pass 360 closes it without new permission vocabulary', () => {
  assert.match(contract, /No Cost Type list\/create request schema, permission or HTTP route is added/);
  assert.match(schema, /createCostTypeBodySchema|listCostTypesQuerySchema/);
  assert.doesNotMatch(schema, /cost_types\.manage|cost_types\.read/);
  assert.match(schema, /freezeWbsBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /reopenWbsBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /costStructureStateResponseSchema[\s\S]*status: costStructureStatusSchema[\s\S]*revisionNo:[\s\S]*frozenAt:/);
  assert.match(contract, /This repair does \*\*not\*\* add Cost Type CRUD/);
});

test('Pass 178 schema gate remains honest while Stage-8 live handoff is pending', () => {
  assert.match(schemaGate, /STAGE_9_SCHEMA_READY_FOR_PASS_179/);
  assert.match(schemaGate, /STAGE_9_SCHEMA_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted/);
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.equal(rootPackage.scripts['module-6:schema:gate'], 'node scripts/module-6/verify-stage-9-schema.mjs');
});

test('Pass 179 repository derives Company ownership only from trusted request context', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /const scope = requireCompanyRepositoryScope\(\)/);
  assert.match(repository, /scope\.where\(\{/);
  assert.match(repository, /scope\.createData\(\{/);
  assert.doesNotMatch(repository, /companyId:\s*input\./);
  assert.doesNotMatch(repository, /companyId:\s*projectId/);
});

test('Pass 179 repository keeps WBS reads and writes bound to one same-company Project', () => {
  for (const method of [
    'findProjectById',
    'lockProjectCostStructure',
    'listWbsNodes',
    'findWbsNodeById',
    'findWbsNodesByIds',
    'findSiblingWbsNodeByCode',
    'createWbsNode',
    'updateWbsNode'
  ]) assert.match(repository, new RegExp(`async ${method}\\(`));
  assert.match(repository, /project:\s*\{ companyId: scope\.companyId \}/);
  assert.match(repository, /WHERE id = \$\{projectId\}::uuid[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(repository, /orderBy: \[\{ level: 'asc' \}, \{ sortOrder: 'asc' \}, \{ code: 'asc' \}, \{ id: 'asc' \}\]/);
});

test('Pass 179 repository primitives remain while Pass 360 adds focused Cost Type and archive lifecycle persistence', () => {
  for (const method of ['listCostCodes', 'findCostCodeById', 'findCostCodeByCode', 'findCostCodesByIds', 'createCostCode']) {
    assert.match(repository, new RegExp(`async ${method}\\(`));
  }
  assert.match(repository, /async findCostTypesByIds\(/);
  for (const method of ['listCostTypes', 'findCostTypeById', 'findCostTypeByCode', 'createCostType', 'updateCostTypeStatus', 'updateCostCodeStatus']) {
    assert.match(repository, new RegExp(`async ${method}\\(`), method);
  }
  assert.doesNotMatch(repository, /deleteCostType\(|deleteCostCode\(|deleteWbsNode\(/);
});

test('Pass 179 repository supports safe complete Project mapping replacement primitives', () => {
  for (const method of [
    'listProjectCostCodeAssignments',
    'deleteProjectCostCodeAssignments',
    'createProjectCostCodeAssignments'
  ]) assert.match(repository, new RegExp(`async ${method}\\(`));
  assert.match(repository, /const \[wbsNodes, costCodes, costTypes\] = await Promise\.all/);
  assert.match(repository, /wbsNodes\.length !== wbsNodeIds\.length/);
  assert.match(repository, /costCodes\.length !== costCodeIds\.length/);
  assert.match(repository, /costTypes\.length !== costTypeIds\.length/);
  assert.match(repository, /projectCostCode\.createMany/);
  assert.match(repository, /return this\.listProjectCostCodeAssignments\(projectId\)/);
});

test('Pass 179 repository remains persistence-only after later service and route passes', async () => {
  assert.equal(await pathExists('apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts'), true);
  assert.doesNotMatch(repository, /requireRequestSecurityContext|findEffectivePermissionCodesForProject|createAudit|enqueue|outbox/);
  assert.match(repositoryGate, /exactProjectAuthorizationDeferredToServiceResourcePolicy: true/);
  assert.match(repositoryGate, /STAGE_9_REPOSITORY_READY_FOR_PASS_180/);
  assert.match(repositoryGate, /STAGE_9_REPOSITORY_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.equal(rootPackage.scripts['module-6:repository:gate'], 'node scripts/module-6/verify-stage-9-repository.mjs');
});

test('Pass 180 source workflows remain while Passes 359-360 add only reviewed Module 6 repair workflows', () => {
  for (const method of [
    'getWbsTree',
    'createWbsNode',
    'updateWbsNode',
    'listCostCodes',
    'createCostCode',
    'replaceProjectCostCodeAssignments',
    'freezeWbs'
  ]) assert.match(service, new RegExp(`async ${method}\\(`), method);

  assert.match(service, /async reopenWbs\(/);
  for (const method of ['archiveWbsNode', 'restoreWbsNode', 'archiveCostCode', 'restoreCostCode', 'listCostTypes', 'createCostType', 'archiveCostType', 'restoreCostType']) {
    assert.match(service, new RegExp(`async ${method}\\(`), method);
  }
  assert.doesNotMatch(service, /deleteWbsNode|deleteCostCode|deleteCostType/);
  assert.doesNotMatch(service, /boq|budget|commitment|actual|forecast/i);
});

test('Pass 180 reuses Module 24B exact Project resource policy instead of trusting browser scope', () => {
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /scope\.kind === 'not-resolved'/);
  assert.match(service, /scope\.kind === 'restricted' && !scope\.projectIds\.includes\(projectId\)/);
  assert.match(service, /assignmentStatuses: \[ASSIGNMENT_ACTIVE\]/);
  assert.match(service, /roleStatuses: \[ROLE_ACTIVE\]/);
  assert.doesNotMatch(service, /companyId:\s*input\.|actorUserId:\s*input\.|permissions:\s*input\.|projectScope:\s*input\./);
});

test('Pass 180 derives hierarchy level, rejects cycles and keeps descendant levels consistent', () => {
  assert.match(service, /level: parent \? parent\.level \+ 1 : 0/);
  assert.match(service, /wouldCreateWbsCycle\(nodes, nodeId, nextParentId\)/);
  assert.match(service, /WBS_CYCLE_DETECTED/);
  assert.match(service, /findSiblingWbsNodeByCode/);
  assert.match(service, /DUPLICATE_WBS_CODE/);
  assert.match(service, /const levelDelta = nextLevel - before\.level/);
  assert.match(service, /isWbsDescendant\(nodes, node\.id, nodeId\)/);
  assert.match(service, /level: node\.level \+ levelDelta/);
});

test('Pass 180 replaces Project cost-code mappings atomically and validates active source records', () => {
  assert.match(service, /async replaceProjectCostCodeAssignments/);
  assert.match(service, /withTransaction\(this\.db/);
  assert.match(service, /lockProjectCostStructure\(projectId\)/);
  assert.match(service, /findWbsNodesByIds\(projectId, wbsNodeIds\)/);
  assert.match(service, /findCostCodesByIds\(costCodeIds\)/);
  assert.match(service, /findCostTypesByIds\(costTypeIds\)/);
  assert.match(service, /wbsNodes\.some\(\(node\) => !isActiveStatus\(node\.status\)\)/);
  assert.match(service, /costCodes\.some\(\(code\) => !isActiveStatus\(code\.status\)\)/);
  assert.match(service, /costTypes\.some\(\(type\) => !isActiveStatus\(type\.status\)\)/);
  assert.match(service, /INVALID_POSTING_COMBINATION/);
  assert.match(service, /deleteProjectCostCodeAssignments\(projectId\)/);
  assert.match(service, /createProjectCostCodeAssignments\(projectId, input\.assignments\)/);
  assert.match(service, /action: 'project\.cost_code_assignments_changed'/);
  assert.doesNotMatch(service, /eventType: 'project\.cost_code_assignments_changed'/);
});

test('Pass 180 keeps the four source events and Pass 359 adds only the reopen transition event', () => {
  for (const eventName of [
    'wbs.node_created',
    'wbs.updated',
    'cost_code.created',
    'project.cost_structure_frozen'
  ]) {
    assert.ok(service.includes(`eventType: '${eventName}'`), eventName);
  }
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /eventType: 'project\.cost_structure_reopened'/);
  assert.doesNotMatch(service, /eventType: 'wbs\.deleted'|eventType: 'cost_code\.archived'/);
});

test('Pass 359 makes freeze durable and provides one controlled reopen transition', () => {
  const freezeSection = service.slice(service.indexOf('async freezeWbs('), service.indexOf('async reopenWbs('));
  assert.match(freezeSection, /freezeProjectCostStructure/);
  assert.match(freezeSection, /action: 'project\.cost_structure_frozen'/);
  assert.match(freezeSection, /eventType: 'project\.cost_structure_frozen'/);
  assert.match(service, /async reopenWbs\(/);
  assert.match(service, /reopenProjectCostStructure/);
  assert.match(service, /revisionNo/);
  assert.match(service, /WBS_COST_STRUCTURE_FROZEN/);
  assert.match(contract, /Pass 359 post-Stage-23 repair amendment/);
});

test('Pass 180 service gate remains honest while Stage-8 live handoff is pending', () => {
  assert.equal(rootPackage.scripts['module-6:service:gate'], 'node scripts/module-6/verify-stage-9-service.mjs');
  assert.match(serviceGate, /STAGE_9_SERVICE_READY_FOR_PASS_181/);
  assert.match(serviceGate, /STAGE_9_SERVICE_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted/);
  assert.match(serviceGate, /routesGenerated: false/);
  assert.match(serviceGate, /Pass 181 - Module 6 Fastify routes, module index and app registration/);
});


test('Pass 181 source operations remain while Passes 359-360 add the reviewed repair routes', () => {
  const routeCalls = [...routes.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);

  for (const expected of [
    'GET /api/v1/projects/:projectId/wbs',
    'POST /api/v1/projects/:projectId/wbs/nodes',
    'PATCH /api/v1/projects/:projectId/wbs/nodes/:id',
    'GET /api/v1/cost-codes',
    'POST /api/v1/cost-codes',
    'PUT /api/v1/projects/:projectId/cost-code-assignments',
    'POST /api/v1/projects/:projectId/wbs/freeze',
    'POST /api/v1/projects/:projectId/wbs/reopen',
    'GET /api/v1/cost-types',
    'POST /api/v1/cost-types'
  ]) assert.ok(routeCalls.includes(expected), expected);
  assert.equal(routeCalls.length, 16);
  assert.doesNotMatch(routes, /app\.delete\(/i);
});

test('Pass 181 authenticates every Module 6 route and keeps exact Project authorization in the service', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 16);
  assert.match(routes, /requireCompanyRoutePermission\('cost_codes\.read'\)/);
  assert.match(routes, /requireCompanyRoutePermission\('cost_codes\.manage'\)/);
  assert.doesNotMatch(routes, /requireCompanyRoutePermission\('wbs\./);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /'wbs\.read'/);
  assert.match(service, /'wbs\.manage'/);
  assert.match(service, /'wbs\.freeze'/);
});

test('Pass 181 reuses strict Zod boundaries and does not accept browser-owned authority', () => {
  for (const schemaName of [
    'module6ProjectParamsSchema',
    'module6WbsNodeParamsSchema',
    'getWbsTreeQuerySchema',
    'createWbsNodeBodySchema',
    'updateWbsNodeBodySchema',
    'listCostCodesQuerySchema',
    'createCostCodeBodySchema',
    'replaceProjectCostCodeAssignmentsBodySchema',
    'freezeWbsBodySchema'
  ]) assert.ok(routes.includes(schemaName), schemaName);

  assert.doesNotMatch(routes, /companyId:\s*\{|actorUserId:\s*\{|permissions:\s*\{|projectScope:\s*\{|level:\s*\{[^\n]*body/i);
  assert.match(routes, /parseRequest\(freezeWbsBodySchema, request\.body \?\? \{\}, 'body'\)/);
});

test('Pass 181 serializes safe Module 6 DTOs without leaking Company ownership', () => {
  assert.match(routes, /function serializeWbsNode/);
  assert.match(routes, /function serializeCostCode/);
  assert.match(routes, /function serializeProjectAssignment/);
  assert.doesNotMatch(routes, /companyId:\s*(?:node|code|assignment)\./);
  assert.match(routes, /wbsNodeResponseSchema\.parse/);
  assert.match(routes, /costCodeResponseSchema\.parse/);
  assert.match(routes, /projectCostCodeAssignmentResponseSchema\.parse/);
});

test('Pass 181 exports the Module 6 public boundary and registers it once in app.ts', () => {
  assert.match(moduleIndex, /export \{ registerWbsCostCodesRoutes \} from '\.\/wbs-cost-codes\.routes\.js';/);
  assert.match(moduleIndex, /export \{ WbsCostCodesService \} from '\.\/wbs-cost-codes\.service\.js';/);
  assert.match(app, /import \{ registerWbsCostCodesRoutes \} from '\.\/modules\/wbs-cost-codes\/index\.js';/);
  assert.equal((app.match(/app\.register\(registerWbsCostCodesRoutes, \{ database: options\.database \}\);/g) ?? []).length, 1);
});

test('Pass 184 completes the OpenAPI error contract that Pass 181 intentionally deferred', () => {
  assert.match(routes, /operationId: 'module6GetWbsTree'/);
  assert.match(routes, /operationId: 'module6FreezeWbs'/);
  assert.doesNotMatch(routes, /ERROR_RESPONSE_JSON_SCHEMA|COMMON_ERROR_RESPONSES/);
  assert.match(routes, /function errorResponseSchema/);
  assert.match(routes, /required: \['code', 'message', 'requestId'\]/);
  assert.match(httpGate, /OpenAPI stable-error enum verification remains deferred to the dedicated API-contract pass/);
  assert.match(httpGate, /PostgreSQL\/Fastify integration remains deferred to Pass 182/);
});

test('Pass 181 HTTP gate remains fail-honest while the Stage-8 live handoff is pending', () => {
  assert.equal(rootPackage.scripts['module-6:http:gate'], 'node scripts/module-6/verify-stage-9-http.mjs');
  assert.match(httpGate, /STAGE_9_HTTP_READY_FOR_PASS_182/);
  assert.match(httpGate, /STAGE_9_HTTP_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted/);
  assert.match(httpGate, /integrationTestsGenerated: false/);
  assert.match(httpGate, /Pass 182 - Module 6 PostgreSQL and Fastify integration tests/);
});


test('Pass 182 adds one focused PostgreSQL/Fastify integration file without production Module 6 changes', async () => {
  assert.equal(await pathExists('tests/integration/module-6-api.integration.test.mjs'), true);
  assert.equal(await pathExists('scripts/module-6/verify-stage-9-integration.mjs'), true);
  assert.match(integrationTest, /Module 6 full PostgreSQL\/Fastify workflow persists hierarchy, mapping, freeze, audit and outbox/);
  assert.match(integrationTest, /Module 6 rejects duplicate hierarchy, cycles and invalid posting combinations without partial mapping state/);
  assert.match(integrationTest, /Module 6 HTTP boundary rejects invalid authority\/input and one missing Project permission/);
});

test('Pass 182 integration workflow covers all seven reviewed operations and durable evidence', () => {
  for (const route of [
    '/api/v1/projects/${PROJECT_ID}/wbs',
    '/api/v1/projects/${input.projectId ?? PROJECT_ID}/wbs/nodes',
    '/api/v1/projects/${PROJECT_ID}/wbs/nodes/${rootA.id}',
    '/api/v1/cost-codes',
    '/api/v1/projects/${PROJECT_ID}/cost-code-assignments',
    '/api/v1/projects/${PROJECT_ID}/wbs/freeze'
  ]) assert.ok(integrationTest.includes(route), route);

  assert.match(integrationTest, /client\.auditLog\.findMany/);
  assert.match(integrationTest, /client\.outboxEvent\.findMany/);
  assert.match(integrationTest, /project\.cost_code_assignments_changed/);
  for (const eventName of ['wbs.node_created', 'wbs.updated', 'cost_code.created', 'project.cost_structure_frozen']) {
    assert.ok(integrationTest.includes(eventName), eventName);
  }
});

test('Pass 182 proves hierarchy, mapping validation and transaction rollback while leaving the exhaustive security matrix to Pass 183', () => {
  assert.match(integrationTest, /DUPLICATE_WBS_CODE/);
  assert.match(integrationTest, /WBS_CYCLE_DETECTED/);
  assert.match(integrationTest, /INVALID_POSTING_COMBINATION/);
  assert.match(integrationTest, /foreignProjectNode/);
  assert.match(integrationTest, /INACTIVE_COST_TYPE_ID/);
  assert.match(integrationTest, /await assert\.rejects\(service\.replaceProjectCostCodeAssignments/);
  assert.match(integrationTest, /afterDatabaseRollback/);
  assert.match(integrationTest, /level: 99/);
  assert.match(integrationTest, /companyId: COMPANY_B_ID/);
  assert.match(integrationTest, /assert\.equal\(response\.statusCode, 403/);
  assert.match(integrationGate, /deferredToPass183/);
});

test('Pass 182 integration gate is static/live split and remains fail-honest while Stage-8 live handoff is pending', () => {
  assert.equal(rootPackage.scripts['test:integration:module-6'].includes('tests/integration/module-6-api.integration.test.mjs'), true);
  assert.equal(rootPackage.scripts['module-6:integration:gate'], 'node scripts/module-6/verify-stage-9-integration.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-6:integration:gate:live'], 'node scripts/module-6/verify-stage-9-integration.mjs --mode=live');
  assert.match(integrationGate, /STAGE_9_INTEGRATION_VERIFIED_READY_FOR_PASS_183/);
  assert.match(integrationGate, /STAGE_9_INTEGRATION_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(integrationGate, /STAGE_8_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationGate, /runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted/);
});

test('Pass 183 keeps security verification in the existing Module 6 integration file with no production runtime change', async () => {
  assert.equal(await pathExists('scripts/module-6/verify-stage-9-security.mjs'), true);
  assert.match(integrationTest, /Module 6 security enforces authentication, permissions and exact Project scope/);
  assert.match(integrationTest, /Module 6 security isolates companies and rejects client-owned authority at HTTP, repository and service boundaries/);
  assert.match(integrationTest, /Module 6 security attacks live ownership and mapping constraints directly/);
  assert.match(securityGate, /productionRuntimeChanges: 0/);
});

test('Pass 183 covers the reviewed permission, membership and Company isolation matrix', () => {
  assert.match(integrationTest, /protectedRequests/);
  assert.match(integrationTest, /readerDeniedRequests/);
  assert.match(integrationTest, /PROJECT_2_ID/);
  assert.match(integrationTest, /PROJECT_B_ID/);
  assert.match(integrationTest, /costCodeB/);
  assert.match(integrationTest, /Project membership never creates missing role permissions|DIRECT-READER-WRITE/);
  assert.match(integrationTest, /repository\.findProjectById\(PROJECT_B_ID\)/);
  assert.match(integrationTest, /service\.getWbsTree\(PROJECT_2_ID\)/);
});

test('Pass 183 rejects browser authority and verifies database ownership constraints directly', () => {
  for (const authority of ['companyId', 'actorUserId', 'permissions', 'projectScope']) {
    assert.ok(integrationTest.includes(`['${authority}'`) || integrationTest.includes(`'${authority}'`), authority);
  }
  assert.match(integrationTest, /projectId: PROJECT_2_ID/);
  assert.match(integrationTest, /companyId=\$\{COMPANY_B_ID\}/);
  assert.match(integrationTest, /DB-CROSS-COMPANY/);
  assert.match(integrationTest, /DB-CROSS-PROJECT-PARENT/);
  assert.match(integrationTest, /foreignCostCode\.id/);
  assert.match(integrationTest, /Duplicate root code must fail/);
});

test('Pass 183 security gate is static/live split and remains fail-honest while Stage-8 live handoff is pending', () => {
  assert.equal(rootPackage.scripts['test:security:module-6'].includes('--test-name-pattern=\"^Module 6 security\"'), true);
  assert.equal(rootPackage.scripts['module-6:security:gate'], 'node scripts/module-6/verify-stage-9-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-6:security:gate:live'], 'node scripts/module-6/verify-stage-9-security.mjs --mode=live');
  assert.match(securityGate, /STAGE_9_SECURITY_VERIFIED_READY_FOR_PASS_184/);
  assert.match(securityGate, /STAGE_9_SECURITY_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(securityGate, /STAGE_8_LIVE_HANDOFF_REQUIRED/);
  assert.match(securityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(securityGate, /runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted/);
  assert.match(securityGate, /Pass 184 - Module 6 OpenAPI and exact API-contract verification/);
});



test('Pass 184 adds one guarded generated OpenAPI gate without adding another business route', async () => {
  assert.equal(await pathExists('scripts/module-6/verify-stage-9-api-contract.mjs'), true);
  assert.equal(rootPackage.scripts['test:api-contract:module-6'].includes('^Module 6 API contract'), true);
  assert.equal(rootPackage.scripts['module-6:api-contract:gate'], 'node scripts/module-6/verify-stage-9-api-contract.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-6:api-contract:gate:live'], 'node scripts/module-6/verify-stage-9-api-contract.mjs --mode=live');
  assert.match(apiContractGate, /module-6-generated-openapi-contract/);
  assert.match(apiContractGate, /productionBusinessBehaviorChanges: 0/);
});

test('Pass 184 freezes exact Module 6 request, success and bearer-security OpenAPI schemas', () => {
  assert.match(integrationTest, /Module 6 API contract exposes the seven source operations plus the Pass 359 reopen repair with stable schemas/);
  assert.match(integrationTest, /url: '\/openapi\.json'/);
  for (const operationId of [
    'module6GetWbsTree',
    'module6CreateWbsNode',
    'module6UpdateWbsNode',
    'module6ListCostCodes',
    'module6CreateCostCode',
    'module6ReplaceProjectCostCodeAssignments',
    'module6FreezeWbs',
    'module6ReopenWbs'
  ]) assert.ok(integrationTest.includes(operationId), operationId);
  assert.match(integrationTest, /assert\.equal\(freeze\.requestBody, undefined\)/);
  assert.match(integrationTest, /document\.components\?\.securitySchemes\?\.bearerAuth/);
  assert.match(integrationTest, /documentedModule6Operations\.sort\(\), actualOperations\.sort\(\)/);
});

test('Pass 184 documents real error envelopes and only currently reachable stable Module 6 codes', () => {
  assert.match(routes, /WBS_UPDATE_VALIDATION_RESPONSE = errorResponseSchema\(\['INVALID_REQUEST', 'WBS_CYCLE_DETECTED'\]\)/);
  assert.match(routes, /POSTING_VALIDATION_RESPONSE = errorResponseSchema\(\['INVALID_REQUEST', 'INVALID_POSTING_COMBINATION'\]\)/);
  assert.match(routes, /WBS_NOT_FOUND_RESPONSE = errorResponseSchema\(\['RESOURCE_NOT_FOUND', 'WBS_NODE_NOT_FOUND'\]\)/);
  assert.match(routes, /WBS_WRITE_CONFLICT_RESPONSE = errorResponseSchema\([\s\S]*'DUPLICATE_WBS_CODE'[\s\S]*'WBS_COST_STRUCTURE_FROZEN'/);
  assert.match(integrationTest, /assert\.equal\(exposedCodes\.has\('COST_CODE_IN_USE'\), false\)/);
  assert.match(apiContractGate, /sourceDefinedButUnreachableError/);
  assert.match(contract, /This repair does \*\*not\*\* add Cost Type CRUD, archive\/delete APIs/);
});

test('Pass 184 API-contract gate is static\/live split and remains fail-honest while Stage-8 live handoff is pending', () => {
  assert.match(apiContractGate, /STAGE_9_API_CONTRACT_VERIFIED_READY_FOR_PASS_185/);
  assert.match(apiContractGate, /STAGE_9_API_CONTRACT_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(apiContractGate, /STAGE_8_LIVE_HANDOFF_REQUIRED/);
  assert.match(apiContractGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(apiContractGate, /runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted/);
  assert.match(apiContractGate, /Pass 185 - Module 6 React API and TanStack Query hooks/);
});


test('Pass 185 source browser calls remain while Passes 359-360 add reviewed repair calls', () => {
  for (const functionName of [
    'getWbsTree',
    'createWbsNode',
    'updateWbsNode',
    'listCostCodes',
    'createCostCode',
    'replaceProjectCostCodeAssignments',
    'freezeWbs',
    'reopenWbs'
  ]) {
    assert.match(webApi, new RegExp(`export function ${functionName}\\(`), functionName);
  }

  for (const route of [
    'projects/${projectId}/wbs',
    'projects/${projectId}/wbs/nodes',
    'projects/${projectId}/wbs/nodes/${nodeId}',
    'cost-codes',
    'projects/${projectId}/cost-code-assignments',
    'projects/${projectId}/wbs/freeze',
    'projects/${projectId}/wbs/reopen'
  ]) assert.ok(webApi.includes(route), route);

  assert.match(webApi, /cost-types/);
  assert.match(webApi, /\/archive/);
  assert.doesNotMatch(webApi, /method: 'DELETE'/i);
});

test('Pass 185 browser write types keep server-owned Module 6 authority out of request bodies', () => {
  for (const typeName of [
    'CreateWbsNodeInput',
    'UpdateWbsNodeInput',
    'CreateCostCodeInput',
    'ProjectCostCodeAssignmentInput'
  ]) assert.ok(webApi.includes(`export type ${typeName}`), typeName);

  const requestTypes = webApi.slice(
    webApi.indexOf('export type CreateWbsNodeInput'),
    webApi.indexOf('export type ReplaceProjectCostCodeAssignmentsResult')
  );
  for (const forbidden of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'effectivePermissions',
    'createdBy',
    'updatedBy',
    'level:'
  ]) assert.doesNotMatch(requestTypes, new RegExp(forbidden), forbidden);

  const assignmentInput = webApi.slice(
    webApi.indexOf('export type ProjectCostCodeAssignmentInput'),
    webApi.indexOf('export type ReplaceProjectCostCodeAssignmentsInput')
  );
  assert.doesNotMatch(assignmentInput, /projectId/);
});

test('Pass 185 keeps Cost Code reads bounded and freeze bodyless in the browser API', () => {
  assert.match(webApi, /if \(input\.page !== undefined\) query\.set\('page'/);
  assert.match(webApi, /if \(input\.pageSize !== undefined\) query\.set\('pageSize'/);
  const freezeSection = webApi.slice(webApi.indexOf('export function freezeWbs'));
  assert.match(freezeSection, /method: 'POST'/);
  assert.doesNotMatch(freezeSection, /body:/);
});

test('Pass 185 query layer stays centralized while Passes 359-360 add focused repair hooks', () => {
  for (const hookName of [
    'useWbsTree',
    'useCostCodes',
    'useCreateWbsNode',
    'useUpdateWbsNode',
    'useCreateCostCode',
    'useReplaceProjectCostCodeAssignments',
    'useFreezeWbs',
    'useReopenWbs',
    'useCostTypes',
    'useArchiveWbsNode',
    'useRestoreWbsNode',
    'useArchiveCostCode',
    'useRestoreCostCode',
    'useCreateCostType',
    'useArchiveCostType',
    'useRestoreCostType'
  ]) {
    assert.match(webHooks, new RegExp(`export function ${hookName}\\(`), hookName);
  }

  assert.match(webHooks, /\['module-6', 'wbs-cost-codes'\]/);
  assert.match(webHooks, /enabled: enabled && projectId !== null/);
  assert.ok((webHooks.match(/invalidateQueries\(\{ queryKey: MODULE_6_QUERY_KEY \}\)/g) ?? []).length >= 6);
});

test('Pass 185 keeps its API and hooks boundary intact after the later workflow pass adds UI', async () => {
  assert.equal(await pathExists('apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts'), true);
  assert.equal(await pathExists('apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts'), true);
  assert.match(reactRegisterGate, /componentsGenerated: false/);
  assert.match(reactRegisterGate, /pagesGenerated: false/);
});

test('Pass 185 React-register gate remains fail-honest about live handoff and unresolved UI contract gaps', () => {
  assert.equal(rootPackage.scripts['module-6:react-register:gate'], 'node scripts/module-6/verify-stage-9-react-register.mjs');
  assert.match(reactRegisterGate, /STAGE_9_REACT_REGISTER_PREPARED_FOR_DEPENDENCY_BACKED_BUILD/);
  assert.match(reactRegisterGate, /STAGE_9_REACT_REGISTER_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(reactRegisterGate, /dependencyBackedWebBuildRequired: true/);
  assert.match(reactRegisterGate, /componentsGenerated: false/);
  assert.match(reactRegisterGate, /pagesGenerated: false/);
  assert.match(reactRegisterGate, /Cost Type master cannot be completed/);
  assert.match(reactRegisterGate, /Pass 186 - Module 6 React WBS tree, Cost Code, Project mapping, validation and freeze workflow/);
});


// Keep Pass 186 inside the reviewed Module 6 browser/API surface while adding the source-required workflow UI.
test('Pass 186 adds only one focused Module 6 component and one page, then registers the workspace', async () => {
  assert.equal(await pathExists('apps/web/src/features/wbs-cost-codes/components/wbs-cost-structure-workspace.tsx'), true);
  assert.equal(await pathExists('apps/web/src/features/wbs-cost-codes/pages/wbs-cost-codes-page.tsx'), true);
  assert.match(adminShell, /WbsCostCodesPage/);
  assert.match(adminShell, /'wbs-cost-codes'/);
  assert.match(adminShell, />WBS & Cost Codes</);
  assert.doesNotMatch(adminShell, /cost-types|wbs\/reopen|wbs\/archive/i);
});

test('Pass 186 renders the WBS tree and keeps hierarchy level server-owned', () => {
  assert.match(webWorkspace, /WBS tree/);
  assert.match(webWorkspace, /node\.level/);
  assert.match(webWorkspace, /useCreateWbsNode/);
  assert.match(webWorkspace, /useUpdateWbsNode/);
  assert.match(webWorkspace, /zodResolver\(wbsNodeFormSchema\)/);
  assert.match(webWorkspace, /parentId: values\.parentId \|\| null/);
  assert.doesNotMatch(webWorkspace, /level:\s*values\./);
  assert.match(webWorkspace, /useReopenWbs/);
  assert.match(webWorkspace, /useArchiveWbsNode/);
  assert.match(webWorkspace, /useRestoreWbsNode/);
  assert.doesNotMatch(webWorkspace, /deleteWbs/i);
});

test('Pass 186 Cost Code master remains while Pass 360 adds the minimum Cost Type master lifecycle UI', () => {
  assert.match(webPage, /useCostCodes\(\{ page: costCodePage, pageSize: 25 \}/);
  assert.match(webPage, /useCreateCostCode/);
  assert.match(webPage, /usePermission\('cost_codes\.read'\)/);
  assert.match(webPage, /usePermission\('cost_codes\.manage'\)/);
  assert.match(webPage, /zodResolver\(createCostCodeSchema\)/);
  assert.match(webPage, /category values remain source-defined free text/);
  assert.match(webPage, /useCostTypes/);
  assert.match(webPage, /useCreateCostType/);
  assert.match(webPage, /useArchiveCostType/);
  assert.match(webPage, /useRestoreCostType/);
});

test('Pass 186 mapping editor remains while Pass 360 resolves Cost Type selection without destructive CRUD', () => {
  assert.match(webWorkspace, /useFieldArray/);
  assert.match(webWorkspace, /zodResolver\(mappingFormSchema\)/);
  assert.match(webWorkspace, /Each WBS, Cost Code and Cost Type combination may appear only once/);
  assert.match(webWorkspace, /useReplaceProjectCostCodeAssignments/);
  assert.match(webWorkspace, /Save complete mapping set/);
  assert.match(webWorkspace, /Cost Type/);
  assert.match(webWorkspace, /costTypes/);
  assert.doesNotMatch(webWorkspace, /deleteCostType|updateCostType/);
});

test('Pass 359 UI uses durable freeze state and controlled reopen without client-owned authority', () => {
  assert.match(webWorkspace, /useFreezeWbs/);
  assert.match(webWorkspace, /useReopenWbs/);
  assert.match(webWorkspace, /costStructureState/);
  assert.match(webWorkspace, /isFrozen/);
  assert.match(webWorkspace, /Reopen cost structure/);
  assert.match(webWorkspace, /frozenAt/);
  assert.doesNotMatch(webWorkspace, /companyId|actorUserId|projectScope:/);
});

test('Pass 186 keeps authorization authority on the backend and records the exact Project-permission UI gap', () => {
  assert.match(webPage, /usePermission\('wbs\.read'\)/);
  assert.match(webPage, /usePermission\('wbs\.manage'\)/);
  assert.match(webPage, /usePermission\('wbs\.freeze'\)/);
  assert.match(webPage, /selectedIsInRestrictedScope/);
  assert.match(webPage, /Project-scoped role permissions are enforced exactly by the backend/);
  assert.match(webPage, /not an exact permission list per Project/);
  for (const forbidden of ['companyId', 'actorUserId', 'permissions:', 'projectScope:', 'level: values']) {
    assert.doesNotMatch(webWorkspace, new RegExp(forbidden), forbidden);
  }
});

test('Pass 186 reuses the shared design system with one small responsive Module 6 style section', () => {
  assert.match(webStyles, /\/\* Module 6 WBS & Cost Codes \*\//);
  assert.match(webStyles, /\.module6-workflow-grid/);
  assert.match(webStyles, /\.module6-mapping-table/);
  assert.match(webStyles, /\.module6-freeze-row/);
  assert.match(webStyles, /@media \(max-width: 820px\)/);
});

test('Pass 186 React-workflow gate remains fail-honest and hands off only to Playwright', () => {
  assert.equal(rootPackage.scripts['module-6:react-workflow:gate'], 'node scripts/module-6/verify-stage-9-react-workflow.mjs');
  assert.match(reactWorkflowGate, /STAGE_9_REACT_WORKFLOW_PREPARED_FOR_DEPENDENCY_BACKED_BUILD/);
  assert.match(reactWorkflowGate, /STAGE_9_REACT_WORKFLOW_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING/);
  assert.match(reactWorkflowGate, /dependencyBackedWebBuildRequired: true/);
  assert.match(reactWorkflowGate, /componentsGenerated: 1/);
  assert.match(reactWorkflowGate, /pagesGenerated: 1/);
  assert.match(reactWorkflowGate, /Cost Type master cannot be completed/);
  assert.match(reactWorkflowGate, /exact effective permissions per Project/);
  assert.match(reactWorkflowGate, /Pass 187 - Module 6 Playwright WBS, Cost Code, mapping, permission and freeze workflow verification/);
});


test('Pass 187 adds one Module 6 Playwright workflow and guarded static/live gate', async () => {
  assert.equal(await pathExists('tests/e2e/module-6-browser.spec.mjs'), true);
  assert.equal(await pathExists('scripts/module-6/verify-stage-9-playwright.mjs'), true);
  assert.equal(rootPackage.scripts['test:e2e:module-6'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-6:playwright:gate'], 'node scripts/module-6/verify-stage-9-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-6:playwright:gate:live'], 'node scripts/module-6/verify-stage-9-playwright.mjs --mode=live');
  assert.match(playwrightGate, /STAGE_8_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /RUN_MODULE_6_E2E_REQUIRED/);
  assert.match(playwrightGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(playwrightGate, /STAGE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_188/);
  assert.match(playwrightGate, /Pass 188 - Module 6 Stage-9 operations, migration, concurrency and deployment-readiness verification/);
});

test('Pass 187 browser scenario remains and Pass 360 extends it with non-destructive master lifecycle', () => {
  for (const marker of [
    'Company Cost Code master',
    'Create WBS node',
    'hierarchy cycle',
    'Save complete mapping set',
    'Freeze cost structure',
    'project.cost_code_assignments_changed',
    'project.cost_structure_frozen',
    'project.cost_structure_reopened',
    'Reopen cost structure',
    'cost_code.created'
  ]) assert.ok(module6BrowserTest.includes(marker), marker);

  assert.match(module6BrowserTest, /\/api\/v1\/cost-types/);
  assert.match(module6BrowserTest, /wbs\/reopen/);
  assert.doesNotMatch(module6BrowserTest, /method:\s*['\"]DELETE['\"]/);
});

test('Pass 187 browser assertions preserve the server-owned authority boundary', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'effectivePermissions',
    'createdBy',
    'updatedBy',
    'level'
  ]) assert.ok(module6BrowserTest.includes(`'${field}'`), field);

  assert.match(module6BrowserTest, /expect\(JSON\.stringify\(mappingReplace\?\.body \?\? \{\}\)\)\.not\.toContain\('projectId'\)/);
  assert.match(module6BrowserTest, /expect\(freezeRequest\?\.body\)\.toBeNull\(\)/);
  assert.match(module6BrowserTest, /expect\(reopenRequest\?\.body\)\.toBeNull\(\)/);
  assert.match(module6BrowserTest, /expect\(denied\.status\(\)\)\.toBe\(403\)/);
});

test('Pass 187 Playwright configuration selects Module 6 only through its explicit environment switch', () => {
  assert.match(playwrightConfig, /RUN_MODULE_6_E2E/);
  assert.match(playwrightConfig, /module-6-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /enabledModuleCount !== 1/);
});


test('Pass 188 adds one guarded Module 6 operational gate without changing production runtime', async () => {
  assert.equal(await pathExists('scripts/module-6/verify-stage-9-operations.mjs'), true);
  assert.equal(rootPackage.scripts['module-6:operations:gate'], 'node scripts/module-6/verify-stage-9-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-6:operations:gate:live'], 'node scripts/module-6/verify-stage-9-operations.mjs --mode=live');
  assert.match(rootPackage.scripts['test:operations:module-6'], /--test-name-pattern="\^Module 6 operational"/);
  assert.match(operationsGate, /STAGE_8_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_9_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_189/);
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
});

test('Pass 188 verifies concurrency and rollback behavior on the existing Module 6 transaction boundary', () => {
  assert.match(integrationTest, /Module 6 operational concurrency keeps duplicate creates and mapping replacement atomic/);
  assert.match(integrationTest, /duplicateWbsResponses/);
  assert.match(integrationTest, /DUPLICATE_WBS_CODE/);
  assert.match(integrationTest, /duplicateCostCodeResponses/);
  assert.match(integrationTest, /mappingResponses/);
  assert.match(integrationTest, /project\.cost_code_assignments_changed/);
  assert.match(integrationTest, /eventType: 'project\.cost_code_assignments_changed'/);
  assert.match(operationsGate, /losing duplicate WBS creation leaves no partial audit or outbox residue/);
  assert.match(operationsGate, /losing duplicate Cost Code creation leaves no partial audit or outbox residue/);
});

test('Pass 188 verifies the reviewed read paths can use existing Module 6 indexes', () => {
  assert.match(integrationTest, /Module 6 operational query plans can use reviewed read-path indexes/);
  assert.match(integrationTest, /SET LOCAL enable_seqscan = off/);
  assert.match(integrationTest, /wbs_nodes_project_parent_sort_idx/);
  assert.match(integrationTest, /project_cost_codes_combination_uq/);
  assert.match(integrationTest, /cost_codes_company_code_uq/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
});

test('Pass 188 reuses the current migration and keeps unresolved freeze and Cost Type gaps explicit', () => {
  assert.match(operationsGate, /no Pass-188 migration because existing constraints and indexes already support the reviewed workflows/);
  assert.match(operationsGate, /no durable freeze-state field or reopen command/);
  assert.match(operationsGate, /does not claim concurrent freeze idempotency or persistent freeze enforcement/);
  assert.match(operationsGate, /no Cost Type CRUD or archive command/);
  assert.match(operationsGate, /Pass 189 - Module 6 final Stage-9 acceptance gate/);
});

// Keep Pass 189 as a final acceptance gate only; it must not invent new Module 6 runtime behavior.
test('Pass 189 registers one static and one guarded live Stage-9 acceptance gate', () => {
  assert.equal(rootPackage.scripts['module-6:gate'], 'node scripts/module-6/verify-stage-9.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-6:gate:live'], 'node scripts/module-6/verify-stage-9.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-6:acceptance:live'], 'npm run module-6:gate:live');
  assert.match(finalGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(finalGate, /Module 4B - BOQ Project Mapping/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
});

test('Pass 189 requires the genuine Stage-8 handoff and Pass-188 live operations before Stage-9 acceptance', () => {
  assert.match(finalGate, /PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6/);
  assert.match(finalGate, /STAGE_8_ACCEPTED_READY_FOR_STAGE_9/);
  assert.match(finalGate, /STAGE_8_REPAIR_HOLD_CLEARED/);
  assert.match(finalGate, /STAGE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_189/);
  assert.match(finalGate, /STAGE_8_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_9_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
});

test('Pass 189 final live gate reruns the dependency-backed build, migrations, API integration and browser workflow', () => {
  for (const requiredStep of [
    "['clean-install', 'npm', ['ci']]",
    "['typecheck', 'npm', ['run', 'typecheck']]",
    "['lint', 'npm', ['run', 'lint']]",
    "['prisma-validate', 'npm', ['run', 'db:validate']]",
    "['prisma-generate', 'npm', ['run', 'db:generate']]",
    "['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']]",
    "['build', 'npm', ['run', 'build']]",
    "['module-6-backend-security-api-operational-integration', 'npm', ['run', 'test:integration:module-6']]",
    "['module-6-browser-workflow', 'npm', ['run', 'test:e2e:module-6']]"
  ]) {
    assert.ok(finalGate.includes(requiredStep), requiredStep);
  }
});

test('Pass 189 carries unresolved source gaps forward instead of silently inventing APIs or persistence', () => {
  assert.match(finalGate, /Cost Type master UI but defines no reviewed Cost Type HTTP CRUD operations/);
  assert.match(finalGate, /archive behavior but defines no reviewed WBS or Cost Code archive command/);
  assert.match(finalGate, /controlled frozen-baseline revision or reopen but defines no durable freeze-state field or reviewed reopen command/);
});

