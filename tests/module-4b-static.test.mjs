import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/boq/STAGE-10-MODULE-4B-CONTRACT.md', 'utf8');
const contractGate = await readFile('scripts/module-4b/verify-stage-10-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-4b/verify-stage-10-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-4b/verify-stage-10-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-4b/verify-stage-10-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-4b/verify-stage-10-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-4b/verify-stage-10-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-4b/verify-stage-10-integration-security.mjs', 'utf8');
const reactGate = await readFile('scripts/module-4b/verify-stage-10-react.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-4b/verify-stage-10-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-4b/verify-stage-10-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-4b/verify-stage-10.mjs', 'utf8');
const module4bBrowser = await readFile('tests/e2e/module-4b-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const module4bIntegration = await readFile('tests/integration/module-4b-api.integration.test.mjs', 'utf8');
const boqWebApi = await readFile('apps/web/src/features/boq/api/boq-api.ts', 'utf8');
const boqWebPage = await readFile('apps/web/src/features/boq/pages/boqs-page.tsx', 'utf8');
const boqWebRevisionPanel = await readFile('apps/web/src/features/boq/components/boq-revision-panel.tsx', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260823000800_module_4b_boq_project_mapping/migration.sql',
  'utf8',
);
const gateManifest = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const migrationChecksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const boqSchema = await readFile('apps/api/src/modules/boq/boq.schema.ts', 'utf8');
const boqRepository = await readFile('apps/api/src/modules/boq/boq.repository.ts', 'utf8');
const boqService = await readFile('apps/api/src/modules/boq/boq.service.ts', 'utf8');
const boqRoutes = await readFile('apps/api/src/modules/boq/boq.routes.ts', 'utf8');

// Keep 4B as a gate inside Module 4 and preserve the corrected dependency order.
test('Pass 191 keeps Module 4B at Stage 10 after Module 6', () => {
  assert.match(contract, /implementation gate inside Module 4/);
  assert.match(contract, /Stage 9\s+Module 6 - WBS & Cost Codes/);
  assert.match(contract, /Stage 10\s+Module 4B - BOQ Project Mapping/);
  assert.match(contract, /Stage 11\s+Module 15A - Finance Core/);
});

// Activate only the three deferred relationships named by the controlling execution contract.
test('Pass 191 activates only the reviewed BOQ Project WBS and Cost Code columns', () => {
  const boqModel = prisma.match(/model Boq \{[\s\S]*?@@map\("boqs"\)\n\}/)?.[0] ?? '';
  const itemModel = prisma.match(/model BoqItem \{[\s\S]*?@@map\("boq_items"\)\n\}/)?.[0] ?? '';
  assert.match(boqModel, /projectId\s+String\?/);
  assert.match(boqModel, /tenderId\s+String\?/);
  assert.match(itemModel, /wbsNodeId\s+String\?/);
  assert.match(itemModel, /costCodeId\s+String\?/);
  assert.doesNotMatch(itemModel, /costTypeId/);
});

// Keep existing tender BOQs valid while restoring the completed source rule that at least one scope exists.
test('Pass 191 migration preserves tender-only BOQs and allows Project-only BOQs', () => {
  assert.match(migration, /ALTER COLUMN "tender_id" DROP NOT NULL/);
  assert.match(migration, /ADD COLUMN "project_id" UUID/);
  assert.match(migration, /"tender_id" IS NOT NULL OR "project_id" IS NOT NULL/);
  assert.doesNotMatch(migration, /\bUPDATE\s+"boqs"/i);
  assert.doesNotMatch(migration, /\bINSERT\s+INTO\s+"boqs"/i);
});

// Enforce same-company Project ownership at the database relationship boundary.
test('Pass 191 adds the reviewed same-company BOQ Project foreign key', () => {
  assert.match(migration, /CONSTRAINT "boqs_project_company_fkey"/);
  assert.match(
    migration,
    /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/,
  );
  assert.match(prisma, /project\s+Project\?\s+@relation\(fields: \[projectId, companyId\]/);
});

// Add nullable BOQ-item relationships without inventing Cost Type ownership.
test('Pass 191 adds direct WBS and Cost Code foreign keys only', () => {
  assert.match(migration, /ADD COLUMN "wbs_node_id" UUID/);
  assert.match(migration, /ADD COLUMN "cost_code_id" UUID/);
  assert.match(migration, /FOREIGN KEY \("wbs_node_id"\) REFERENCES "wbs_nodes"\("id"\)/);
  assert.match(migration, /FOREIGN KEY \("cost_code_id"\) REFERENCES "cost_codes"\("id"\)/);
  assert.doesNotMatch(migration, /cost_type_id/);
});

// Keep WBS and Cost Code mappings inside the BOQ's trusted Project/Company scope.
test('Pass 191 adds one simple BOQ-item mapping scope trigger', () => {
  assert.match(migration, /CREATE FUNCTION "module_4b_validate_boq_item_scope"\(\)/);
  assert.match(migration, /BOQ item mapping requires a Project-linked BOQ/);
  assert.match(migration, /BOQ item WBS node must belong to the BOQ Project/);
  assert.match(migration, /BOQ item Cost Code must belong to the BOQ Company/);
  assert.match(migration, /CREATE TRIGGER "boq_items_scope_integrity"/);
});

// Add only the indexes needed for the new relationship lookups.
test('Pass 191 adds bounded relationship indexes without speculative persistence', () => {
  assert.match(migration, /CREATE INDEX "boqs_company_project_created_idx"/);
  assert.match(migration, /CREATE INDEX "boq_items_wbs_node_idx"/);
  assert.match(migration, /CREATE INDEX "boq_items_cost_code_idx"/);
});

// Activate the reviewed Stage-10 request fields without changing the six-route Module-4 surface.
test('Pass 192 activates Project and item mapping fields inside the existing BOQ routes', () => {
  assert.match(boqSchema, /tenderId:\s*uuidSchema\.optional\(\)/);
  assert.match(boqSchema, /projectId:\s*uuidSchema\.optional\(\)/);
  assert.match(boqSchema, /At least one of tenderId or projectId is required/);
  assert.match(boqSchema, /wbsNodeId:\s*uuidSchema\.optional\(\)/);
  assert.match(boqSchema, /costCodeId:\s*uuidSchema\.optional\(\)/);
  assert.equal((boqRoutes.match(/app\.(?:get|post|put|patch|delete)\(/g) ?? []).length, 8);
  assert.match(contract, /does \*\*not\*\* add another generic endpoint/);
});

// Keep Project scope at the BOQ boundary and do not invent Cost Type or per-item Project ownership.
test('Pass 192 keeps item mapping input narrow and source-faithful', () => {
  const itemInput = boqSchema.match(/export const boqItemInputSchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  assert.match(itemInput, /wbsNodeId:\s*uuidSchema\.optional\(\)/);
  assert.match(itemInput, /costCodeId:\s*uuidSchema\.optional\(\)/);
  assert.doesNotMatch(itemInput, /projectId/);
  assert.doesNotMatch(itemInput, /costTypeId/);
  assert.match(contract, /does not state that the two nullable mapping columns must always be supplied together/);
});

// Return the new nullable relationships while continuing to hide Company ownership internals.
test('Pass 192 activates nullable Project WBS and Cost Code response fields', () => {
  const boqResponse = boqSchema.match(/export const boqResponseSchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  const itemResponse = boqSchema.match(/export const boqItemResponseSchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  assert.match(boqResponse, /tenderId:\s*uuidSchema\.nullable\(\)/);
  assert.match(boqResponse, /projectId:\s*uuidSchema\.nullable\(\)/);
  assert.doesNotMatch(boqResponse, /companyId/);
  assert.match(itemResponse, /wbsNodeId:\s*uuidSchema\.nullable\(\)/);
  assert.match(itemResponse, /costCodeId:\s*uuidSchema\.nullable\(\)/);
  assert.doesNotMatch(itemResponse, /costTypeId/);
});

// Do not invent a Project list filter or a hidden mapping route where the source defines none.
test('Pass 192 does not broaden the reviewed list query or route inventory', () => {
  const listQuery = boqSchema.match(/export const listBoqsQuerySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  assert.match(listQuery, /tenderId:\s*uuidSchema\.optional\(\)/);
  assert.doesNotMatch(listQuery, /projectId/);
  assert.equal((boqRoutes.match(/app\.(?:get|post|put|patch|delete)\(/g) ?? []).length, 8);
  assert.doesNotMatch(boqRoutes, /boq-mappings|\/project['"`]|\/mapping['"`]/);
});

// Keep the historical Stage-10 migration gate present and checksum-locked after later stages append.
test('Pass 191 appends one Stage-10 migration gate with an immutable checksum', () => {
  const stage10 = gateManifest.gates.find((gate) => gate.gate === 'module-4b-boq-project-mapping-persistence');
  assert.equal(stage10?.stage, 10);
  assert.deepEqual(stage10?.migrations, ['20260823000800_module_4b_boq_project_mapping']);
  assert.match(
    migrationChecksums.migrations['20260823000800_module_4b_boq_project_mapping'],
    /^[a-f0-9]{64}$/,
  );
});

// Keep unresolved source gaps visible instead of inventing a Project-link command or mapping pair rule.
test('Pass 191 preserves unresolved Stage-10 source gaps', () => {
  assert.match(
    contract,
    /does not define a dedicated command for attaching a Project to an \*\*already-existing tender-only BOQ\*\*/,
  );
  assert.match(
    contract,
    /does not state that the two nullable mapping columns must always be supplied together/,
  );
  assert.match(contract, /Stage-27 integration-completion gate/);
});

// Keep the persistence gate fail-honest while Stage 9 live acceptance is unavailable.
test('Pass 191 persistence gate requires genuine Stage-9 live handoff before deployment', () => {
  assert.match(persistenceGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(persistenceGate, /runtimeVerificationComplete === true/);
  assert.match(
    persistenceGate,
    /STAGE_10_MODULE_4B_PERSISTENCE_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/,
  );
  assert.match(persistenceGate, /runtimeDeploymentAllowed: passed && stage9LiveAccepted/);
  assert.equal(
    rootPackage.scripts['module-4b:persistence:gate'],
    'node scripts/module-4b/verify-stage-10-persistence.mjs',
  );
  assert.match(contractGate, /persistencePreparationAllowed: passed/);
});

// Keep the schema gate fail-honest while Stage 9 live acceptance is unavailable.
test('Pass 192 schema gate requires genuine Stage-9 live handoff before deployment', () => {
  assert.match(schemaGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(schemaGate, /runtimeVerificationComplete === true/);
  assert.match(
    schemaGate,
    /STAGE_10_MODULE_4B_SCHEMA_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/,
  );
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && stage9LiveAccepted/);
  assert.equal(
    rootPackage.scripts['module-4b:schema:gate'],
    'node scripts/module-4b/verify-stage-10-schema.mjs',
  );
});



// Prepare Project-aware register visibility without changing the reviewed HTTP list filters.
test('Pass 193 prepares tender-only and Project-linked BOQ repository visibility', () => {
  assert.match(boqRepository, /export type BoqProjectVisibilityRepositoryInput/);
  assert.match(boqRepository, /includeTenderOnly:\s*boolean/);
  assert.match(boqRepository, /allowedProjectIds:\s*readonly string\[\] \| null/);
  assert.match(boqRepository, /function buildProjectVisibilityWhere/);
  assert.match(boqRepository, /visibility\?: BoqProjectVisibilityRepositoryInput/);
  assert.match(boqRepository, /\.\.\.buildProjectVisibilityWhere\(input\.visibility\)/);
});

// Resolve both optional parent resources only through the trusted Company scope before creating a BOQ.
test('Pass 193 creates tender Project or combined BOQs only from same-company parents', () => {
  assert.match(boqRepository, /async findTenderById\(tenderId: string \| undefined\)/);
  assert.match(boqRepository, /async findProjectById\(projectId: string \| undefined\)/);
  assert.match(boqRepository, /if \(!input\.tenderId && !input\.projectId\) return null/);
  assert.match(boqRepository, /await this\.findTenderById\(input\.tenderId\)/);
  assert.match(boqRepository, /await this\.findProjectById\(input\.projectId\)/);
  assert.match(boqRepository, /tenderId: input\.tenderId \?\? null/);
  assert.match(boqRepository, /projectId: input\.projectId \?\? null/);
});

// Carry Stage-10 item relationships through the existing replace-all repository command.
test('Pass 193 persists optional WBS and Cost Code mapping IDs without inventing Cost Type', () => {
  const itemInput = boqRepository.match(/export type BoqItemRepositoryInput = Readonly<\{[\s\S]*?\n\}>;/)?.[0] ?? '';
  assert.match(itemInput, /wbsNodeId\?: string \| null/);
  assert.match(itemInput, /costCodeId\?: string \| null/);
  assert.doesNotMatch(itemInput, /costTypeId/);
  assert.match(boqRepository, /wbsNodeId: item\.wbsNodeId \?\? null/);
  assert.match(boqRepository, /costCodeId: item\.costCodeId \?\? null/);
});

// Reject invalid mapping scope before the replacement deletes the current item set.
test('Pass 193 prevalidates BOQ item mapping ownership before replacement', () => {
  const replaceMethod = boqRepository.match(/async replaceBoqRevisionItems\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(replaceMethod, /boq: \{ select: \{ projectId: true \} \}/);
  assert.match(replaceMethod, /if \(hasMappings && !revision\.boq\.projectId\) return null/);
  assert.match(replaceMethod, /this\.db\.wbsNode\.count/);
  assert.match(replaceMethod, /projectId: revision\.boq\.projectId \?\? undefined/);
  assert.match(replaceMethod, /this\.db\.costCode\.count/);
  assert.ok(
    replaceMethod.indexOf('matchingWbsNodes') < replaceMethod.indexOf('this.db.boqItem.deleteMany'),
    'WBS scope must be checked before replacing existing items.',
  );
  assert.ok(
    replaceMethod.indexOf('matchingCostCodes') < replaceMethod.indexOf('this.db.boqItem.deleteMany'),
    'Cost Code scope must be checked before replacing existing items.',
  );
});

// Expose the persisted Project relationship in the write lock so the next service pass can re-authorize exact resources.
test('Pass 193 lock readback includes the persisted BOQ Project relationship', () => {
  assert.match(boqRepository, /projectId: string \| null/);
  assert.match(boqRepository, /project_id AS "projectId"/);
  assert.match(boqRepository, /tender_id AS "tenderId"/);
});

// Keep exact Project permission decisions in the service/resource-policy pass rather than trusting repository input.
test('Pass 193 keeps exact Project authorization deferred to Pass 194 service policy', () => {
  assert.doesNotMatch(boqRepository, /hasPermission\(/);
  assert.doesNotMatch(boqRepository, /requireRequestSecurityContext\(/);
  assert.match(repositoryGate, /exactProjectAuthorizationDeferredToServiceResourcePolicy: true/);
  assert.match(repositoryGate, /Pass 194 - Module 4B service\/resource-policy activation/);
});

// Keep the repository gate fail-honest while genuine Stage-9 live acceptance is unavailable.
test('Pass 193 repository gate requires genuine Stage-9 handoff before runtime deployment', () => {
  assert.match(repositoryGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(repositoryGate, /runtimeVerificationComplete === true/);
  assert.match(
    repositoryGate,
    /STAGE_10_MODULE_4B_REPOSITORY_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/,
  );
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage9LiveAccepted/);
  assert.equal(
    rootPackage.scripts['module-4b:repository:gate'],
    'node scripts/module-4b/verify-stage-10-repository.mjs',
  );
});


// Resolve the BOQ register from trusted Company permission plus exact Project role scope.
test('Pass 194 filters Project-linked BOQs by Module 24B permission without leaking tender-only rows', () => {
  assert.match(boqService, /private async resolveReadableBoqVisibility/);
  assert.match(boqService, /const includeTenderOnly = hasPermission\('boq\.read'\)/);
  assert.match(boqService, /listProjectIdsWithPermission\([\s\S]*'boq\.read'/);
  assert.match(boqService, /visibility,[\s\S]*skip:/);
  assert.match(boqService, /scope\.kind === 'restricted'[\s\S]*allowedProjectIds: scope\.projectIds/);
});

// Revalidate each Project-linked operation against the exact effective Project permission.
test('Pass 194 applies exact Module 24B permission to Project-linked BOQ resources', () => {
  assert.match(boqService, /private async requireProjectPermission/);
  assert.match(boqService, /requireRequestSecurityContext\(\)/);
  assert.match(boqService, /findEffectivePermissionCodesForProject\(projectId/);
  assert.match(boqService, /assignmentStatuses: \[ASSIGNMENT_ACTIVE\]/);
  assert.match(boqService, /roleStatuses: \[ROLE_ACTIVE\]/);
  assert.match(boqService, /private async requireBoqPermission/);
  assert.match(boqService, /if \(boq\.projectId\)[\s\S]*requireProjectPermission/);
  assert.match(boqService, /this\.requirePermission\(permission\)/);
});

// Allow Project-only BOQ creation while independently validating any supplied Tender and Project.
test('Pass 194 activates Project-only and combined BOQ creation in the service', () => {
  const createMethod = boqService.match(/async createBoq\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(createMethod, /if \(input\.tenderId && !\(await repository\.findTenderById\(input\.tenderId\)\)\)/);
  assert.match(createMethod, /if \(input\.projectId\)/);
  assert.match(createMethod, /repository\.findProjectById\(input\.projectId\)/);
  assert.match(createMethod, /requireProjectPermission\(usersRepository, project\.id, 'boq\.create', now\)/);
  assert.match(createMethod, /else \{[\s\S]*this\.requirePermission\('boq\.create'\)/);
  assert.match(createMethod, /projectId: boq\.projectId/);
  assert.match(createMethod, /if \(!boq\) throw createModule4aError\('BOQ_SCOPE_CONFLICT'\)/);
});

// Re-authorize every existing Project-linked write/export after loading the trusted BOQ Project relationship.
test('Pass 194 re-authorizes existing Project-linked BOQ operations before use', () => {
  for (const permission of ['boq.edit', 'boq.freeze', 'boq.export']) {
    assert.ok(boqService.includes(`'${permission}'`), permission);
  }
  assert.match(boqService, /async createRevision[\s\S]*lockBoqForWrite[\s\S]*requireBoqPermission/);
  assert.match(boqService, /async replaceRevisionItems[\s\S]*lockBoqForWrite[\s\S]*requireBoqPermission/);
  assert.match(boqService, /async freezeRevision[\s\S]*lockBoqForWrite[\s\S]*requireBoqPermission/);
  assert.match(boqService, /async getRevisionExportSource[\s\S]*findBoqById[\s\S]*requireBoqPermission/);
});

// Preserve the two reviewed optional item relationships and return the existing stable scope error for invalid mappings.
test('Pass 194 carries WBS and Cost Code mappings through service validation and audit', () => {
  assert.match(boqService, /function buildPersistentItems[\s\S]*wbsNodeId: item\.wbsNodeId \?\? null/);
  assert.match(boqService, /function buildPersistentItems[\s\S]*costCodeId: item\.costCodeId \?\? null/);
  assert.doesNotMatch(boqService, /costTypeId/);
  assert.match(boqService, /hasMappings && !lockedBoq\.projectId[\s\S]*BOQ_SCOPE_CONFLICT/);
  assert.match(boqService, /if \(!items\) throw createModule4aError\('BOQ_SCOPE_CONFLICT'\)/);
  assert.match(boqService, /wbsNodeId: item\.wbsNodeId/);
  assert.match(boqService, /costCodeId: item\.costCodeId/);
});

// Add Project identity to sensitive audit snapshots without inventing another Module-4 event name.
test('Pass 194 records Project-aware BOQ audit context and keeps the reviewed event inventory', () => {
  assert.match(boqService, /action: 'boq\.created'[\s\S]*projectId: boq\.projectId/);
  assert.match(boqService, /action: 'boq\.revision_created'[\s\S]*projectId: lockedBoq\.projectId/);
  assert.match(boqService, /action: 'boq\.items_replaced'[\s\S]*projectId: lockedBoq\.projectId/);
  assert.match(boqService, /action: 'boq\.revision_frozen'[\s\S]*projectId: lockedBoq\.projectId/);
  const eventTypes = [...boqService.matchAll(/eventType: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(eventTypes)].sort(), [
    'boq.created',
    'boq.revision_created',
    'boq.revision_frozen',
  ]);
});

// Keep the HTTP boundary frozen until the next pass and preserve source gaps instead of inventing commands.
test('Pass 194 changes service policy only and does not invent Module 4B HTTP operations', () => {
  assert.equal((boqRoutes.match(/app\.(?:get|post|put|patch|delete)\(/g) ?? []).length, 8);
  assert.doesNotMatch(boqService, /costTypeId/);
  assert.doesNotMatch(boqRoutes, /boq-mappings|\/project['"`]|items\/:itemId\/map/);
  assert.match(serviceGate, /routesChanged: false/);
  assert.match(serviceGate, /openApiChanged: false/);
});

// Keep the service gate fail-honest until genuine Stage-9 live acceptance exists.
test('Pass 194 service gate requires genuine Stage-9 handoff before runtime deployment', () => {
  assert.match(serviceGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(serviceGate, /runtimeVerificationComplete === true/);
  assert.match(
    serviceGate,
    /STAGE_10_MODULE_4B_SERVICE_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/,
  );
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && stage9LiveAccepted/);
  assert.equal(
    rootPackage.scripts['module-4b:service:gate'],
    'node scripts/module-4b/verify-stage-10-service.mjs',
  );
  assert.match(serviceGate, /Pass 195 - Module 4B HTTP\/OpenAPI relationship activation/);
});


// Keep the Stage-10 HTTP surface at the same six reviewed Module-4 operations.
test('Pass 195 activates relationships without adding another BOQ route', () => {
  const registrations = [...boqRoutes.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.deepEqual(registrations, [
    'GET /api/v1/boqs',
    'GET /api/v1/boqs/:id',
    'GET /api/v1/boqs/:id/revisions/:revId',
    'POST /api/v1/boqs',
    'POST /api/v1/boqs/:id/revisions',
    'PUT /api/v1/boqs/:id/revisions/:revId/items',
    'POST /api/v1/boqs/:id/revisions/:revId/freeze',
    'GET /api/v1/boqs/:id/revisions/:revId/export',
  ]);
  assert.doesNotMatch(boqRoutes, /boq-mappings|items\/:itemId\/map|\/api\/v1\/cost-types/);
});

// Document tender-only, Project-only and combined creation on the existing POST /boqs command.
test('Pass 195 OpenAPI create body exposes nullable BOQ scope without trusting ownership fields', () => {
  const createRoute = boqRoutes.slice(
    boqRoutes.indexOf("operationId: 'module4aCreateBoq'"),
    boqRoutes.indexOf("operationId: 'module4aCreateBoqRevision'"),
  );
  assert.match(createRoute, /summary: 'Create a tender-linked, Project-linked or combined BOQ'/);
  assert.match(createRoute, /required: \['code', 'title', 'currency'\]/);
  assert.match(createRoute, /anyOf:[\s\S]*required: \['tenderId'\][\s\S]*required: \['projectId'\]/);
  assert.match(createRoute, /tenderId: \{ type: 'string', format: 'uuid' \}/);
  assert.match(createRoute, /projectId: \{ type: 'string', format: 'uuid' \}/);
  assert.doesNotMatch(createRoute, /companyId|actorUserId|permissions|projectScope/);
});

// Return both BOQ scope relationships explicitly, including null for existing tender-only rows.
test('Pass 195 HTTP serializer and OpenAPI response expose nullable tenderId and projectId', () => {
  assert.match(boqRoutes, /required: \['id', 'tenderId', 'projectId'/);
  assert.match(boqRoutes, /tenderId: \{ anyOf: \[\{ type: 'string', format: 'uuid' \}, \{ type: 'null' \}\] \}/);
  assert.match(boqRoutes, /projectId: \{ anyOf: \[\{ type: 'string', format: 'uuid' \}, \{ type: 'null' \}\] \}/);
  assert.match(boqRoutes, /function serializeBoq[\s\S]*projectId: boq\.projectId/);
  assert.match(boqSchema, /projectId:\s*uuidSchema\.nullable\(\),/);
});

// Activate optional WBS/Cost Code mapping IDs on the existing whole-set item replacement command.
test('Pass 195 item HTTP contract accepts and returns WBS and Cost Code mapping IDs only', () => {
  const itemRoute = boqRoutes.slice(
    boqRoutes.indexOf("operationId: 'module4aReplaceBoqRevisionItems'"),
    boqRoutes.indexOf("operationId: 'module4aFreezeBoqRevision'"),
  );
  assert.match(itemRoute, /wbsNodeId: \{ type: 'string', format: 'uuid' \}/);
  assert.match(itemRoute, /costCodeId: \{ type: 'string', format: 'uuid' \}/);
  assert.doesNotMatch(itemRoute, /costTypeId|projectId|amount:/);
  assert.match(boqRoutes, /required: \[[\s\S]*'wbsNodeId', 'costCodeId'/);
  assert.match(boqRoutes, /function serializeItem[\s\S]*wbsNodeId: item\.wbsNodeId[\s\S]*costCodeId: item\.costCodeId/);
  assert.match(boqSchema, /wbsNodeId:\s*uuidSchema\.nullable\(\),/);
  assert.match(boqSchema, /costCodeId:\s*uuidSchema\.nullable\(\),/);
});

// Avoid Company-only route RBAC that would incorrectly block valid Project-scoped Module-24B permissions.
test('Pass 195 keeps authentication at HTTP and exact BOQ resource permission in the service', () => {
  assert.equal((boqRoutes.match(/await authenticateRequest\(request, options\.database\)/g) ?? []).length, 8);
  assert.doesNotMatch(boqRoutes, /requireRoutePermission\(/);
  assert.doesNotMatch(boqRoutes, /hasPermission\(/);
  assert.match(boqService, /private async requireBoqPermission/);
  assert.match(boqService, /private async requireProjectPermission/);
});

// Keep the generated OpenAPI identifiers stable while widening only the approved relationship fields.
test('Pass 195 retains all six operation IDs and stable Module-4 error codes', () => {
  for (const operationId of [
    'module4aListBoqs',
    'module4Pass367GetBoqDetails',
    'module4Pass367GetBoqRevisionDetails',
    'module4aCreateBoq',
    'module4aCreateBoqRevision',
    'module4aReplaceBoqRevisionItems',
    'module4aFreezeBoqRevision',
    'module4aExportBoqRevision',
  ]) assert.ok(boqRoutes.includes(`operationId: '${operationId}'`), operationId);
  assert.equal((boqRoutes.match(/security: BEARER_SECURITY/g) ?? []).length, 8);
  for (const code of ['BOQ_NOT_FOUND', 'BOQ_REVISION_LOCKED', 'INVALID_BOQ_ITEM', 'BOQ_SCOPE_CONFLICT']) {
    assert.ok(boqRoutes.includes(`'${code}'`), code);
  }
});

// Keep Pass-195 evidence fail-honest until genuine Stage-9 live acceptance exists.
test('Pass 195 HTTP OpenAPI gate requires genuine Stage-9 handoff before runtime deployment', () => {
  assert.match(httpGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(httpGate, /runtimeVerificationComplete === true/);
  assert.match(httpGate, /STAGE_10_MODULE_4B_HTTP_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage9LiveAccepted/);
  assert.equal(
    rootPackage.scripts['module-4b:http:gate'],
    'node scripts/module-4b/verify-stage-10-http.mjs',
  );
  assert.match(httpGate, /Pass 196 - Module 4B PostgreSQL\/Fastify integration and security verification/);
});


// Prepare one focused live suite for the new Stage-10 relationships instead of duplicating Module-4A tests.
test('Pass 196 adds one focused Module 4B PostgreSQL Fastify integration and security suite', () => {
  assert.match(module4bIntegration, /Module 4B full PostgreSQL\/Fastify workflow persists Project BOQs and WBS\/Cost Code mappings/);
  assert.match(module4bIntegration, /Module 4B security enforces exact Project permissions and atomic mapping scope/);
  assert.match(module4bIntegration, /Module 4B live OpenAPI keeps six source operations plus Pass-367 readback while documenting Stage-10 relationships/);
  assert.match(module4bIntegration, /projectMember\.createMany/);
  assert.match(module4bIntegration, /scopeType: 'PROJECT'/);
  assert.match(module4bIntegration, /wbsNodeId: WBS_ID/);
  assert.match(module4bIntegration, /costCodeId: COST_CODE_ID/);
});

// Prove tender-only, Project-only and combined BOQs remain valid through the existing create operation.
test('Pass 196 covers all three reviewed BOQ scope combinations without adding a route', () => {
  assert.match(module4bIntegration, /code: 'BOQ-TENDER-ONLY'/);
  assert.match(module4bIntegration, /code: 'BOQ-PROJECT-ONLY'/);
  assert.match(module4bIntegration, /code: 'BOQ-COMBINED'/);
  assert.equal((boqRoutes.match(/app\.(?:get|post|put|patch|delete)\(/g) ?? []).length, 8);
});

// Recheck exact Project permission and register visibility under real authenticated request context.
test('Pass 196 prepares negative Project scope and membership-only authorization coverage', () => {
  assert.match(module4bIntegration, /module4b-editor@example\.test/);
  assert.match(module4bIntegration, /module4b-reader@example\.test/);
  assert.match(module4bIntegration, /module4b-member@example\.test/);
  assert.match(module4bIntegration, /assert\.equal\(response\.statusCode, 403, response\.body\)/);
  assert.match(module4bIntegration, /assert\.deepEqual\(response\.json\(\)\.data\.items\.map\(\(boq\) => boq\.id\), \[projectABoq\.id\]\)/);
});

// Reject invalid mappings before replacement and keep direct database constraints as the final integrity backstop.
test('Pass 196 prepares atomic cross-Project and cross-Company mapping attacks', () => {
  assert.match(module4bIntegration, /wbsNodeId: WBS_2_ID/);
  assert.match(module4bIntegration, /costCodeId: COST_CODE_B_ID/);
  assert.match(module4bIntegration, /persistedAfterFailures\.length, 1/);
  assert.match(module4bIntegration, /client\.boq\.create/);
  assert.match(module4bIntegration, /client\.boqItem\.create/);
});

// Keep Stage-6 live OpenAPI regression expectations aligned with the intentionally activated Stage-10 fields.
test('Pass 196 updates the Module 4A live API contract regression for Stage-10 compatibility', () => {
  assert.match(module4bIntegration, /createBody\.anyOf/);
  assert.match(module4bIntegration, /Object\.hasOwn\(itemSchema\.properties, 'wbsNodeId'\), true/);
  assert.match(module4bIntegration, /Object\.hasOwn\(itemSchema\.properties, 'costCodeId'\), true/);
  assert.doesNotMatch(module4bIntegration, /\/boq-mappings/);
});

// Keep destructive PostgreSQL checks blocked until genuine Stage-9 live acceptance exists.
test('Pass 196 integration security gate stays fail-honest before Stage-9 live handoff', () => {
  assert.match(integrationSecurityGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(integrationSecurityGate, /STAGE_9_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_10_MODULE_4B_INTEGRATION_SECURITY_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /runtimeVerificationComplete: passed && mode === 'live' && stage9LiveAccepted/);
  assert.equal(
    rootPackage.scripts['module-4b:integration-security:gate'],
    'node scripts/module-4b/verify-stage-10-integration-security.mjs --mode=static',
  );
  assert.equal(
    rootPackage.scripts['module-4b:integration-security:gate:live'],
    'node scripts/module-4b/verify-stage-10-integration-security.mjs --mode=live',
  );
  assert.match(integrationSecurityGate, /Pass 197 - Module 4B React Project\/WBS\/Cost Code mapping activation/);
});

// Activate the Stage-10 relationships in the existing typed BOQ browser API without adding a client authority field.
test('Pass 197 updates BOQ browser types for Project WBS and Cost Code relationships', () => {
  const createInput = boqWebApi.match(/export type CreateBoqInput = Readonly<\{[\s\S]*?\}>;/)?.[0] ?? '';
  const itemInput = boqWebApi.match(/export type BoqItemInput = Readonly<\{[\s\S]*?\}>;/)?.[0] ?? '';
  assert.match(boqWebApi, /tenderId: string \| null;/);
  assert.match(boqWebApi, /projectId: string \| null;/);
  assert.match(boqWebApi, /wbsNodeId: string \| null;/);
  assert.match(boqWebApi, /costCodeId: string \| null;/);
  assert.match(createInput, /tenderId\?: string;/);
  assert.match(createInput, /projectId\?: string;/);
  assert.doesNotMatch(createInput, /companyId|actorUserId|permissions|projectScope/);
  assert.match(itemInput, /wbsNodeId\?: string;/);
  assert.match(itemInput, /costCodeId\?: string;/);
  assert.doesNotMatch(itemInput, /projectId|costTypeId|amount/);
});

// Reuse the existing Tender and Project registers for the three reviewed BOQ creation scopes.
test('Pass 197 adds Tender-only Project-only and combined BOQ creation to the existing page', () => {
  assert.match(boqWebPage, /useProjects/);
  assert.match(boqWebPage, /Select a Tender, a Project, or both/);
  assert.match(boqWebPage, /\.\.\.\(values\.tenderId \? \{ tenderId: values\.tenderId \} : \{\}\)/);
  assert.match(boqWebPage, /\.\.\.\(values\.projectId \? \{ projectId: values\.projectId \} : \{\}\)/);
  assert.match(boqWebPage, /<th>Project<\/th>/);
  const listCall = boqWebPage.match(/const boqsQuery = useBoqs\(\{[\s\S]*?\}, canOpenWorkspace\);/)?.[0] ?? '';
  assert.doesNotMatch(listCall, /projectId/);
});

// Map BOQ draft items through the already-reviewed Module-6 read contracts and existing item replacement command.
test('Pass 197 activates Project WBS and Cost Code mapping controls without a new route', () => {
  assert.match(boqWebRevisionPanel, /useWbsTree\(boq\.projectId, canReadMappedWbs\)/);
  assert.match(boqWebRevisionPanel, /useCostCodes\(\{ page: 1, pageSize: 100 \}/);
  assert.match(boqWebRevisionPanel, /items\.\$\{index\}\.wbsNodeId/);
  assert.match(boqWebRevisionPanel, /items\.\$\{index\}\.costCodeId/);
  assert.match(boqWebRevisionPanel, /const submittedItems = values\.items\.map/);
  assert.match(boqWebRevisionPanel, /\.\.\.\(wbsNodeId \? \{ wbsNodeId \} : \{\}\)/);
  assert.match(boqWebRevisionPanel, /\.\.\.\(costCodeId \? \{ costCodeId \} : \{\}\)/);
  assert.equal((boqRoutes.match(/app\.(?:get|post|put|patch|delete)\(/g) ?? []).length, 8);
});

// Keep Tender-only historical BOQs valid and do not invent a Project attachment workflow.
test('Pass 197 keeps Tender-only BOQs mapping-free when no Project relationship exists', () => {
  assert.match(boqWebRevisionPanel, /selectedBoq\.projectId === null/);
  assert.match(boqWebRevisionPanel, /does not define a command to attach a Project to an existing BOQ/);
  assert.doesNotMatch(boqWebApi, /attachProject|boq-mappings|costTypeId/);
});

// Keep the React gate fail-honest while the genuine Stage-9 handoff and dependency-backed web build are unavailable.
test('Pass 197 React gate requires the Pass-196 proof and keeps Stage-9 live status explicit', () => {
  assert.match(reactGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(reactGate, /module-4b-integration-security-evidence/);
  assert.match(reactGate, /STAGE_10_MODULE_4B_REACT_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/);
  assert.match(reactGate, /dependencyBackedWebBuildRequired: true/);
  assert.equal(
    rootPackage.scripts['module-4b:react:gate'],
    'node scripts/module-4b/verify-stage-10-react.mjs',
  );
  assert.match(reactGate, /Pass 198 - Module 4B Playwright Project BOQ and WBS\/Cost Code mapping workflow verification/);
});



// Keep the Stage-10 browser test focused on the reviewed Project BOQ mapping workflow.
test('Pass 198 adds one focused Module 4B Playwright workflow without duplicating Module 4A coverage', () => {
  assert.match(module4bBrowser, /Module 4B browser workflow creates a Project BOQ and persists WBS\/Cost Code item mapping/);
  assert.match(module4bBrowser, /selectOption\(PROJECT_ID\)/);
  assert.match(module4bBrowser, /selectOption\(WBS_ID\)/);
  assert.match(module4bBrowser, /selectOption\(COST_CODE_ID\)/);
  assert.match(module4bBrowser, /Revision 1 · FROZEN/);
  assert.match(module4bBrowser, /Tender-only BOQ, so WBS and Cost Code mappings stay unavailable/);
});

// Prove the browser keeps server-owned authority out while allowing only the new reviewed relationship IDs.
test('Pass 198 verifies the Stage-10 browser authority boundary', () => {
  assert.match(module4bBrowser, /forbiddenFields = \['companyId', 'actorUserId', 'permissions', 'projectScope', 'costTypeId', 'amount', 'approvedBy'\]/);
  assert.match(module4bBrowser, /\['code', 'currency', 'projectId', 'title'\]/);
  assert.match(module4bBrowser, /'costCodeId'[\s\S]*'wbsNodeId'/);
  assert.match(module4bBrowser, /not\.toContain\('projectId'\)/);
  assert.match(module4bBrowser, /freeze\?\.body\)\.toBeNull\(\)/);
});

// Reuse approved Project and Module 6 lookup APIs instead of creating mapping-specific helper routes.
test('Pass 198 reuses existing Project WBS and Cost Code reads for mapping choices', () => {
  assert.match(module4bBrowser, /\/api\/v1\/projects\/\$\{PROJECT_ID\}\/wbs/);
  assert.match(module4bBrowser, /\/api\/v1\/cost-codes/);
  assert.doesNotMatch(module4bBrowser, /boq-mappings|items\/[^'"`]+\/map|cost-types/);
});

// Verify Project-scoped read-only access stays visible in UI while direct writes remain server-denied.
test('Pass 198 covers Project-scoped read-only BOQ authorization', () => {
  assert.match(module4bBrowser, /scopeType: 'PROJECT'/);
  assert.match(module4bBrowser, /projectMember\.create/);
  assert.match(module4bBrowser, /Your current role can read BOQs but cannot create or edit BOQ revisions/);
  assert.match(module4bBrowser, /expect\(denied\.status\(\)\)\.toBe\(403\)/);
});

// Register Module 4B as one isolated Playwright target and keep live execution fail-honest.
test('Pass 198 Playwright gate requires Stage-9 live handoff before browser execution', () => {
  assert.match(playwrightConfig, /RUN_MODULE_4B_E2E/);
  assert.match(playwrightConfig, /module-4b-browser\.spec\.mjs/);
  assert.match(playwrightGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(playwrightGate, /STAGE_9_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /RUN_MODULE_4B_E2E_REQUIRED/);
  assert.match(playwrightGate, /STAGE_10_MODULE_4B_PLAYWRIGHT_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/);
  assert.equal(rootPackage.scripts['module-4b:playwright:gate'], 'node scripts/module-4b/verify-stage-10-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4b:playwright:gate:live'], 'node scripts/module-4b/verify-stage-10-playwright.mjs --mode=live');
  assert.equal(rootPackage.scripts['test:e2e:module-4b'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.match(playwrightGate, /Pass 199 - Module 4B operational, migration and concurrency verification/);
});


// Keep Pass 199 focused on concurrency, migration safety and the new Stage-10 relationship indexes.
test('Pass 199 adds focused Module 4B operational concurrency coverage', () => {
  assert.match(module4bIntegration, /Module 4B operational concurrency keeps Project BOQ creation and mapped item replacement atomic/);
  assert.match(module4bIntegration, /OPS-PROJECT-DUPLICATE/);
  assert.match(module4bIntegration, /duplicateResponses = await Promise\.all/);
  assert.match(module4bIntegration, /replacementResponses = await Promise\.all/);
  assert.match(module4bIntegration, /finalSetIsA \|\| finalSetIsB/);
  assert.match(module4bIntegration, /action: 'boq\.created'/);
  assert.match(module4bIntegration, /eventType: 'boq\.created'/);
});

// Verify each relationship index introduced by the Stage-10 migration has a live query-plan check.
test('Pass 199 verifies Stage-10 Project and mapping indexes without hard timing thresholds', () => {
  assert.match(module4bIntegration, /Module 4B operational query plans use Stage-10 Project and mapping indexes/);
  assert.match(module4bIntegration, /boqs_company_project_created_idx/);
  assert.match(module4bIntegration, /boq_items_wbs_node_idx/);
  assert.match(module4bIntegration, /boq_items_cost_code_idx/);
  assert.match(module4bIntegration, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
});

// Reuse the existing Stage-10 migration instead of adding speculative persistence for operations verification.
test('Pass 199 keeps persistence unchanged and reruns clean plus previous-schema migration gates', () => {
  assert.match(operationsGate, /clean-and-previous-migrations/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  const stage10 = gateManifest.gates.find((gate) => gate.gate === 'module-4b-boq-project-mapping-persistence');
  assert.equal(stage10?.stage, 10);
  assert.deepEqual(stage10?.migrations, ['20260823000800_module_4b_boq_project_mapping']);
});

// Keep the operational live run guarded by Stage-9 and the completed Pass-198 browser proof.
test('Pass 199 operational gate stays fail-honest before live prerequisites', () => {
  assert.match(operationsGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(operationsGate, /STAGE_10_MODULE_4B_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_199/);
  assert.match(operationsGate, /STAGE_9_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_10_MODULE_4B_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(operationsGate, /STAGE_10_MODULE_4B_OPERATIONS_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING/);
  assert.equal(rootPackage.scripts['module-4b:operations:gate'], 'node scripts/module-4b/verify-stage-10-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4b:operations:gate:live'], 'node scripts/module-4b/verify-stage-10-operations.mjs --mode=live');
  assert.match(rootPackage.scripts['test:operations:module-4b'], /\^Module 4B operational/);
});

// Keep the Stage-10 closure as the next pass only after operational verification.
test('Pass 199 points to the Module 4B final Stage-10 acceptance gate', () => {
  assert.match(operationsGate, /Pass 200 - Module 4B final Stage-10 acceptance gate/);
  assert.match(operationsGate, /module-4a-operational-regression/);
  assert.match(operationsGate, /test:operations:module-4a/);
});


// Close Stage 10 only through one cumulative gate that preserves the corrected dependency order.
test('Pass 200 adds the final Module 4B Stage-10 acceptance gate', () => {
  assert.match(finalGate, /stage-9-static-prerequisite/);
  assert.match(finalGate, /module-4a-static-regression/);
  assert.match(finalGate, /module-4b-operations-static-regression/);
  assert.match(finalGate, /module-4b-static-suite/);
  assert.match(finalGate, /full-static-regression/);
  assert.match(finalGate, /workspace-contract/);
  assert.match(finalGate, /migration-policy/);
});

// Keep the live acceptance path dependency-backed instead of treating static preparation as runtime proof.
test('Pass 200 live gate reruns build Prisma migration integration browser and operational proof', () => {
  assert.match(finalGate, /clean-install/);
  assert.match(finalGate, /typecheck/);
  assert.match(finalGate, /lint/);
  assert.match(finalGate, /prisma-validate/);
  assert.match(finalGate, /prisma-generate/);
  assert.match(finalGate, /clean-and-previous-migrations/);
  assert.match(finalGate, /module-4b-backend-security-integration/);
  assert.match(finalGate, /module-4b-browser-workflow/);
  assert.match(finalGate, /module-4b-operational-verification/);
  assert.match(finalGate, /module-4a-operational-regression/);
});

// Refuse Stage-10 live acceptance until both Stage 9 and Pass 199 have genuine live evidence.
test('Pass 200 remains fail-honest until Stage-9 handoff and operations live verification exist', () => {
  assert.match(finalGate, /STAGE_9_ACCEPTED_READY_FOR_STAGE_10/);
  assert.match(finalGate, /STAGE_10_MODULE_4B_OPERATIONS_VERIFIED_READY_FOR_PASS_200/);
  assert.match(finalGate, /STAGE_9_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_10_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_10_STATIC_GATE_PASSED_STAGE_9_LIVE_HANDOFF_PENDING/);
  assert.match(finalGate, /runtimeVerificationComplete: passed && mode === 'live'/);
});

// Preserve the exact reviewed Module-4 surface and Stage-10 relationship set at closure.
test('Pass 200 closes Stage 10 without new routes tables permissions or relationships', () => {
  assert.match(finalGate, /activatedRelationships: \['boqs\.project_id', 'boq_items\.wbs_node_id', 'boq_items\.cost_code_id'\]/);
  assert.match(finalGate, /routeCount: 6/);
  assert.match(finalGate, /activePermissions: \['boq\.read', 'boq\.create', 'boq\.edit', 'boq\.freeze', 'boq\.export'\]/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
});

// Advance only to Finance Core after a genuine successful Stage-10 live acceptance.
test('Pass 200 final gate advances to Module 15A Finance Core only after live acceptance', () => {
  assert.match(finalGate, /STAGE_10_ACCEPTED_READY_FOR_STAGE_11/);
  assert.match(finalGate, /Module 15A - Finance Core/);
  assert.equal(rootPackage.scripts['module-4b:gate'], 'node scripts/module-4b/verify-stage-10.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4b:gate:live'], 'node scripts/module-4b/verify-stage-10.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-4b:acceptance:live'], 'npm run module-4b:gate:live');
});
