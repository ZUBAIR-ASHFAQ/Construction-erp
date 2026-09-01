import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/change-orders/STAGE-22-MODULE-17-CONTRACT.md', 'utf8');
const gate = await readFile('scripts/module-17/verify-stage-22-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-17/verify-stage-22-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-17/verify-stage-22-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-17/verify-stage-22-repository.mjs', 'utf8').catch(() => '');
const serviceGate = await readFile('scripts/module-17/verify-stage-22-service.mjs', 'utf8').catch(() => '');
const impactGate = await readFile('scripts/module-17/verify-stage-22-impact.mjs', 'utf8').catch(() => '');
const httpGate = await readFile('scripts/module-17/verify-stage-22-http.mjs', 'utf8').catch(() => '');
const integrationSecurityGate = await readFile('scripts/module-17/verify-stage-22-integration-security.mjs', 'utf8').catch(() => '');
const reactDataGate = await readFile('scripts/module-17/verify-stage-22-react-data.mjs', 'utf8').catch(() => '');
const reactWorkspaceGate = await readFile('scripts/module-17/verify-stage-22-react-workspace.mjs', 'utf8').catch(() => '');
const playwrightGate = await readFile('scripts/module-17/verify-stage-22-playwright.mjs', 'utf8').catch(() => '');
const operationsGate = await readFile('scripts/module-17/verify-stage-22-operations.mjs', 'utf8').catch(() => '');
const finalGate = await readFile('scripts/module-17/verify-stage-22.mjs', 'utf8').catch(() => '');
const browserTest = await readFile('tests/e2e/module-17-browser.spec.mjs', 'utf8').catch(() => '');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8').catch(() => '');
const reactApi = await readFile('apps/web/src/features/change-orders/api/change-orders-api.ts', 'utf8').catch(() => '');
const reactHooks = await readFile('apps/web/src/features/change-orders/hooks/change-orders.ts', 'utf8').catch(() => '');
const reactWorkspace = await readFile('apps/web/src/features/change-orders/components/change-orders-workspace.tsx', 'utf8').catch(() => '');
const reactPage = await readFile('apps/web/src/features/change-orders/pages/change-orders-page.tsx', 'utf8').catch(() => '');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8').catch(() => '');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8').catch(() => '');
const integrationTest = await readFile('tests/integration/module-17-api.integration.test.mjs', 'utf8').catch(() => '');
const schema = await readFile('apps/api/src/modules/change-orders/change-orders.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/change-orders/change-orders.repository.ts', 'utf8').catch(() => '');
const service = await readFile('apps/api/src/modules/change-orders/change-orders.service.ts', 'utf8').catch(() => '');
const routes = await readFile('apps/api/src/modules/change-orders/change-orders.routes.ts', 'utf8').catch(() => '');
const indexFile = await readFile('apps/api/src/modules/change-orders/index.ts', 'utf8').catch(() => '');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const apiEnvExample = await readFile('apps/api/.env.example', 'utf8');
const budgetService = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts', 'utf8');
const budgetRepository = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260826000200_module_17_change_orders_core/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

const TABLES = [
  'change_requests',
  'change_request_lines',
  'change_orders',
  'change_order_impacts',
];

const ROUTES = [
  'GET  /api/v1/change-orders',
  'POST /api/v1/change-orders/requests',
  'PUT  /api/v1/change-orders/requests/:id/lines',
  'POST /api/v1/change-orders/requests/:id/submit',
  'POST /api/v1/change-orders/requests/:id/approve',
  'POST /api/v1/change-orders/requests/:id/reject',
  'GET  /api/v1/change-orders/:id/impact',
];

const PERMISSIONS = [
  'changes.read',
  'changes.create',
  'changes.estimate',
  'changes.submit',
  'changes.approve',
  'changes.apply',
];

const ERRORS = [
  'CHANGE_REQUEST_NOT_FOUND',
  'CHANGE_REQUEST_LOCKED',
  'CHANGE_APPROVAL_REQUIRED',
  'CHANGE_IMPACT_ALREADY_APPLIED',
  'CHANGE_TARGET_CLOSED',
];

const EVENTS = [
  'change_request.created',
  'change_request.submitted',
  'change_order.approved',
  'change_order.impact_applied',
  'change_request.rejected',
];

test('Pass 334 freezes Module 17 at corrected Stage 22', () => {
  assert.match(contract, /Stage 21  Module 21  - Project Scheduling/);
  assert.match(contract, /Stage 22  Module 17  - Change Orders \/ Variations/);
  assert.match(contract, /Stage 23  Module 16  - Client Billing/);
  assert.match(gate, /pass: 334/);
  assert.match(gate, /stage: 22/);
});

test('Pass 334 requires Stage 21 live handoff only for runtime activation', () => {
  assert.match(contract, /STAGE_21_ACCEPTED_READY_FOR_STAGE_22/);
  assert.match(contract, /contract may be reviewed and frozen while that live handoff is pending/);
  assert.match(gate, /STAGE_22_MODULE_17_CONTRACT_FROZEN_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(gate, /persistencePreparationAllowed: passed/);
});

test('Pass 334 preserves corrected hard prerequisites', () => {
  for (const dependency of [
    'Module 5  - Project Management',
    'Module 6  - WBS & Cost Codes',
    'Module 7  - Budgeting & Job Costing',
    'Module 22 - Approval Workflows',
  ]) assert.ok(contract.includes(dependency), `Missing dependency ${dependency}`);

  assert.match(gate, /hardPrerequisites: \[/);
  assert.match(gate, /'5 - Project Management'/);
  assert.match(gate, /'6 - WBS & Cost Codes'/);
  assert.match(gate, /'7 - Budgeting & Job Costing'/);
  assert.match(gate, /'22 - Approval Workflows'/);
});

test('Pass 334 keeps BOQ optional and Scheduling conditional', () => {
  assert.match(contract, /Module 4B - BOQ Project Mapping\s+optional when boq_item_id is used/);
  assert.match(contract, /Module 21 - Project Scheduling\s+conditional when approved_days or Schedule impact is enabled/);
  assert.match(gate, /optionalPrerequisites: \['4B - BOQ Project Mapping when boq_item_id is used'\]/);
  assert.match(gate, /schedulePrerequisiteConditional: true/);
});

test('Pass 334 reuses Module 24B Project scope and Module 18 documents', () => {
  assert.match(contract, /Project-scope authorization already exists through Module 24B and must be reused/);
  assert.match(contract, /Supporting documents use the already-generated Module-18 signed upload\/version\/link contract/);
  assert.match(gate, /projectScopeReusesModule24B: true/);
  assert.match(gate, /supportingDocumentsReuseModule18: true/);
});

test('Pass 334 freezes exactly four source-owned tables', () => {
  for (const table of TABLES) assert.ok(contract.includes(table), `Missing table ${table}`);
  assert.match(gate, /ownedTables: \[/);
  assert.match(gate, /'change_requests'/);
  assert.match(gate, /'change_order_impacts'/);
});

test('Pass 334 freezes all source-defined Change Request fields', () => {
  for (const field of [
    'company_id', 'project_id', 'change_no', 'change_type', 'title', 'description',
    'reason', 'status', 'requested_by', 'requested_at',
  ]) assert.ok(contract.includes(field), `Missing change_requests field ${field}`);
});

test('Pass 334 keeps Change Request actor, time and status server-owned', () => {
  assert.match(contract, /`requested_by` is the authenticated actor/);
  assert.match(contract, /`requested_at` is server-owned time/);
  assert.match(contract, /`status` is server-controlled lifecycle state/);
});

test('Pass 334 records Change number authority instead of inventing it', () => {
  assert.match(contract, /does not define whether it is manually supplied, Foundation-numbered, Company-unique or Project-unique/);
  assert.match(gate, /changeNumberAuthorityGapRecorded: true/);
});

test('Pass 334 records missing withdrawn-change command', () => {
  assert.match(contract, /workflow mentions withdrawn changes, but the reviewed API exposes no withdraw command/);
  assert.match(gate, /withdrawRouteGapRecorded: true/);
});

test('Pass 334 freezes all source-defined Change Request line fields', () => {
  for (const field of [
    'change_request_id', 'wbs_node_id nullable', 'cost_code_id nullable', 'cost_type_id nullable',
    'description', 'cost_amount', 'revenue_amount', 'boq_item_id nullable',
  ]) assert.ok(contract.includes(field), `Missing change_request_lines field ${field}`);
});

test('Pass 334 requires decimal-safe estimated cost and revenue values', () => {
  assert.match(contract, /cost and revenue values use DECIMAL\/NUMERIC/);
  assert.match(gate, /decimalSafeAmountsRequired: true/);
});

test('Pass 334 keeps cost structure and optional BOQ references in Project scope', () => {
  assert.match(contract, /must resolve to the Change Request Project and active reviewed Project cost structure/);
  assert.match(contract, /Module-4B Project-mapped BOQ boundary and must not point to an unrelated Project/);
});

test('Pass 334 does not invent estimate component columns absent from source', () => {
  assert.match(contract, /does not define line quantity, unit, labor\/material\/equipment\/subcontract component columns/);
});

test('Pass 334 records PUT line semantics as unresolved', () => {
  assert.match(contract, /does not explicitly state replace-all versus item-by-item merge semantics/);
  assert.match(gate, /linePutSemanticsGapRecorded: true/);
});

test('Pass 334 freezes all source-defined formal Change Order fields', () => {
  for (const field of [
    'change_request_id', 'approved_cost', 'approved_revenue', 'approved_days nullable',
    'approved_at', 'effective_date', 'status',
  ]) assert.ok(contract.includes(field), `Missing change_orders field ${field}`);
});

test('Pass 334 freezes immutable approved snapshot behavior', () => {
  assert.match(contract, /approved variation snapshot is immutable/i);
  assert.match(gate, /approvedVariationSnapshotImmutable: true/);
});

test('Pass 334 freezes one formal Change Order per approved request', () => {
  assert.match(contract, /one formal Change Order per Change Request/);
  assert.match(gate, /oneFormalChangeOrderPerRequest: true/);
});

test('Pass 334 freezes conditional approved-days Scheduling dependency', () => {
  assert.match(contract, /`approved_days`, when present, activates the corrected Scheduling prerequisite/);
  assert.match(contract, /must never rewrite a Module-21 baseline snapshot/);
});

test('Pass 334 freezes all source-defined Change impact fields', () => {
  for (const field of [
    'change_order_id', 'target_type', 'target_id', 'amount_delta',
    'quantity_delta nullable', 'applied_at nullable', 'status',
  ]) assert.ok(contract.includes(field), `Missing change_order_impacts field ${field}`);
});

test('Pass 334 keeps impact rows server-created and idempotent', () => {
  assert.match(contract, /server-created orchestration evidence, not arbitrary browser-authored generic links/);
  assert.match(contract, /applying the same approved impact more than once is forbidden/);
  assert.match(gate, /impactApplicationIdempotent: true/);
});

test('Pass 334 freezes atomic impact application', () => {
  assert.match(contract, /all required impacts for one approval apply atomically or none do/);
  assert.match(gate, /impactApplicationAtomic: true/);
});

test('Pass 334 freezes mandatory Budget impact from Part I', () => {
  assert.match(contract, /Budget impact remains mandatory/);
  assert.match(contract, /Module-7 Budget\/Forecast impact is part of the mandatory Change Order completion path/);
  assert.match(gate, /budgetImpactMandatory: true/);
});

test('Pass 334 preserves Stage 27 adapter completion boundary', () => {
  assert.match(contract, /Client, Subcontract and Schedule target adapters must pass Stage-27 integration tests/);
  assert.match(contract, /Stage 27 must prove every configured Change impact is applied once, traceable and reversible\/adjustable/);
  assert.match(gate, /stage27TargetAdapterProofRequired: true/);
});

test('Pass 334 keeps Client Billing out of Stage 22 contract generation', () => {
  assert.match(contract, /Client Billing belongs to later Module 16 and must not be generated early in Pass 334/);
  assert.match(gate, /clientBillingGeneratedEarly: false/);
});

test('Pass 334 reuses Module 22 instead of inventing approval storage', () => {
  assert.match(contract, /Module 22 is a hard prerequisite/);
  assert.match(contract, /Module 22 retains approval-decision authority/);
  assert.match(contract, /reuses Module-22 generic resource references rather than inventing a new required foreign key/);
  assert.match(gate, /approvalWorkflowReusesModule22: true/);
});

test('Pass 334 records undefined latest-revision representation', () => {
  assert.match(contract, /no Change Request revision table or revision number is defined/);
  assert.match(gate, /latestRevisionRepresentationGapRecorded: true/);
});

test('Pass 334 does not invent a separate apply endpoint', () => {
  assert.match(contract, /contains no separate `\/apply` route even though `changes.apply` is a source-defined permission/);
  assert.match(contract, /must use the reviewed `\/approve` command/);
  assert.match(gate, /extraApplyRouteInvented: false/);
});

test('Pass 334 freezes exactly seven reviewed routes', () => {
  for (const route of ROUTES) assert.ok(contract.includes(route), `Missing route ${route}`);
  assert.match(gate, /reviewedRouteCount: 7/);
});

test('Pass 334 rejects undocumented generic Change Order endpoints', () => {
  for (const fragment of [
    'GET    /api/v1/change-orders/requests/:id',
    'PATCH  /api/v1/change-orders/requests/:id',
    'POST   /api/v1/change-orders/requests/:id/withdraw',
    'POST   /api/v1/change-orders/:id/apply',
    'POST   /api/v1/change-orders/:id/reopen',
  ]) assert.ok(contract.includes(fragment), `Missing forbidden route example ${fragment}`);
  assert.match(gate, /extraRoutesInvented: false/);
});

test('Pass 334 records missing detail GET contract instead of inventing it', () => {
  assert.match(contract, /no dedicated Change Request detail GET/);
  assert.match(gate, /detailGetRouteGapRecorded: true/);
});

test('Pass 334 freezes exactly six source permissions', () => {
  for (const permission of PERMISSIONS) assert.ok(contract.includes(permission), `Missing permission ${permission}`);
  assert.match(gate, /reviewedPermissions: \[/);
  assert.match(gate, /extraPermissionsInvented: false/);
});

test('Pass 334 maps impact application to reviewed apply authority without adding a route', () => {
  assert.match(contract, /any approved command that causes target application must additionally enforce `changes.apply`/);
});

test('Pass 334 keeps Company, actor and allowed Project authority server-side', () => {
  assert.match(contract, /companyId/);
  assert.match(contract, /actorUserId/);
  assert.match(contract, /allowedProjectIds/);
  assert.match(contract, /browser-supplied Project ID never grants Project access by itself/);
});

test('Pass 334 freezes exactly five stable business errors', () => {
  for (const error of ERRORS) assert.ok(contract.includes(error), `Missing error ${error}`);
  assert.match(gate, /reviewedErrors: \[/);
});

test('Pass 334 freezes exactly five source events', () => {
  for (const event of EVENTS) assert.ok(contract.includes(event), `Missing event ${event}`);
  assert.match(gate, /reviewedEvents: \[/);
});

test('Pass 334 preserves Foundation audit and outbox behavior', () => {
  assert.match(contract, /Events are recorded through the Foundation outbox only after successful business validation/);
  assert.match(contract, /Audit must cover/);
});

test('Pass 334 freezes the reviewed React feature without backend invention', () => {
  assert.match(contract, /apps\/web\/src\/features\/change-orders\//);
  for (const surface of [
    'Change register',
    'cost/revenue impact worksheet',
    'approval timeline',
    'supporting documents',
    'applied-impact summary',
  ]) assert.ok(contract.includes(surface), `Missing React surface ${surface}`);
  assert.match(contract, /must not invent hidden browser-only backend routes/);
});

test('Pass 334 freezes the previously reviewed Pass 334 through 345 sequence', () => {
  assert.match(contract, /\*\*Pass 334\*\* — freeze this Module-17 contract/);
  assert.match(contract, /\*\*Pass 335\*\* — generate\/review the four Prisma models/);
  assert.match(contract, /\*\*Pass 345\*\* — run final Stage-22 operational\/concurrency\/regression acceptance/);
});

test('Pass 334 records unresolved source gaps explicitly', () => {
  for (const gap of [
    'change_requests.change_no numbering authority',
    'change_type vocabulary is not enumerated',
    'no Change Request / Change Order detail GET route is defined',
    'changes.apply exists but no standalone apply route exists',
    'approved_days semantics',
    'reversal/adjustment command',
  ]) assert.ok(contract.includes(gap), `Missing source gap ${gap}`);
  assert.match(gate, /unresolvedSourceAmbiguities: \[/);
});

test('Pass 334 contract evidence records that its own pass generated no runtime or migration', () => {
  assert.match(gate, /productionFilesGenerated: false/);
  assert.match(gate, /databaseMigrationGenerated: false/);
});

test('Pass 334 contract gate remains available after later persistence work', () => {
  assert.equal(
    rootPackage.scripts['module-17:contract:gate'],
    'node scripts/module-17/verify-stage-22-contract.mjs',
  );
  assert.equal(
    rootPackage.scripts['pass-334:change-orders-contract:gate'],
    'node scripts/module-17/verify-stage-22-contract.mjs',
  );
});

test('Pass 335 implements exactly the four reviewed Module-17 persistence models', () => {
  for (const model of ['ChangeRequest', 'ChangeRequestLine', 'ChangeOrder', 'ChangeOrderImpact']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`));
  }
  for (const table of TABLES) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.equal([...migration.matchAll(/CREATE TABLE\s+"([^"]+)"/g)].length, 4);
});

test('Pass 335 preserves all reviewed persistence fields without extra business tables', () => {
  const request = prisma.match(/model ChangeRequest \{[\s\S]*?\n\}/)?.[0] ?? '';
  const line = prisma.match(/model ChangeRequestLine \{[\s\S]*?\n\}/)?.[0] ?? '';
  const order = prisma.match(/model ChangeOrder \{[\s\S]*?\n\}/)?.[0] ?? '';
  const impact = prisma.match(/model ChangeOrderImpact \{[\s\S]*?\n\}/)?.[0] ?? '';
  for (const token of ['companyId', 'projectId', 'changeNo', 'changeType', 'title', 'description', 'reason', 'status', 'requestedBy', 'requestedAt']) assert.match(request, new RegExp(token));
  for (const token of ['changeRequestId', 'wbsNodeId', 'costCodeId', 'costTypeId', 'description', 'costAmount', 'revenueAmount', 'boqItemId']) assert.match(line, new RegExp(token));
  for (const token of ['changeRequestId', 'approvedCost', 'approvedRevenue', 'approvedDays', 'approvedAt', 'effectiveDate', 'status']) assert.match(order, new RegExp(token));
  for (const token of ['changeOrderId', 'targetType', 'targetId', 'amountDelta', 'quantityDelta', 'appliedAt', 'status']) assert.match(impact, new RegExp(token));
  assert.doesNotMatch(migration, /CREATE TABLE "(change_request_revisions|change_order_revisions|change_documents|change_approvals|change_schedule_impacts)"/);
});

test('Pass 335 uses exact decimal storage without inventing positive-only impact rules', () => {
  assert.match(prisma, /costAmount\s+Decimal[\s\S]*@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /revenueAmount\s+Decimal[\s\S]*@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /approvedCost\s+Decimal[\s\S]*@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /approvedRevenue\s+Decimal[\s\S]*@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /approvedDays\s+Decimal\?[\s\S]*@db\.Decimal\(10, 2\)/);
  assert.match(prisma, /amountDelta\s+Decimal[\s\S]*@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /quantityDelta\s+Decimal\?[\s\S]*@db\.Decimal\(18, 4\)/);
  assert.doesNotMatch(migration, /(cost_amount|revenue_amount|approved_cost|approved_revenue|amount_delta|quantity_delta)"?\s*(>=|>)/i);
});

test('Pass 335 enforces trusted Company, Project and requester ownership', () => {
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("requested_by", "company_id"\) REFERENCES "users"\("id", "company_id"\)/);
  assert.match(prisma, /project\s+Project[\s\S]*fields: \[projectId, companyId\][\s\S]*references: \[id, companyId\]/);
  assert.match(prisma, /requester\s+User[\s\S]*fields: \[requestedBy, companyId\][\s\S]*references: \[id, companyId\]/);
});

test('Pass 335 scopes optional cost structure and BOQ references to the Change Request Project', () => {
  assert.match(migration, /module_17_validate_change_request_line_scope/);
  assert.match(migration, /Change Request WBS node must belong to the Change Request Company and Project/);
  assert.match(migration, /Change Request Cost Code must belong to the Change Request Company/);
  assert.match(migration, /Change Request Cost Type must belong to the Change Request Company/);
  assert.match(migration, /project_cost_codes[\s\S]*is_posting_allowed" = TRUE/);
  assert.match(migration, /Change Request BOQ item must belong to a Project-mapped BOQ for the Change Request Project/);
});

test('Pass 335 does not invent Change number uniqueness or status/type enums', () => {
  assert.match(prisma, /@@index\(\[companyId, changeNo\], map: "change_requests_company_change_no_idx"\)/);
  assert.doesNotMatch(prisma, /@@unique\(\[companyId, changeNo\]/);
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX "change_requests[^\n]*change_no/);
  assert.doesNotMatch(migration, /CREATE TYPE[^;]*(change|impact)/is);
});

test('Pass 335 enforces one immutable formal Change Order per request', () => {
  assert.match(prisma, /changeRequestId\s+String\s+@unique\(map: "change_orders_request_uq"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "change_orders_request_uq"/);
  assert.match(migration, /module_17_reject_change_order_snapshot_mutation/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "change_orders"/);
  assert.match(migration, /Approved Change Order snapshots are immutable/);
});

test('Pass 335 preserves generic impact evidence without inventing target foreign keys', () => {
  assert.match(prisma, /targetType\s+String[\s\S]*targetId\s+String/);
  assert.doesNotMatch(migration, /FOREIGN KEY \("target_id"\)/);
  assert.match(migration, /module_17_validate_change_order_impact_update/);
  assert.match(migration, /Change Order impact identity and values are immutable/);
  assert.match(migration, /Applied Change Order impacts are immutable/);
});

test('Pass 335 keeps the reviewed Stage-22 migration gate registered after later stages append', () => {
  const stage22Gate = migrationGates.gates.find((item) => item.gate === 'module-17-change-orders-core-persistence');
  assert.ok(stage22Gate);
  assert.equal(stage22Gate.stage, 22);
  assert.deepEqual(stage22Gate.migrations, ['20260826000200_module_17_change_orders_core']);
});

test('Pass 335 registers a simple persistence gate and keeps runtime activation blocked without Stage 21 live acceptance', () => {
  assert.equal(rootPackage.scripts['module-17:persistence:gate'], 'node scripts/module-17/verify-stage-22-persistence.mjs');
  assert.equal(rootPackage.scripts['pass-335:change-orders-persistence:gate'], 'node scripts/module-17/verify-stage-22-persistence.mjs');
  assert.match(persistenceGate, /pass: 335/);
  assert.match(persistenceGate, /STAGE_22_MODULE_17_PERSISTENCE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(persistenceGate, /productionRuntimeActivationAllowed: false/);
});

test('Pass 335 evidence records that runtime layers were still deferred at the persistence checkpoint', () => {
  assert.match(persistenceGate, /apiSchemaGenerated: false/);
  assert.match(persistenceGate, /repositoryGenerated: false/);
  assert.match(persistenceGate, /serviceGenerated: false/);
  assert.match(persistenceGate, /publicRoutesGenerated: false/);
  assert.match(persistenceGate, /reactGenerated: false/);
  assert.match(persistenceGate, /stage27TargetAdaptersGeneratedEarly: false/);
});



test('Pass 336 established the strict Module-17 schema before later runtime layers', async () => {
  await access('apps/api/src/modules/change-orders/change-orders.schema.ts');
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /indexGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
});

test('Pass 336 freezes exactly seven reviewed routes, six permissions, five errors and five events', () => {
  for (const route of ROUTES) {
    const [method, path] = route.trim().split(/\s+/);
    assert.ok(schema.includes(`method: '${method}'`), `Missing method ${method}`);
    assert.ok(schema.includes(`route: '${path}'`), `Missing route ${path}`);
  }
  for (const permission of PERMISSIONS) assert.ok(schema.includes(`'${permission}'`), `Missing permission ${permission}`);
  for (const error of ERRORS) assert.ok(schema.includes(`'${error}'`), `Missing error ${error}`);
  for (const event of EVENTS) assert.ok(schema.includes(`'${event}'`), `Missing event ${event}`);
  assert.match(schemaGate, /reviewedRouteCount: 7/);
  assert.match(schemaGate, /extraRoutesInvented: false/);
  assert.match(schemaGate, /extraPermissionsInvented: false/);
});

test('Pass 336 keeps the Change register query to bounded pagination only', () => {
  assert.match(schema, /MODULE_17_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /listChangeOrdersQuerySchema = z\.object\(\{\s*\.\.\.paginationQueryShape\s*\}\)\.strict\(\)/s);
  assert.match(schemaGate, /listFiltersInvented: false/);
  assert.match(schemaGate, /boundedPaginationOnly: true/);
});

test('Pass 336 accepts only source-supported create fields and keeps numbering/state server-owned', () => {
  const block = schema.match(/createChangeRequestBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  for (const field of ['projectId', 'changeType', 'title', 'description', 'reason']) assert.match(block, new RegExp(field));
  for (const forbidden of ['companyId', 'actorUserId', 'changeNo', 'status', 'requestedBy', 'requestedAt']) assert.doesNotMatch(block, new RegExp(forbidden));
  assert.match(schemaGate, /changeNumberBrowserOwned: false/);
  assert.match(schemaGate, /requestStatusBrowserOwned: false/);
});

test('Pass 336 resolves the reviewed PUT as complete draft-line replacement without line CRUD', () => {
  assert.match(schema, /replaceChangeRequestLinesBodySchema = z\.object\(\{\s*lines: z\.array\(changeRequestLineInputSchema\)\s*\}\)\.strict\(\)/s);
  assert.match(schema, /complete draft-line replacement/);
  assert.match(schemaGate, /draftLinePutSemantics: 'complete-replacement'/);
  const lineBlock = schema.match(/changeRequestLineInputSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId', 'description', 'costAmount', 'revenueAmount', 'boqItemId']) assert.match(lineBlock, new RegExp(field));
  assert.doesNotMatch(lineBlock, /\bid\s*:/);
  assert.doesNotMatch(lineBlock, /changeRequestId\s*:/);
});

test('Pass 336 keeps financial and approved-day values as exact decimal strings', () => {
  assert.match(schema, /moneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /approvedDaysSchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /quantityDeltaSchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schemaGate, /exactDecimalStringsUsed: true/);
  assert.match(schemaGate, /approvedDaysWholeNumberRestrictionInvented: false/);
});

test('Pass 336 makes submit and reject bodyless and does not invent rejection payloads', () => {
  assert.match(schema, /submitChangeRequestBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /rejectChangeRequestBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schemaGate, /submitBodyless: true/);
  assert.match(schemaGate, /rejectBodyless: true/);
  assert.match(schemaGate, /rejectionReasonInvented: false/);
});

test('Pass 336 approval accepts effective date and optional approved days but not approved totals', () => {
  const block = schema.match(/approveChangeRequestBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(block, /effectiveDate/);
  assert.match(block, /approvedDays/);
  assert.doesNotMatch(block, /approvedCost/);
  assert.doesNotMatch(block, /approvedRevenue/);
  assert.doesNotMatch(block, /approvedAt/);
  assert.match(schemaGate, /approvedTotalsBrowserOwned: false/);
});

test('Pass 336 keeps Change and impact lifecycle vocabularies string-backed', () => {
  assert.match(schema, /statusSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(32\)/);
  assert.match(schema, /targetTypeSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(100\)/);
  assert.match(schemaGate, /changeTypeEnumInvented: false/);
  assert.match(schemaGate, /lifecycleStatusEnumsInvented: false/);
  assert.match(schemaGate, /impactTargetEnumInvented: false/);
});

test('Pass 336 uses aggregate list readback instead of inventing a detail route', () => {
  assert.match(schema, /changeRequestResponseSchema = z\.object/);
  assert.match(schema, /lines: z\.array\(changeRequestLineResponseSchema\)/);
  assert.match(schema, /changeOrder: changeOrderResponseSchema\.nullable\(\)/);
  assert.match(schemaGate, /separateDetailRouteInvented: false/);
  assert.match(schemaGate, /aggregateListReadbackUsed: true/);
});

test('Pass 336 keeps impact targets server-created and exposes no impact mutation body', () => {
  assert.match(schema, /changeOrderImpactResponseSchema = z\.object/);
  assert.match(schemaGate, /impactWriteBodyInvented: false/);
  assert.match(schemaGate, /impactTargetsBrowserOwned: false/);
  assert.doesNotMatch(schema, /createChangeOrderImpactBodySchema|updateChangeOrderImpactBodySchema/);
});

test('Pass 336 maps all five reviewed stable errors without leaking implementation errors', () => {
  assert.match(schema, /export function createModule17Error/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ConflictError/);
  for (const error of ERRORS) assert.ok(schema.includes(`${error}:`), `Missing public message for ${error}`);
});

test('Pass 336 registers the schema gate and keeps later runtime layers pending', () => {
  assert.equal(rootPackage.scripts['module-17:schema:gate'], 'node scripts/module-17/verify-stage-22-schema.mjs');
  assert.equal(rootPackage.scripts['pass-336:change-orders-schema:gate'], 'node scripts/module-17/verify-stage-22-schema.mjs');
  assert.match(schemaGate, /pass: 336/);
  assert.match(schemaGate, /STAGE_22_MODULE_17_SCHEMA_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /indexGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
});

test('Pass 336 keeps clear purpose comments on its named functions', () => {
  assert.match(schema, /\/\*\* Map each reviewed Module-17 business code[\s\S]*?\*\/\s*export function createModule17Error/);
  assert.match(schemaGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
});


test('Pass 337 added only the Company/Project-scoped repository at its own checkpoint', async () => {
  await access('apps/api/src/modules/change-orders/change-orders.repository.ts');
  assert.doesNotMatch(repository, /ChangeOrdersService|executeIdempotentCommand|ApprovalsService/);
  assert.match(repositoryGate, /reactGenerated: false/);
  assert.match(repositoryGate, /serviceGenerated: false/);
  assert.match(repositoryGate, /routesGenerated: false/);
  assert.match(repositoryGate, /indexGenerated: false/);
  assert.match(repository, /DatabaseClient, TransactionClient/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /ChangeOrdersProjectVisibilityRepositoryInput/);
  assert.doesNotMatch(repository, /FastifyInstance|useQuery|useMutation|createModule17Error/);
});

test('Pass 337 reuses trusted Company scope and explicit Module-24B Project visibility', () => {
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /function isProjectVisible/);
  assert.match(repository, /visibility\.allowedProjectIds === null/);
  assert.match(repository, /function buildProjectVisibilityWhere/);
  assert.match(repository, /requireCompanyRepositoryScope\(\)/);
  assert.doesNotMatch(repository, /companyId:\s*string[;,]/);
});

test('Pass 337 keeps Change register pagination bounded and Project-visible', () => {
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /MODULE_17_MAX_PAGE_SIZE/);
  assert.match(repository, /async listChangeRequests\(input: ListChangeRequestsRepositoryInput\)/);
  assert.match(repository, /scope\.where\(buildProjectVisibilityWhere\(input\.visibility\)\)/);
  assert.match(repository, /skip: input\.skip/);
  assert.match(repository, /take: input\.take/);
  assert.doesNotMatch(repository, /search\?:|status\?:|projectId\?:.*ListChangeRequestsRepositoryInput/s);
});

test('Pass 337 returns the reviewed aggregate list/read shape in deterministic order', () => {
  assert.match(repository, /function changeRequestAggregateInclude/);
  assert.match(repository, /lines:\s*\{[\s\S]*orderBy: \[\{ id: 'asc'/);
  assert.match(repository, /order: true/);
  assert.match(repository, /orderBy: \[\{ requestedAt: 'desc' \}, \{ changeNo: 'asc' \}, \{ id: 'asc' \}\]/);
  assert.match(repository, /async findChangeRequestById/);
});

test('Pass 337 prepares a scoped row lock for state-sensitive Change Request commands', () => {
  assert.match(repository, /async lockChangeRequestForWrite/);
  assert.match(repository, /FROM change_requests[\s\S]*project_id = \$\{projectId\}::uuid[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
});

test('Pass 337 creates Change Requests only from server-owned number, status and actor values', () => {
  const block = repository.match(/async createChangeRequest\([\s\S]*?include: changeRequestAggregateInclude\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  for (const field of ['projectId', 'changeNo', 'changeType', 'title', 'description', 'reason', 'status', 'requestedBy']) {
    assert.ok(block.includes(field), `Create primitive missing ${field}`);
  }
  assert.match(block, /scope\.createData\(\{/);
  assert.match(block, /this\.db\.user\.findFirst/);
  assert.doesNotMatch(block, /companyId: input|requestedAt: input|actorUserId/);
});

test('Pass 337 resolves optional WBS, Cost Code and Cost Type references inside reviewed ownership scope', () => {
  assert.match(repository, /async findWbsNodesByIds/);
  assert.match(repository, /scope\.where\(\{ id: \{ in: ids \}, projectId \}\)/);
  assert.match(repository, /async findCostCodesByIds/);
  assert.match(repository, /this\.db\.costCode\.findMany/);
  assert.match(repository, /async findCostTypesByIds/);
  assert.match(repository, /this\.db\.costType\.findMany/);
});

test('Pass 337 resolves complete posting combinations through Module-6 Project mappings', () => {
  assert.match(repository, /function completeCostStructures/);
  assert.match(repository, /async findPostingCostStructures/);
  assert.match(repository, /this\.db\.projectCostCode\.findMany/);
  assert.match(repository, /project: \{ companyId: scope\.companyId \}/);
  assert.match(repository, /isPostingAllowed: true/);
  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId']) assert.ok(repository.includes(field));
});

test('Pass 337 scopes optional BOQ items through the existing Project-mapped BOQ relationship', () => {
  assert.match(repository, /async findProjectBoqItemsByIds/);
  assert.match(repository, /revision:\s*\{[\s\S]*boq:\s*\{[\s\S]*projectId,[\s\S]*companyId: scope\.companyId/);
  assert.doesNotMatch(repository, /createBoq|updateBoq|deleteBoq/);
});

test('Pass 337 implements PUT lines as complete replacement inside caller-owned transactions', () => {
  assert.match(repository, /async replaceChangeRequestLines/);
  assert.match(repository, /changeRequestLine\.deleteMany\(\{ where: \{ changeRequestId \} \}\)/);
  assert.match(repository, /changeRequestLine\.createMany/);
  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId', 'description', 'costAmount', 'revenueAmount', 'boqItemId']) {
    assert.ok(repository.includes(`${field}:`), `Line replacement missing ${field}`);
  }
  assert.match(repository, /return this\.findChangeRequestById\(changeRequestId, visibility\)/);
});

test('Pass 337 keeps lifecycle authority server-side with a narrow status update primitive', () => {
  assert.match(repository, /async updateChangeRequestStatus/);
  assert.match(repository, /data: \{ status: input\.status \}/);
  assert.doesNotMatch(repository, /updateChangeRequestHeader|updateChangeRequestDetails|deleteChangeRequest/);
});

test('Pass 337 prepares singular immutable formal Change Order creation for approval retries', () => {
  assert.match(repository, /async findChangeOrderByRequestId/);
  assert.match(repository, /async createChangeOrder\(input: CreateChangeOrderRepositoryInput\)/);
  for (const field of ['approvedCost', 'approvedRevenue', 'approvedDays', 'approvedAt', 'effectiveDate', 'status']) {
    assert.ok(repository.includes(`${field}: input.${field}`) || repository.includes(`${field}: input.${field} ?? null`), `Formal order primitive missing ${field}`);
  }
  assert.doesNotMatch(repository, /updateChangeOrder\(|deleteChangeOrder\(/);
});

test('Pass 337 keeps impact evidence server-created and read-only after insert', () => {
  assert.match(repository, /async findChangeOrderById/);
  assert.match(repository, /async createChangeOrderImpacts/);
  assert.match(repository, /changeOrderImpact\.createMany/);
  for (const field of ['targetType', 'targetId', 'amountDelta', 'quantityDelta', 'appliedAt', 'status']) {
    assert.ok(repository.includes(`${field}: impact.${field}`) || repository.includes(`${field}: impact.${field} ?? null`), `Impact primitive missing ${field}`);
  }
  assert.doesNotMatch(repository, /updateChangeOrderImpact|deleteChangeOrderImpact|applyChangeOrderImpact/);
});

test('Pass 337 does not duplicate Budget, Approval, Schedule, Client Billing or Stage-27 adapters in the repository', () => {
  assert.doesNotMatch(repository, /projectBudget\.(create|update|delete)|forecastLine\.(create|update|delete)/);
  assert.doesNotMatch(repository, /approvalRequest\.(create|update|delete)|scheduleActivity\.(create|update|delete)/);
  assert.doesNotMatch(repository, /clientInvoice|clientContract|subcontract.*update|stage27/i);
});

test('Pass 337 registers the repository gate after the strict schema gate', () => {
  assert.equal(rootPackage.scripts['module-17:repository:gate'], 'node scripts/module-17/verify-stage-22-repository.mjs');
  assert.equal(rootPackage.scripts['pass-337:change-orders-repository:gate'], 'node scripts/module-17/verify-stage-22-repository.mjs');
  assert.match(repositoryGate, /pass: 337/);
  assert.match(repositoryGate, /STAGE_22_MODULE_17_REPOSITORY_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
});

test('Pass 337 keeps clear purpose comments on every new named helper and repository method', () => {
  for (const name of [
    'assertPageWindow',
    'uniqueIds',
    'isProjectVisible',
    'buildProjectVisibilityWhere',
    'changeRequestAggregateInclude',
    'completeCostStructures',
  ]) {
    assert.match(repository, new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*function ${name}\\(`), `Missing purpose comment for ${name}`);
  }
  assert.match(repositoryGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
});

test('Pass 338 added the core Change Orders service while HTTP and React remained deferred at that checkpoint', async () => {
  await access('apps/api/src/modules/change-orders/change-orders.service.ts');
  assert.match(serviceGate, /routesGenerated: false/);
  assert.match(serviceGate, /indexGenerated: false/);
  assert.match(serviceGate, /reactGenerated: false/);
  assert.match(service, /export class ChangeOrdersService/);
  assert.doesNotMatch(service, /FastifyInstance|useQuery|useMutation/);
});

test('Pass 338 keeps Company and Project authority server-resolved through Module 24B', () => {
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /private async hasCompanyPermission/);
  assert.match(service, /private async requireProjectPermission/);
  assert.match(service, /private async resolveProjectVisibility/);
  assert.match(service, /scope\.kind === 'restricted'/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.doesNotMatch(service, /companyId:\s*input\.|allowedProjectIds:\s*input\./);
});

test('Pass 338 keeps lifecycle tokens private and string-backed instead of exporting an invented enum', () => {
  for (const token of ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']) {
    assert.ok(service.includes(`'${token}'`), `Missing implementation-private lifecycle token ${token}`);
  }
  assert.doesNotMatch(service, /export enum .*Change|z\.enum\(\['DRAFT', 'SUBMITTED'/);
  assert.match(contract, /implementation-private lifecycle vocabulary/);
});

test('Pass 338 uses Foundation Company numbering without inventing a Project numbering rule', () => {
  assert.match(service, /allocateCompanyNumber/);
  assert.match(service, /CHANGE_REQUEST_SEQUENCE_KEY = 'change-request'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: CHANGE_REQUEST_SEQUENCE_KEY \}\)/);
  assert.match(contract, /existing Foundation Company-numbering service/);
  assert.match(contract, /does not add a Project-level numbering claim/);
});

test('Pass 338 serializes exact money and calculates approved totals without binary floating point', () => {
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /function minorUnitsToMoney/);
  assert.match(service, /function sumLineMoney/);
  assert.match(service, /BigInt\(/);
  assert.match(service, /MAX_MONEY_MINOR_UNITS/);
  assert.doesNotMatch(service, /parseFloat|Number\(.*costAmount|Number\(.*revenueAmount/);
});

test('Pass 338 creates Change Requests with server-owned actor, DRAFT state, audit and outbox evidence', () => {
  assert.match(service, /async createChangeRequest\(/);
  assert.match(service, /private async createChangeRequestOnce/);
  assert.match(service, /'changes\.create'/);
  assert.match(service, /requestedBy: security\.actorUserId/);
  assert.match(service, /status: CHANGE_REQUEST_DRAFT/);
  assert.match(service, /action: 'change_request\.created'/);
  assert.match(service, /eventType: 'change_request\.created'/);
  assert.match(service, /executeIdempotentCommand/);
});

test('Pass 338 allows complete line replacement only while the Change Request is DRAFT', () => {
  assert.match(service, /async replaceChangeRequestLines\(/);
  assert.match(service, /'changes\.estimate'/);
  assert.match(service, /lockChangeRequestForWrite/);
  assert.match(service, /CHANGE_REQUEST_DRAFT/);
  assert.match(service, /CHANGE_REQUEST_LOCKED/);
  assert.match(service, /replaceChangeRequestLines\(/);
});

test('Pass 338 revalidates optional WBS, Cost Code, Cost Type and BOQ line references', () => {
  assert.match(service, /private async requireValidLineReferences/);
  assert.match(service, /findWbsNodesByIds/);
  assert.match(service, /findCostCodesByIds/);
  assert.match(service, /findCostTypesByIds/);
  assert.match(service, /findProjectBoqItemsByIds/);
  assert.match(service, /findPostingCostStructures/);
  assert.match(service, /invalid or not posting-enabled/);
});

test('Pass 338 submits the current estimate snapshot to Module 22 instead of owning approval actions', () => {
  assert.match(service, /ApprovalsService/);
  assert.match(service, /function buildChangeApprovalInput/);
  assert.match(service, /sourceType: 'change-request-submit'/);
  assert.match(service, /requestApprovalInTransaction/);
  assert.match(service, /status: CHANGE_REQUEST_SUBMITTED/);
  assert.match(service, /eventType: 'change_request\.submitted'/);
  assert.doesNotMatch(service, /createApprovalAction|updateApprovalRequestProgress|approvalAction/);
});

test('Pass 338 approve/reject commands only synchronize terminal Module-22 decisions', () => {
  assert.match(service, /async approveChangeRequest\(/);
  assert.match(service, /async rejectChangeRequest\(/);
  assert.match(service, /if \(!hasStatus\(approval\.status, CHANGE_REQUEST_APPROVED\)\) throw createModule17Error\('CHANGE_APPROVAL_REQUIRED'\)/);
  assert.match(service, /if \(!hasStatus\(approval\.status, CHANGE_REQUEST_REJECTED\)\) throw createModule17Error\('CHANGE_APPROVAL_REQUIRED'\)/);
  assert.match(service, /status: CHANGE_REQUEST_APPROVED/);
  assert.match(service, /status: CHANGE_REQUEST_REJECTED/);
});

test('Pass 338 creates one immutable formal approval snapshot from exact current line totals', () => {
  assert.match(service, /const approvedCost = sumLineMoney\(source\.lines, 'costAmount'\)/);
  assert.match(service, /const approvedRevenue = sumLineMoney\(source\.lines, 'revenueAmount'\)/);
  assert.match(service, /createChangeOrder\(\{/);
  assert.match(service, /approvedCost,\s+approvedRevenue,/);
  assert.match(service, /approvedDays: null/);
  assert.match(service, /status: CHANGE_ORDER_APPROVED/);
  assert.match(service, /eventType: 'change_order\.approved'/);
  assert.doesNotMatch(service, /updateChangeOrder\(|deleteChangeOrder\(/);
});

test('Pass 338 hands mandatory Budget application to the reviewed Pass 339 gate before route exposure', () => {
  assert.match(contract, /Pass 339 must extend that same approval transaction with mandatory Module-7 Budget\/Forecast application and `changes\.apply` authorization/);
  assert.match(serviceGate, /budgetForecastImpactApplied: false/);
  assert.match(serviceGate, /changesApplyPermissionIntegrated: false/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: false/);
});

test('Pass 338 keeps the formal impact read read-only and permission-filtered', () => {
  const impactRead = service.match(/async getChangeOrderImpact\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(impactRead, /'changes\.read'/);
  assert.match(impactRead, /findChangeOrderById/);
  assert.match(impactRead, /impacts: source\.impacts\.map\(changeOrderImpactResponse\)/);
  assert.doesNotMatch(impactRead, /createChangeOrderImpacts\(/);
});

test('Pass 338 registers its focused service gate and next Pass 339 handoff', () => {
  assert.equal(rootPackage.scripts['module-17:service:gate'], 'node scripts/module-17/verify-stage-22-service.mjs');
  assert.equal(rootPackage.scripts['pass-338:change-orders-service:gate'], 'node scripts/module-17/verify-stage-22-service.mjs');
  assert.match(serviceGate, /pass: 338/);
  assert.match(serviceGate, /STAGE_22_MODULE_17_SERVICE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /Pass 339 - Module 17 mandatory Module-7 Budget\/Forecast impact application/);
});

test('Pass 338 keeps clear purpose comments on every new named service function', () => {
  for (const name of [
    'hasStatus',
    'inputDate',
    'dateOnly',
    'uniqueIds',
    'pageWindow',
    'moneyToMinorUnits',
    'minorUnitsToMoney',
    'sumLineMoney',
    'changeRequestLineResponse',
    'changeOrderResponse',
    'changeOrderImpactResponse',
    'changeRequestResponse',
    'costStructureKey',
    'completeLineCostStructures',
    'buildChangeApprovalInput'
  ]) {
    assert.match(service, new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*function ${name}\\(`), `Missing purpose comment for ${name}`);
  }
  assert.match(serviceGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
});


test('Pass 339 reuses Module 7 service orchestration instead of writing Budget or Forecast tables from Module 17', () => {
  assert.match(service, /BudgetsJobCostingService/);
  assert.match(service, /applyApprovedChangeOrderInTransaction/);
  assert.doesNotMatch(service, /projectBudget\.(create|update|delete)|budgetLine\.(create|update|delete)|forecastLine\.(create|update|delete)/);
});

test('Pass 339 requires changes.apply in addition to changes.approve before any approved target application', () => {
  const block = service.match(/private async approveChangeRequestOnce\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(block, /'changes\.approve'/);
  assert.match(block, /'changes\.apply'/);
  assert.ok(block.indexOf("'changes.apply'") < block.indexOf('createChangeOrder({'));
});

test('Pass 339 creates a controlled next frozen Module-7 budget revision from the current frozen budget', () => {
  assert.match(budgetService, /async applyApprovedChangeOrderInTransaction\(/);
  assert.match(budgetService, /findLatestProjectBudgetByStatus\(input\.projectId, BUDGET_FROZEN\)/);
  assert.match(budgetService, /versionNo: \(latest\?\.versionNo \?\? current\.versionNo\) \+ 1/);
  assert.match(budgetService, /status: BUDGET_DRAFT/);
  assert.match(budgetService, /updateProjectBudgetStatus\([\s\S]*?BUDGET_DRAFT,[\s\S]*?BUDGET_FROZEN/);
  assert.match(budgetService, /eventType: 'budget\.revised'/);
});

test('Pass 339 requires complete cost structure for non-zero approved financial lines and groups exact deltas', () => {
  assert.match(budgetService, /function prepareChangeBudgetAdjustments/);
  assert.match(budgetService, /if \(cost === 0n && revenue === 0n\) continue/);
  assert.match(budgetService, /Approved Change financial lines require WBS, Cost Code and Cost Type/);
  assert.match(budgetService, /addMoneyMinorUnits/);
  assert.match(budgetService, /minorUnitsToMoney/);
  assert.match(budgetService, /requireValidCostStructures/);
});

test('Pass 339 appends reviewed budget adjustment rows through Module 7 repository scope', () => {
  assert.match(budgetRepository, /async appendBudgetLines\(/);
  assert.match(budgetRepository, /requireCompanyRepositoryScope/);
  assert.match(budgetRepository, /findPostingCostStructures/);
  assert.match(budgetRepository, /budgetLine\.create/);
  assert.doesNotMatch(budgetRepository, /changeOrder|changeRequest/);
});

test('Pass 339 carries the latest forecast forward and adds approved financial adjustment assumptions', () => {
  assert.match(budgetService, /findLatestForecastLine/);
  assert.match(budgetService, /listForecastLines\(input\.projectId, latestForecast\.asOfDate\)/);
  assert.match(budgetService, /latestForecast\.asOfDate > input\.effectiveDate/);
  assert.match(budgetService, /estimateToComplete: adjustments\[index\]\?\.amount \?\? '0\.00'/);
  assert.match(budgetService, /replaceForecastLines\(input\.projectId, forecastDate, preparedForecasts\)/);
  assert.match(budgetService, /eventType: 'forecast\.updated'/);
});

test('Pass 339 records server-owned applied Budget and Forecast impact evidence for cost and revenue', () => {
  for (const token of [
    'PROJECT_BUDGET_COST',
    'PROJECT_BUDGET_REVENUE',
    'PROJECT_FORECAST_COST',
    'PROJECT_FORECAST_REVENUE'
  ]) assert.ok(service.includes(token), `Missing Pass-339 impact token ${token}`);
  assert.match(service, /createChangeOrderImpacts\(\{/);
  assert.match(service, /status: CHANGE_IMPACT_APPLIED/);
  assert.match(service, /appliedAt: now/);
  assert.match(service, /eventType: 'change_order\.impact_applied'/);
});

test('Pass 339 does not mark the Change Request approved until mandatory Module-7 impact work succeeds', () => {
  const block = service.match(/private async approveChangeRequestOnce\([\s\S]*?\n  \}/)?.[0] ?? '';
  const applyIndex = block.indexOf('applyApprovedChangeOrderInTransaction');
  const impactIndex = block.indexOf('createChangeOrderImpacts({');
  const statusIndex = block.indexOf('status: CHANGE_REQUEST_APPROVED');
  assert.ok(applyIndex >= 0 && impactIndex > applyIndex && statusIndex > impactIndex);
});

test('Pass 339 fails closed for approvedDays until the reviewed Stage-27 Schedule adapter exists', () => {
  assert.match(service, /if \(input\.approvedDays !== undefined && input\.approvedDays !== null\)/);
  assert.match(service, /Schedule-day impact requires the reviewed Stage-27 Schedule adapter/);
  assert.doesNotMatch(service, /SchedulingService|scheduleActivity\.(update|create)|scheduleBaseline\.(update|create)/);
  assert.match(contract, /Pass 339 therefore fails closed when `approvedDays` is supplied/);
});

test('Pass 339 keeps Client Billing and Subcontract target adapters deferred to Stage 27', () => {
  assert.doesNotMatch(service, /ClientBillingService|SubcontractService/);
  assert.match(contract, /No Schedule mutation, Subcontract mutation or Client Billing mutation is generated in this pass/);
  assert.match(impactGate, /stage27CompletionClaimed: false/);
  assert.match(impactGate, /scheduleAdapterGenerated: false/);
  assert.match(impactGate, /subcontractAdapterGenerated: false/);
  assert.match(impactGate, /clientBillingAdapterGenerated: false/);
});

test('Pass 339 kept Module 17 unexposed at its checkpoint until the reviewed Pass 340 HTTP layer', () => {
  assert.match(impactGate, /routesGenerated: false/);
  assert.match(impactGate, /indexGenerated: false/);
  assert.match(impactGate, /Pass 340 - Module 17 Fastify routes/);
});

test('Pass 339 registers the focused impact gate and fail-honest Stage-21 handoff state', () => {
  assert.equal(rootPackage.scripts['module-17:impact:gate'], 'node scripts/module-17/verify-stage-22-impact.mjs');
  assert.equal(rootPackage.scripts['pass-339:change-orders-impact:gate'], 'node scripts/module-17/verify-stage-22-impact.mjs');
  assert.match(impactGate, /pass: 339/);
  assert.match(impactGate, /STAGE_22_MODULE_17_IMPACT_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(impactGate, /mandatoryModule7BudgetRevisionIntegrated: true/);
  assert.match(impactGate, /changesApplyPermissionIntegrated: true/);
  assert.match(impactGate, /impactAppliedEventEmitted: true/);
});

test('Pass 339 keeps clear purpose comments on every newly named production function', () => {
  assert.match(budgetService, /\/\*\*[\s\S]*?\*\/\s*function prepareChangeBudgetAdjustments\(/);
  assert.match(budgetService, /\/\*\*[\s\S]*?\*\/\s*async applyApprovedChangeOrderInTransaction\(/);
  assert.match(budgetRepository, /\/\*\*[\s\S]*?\*\/\s*async appendBudgetLines\(/);
  assert.match(impactGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
});


test('Pass 340 seven reviewed routes remain present and Pass 377 adds only the approved withdraw repair', async () => {
  await access('apps/api/src/modules/change-orders/change-orders.routes.ts');
  await access('apps/api/src/modules/change-orders/index.ts');
  for (const route of ROUTES) {
    const [method, path] = route.trim().split(/\s+/);
    const fastifyMethod = method.toLowerCase();
    assert.ok(routes.includes(`app.${fastifyMethod}('${path}'`), `Missing HTTP route ${route}`);
  }
  assert.equal([...routes.matchAll(/app\.(?:get|post|put|patch|delete)\('\/api\/v1\/change-orders/g)].length, 8);
  assert.doesNotMatch(routes, /app\.(?:patch|delete)\('\/api\/v1\/change-orders/);
  assert.match(routes, /\/requests\/:id\/withdraw'/);
  assert.doesNotMatch(routes, /\/apply'|\/reopen'/);
});

test('Pass 340 authenticates every route and keeps Project/RBAC authority inside the service', () => {
  assert.equal([...routes.matchAll(/await authenticateRequest\(request, options\.database\)/g)].length, 8);
  assert.match(routes, /const service = new ChangeOrdersService\(options\.database/);
  assert.match(service, /'changes\.read'/);
  assert.match(service, /'changes\.create'/);
  assert.match(service, /'changes\.estimate'/);
  assert.match(service, /'changes\.submit'/);
  assert.match(service, /'changes\.approve'/);
  assert.match(service, /'changes\.apply'/);
});

test('Pass 340 five reviewed writes remain idempotent and Pass 377 adds one idempotent withdraw repair', () => {
  assert.equal([...routes.matchAll(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g)].length, 6);
  assert.equal([...routes.matchAll(/readIdempotencyKey\(request\)/g)].length, 6);
  assert.match(routes, /\/requests',/);
  assert.match(routes, /\/requests\/:id\/lines'/);
  assert.match(routes, /\/requests\/:id\/submit'/);
  assert.match(routes, /\/requests\/:id\/approve'/);
  assert.match(routes, /\/requests\/:id\/reject'/);
  assert.match(routes, /\/requests\/:id\/withdraw'/);
});

test('Pass 340 reuses every strict Pass-336 Zod request and response boundary', () => {
  for (const token of [
    'listChangeOrdersQuerySchema',
    'listChangeOrdersResponseSchema',
    'createChangeRequestBodySchema',
    'createChangeRequestResponseSchema',
    'replaceChangeRequestLinesBodySchema',
    'replaceChangeRequestLinesResponseSchema',
    'submitChangeRequestBodySchema',
    'submitChangeRequestResponseSchema',
    'approveChangeRequestBodySchema',
    'approveChangeRequestResponseSchema',
    'rejectChangeRequestBodySchema',
    'rejectChangeRequestResponseSchema',
    'getChangeOrderImpactQuerySchema',
    'getChangeOrderImpactResponseSchema'
  ]) assert.ok(routes.includes(token), `Missing route schema ${token}`);
  assert.match(routes, /function parseRequest/);
});

test('Pass 340 OpenAPI keeps exact-decimal money and server-owned impact readback', () => {
  assert.match(routes, /MONEY_JSON_SCHEMA/);
  assert.match(routes, /APPROVED_DAYS_JSON_SCHEMA/);
  assert.match(routes, /QUANTITY_DELTA_JSON_SCHEMA/);
  assert.match(routes, /CHANGE_ORDER_IMPACT_SUCCESS_JSON_SCHEMA/);
  assert.doesNotMatch(routes, /companyId\s*:/);
  assert.doesNotMatch(routes, /actorUserId\s*:/);
  assert.doesNotMatch(routes, /targetType\s*:\s*\{[^}]*body/);
});

test('Pass 340 exposes stable Module-17 errors without leaking implementation details', () => {
  for (const code of ERRORS) assert.ok(routes.includes(`'${code}'`), `Missing route error ${code}`);
  assert.match(routes, /INVALID_REQUEST/);
  assert.match(routes, /AUTHENTICATION_REQUIRED/);
  assert.match(routes, /FORBIDDEN/);
  assert.match(routes, /INTERNAL_SERVER_ERROR/);
  assert.doesNotMatch(routes, /stack|sqlState|databaseMessage/);
});

test('Pass 340 wires the server-owned Change Request approval definition from config to service', () => {
  assert.match(serverConfig, /changeRequestApprovalDefinitionCode: string \| null/);
  assert.match(serverConfig, /CHANGE_REQUEST_APPROVAL_DEFINITION_CODE/);
  assert.match(serverConfig, /key: 'CHANGE_REQUEST_APPROVAL_DEFINITION_CODE'/);
  assert.match(apiEnvExample, /CHANGE_REQUEST_APPROVAL_DEFINITION_CODE=CHANGE_REQUEST/);
  assert.match(apiMain, /changeRequestApprovalDefinitionCode: config\.changeRequestApprovalDefinitionCode/);
  assert.match(app, /changeRequestApprovalDefinitionCode\?: string \| null/);
  assert.match(app, /approvalDefinitionCode: options\.changeRequestApprovalDefinitionCode \?\? null/);
  assert.doesNotMatch(routes, /approvalDefinitionCode.*request\.body/);
});

test('Pass 340 registers Module 17 in the API composition only after mandatory Pass-339 impact orchestration', () => {
  assert.match(app, /import \{ registerChangeOrdersRoutes \} from '\.\/modules\/change-orders\/index\.js'/);
  assert.match(app, /app\.register\(registerSchedulingRoutes/);
  assert.match(app, /app\.register\(registerChangeOrdersRoutes/);
  assert.ok(app.indexOf('registerSchedulingRoutes') < app.lastIndexOf('registerChangeOrdersRoutes'));
  assert.match(service, /applyApprovedChangeOrderInTransaction/);
  assert.match(service, /'changes\.apply'/);
});

test('Pass 340 index exports only the already-built Module-17 public layers and route registration', () => {
  assert.match(indexFile, /from '\.\/change-orders\.schema\.js'/);
  assert.match(indexFile, /ChangeOrdersRepository/);
  assert.match(indexFile, /ChangeOrdersService/);
  assert.match(indexFile, /registerChangeOrdersRoutes/);
  assert.doesNotMatch(indexFile, /React|ClientBilling|Subcontract|SchedulingService/);
});

test('Pass 340 OpenAPI metadata remains and Pass 377 adds one focused withdraw operation', () => {
  for (const operationId of [
    'module17ListChangeOrders',
    'module17CreateChangeRequest',
    'module17ReplaceChangeRequestLines',
    'module17SubmitChangeRequest',
    'module17ApproveChangeRequest',
    'module17RejectChangeRequest',
    'module17GetChangeOrderImpact',
    'module17WithdrawChangeRequest'
  ]) assert.ok(routes.includes(`operationId: '${operationId}'`), `Missing operationId ${operationId}`);
  assert.equal([...routes.matchAll(/tags: \['Module 17 - Change Orders \/ Variations'\]/g)].length, 8);
  assert.equal([...routes.matchAll(/security: BEARER_SECURITY/g)].length, 8);
});

test('Pass 340 registers its focused HTTP gate and preserves the Stage-21 fail-honest handoff', () => {
  assert.equal(rootPackage.scripts['module-17:http:gate'], 'node scripts/module-17/verify-stage-22-http.mjs');
  assert.equal(rootPackage.scripts['pass-340:change-orders-http:gate'], 'node scripts/module-17/verify-stage-22-http.mjs');
  assert.match(httpGate, /pass: 340/);
  assert.match(httpGate, /exactReviewedRouteCount: 7/);
  assert.match(httpGate, /STAGE_22_MODULE_17_HTTP_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /Pass 341 - Module 17 PostgreSQL\/Fastify integration/);
});

test('Pass 340 keeps clear purpose comments on every new named route function', () => {
  for (const name of ['errorResponseSchema', 'parseRequest', 'readIdempotencyKey', 'registerChangeOrdersRoutes']) {
    assert.match(routes, new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*(?:export\\s+)?(?:async\\s+)?function ${name}(?:<[^>]+>)?\\(`), `Missing purpose comment for ${name}`);
  }
  assert.match(httpGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
});

test('Pass 341 adds only the reviewed Module-17 integration/security harness at this checkpoint', async () => {
  await access('tests/integration/module-17-api.integration.test.mjs');
  await access('scripts/module-17/verify-stage-22-integration-security.mjs');
  assert.match(integrationSecurityGate, /pass: 341/);
  assert.match(integrationSecurityGate, /productionRuntimeChanges: 0/);
  assert.match(integrationSecurityGate, /databaseChanges: 0/);
  assert.match(integrationSecurityGate, /newMigrations: 0/);
  assert.match(integrationSecurityGate, /publicRoutesAdded: 0/);
  assert.match(integrationSecurityGate, /reactGenerated: false/);
});

test('Pass 341 live suite covers all seven reviewed Change operations through real Fastify and PostgreSQL', () => {
  for (const route of [
    '/api/v1/change-orders',
    '/api/v1/change-orders/requests',
    '/api/v1/change-orders/requests/${changeRequestId}/lines',
    '/api/v1/change-orders/requests/${changeRequestId}/submit',
    '/api/v1/change-orders/requests/${request.id}/approve',
    '/api/v1/change-orders/requests/${request.id}/reject',
    '/api/v1/change-orders/${approved.changeOrder.id}/impact'
  ]) assert.ok(integrationTest.includes(route), `Missing integration route ${route}`);
  assert.match(integrationTest, /Module 17 live workflow creates estimates, approval, formal Change Order and mandatory Budget impacts/);
});

test('Pass 341 verifies Module-22 terminal decisions before Module-17 approval or rejection', () => {
  assert.match(integrationTest, /findApprovalRequest/);
  assert.match(integrationTest, /actOnApproval/);
  assert.match(integrationTest, /CHANGE_APPROVAL_REQUIRED/);
  assert.match(integrationTest, /approvalAction\.status, 'APPROVED'/);
  assert.match(integrationTest, /action\.status, 'REJECTED'/);
});

test('Pass 341 verifies mandatory Module-7 Budget and Forecast impact plus historical rejection', () => {
  assert.match(integrationTest, /projectBudget\.findMany/);
  assert.match(integrationTest, /totalCost\.toString\(\), '1125\.50'/);
  assert.match(integrationTest, /totalRevenue\.toString\(\), '1675\.75'/);
  assert.match(integrationTest, /forecastLine\.findMany/);
  assert.match(integrationTest, /PROJECT_BUDGET_COST/);
  assert.match(integrationTest, /PROJECT_FORECAST_REVENUE/);
  assert.match(integrationTest, /rejection preserves history without creating Change Order or Budget revision/);
});

test('Pass 341 verifies authentication, negative RBAC, Project scope and cross-Company isolation', () => {
  assert.match(integrationTest, /Module 17 live security blocks unauthorized writes and cross-Project or cross-Company records/);
  assert.match(integrationTest, /module17-reader@example\.test/);
  assert.match(integrationTest, /module17-admin-b@example\.test/);
  assert.match(integrationTest, /errorCode\(response\), 'FORBIDDEN'/);
  assert.match(integrationSecurityGate, /negativeAuthorizationVerified/);
  assert.match(integrationSecurityGate, /crossProjectIsolationVerified/);
  assert.match(integrationSecurityGate, /crossCompanyIsolationVerified/);
});

test('Pass 341 verifies strict browser authority, closed-Project protection and idempotent replay', () => {
  assert.match(integrationTest, /companyId: COMPANY_ID/);
  assert.match(integrationTest, /module17-cross-project-wbs/);
  assert.match(integrationTest, /CHANGE_TARGET_CLOSED/);
  assert.match(integrationTest, /change-orders\.request-create/);
  assert.match(integrationTest, /change-orders\.request-approve-core/);
  assert.match(integrationSecurityGate, /idempotencyVerified/);
});

test('Pass 341 forces a late impact failure and requires the full approval transaction to roll back', () => {
  assert.match(integrationTest, /installModule17OutboxFailure/);
  assert.match(integrationTest, /change_order\.impact_applied/);
  assert.match(integrationTest, /stored\.status, 'SUBMITTED'/);
  assert.match(integrationTest, /changeOrder\.count/);
  assert.match(integrationTest, /projectBudget\.count/);
  assert.match(integrationTest, /forecastLine\.count/);
  assert.match(integrationTest, /idempotencyRecord\.count/);
  assert.match(integrationSecurityGate, /transactionRollbackVerified/);
});

test('Pass 341 OpenAPI verification remains preserved while Pass 377 adds the focused withdraw repair', () => {
  assert.match(integrationTest, /Module 17 live OpenAPI exposes reviewed operations plus focused withdraw repair and no generic Change CRUD/);
  assert.match(integrationTest, /module17ListChangeOrders/);
  assert.match(integrationTest, /module17GetChangeOrderImpact/);
  assert.match(integrationTest, /idempotency-key/);
  assert.match(integrationTest, /\/apply/);
  assert.match(integrationTest, /\/withdraw/);
  assert.match(integrationTest, /\/reopen/);
  assert.match(integrationSecurityGate, /reviewedRouteCount: 7/);
  assert.match(integrationSecurityGate, /reviewedWriteCount: 5/);
});

test('Pass 341 keeps deferred approvedDays scheduling impact fail-closed and adds no target adapter', () => {
  assert.match(integrationTest, /approvedDays: '2\.00'/);
  assert.match(integrationTest, /client\.changeOrder\.count/);
  assert.match(integrationSecurityGate, /scheduleAdapterGenerated: false/);
  assert.match(integrationSecurityGate, /subcontractAdapterGenerated: false/);
  assert.match(integrationSecurityGate, /clientBillingAdapterGenerated: false/);
});

test('Pass 341 registers static/live integration-security scripts and preserves fail-honest Stage-21 handoff', () => {
  assert.equal(rootPackage.scripts['module-17:integration-security:gate'], 'node scripts/module-17/verify-stage-22-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-17:integration-security:gate:live'], 'node scripts/module-17/verify-stage-22-integration-security.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-341:change-orders-integration-security:gate'], 'node scripts/module-17/verify-stage-22-integration-security.mjs --mode=static');
  assert.match(rootPackage.scripts['test:integration:module-17'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(integrationSecurityGate, /STAGE_21_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /Pass 342 - Module 17 React typed API client/);
});

test('Pass 341 keeps purpose comments on every new named integration and gate helper', () => {
  for (const name of [
    'loadRuntime',
    'seedScenario',
    'withApi',
    'signIn',
    'errorCode',
    'changeWrite',
    'createChangeRequest',
    'replaceChangeLines',
    'submitChangeRequest',
    'findApprovalRequest',
    'actOnApproval',
    'prepareSubmittedChange',
    'module17OpenApiOperation',
    'installModule17OutboxFailure',
    'removeModule17OutboxFailure'
  ]) {
    assert.match(integrationTest, new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*(?:async\\s+)?function ${name}\\(`), `Missing purpose comment for ${name}`);
  }
  assert.match(integrationSecurityGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
  assert.match(integrationSecurityGate, /\/\*\* Write one blocked live result[\s\S]*?\*\/\s*async function writeBlockedEvidence/);
});

// Pass 342 adds only the reviewed browser data layer before any Change Orders UI is generated.
test('Pass 342 adds only the typed Change Orders browser API and TanStack Query hooks', async () => {
  await access('apps/web/src/features/change-orders/api/change-orders-api.ts');
  await access('apps/web/src/features/change-orders/hooks/change-orders.ts');
  assert.match(reactDataGate, /pass: 342/);
  assert.match(reactDataGate, /newReactFiles: 2/);
  assert.match(reactDataGate, /reactComponentsAdded: 0/);
  assert.match(reactDataGate, /reactPagesAdded: 0/);
  assert.match(reactDataGate, /productionBackendChanges: 0/);
  assert.match(reactDataGate, /databaseChanges: 0/);
});

// The browser client mirrors the exact seven reviewed Stage-22 operations and nothing more.
test('Pass 342 seven browser operations remain and Pass 377 adds only withdrawChangeRequest', () => {
  for (const name of [
    'listChangeOrders',
    'createChangeRequest',
    'replaceChangeRequestLines',
    'submitChangeRequest',
    'approveChangeRequest',
    'rejectChangeRequest',
    'getChangeOrderImpact',
    'withdrawChangeRequest',
  ]) assert.match(reactApi, new RegExp(`export function ${name}\\(`));
  assert.equal((reactApi.match(/authenticatedRequest</g) ?? []).length, 8);
  assert.doesNotMatch(reactApi, /deleteChange|patchChange|applyChange|reopenChange|getChangeRequestDetail/);
});

// The Change register accepts only source-reviewed pagination fields.
test('Pass 342 keeps the Change register browser query to page and pageSize only', () => {
  assert.match(reactApi, /export type ListChangeOrdersInput = Readonly<\{[\s\S]*?page\?: number;[\s\S]*?pageSize\?: number;/);
  const querySection = reactApi.slice(reactApi.indexOf('function changeOrdersPageQuery'), reactApi.indexOf('/** Build the Foundation retry header'));
  assert.match(querySection, /query\.set\('page'/);
  assert.match(querySection, /query\.set\('pageSize'/);
  assert.doesNotMatch(querySection, /projectId|status|changeType|search|sort|date/);
});

// Browser mutation inputs contain business fields only; server authority remains absent.
test('Pass 342 does not expose server-owned Change Order authority in browser input types', () => {
  const inputSection = reactApi.slice(reactApi.indexOf('export type ListChangeOrdersInput'), reactApi.indexOf('/** Build the reviewed Change register query'));
  for (const forbidden of [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'changeNo',
    'status',
    'requestedBy',
    'requestedAt',
    'approvedCost',
    'approvedRevenue',
    'approvedAt',
    'changeOrderId',
    'targetType',
    'targetId',
    'amountDelta',
    'quantityDelta',
    'appliedAt',
  ]) assert.doesNotMatch(inputSection, new RegExp(`\\b${forbidden}\\b`), `Browser input exposes ${forbidden}`);
});

// Exact financial and Schedule-day values remain strings so browser code cannot introduce binary-float precision loss.
test('Pass 342 preserves exact decimal strings in Change Request, Change Order and impact browser types', () => {
  assert.match(reactApi, /costAmount: string;/);
  assert.match(reactApi, /revenueAmount: string;/);
  assert.match(reactApi, /approvedCost: string;/);
  assert.match(reactApi, /approvedRevenue: string;/);
  assert.match(reactApi, /approvedDays: string \| null;/);
  assert.match(reactApi, /amountDelta: string;/);
  assert.match(reactApi, /quantityDelta: string \| null;/);
  assert.doesNotMatch(reactApi, /costAmount: number|revenueAmount: number|approvedCost: number|amountDelta: number/);
});

// All five writes use Foundation idempotency while the two source-bodyless commands stay bodyless.
test('Pass 342 reviewed writes remain idempotent and Pass 377 adds one reason-bearing idempotent withdraw', () => {
  assert.equal((reactApi.match(/headers: changeOrdersCommandHeaders\(idempotencyKey\)/g) ?? []).length, 6);
  const submitSection = reactApi.slice(reactApi.indexOf('export function submitChangeRequest'), reactApi.indexOf('/** Apply one terminal-approved'));
  const rejectSection = reactApi.slice(reactApi.indexOf('export function rejectChangeRequest'), reactApi.indexOf('/** Withdraw one draft or submitted'));
  const withdrawSection = reactApi.slice(reactApi.indexOf('export function withdrawChangeRequest'), reactApi.indexOf('/** Load one approved Change Order'));
  assert.doesNotMatch(submitSection, /body:/);
  assert.doesNotMatch(rejectSection, /body:/);
  assert.match(withdrawSection, /body: JSON\.stringify\(input\)/);
});

// Approval carries only the two reviewed browser business inputs.
test('Pass 342 approval input contains only effectiveDate and optional approvedDays', () => {
  const section = reactApi.slice(reactApi.indexOf('export type ApproveChangeRequestInput'), reactApi.indexOf('/** Build the reviewed Change register query'));
  assert.match(section, /effectiveDate: string;/);
  assert.match(section, /approvedDays\?: string \| null;/);
  assert.doesNotMatch(section, /approvedCost|approvedRevenue|approvedAt|targetType|targetId|status/);
});

// Complete PUT line replacement is preserved rather than expanding into invented item-level CRUD.
test('Pass 342 keeps Change Request estimate editing as one complete line-replacement command', () => {
  assert.match(reactApi, /export type ReplaceChangeRequestLinesInput = Readonly<\{\s*lines: ChangeRequestLineInput\[\];/);
  assert.match(reactApi, /method: 'PUT'/);
  assert.match(reactApi, /change-orders\/requests\/\$\{changeRequestId\}\/lines/);
  assert.doesNotMatch(reactApi, /createChangeRequestLine|updateChangeRequestLine|deleteChangeRequestLine/);
});

// One simple query/mutation hook exists for every reviewed browser operation.
test('Pass 342 exposes one TanStack Query hook per reviewed Change Orders operation', () => {
  for (const name of [
    'useChangeOrders',
    'useCreateChangeRequest',
    'useReplaceChangeRequestLines',
    'useSubmitChangeRequest',
    'useApproveChangeRequest',
    'useRejectChangeRequest',
    'useChangeOrderImpact',
  ]) assert.match(reactHooks, new RegExp(`export function ${name}\\(`));
  assert.match(reactHooks, /const MODULE_17_QUERY_KEY = \['module-17', 'change-orders'\] as const/);
});

// Mutation invalidation stays inside Module 17 and approval refreshes only its resulting impact read.
test('Pass 342 keeps Change Orders cache invalidation narrow and predictable', () => {
  assert.match(reactHooks, /function invalidateChangeRegister/);
  assert.match(reactHooks, /'register'/);
  assert.match(reactHooks, /useApproveChangeRequest[\s\S]*?data\.changeOrder[\s\S]*?'impact', data\.changeOrder\.id/);
  assert.doesNotMatch(reactHooks, /module-7|budgets-job-cost|module-21|scheduling|subcontracts|client-billing/);
});

// Named browser functions keep short purpose comments for junior-readable maintenance.
test('Pass 342 keeps a purpose comment on every named Change Orders browser function', () => {
  for (const [source, name] of [
    [reactApi, 'changeOrdersPageQuery'],
    [reactApi, 'changeOrdersCommandHeaders'],
    [reactApi, 'listChangeOrders'],
    [reactApi, 'createChangeRequest'],
    [reactApi, 'replaceChangeRequestLines'],
    [reactApi, 'submitChangeRequest'],
    [reactApi, 'approveChangeRequest'],
    [reactApi, 'rejectChangeRequest'],
    [reactApi, 'getChangeOrderImpact'],
    [reactHooks, 'newIdempotencyKey'],
    [reactHooks, 'invalidateChangeRegister'],
    [reactHooks, 'useChangeOrders'],
    [reactHooks, 'useChangeOrderImpact'],
    [reactHooks, 'useCreateChangeRequest'],
    [reactHooks, 'useReplaceChangeRequestLines'],
    [reactHooks, 'useSubmitChangeRequest'],
    [reactHooks, 'useApproveChangeRequest'],
    [reactHooks, 'useRejectChangeRequest'],
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 260), position), /\/\*\*[\s\S]*?\*\//);
  }
});

// The data layer remains a preparation pass and points directly to the accessible workspace pass.
test('Pass 342 registers its gate and preserves fail-honest Stage-21 handoff status', () => {
  assert.equal(rootPackage.scripts['module-17:react-data:gate'], 'node scripts/module-17/verify-stage-22-react-data.mjs');
  assert.equal(rootPackage.scripts['pass-342:change-orders-react-data:gate'], 'node scripts/module-17/verify-stage-22-react-data.mjs');
  assert.match(reactDataGate, /STAGE_21_ACCEPTED_READY_FOR_STAGE_22/);
  assert.match(reactDataGate, /STAGE_22_MODULE_17_REACT_DATA_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(reactDataGate, /Pass 343 - Module 17 accessible permission-aware React Change Orders workspace/);
});


// Pass 343 adds the source-bounded React workspace after the typed browser data layer.
test('Pass 343 adds one Change Orders component and one page without backend or migration expansion', async () => {
  await access('apps/web/src/features/change-orders/components/change-orders-workspace.tsx');
  await access('apps/web/src/features/change-orders/pages/change-orders-page.tsx');
  assert.match(reactWorkspaceGate, /pass: 343/);
  assert.match(reactWorkspaceGate, /newReactFiles: 2/);
  assert.match(reactWorkspaceGate, /reactComponentsAdded: 1/);
  assert.match(reactWorkspaceGate, /reactPagesAdded: 1/);
  assert.match(reactWorkspaceGate, /productionBackendChanges: 0/);
  assert.match(reactWorkspaceGate, /databaseChanges: 0/);
  assert.match(reactWorkspaceGate, /publicRoutesAdded: 0/);
});

// Navigation visibility follows the six reviewed Module-17 permissions plus existing restricted Project scope.
test('Pass 343 registers permission-aware Change Orders navigation in the existing admin shell', () => {
  assert.match(adminShell, /import \{ ChangeOrdersPage \} from '..\/..\/change-orders\/pages\/change-orders-page\.js'/);
  for (const permission of PERMISSIONS) assert.ok(adminShell.includes(`'${permission}'`), `Admin shell missing ${permission}`);
  assert.match(adminShell, /const canUseModule17 = hasModule17CompanyPermission/);
  assert.match(adminShell, /projectScope\.kind === 'restricted'/);
  assert.match(adminShell, /setView\('change-orders'\)/);
  assert.match(adminShell, />Change Orders \/ Variations<\/button>/);
  assert.match(adminShell, /activeView === 'change-orders'/);
});

// The page keeps sensitive controls tied to existing permission hooks and Project-scope visibility.
test('Pass 343 page derives all six Change permissions and keeps Project writes API-authoritative', () => {
  for (const permission of PERMISSIONS) assert.ok(reactPage.includes(`usePermission('${permission}')`), `Page missing ${permission}`);
  assert.match(reactPage, /useProjectWorkspaceVisibility/);
  assert.match(reactPage, /hasRestrictedProjectScope/);
  assert.match(reactPage, /Project-scoped writes remain API-authoritative/);
});

// The register mirrors the reviewed page/pageSize query only and does not add browser-only filters.
test('Pass 343 renders the bounded Change register without invented filter controls', () => {
  assert.match(reactWorkspace, /useChangeOrders\(\{ page: registerPage, pageSize: 25 \}/);
  assert.match(reactWorkspace, /Change register/);
  assert.match(reactWorkspace, /does not invent status, Project, date or search filters/);
  assert.doesNotMatch(reactWorkspace, /registerStatus|registerSearch|registerProjectId|registerDate/);
});

// Creation reuses Project Management discovery and sends only the Pass-342 business input shape.
test('Pass 343 does not hide permitted create work just because the Change register is unreadable', () => {
  assert.doesNotMatch(reactWorkspace, /if \(!props\.canRead\) \{[\s\S]*?return \(/);
  assert.match(reactWorkspace, /!props\.canRead && <p className="muted">The current identity has no visible/);
  assert.match(reactWorkspace, /props\.canCreate && props\.canDiscoverProjects/);
});

test('Pass 343 Change Request creation reuses Module 5 Projects and preserves server-owned authority', () => {
  assert.match(reactWorkspace, /useProjects\(\{ page: projectPage, pageSize: 25 \}/);
  assert.match(reactWorkspace, /changeType: values\.changeType\.trim\(\)/);
  assert.match(reactWorkspace, /title: values\.title\.trim\(\)/);
  assert.match(reactWorkspace, /description: values\.description\.trim\(\)/);
  assert.match(reactWorkspace, /reason: values\.reason\.trim\(\)/);
  const createBlock = reactWorkspace.match(/async function handleCreate[\s\S]*?\n  \}/)?.[0] ?? '';
  for (const forbidden of ['companyId', 'actorUserId', 'changeNo', 'status', 'requestedAt']) {
    assert.doesNotMatch(createBlock, new RegExp(forbidden));
  }
});

// Draft estimates use the one reviewed complete PUT replacement and keep exact financial strings.
test('Pass 343 implements a DRAFT-only exact-decimal cost/revenue impact worksheet', () => {
  assert.match(reactWorkspace, /selectedRequest\.status === 'DRAFT'/);
  assert.match(reactWorkspace, /useReplaceChangeRequestLines/);
  assert.match(reactWorkspace, /costAmount: line\.costAmount\.trim\(\)/);
  assert.match(reactWorkspace, /revenueAmount: line\.revenueAmount\.trim\(\)/);
  assert.match(reactWorkspace, /WBS, Cost Code and Cost Type must be entered together/);
  assert.match(reactWorkspace, /BOQ Item UUID \(optional\)/);
  assert.doesNotMatch(reactWorkspace, /parseFloat|Number\(line\.costAmount|Number\(line\.revenueAmount/);
});

// Lifecycle controls call only the reviewed submit/approve/reject commands and expose no new business endpoint.
test('Pass 343 keeps submit, approve and reject on the reviewed command surface', () => {
  assert.match(reactWorkspace, /useSubmitChangeRequest/);
  assert.match(reactWorkspace, /useApproveChangeRequest/);
  assert.match(reactWorkspace, /useRejectChangeRequest/);
  assert.match(reactWorkspace, /input: \{ effectiveDate: values\.effectiveDate \}/);
  assert.match(reactWorkspace, /Reject is bodyless/);
  assert.doesNotMatch(reactWorkspace, /withdrawChange|reopenChange|applyChangeOrder|deleteChange|patchChange/);
});

// Approval/apply visibility mirrors the backend rule that formal approval also performs mandatory Module-7 impact.
test('Pass 343 requires both changes.approve and changes.apply visibility for approve-and-apply UI', () => {
  assert.match(reactWorkspace, /disabled=\{!props\.canApprove \|\| !props\.canApply \|\| approveMutation\.isPending\}/);
  assert.match(reactWorkspace, /changes\.approve/);
  assert.match(reactWorkspace, /changes\.apply/);
  assert.match(reactWorkspace, /Approve & apply impact/);
});

// The compact timeline is derived from Module-17 state and links out instead of inventing approval history.
test('Pass 343 shows approval state without inventing a Module-22 timeline endpoint', () => {
  assert.match(reactWorkspace, /Approval state/);
  assert.match(reactWorkspace, /Detailed approver actions remain owned by Module 22/);
  assert.match(reactWorkspace, /Draft created/);
  assert.match(reactWorkspace, /Submitted to Approval Workflows/);
  assert.match(reactWorkspace, /Terminal decision/);
  assert.match(reactWorkspace, /Open Approval Workflows/);
  assert.match(reactWorkspaceGate, /approvalTimelineInvented: false/);
});

// Supporting documents correctly hand off to Module 18 because Module 17 has no attachment mutation contract yet.
test('Pass 343 keeps supporting documents in Module 18 without fake Change attachment state', () => {
  assert.match(reactWorkspace, /Supporting documents/);
  assert.match(reactWorkspace, /Module 18 owns uploads, versions and signed access/);
  assert.match(reactWorkspace, /Open Document Management/);
  assert.match(reactWorkspaceGate, /attachmentMutationInvented: false/);
  assert.doesNotMatch(reactWorkspace, /uploadChangeDocument|attachChangeDocument|documentIds:/);
});

// Applied impacts are read from the reviewed formal impact endpoint and are never calculated in the browser.
test('Pass 343 renders the formal Change Order snapshot and server-created applied-impact summary', () => {
  assert.match(reactWorkspace, /useChangeOrderImpact/);
  assert.match(reactWorkspace, /Applied-impact summary/);
  assert.match(reactWorkspace, /selectedRequest\.changeOrder\.approvedCost/);
  assert.match(reactWorkspace, /selectedRequest\.changeOrder\.approvedRevenue/);
  assert.match(reactWorkspace, /impact\.targetType/);
  assert.match(reactWorkspace, /impact\.amountDelta/);
  assert.doesNotMatch(reactWorkspace, /calculateImpact|applyBudget|updateForecast/);
});

// Schedule-day input remains absent because Pass 339 deliberately fails closed until Stage 27.
test('Pass 343 does not expose approvedDays or deferred target adapters', () => {
  assert.doesNotMatch(reactWorkspace, /register\('approvedDays'\)|name="approvedDays"/);
  assert.match(reactPage, /Schedule-day impact remains disabled until the reviewed Stage-27 Schedule adapter exists/);
  assert.match(reactWorkspaceGate, /scheduleAdapterGenerated: false/);
  assert.match(reactWorkspaceGate, /subcontractAdapterGenerated: false/);
  assert.match(reactWorkspaceGate, /clientBillingAdapterGenerated: false/);
});

// The new UI uses small responsive layout rules rather than introducing a separate design system.
test('Pass 343 adds only focused Module-17 responsive styles', () => {
  assert.match(webStyles, /\/\* Module 17 - Change Orders \/ Variations \*\//);
  assert.match(webStyles, /\.module17-form-grid/);
  assert.match(webStyles, /\.module17-timeline/);
  assert.match(webStyles, /\.module17-contract-note/);
  assert.match(webStyles, /@media \(max-width: 720px\)/);
});

// Every newly named UI helper/handler keeps a clear purpose comment for junior-readable maintenance.
test('Pass 343 keeps purpose comments on every newly named Change Orders UI function', () => {
  for (const [source, name] of [
    [reactWorkspace, 'errorMessage'],
    [reactWorkspace, 'emptyEstimateLine'],
    [reactWorkspace, 'estimateValues'],
    [reactWorkspace, 'todayInputValue'],
    [reactWorkspace, 'FieldError'],
    [reactWorkspace, 'ChangeOrdersWorkspace'],
    [reactWorkspace, 'handleCreate'],
    [reactWorkspace, 'handleReplaceLines'],
    [reactWorkspace, 'handleSubmitRequest'],
    [reactWorkspace, 'handleApprove'],
    [reactWorkspace, 'handleReject'],
    [reactWorkspace, 'handleSelectRequest'],
    [reactWorkspace, 'handleRegisterPage'],
    [reactWorkspace, 'handleProjectPage'],
    [reactPage, 'ChangeOrdersPage'],
    [adminShell, 'showChangeOrders']
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 300), position), /\/\*\*[\s\S]*?\*\//);
  }
  assert.match(reactWorkspaceGate, /\/\*\* Read one optional JSON evidence file[\s\S]*?\*\/\s*async function readJson/);
});

// Pass 343 remains preparation-only and hands directly to browser E2E verification.
test('Pass 343 registers its React workspace gate and Pass-344 handoff', () => {
  assert.equal(rootPackage.scripts['module-17:react-workspace:gate'], 'node scripts/module-17/verify-stage-22-react-workspace.mjs');
  assert.equal(rootPackage.scripts['pass-343:change-orders-react-workspace:gate'], 'node scripts/module-17/verify-stage-22-react-workspace.mjs');
  assert.match(reactWorkspaceGate, /STAGE_22_MODULE_17_REACT_WORKSPACE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(reactWorkspaceGate, /Pass 344 - Module 17 Playwright main workflow and permission-negative browser verification/);
});


// Pass 344 adds only browser verification and shared Playwright selection; Module-17 runtime behavior stays unchanged.
test('Pass 344 adds only the reviewed Module 17 Playwright verification boundary', () => {
  assert.match(playwrightGate, /pass: 344/);
  assert.match(playwrightGate, /stage: 22/);
  assert.match(playwrightGate, /databaseChanges: 0/);
  assert.match(playwrightGate, /newMigrations: 0/);
  assert.match(playwrightGate, /publicRoutesAdded: 0/);
  assert.match(playwrightGate, /newPermissions: 0/);
  assert.match(playwrightGate, /newBrowserFiles: 1/);
  assert.match(playwrightGate, /reviewedRouteCount: 7/);
  assert.match(playwrightGate, /reviewedWriteCount: 5/);
});

// The browser test starts from the real auth shell and opens the actual Change Orders workspace.
test('Pass 344 browser workflow uses real auth and permission-aware Change Orders navigation', () => {
  assert.match(browserTest, /async function signIn\(page, email\)/);
  assert.match(browserTest, /button', \{ name: 'Change Orders \/ Variations' \}/);
  assert.match(browserTest, /PASS344-PROJECT/);
  assert.match(browserTest, /CR-0001/);
  assert.match(browserTest, /Foundation scope variation/);
});

// The main workflow proves exact estimate strings, Module-22 approval, immutable formal approval and Module-7 impact.
test('Pass 344 covers estimate, Approval Workflows and mandatory Budget Forecast application', () => {
  assert.match(browserTest, /costAmount: '125\.50'/);
  assert.match(browserTest, /revenueAmount: '175\.75'/);
  assert.match(browserTest, /Approved in Pass 344 browser test/);
  assert.match(browserTest, /Approve & apply impact/);
  assert.match(browserTest, /totalCost\.toString\(\)\)\.toBe\('1125\.50'\)/);
  assert.match(browserTest, /totalRevenue\?\.toString\(\)\)\.toBe\('1675\.75'\)/);
  for (const target of ['PROJECT_BUDGET_COST', 'PROJECT_BUDGET_REVENUE', 'PROJECT_FORECAST_COST', 'PROJECT_FORECAST_REVENUE']) {
    assert.ok(browserTest.includes(`'${target}'`), `Browser workflow missing ${target}`);
  }
});

// A second request exercises the source-defined rejection command without creating another financial revision.
test('Pass 344 verifies the rejected Change stays historical and does not create a formal Change Order', () => {
  assert.match(browserTest, /CR-0002/);
  assert.match(browserTest, /Rejected temporary works variation/);
  assert.match(browserTest, /Rejected in Pass 344 browser test/);
  assert.match(browserTest, /button', \{ name: 'Record rejection' \}/);
  assert.match(browserTest, /expect\(rejectedChange\.changeOrder\)\.toBeNull\(\)/);
  assert.match(browserTest, /projectBudget\.count[\s\S]*?toBe\(2\)/);
});

// Browser request capture proves all reviewed routes, retry keys and server-owned authority boundaries.
test('Pass 344 captures all seven reviewed Module 17 operations and all five idempotent writes', () => {
  for (const route of [
    'GET /api/v1/change-orders',
    'POST /api/v1/change-orders/requests',
    'PUT /api/v1/change-orders/requests/:id/lines',
    'POST /api/v1/change-orders/requests/:id/submit',
    'POST /api/v1/change-orders/requests/:id/approve',
    'POST /api/v1/change-orders/requests/:id/reject',
    'GET /api/v1/change-orders/:id/impact'
  ]) assert.ok(browserTest.includes(`'${route}'`), `Browser operation missing ${route}`);
  assert.match(browserTest, /for \(const request of writes\) expect\(request\.idempotencyKey\)\.toBeTruthy\(\)/);
  assert.match(browserTest, /expect\(submitWrites\)\.toHaveLength\(2\)/);
  assert.match(browserTest, /expect\(rejectWrite\?\.body\)\.toBeNull\(\)/);
  assert.match(browserTest, /expect\(Object\.keys\(approveWrite\?\.body \?\? \{\}\)\)\.toEqual\(\['effectiveDate'\]\)/);
});

// The captured payloads must never take over Company, actor, numbering, lifecycle or impact authority.
test('Pass 344 keeps server-owned Change authority out of browser request bodies', () => {
  for (const field of [
    'companyId', 'actorUserId', 'allowedProjectIds', 'changeNo', 'requestedBy', 'approvedCost',
    'approvedRevenue', 'targetType', 'targetId', 'amountDelta', 'appliedAt'
  ]) assert.ok(browserTest.includes(`'${field}'`), `Browser authority assertion missing ${field}`);
  assert.match(browserTest, /Object\.keys\(request\.body \?\? \{\}\)\.sort\(\)\)\.toEqual\(\['changeType', 'description', 'projectId', 'reason', 'title'\]\)/);
  assert.match(browserTest, /expect\(request\.query\)\.toEqual\(\{ page: '1', pageSize: '25' \}\)/);
  assert.match(browserTest, /expect\(request\.query\)\.toEqual\(\{\}\)/);
});

// Read-only browser and direct API checks prove UI hiding is not the security boundary.
test('Pass 344 verifies changes.read-only UI and direct HTTP 403 write protection', () => {
  assert.match(browserTest, /changes\.create is required for this command/);
  assert.ok(browserTest.includes("getByRole('button', { name: 'Add line' })).toHaveCount(0)"));
  assert.ok(browserTest.includes("getByRole('button', { name: 'Save complete estimate' })).toHaveCount(0)"));
  assert.match(browserTest, /pass344-reader-denied-create/);
  assert.match(browserTest, /pass344-reader-denied-lines/);
  assert.match(browserTest, /pass344-reader-denied-approve/);
  assert.equal((browserTest.match(/expect\(denied[A-Za-z]+\.status\(\)\)\.toBe\(403\)/g) ?? []).length, 3);
});

// The shared Playwright selector enables Module 17 without changing the existing single-module rule.
test('Pass 344 wires Module 17 into the shared Playwright selector and approval configuration', () => {
  assert.match(playwrightConfig, /const runModule17 = process\.env\.RUN_MODULE_17_E2E === '1'/);
  assert.match(playwrightConfig, /runModule21, runModule17/);
  assert.match(playwrightConfig, /runModule17[\s\S]*?module-17-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /CHANGE_REQUEST_APPROVAL_DEFINITION_CODE: 'CHANGE_REQUEST'/);
  assert.match(playwrightConfig, /enabledModuleCount !== 1/);
});

// Every new named browser/gate helper keeps the required junior-readable purpose comment.
test('Pass 344 keeps purpose comments on every new named browser and gate function', () => {
  for (const [source, name] of [
    [browserTest, 'seedScenario'],
    [browserTest, 'signIn'],
    [browserTest, 'openChangeOrders'],
    [browserTest, 'createChangeInUi'],
    [browserTest, 'saveEstimateInUi'],
    [browserTest, 'actOnApprovalInUi'],
    [browserTest, 'isStage22Request'],
    [browserTest, 'requestBody'],
    [browserTest, 'trackStage22Requests'],
    [browserTest, 'normalizeStage22Operation'],
    [browserTest, 'assertStage22AuthorityBoundary'],
    [playwrightGate, 'readJson'],
    [playwrightGate, 'writeBlockedEvidence']
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 320), position), /\/\*\*[\s\S]*?\*\//);
  }
});

// Static preparation stays fail-honest until genuine Stage-21 live acceptance exists.
test('Pass 344 registers static/live gates and hands off to final Stage-22 acceptance', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-17'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-17:playwright:gate'], 'node scripts/module-17/verify-stage-22-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-17:playwright:gate:live'], 'node scripts/module-17/verify-stage-22-playwright.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-344:change-orders-playwright:gate'], 'node scripts/module-17/verify-stage-22-playwright.mjs --mode=static');
  assert.match(playwrightGate, /STAGE_22_MODULE_17_PLAYWRIGHT_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /STAGE_21_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /Pass 345 - Module 17 operational verification and final Stage-22 acceptance\/regression gate/);
});


// Pass 345 adds only operational/final verification and does not expand the reviewed production boundary.
test('Pass 345 keeps Module 17 production, routes, permissions and migration count unchanged', () => {
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /publicApiChanges: 0/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /reviewedRouteCount: 7/);
  assert.match(finalGate, /reviewedWriteRouteCount: 5/);
  assert.match(finalGate, /newPermissions: 0/);
});

// The focused operational suite covers concurrency, database authority, rollback and indexes.
test('Pass 345 adds focused Module 17 PostgreSQL operational coverage', () => {
  for (const title of [
    'Module 17 operational concurrent same-key Change Request create stays singular',
    'Module 17 operational concurrent approval keys create one formal Change Order and one Budget revision',
    'Module 17 operational concurrent different Change approvals serialize Project Budget revisions',
    'Module 17 operational PostgreSQL rejects cross-Project line scope and approved-history mutation',
    'Module 17 operational forced impact outbox failure rolls back the whole approval transaction',
    'Module 17 operational Stage-22 Change Order indexes are deployed'
  ]) assert.ok(integrationTest.includes(title), `Missing operational test: ${title}`);
  assert.match(operationsGate, /test:operations:module-17/);
  assert.match(operationsGate, /clean-and-previous-migrations/);
});

// Approval concurrency must preserve one immutable formal snapshot and safe Budget versions.
test('Pass 345 verifies concurrent approval serialization and idempotent business state', () => {
  assert.match(integrationTest, /module17-ops-approve-a/);
  assert.match(integrationTest, /module17-ops-approve-b/);
  assert.ok(integrationTest.includes("assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 1);"));
  assert.ok(integrationTest.includes("assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 2);"));
  assert.match(integrationTest, /budgets\.map\(\(budget\) => budget\.versionNo\), \[1, 2, 3\]/);
  assert.match(integrationTest, /'1251\.00'/);
  assert.match(integrationTest, /'1851\.50'/);
});

// Database triggers remain authoritative even if a caller bypasses the HTTP/service layer.
test('Pass 345 verifies direct PostgreSQL scope and immutable-history guards', () => {
  assert.match(integrationTest, /Cross-Project direct line must fail/);
  assert.match(integrationTest, /WBS node must belong to the Change Request Company and Project/);
  assert.match(integrationTest, /Approved Change Order snapshots are immutable/);
  assert.match(integrationTest, /Applied Change Order impacts are immutable/);
  assert.match(integrationTest, /Change Order impact history cannot be deleted/);
});

// The final gate preserves all reviewed source contracts and the corrected Stage-23 handoff.
test('Pass 345 final acceptance freezes the reviewed Stage 22 contract and hands off to Module 16', () => {
  for (const table of TABLES) assert.ok(finalGate.includes(`'${table}'`), `Final gate missing table ${table}`);
  for (const permission of PERMISSIONS) assert.ok(finalGate.includes(`'${permission}'`), `Final gate missing permission ${permission}`);
  for (const error of ERRORS) assert.ok(finalGate.includes(`'${error}'`), `Final gate missing error ${error}`);
  for (const event of EVENTS) assert.ok(finalGate.includes(`'${event}'`), `Final gate missing event ${event}`);
  assert.match(finalGate, /STAGE_22_ACCEPTED_READY_FOR_STAGE_23/);
  assert.match(finalGate, /23 - Module 16 Client Billing/);
  assert.match(finalGate, /Pass 346 - Stage 23 \/ Module 16 Client Billing contract freeze/);
});

// Deferred integrations must remain fail-closed instead of being silently claimed complete.
test('Pass 345 preserves Stage-27 target-adapter boundaries', () => {
  assert.match(finalGate, /scheduleImpactFailClosedUntilReviewedAdapter: true/);
  assert.match(finalGate, /scheduleAdapterGenerated: false/);
  assert.match(finalGate, /clientBillingAdapterGenerated: false/);
  assert.match(finalGate, /subcontractAdapterGenerated: false/);
  assert.match(finalGate, /stage27TargetAdapterProofStillRequired: true/);
});

// Static evidence is allowed while runtime acceptance remains blocked behind the genuine Stage-21 handoff.
test('Pass 345 remains fail-honest about live Stage 22 acceptance', () => {
  assert.match(operationsGate, /STAGE_22_MODULE_17_OPERATIONS_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /STAGE_21_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_22_STATIC_GATE_PASSED_STAGE_21_LIVE_HANDOFF_PENDING/);
  assert.match(finalGate, /DO_NOT_DEPLOY_STAGE_22_UNTIL_STAGE_21_LIVE_HANDOFF/);
  assert.match(finalGate, /runtimeVerificationComplete: passed/);
  assert.match(finalGate, /runtimeDeploymentAllowed: passed/);
});

// All new named verifier functions keep clear purpose comments for junior-readable maintenance.
test('Pass 345 keeps purpose comments on every newly named gate function', () => {
  for (const [source, name] of [
    [operationsGate, 'readJson'],
    [operationsGate, 'writeBlockedEvidence'],
    [finalGate, 'readEvidence'],
    [finalGate, 'localResult'],
    [finalGate, 'validateLivePrerequisites']
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 320), position), /\/\*\*[\s\S]*?\*\//);
  }
});

// Package scripts expose separate operational and final static/live gates without adding runtime commands.
test('Pass 345 registers operational and final Stage 22 verification scripts', () => {
  assert.equal(rootPackage.scripts['module-17:operations:gate'], 'node scripts/module-17/verify-stage-22-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-17:operations:gate:live'], 'node scripts/module-17/verify-stage-22-operations.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-17:gate'], 'node scripts/module-17/verify-stage-22.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-17:gate:live'], 'node scripts/module-17/verify-stage-22.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-17:acceptance:live'], 'node scripts/module-17/verify-stage-22.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-345:change-orders-acceptance:gate'], 'node scripts/module-17/verify-stage-22.mjs --mode=static');
});
