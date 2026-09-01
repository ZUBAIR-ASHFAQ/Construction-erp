import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/boq/STAGE-6-MODULE-4A-CONTRACT.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260823000300_module_4a_boq_commercial_core/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const schema = await readFile('apps/api/src/modules/boq/boq.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/boq/boq.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/boq/boq.service.ts', 'utf8');
const httpRoutes = await readFile('apps/api/src/modules/boq/boq.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/boq/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const integrationTest = await readFile('tests/integration/module-4a-api.integration.test.mjs', 'utf8');
const integrationGate = await readFile('scripts/module-4a/verify-stage-6-integration.mjs', 'utf8');
const securityGate = await readFile('scripts/module-4a/verify-stage-6-security.mjs', 'utf8');
const apiContractGate = await readFile('scripts/module-4a/verify-stage-6-api-contract.mjs', 'utf8');
const webBoqApi = await readFile('apps/web/src/features/boq/api/boq-api.ts', 'utf8');
const webBoqHooks = await readFile('apps/web/src/features/boq/hooks/boq.ts', 'utf8');
const webBoqRevisionPanel = await readFile('apps/web/src/features/boq/components/boq-revision-panel.tsx', 'utf8');
const webBoqsPage = await readFile('apps/web/src/features/boq/pages/boqs-page.tsx', 'utf8');
const webAdminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const reactRegisterGate = await readFile('scripts/module-4a/verify-stage-6-react-register.mjs', 'utf8');
const reactWorkflowGate = await readFile('scripts/module-4a/verify-stage-6-react-workflow.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-4a/verify-stage-6-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-4a/verify-stage-6-operations.mjs', 'utf8');
const finalStageGate = await readFile('scripts/module-4a/verify-stage-6.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-4a-browser.spec.mjs', 'utf8');

const routes = [
  'GET  /api/v1/boqs',
  'POST /api/v1/boqs',
  'POST /api/v1/boqs/:id/revisions',
  'PUT  /api/v1/boqs/:id/revisions/:revId/items',
  'POST /api/v1/boqs/:id/revisions/:revId/freeze',
  'GET  /api/v1/boqs/:id/revisions/:revId/export'
];
const permissions = ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'];
const errors = ['BOQ_NOT_FOUND', 'BOQ_REVISION_LOCKED', 'INVALID_BOQ_ITEM', 'BOQ_SCOPE_CONFLICT'];
const events = ['boq.created', 'boq.revision_created', 'boq.revision_frozen'];

// Keep Module 4 as one business module while 4A and 4B remain implementation gates.
test('Module 4A contract preserves the corrected two-gate BOQ boundary', () => {
  assert.match(contract, /Module 4 remains one approved ERP business module/);
  assert.match(contract, /Project\/WBS\/cost-code mapping belongs to Module 4B/);
  assert.match(contract, /Module 5\s+Project Management/);
  assert.match(contract, /Module 24B Project Scope Activation/);
  assert.match(contract, /Module 6\s+WBS & Cost Codes/);
  assert.match(contract, /Module 4B BOQ Project Mapping/);
});

// Keep Stage 6 limited to tender-linked BOQ persistence and defer every project mapping field.
test('Module 4A contract owns only commercial BOQ tables and defers project mapping', () => {
  for (const table of ['boqs', 'boq_revisions', 'boq_items']) assert.match(contract, new RegExp(`\\b${table}\\b`));
  assert.match(contract, /`tender_id` is required for a Stage-6 BOQ/);
  assert.match(contract, /Stage 6 does not add WBS or cost-code columns/);
  assert.match(contract, /project_id[\s\S]*wbs_node_id[\s\S]*cost_code_id/);
});

// Keep the public Stage-6 API at exactly the six reviewed BOQ workflow operations.
test('Module 4A contract freezes the exact six BOQ routes without inventing import or generic CRUD', () => {
  for (const route of routes) assert.ok(contract.includes(route), route);
  assert.match(contract, /does not define a public import API/);
  assert.match(contract, /must not invent one/);
  assert.match(contract, /DELETE \/api\/v1\/boqs\/:id/);
  assert.match(contract, /POST\s+\/api\/v1\/boqs\/:id\/import/);
});

// Keep authorization, stable business errors and domain events aligned with Appendix A.
test('Module 4A contract freezes the reviewed permissions, errors and events', () => {
  for (const permission of permissions) assert.ok(contract.includes(permission), permission);
  for (const errorCode of errors) assert.ok(contract.includes(errorCode), errorCode);
  for (const eventName of events) assert.ok(contract.includes(eventName), eventName);
});

// Keep money/quantity authoritative on the server and immutable after revision freeze.
test('Module 4A contract keeps decimal totals and frozen history server-controlled', () => {
  assert.match(contract, /quantity`, `rate` and `amount` use PostgreSQL\/Prisma decimal-safe types/);
  assert.match(contract, /`amount` is server-calculated/);
  assert.match(contract, /Frozen revisions are immutable/);
  assert.match(contract, /item replacement is transactional and all-or-nothing/);
});

// Keep Pass 123 contract-only until genuine Stage-5 live acceptance exists.
test('Module 4A contract gate does not authorize runtime implementation from static evidence alone', () => {
  assert.match(contract, /STAGE_5_ACCEPTED_READY_FOR_STAGE_6/);
  assert.match(contract, /does not authorize the Stage-6 migration or runtime implementation/);
  assert.equal(rootPackage.scripts['module-4a:contract:gate'], 'node scripts/module-4a/verify-stage-6-contract.mjs');
});


// Keep the original Stage-6 commercial core intact even after later Module 4B persistence extends it.
test('Module 4A commercial-core persistence remains intact after later gates', () => {
  for (const model of ['Boq', 'BoqRevision', 'BoqItem']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`), model);
  }
  assert.match(migration, /"tender_id" UUID NOT NULL/);
  assert.doesNotMatch(migration, /"project_id"|"wbs_node_id"|"cost_code_id"/);
  assert.match(prisma, /@@unique\(\[companyId, code\], map: "boqs_company_code_uq"\)/);
});

// Keep revision numbering and current-revision ownership enforceable at the database boundary.
test('Module 4A migration enforces revision uniqueness and current revision ownership', () => {
  assert.match(migration, /CREATE UNIQUE INDEX "boq_revisions_boq_revision_uq"[\s\S]*"boq_revisions"\("boq_id", "revision_no"\)/);
  assert.match(migration, /CONSTRAINT "boq_revisions_revision_positive" CHECK \("revision_no" > 0\)/);
  assert.match(migration, /CONSTRAINT "boq_revisions_status_allowed" CHECK \("status" IN \('DRAFT', 'FROZEN'\)\)/);
  assert.match(migration, /CONSTRAINT "boqs_current_revision_belongs_to_boq_fkey"[\s\S]*FOREIGN KEY \("current_revision_id", "id"\)[\s\S]*REFERENCES "boq_revisions"\("id", "boq_id"\)/);
});

// Keep BOQ tenant ownership tied to the already-generated Tender/company relationship.
test('Module 4A migration prevents cross-company Tender ownership', () => {
  assert.match(migration, /CONSTRAINT "boqs_company_id_fkey"/);
  assert.match(migration, /CONSTRAINT "boqs_tender_company_fkey"[\s\S]*FOREIGN KEY \("tender_id", "company_id"\)[\s\S]*REFERENCES "tenders"\("id", "company_id"\)/);
});

// Keep BOQ item hierarchy and decimal fields safe before repository/service code exists.
test('Module 4A migration hardens decimal items and same-revision parents', () => {
  assert.match(migration, /"quantity" DECIMAL\(18,4\) NOT NULL/);
  assert.match(migration, /"rate" DECIMAL\(18,4\) NOT NULL/);
  assert.match(migration, /"amount" DECIMAL\(18,2\) NOT NULL/);
  assert.match(migration, /boq_items_quantity_nonnegative/);
  assert.match(migration, /boq_items_rate_nonnegative/);
  assert.match(migration, /boq_items_amount_nonnegative/);
  assert.match(migration, /boq_items_parent_not_self/);
  assert.match(migration, /CONSTRAINT "boq_items_parent_same_revision_fkey"[\s\S]*FOREIGN KEY \("parent_id", "boq_revision_id"\)[\s\S]*REFERENCES "boq_items"\("id", "boq_revision_id"\)/);
});

// Keep Stage 6 registered as one reviewed migration gate and preserve the Module 4B deferral.
test('Module 4A persistence is registered as the Stage-6 migration gate', () => {
  const gate = migrationGates.gates.find((item) => item.gate === 'module-4a-boq-commercial-core-persistence');
  assert.ok(gate);
  assert.equal(gate.stage, 6);
  assert.deepEqual(gate.migrations, ['20260823000300_module_4a_boq_commercial_core']);
  assert.match(migration, /Project, WBS and cost-code columns remain deferred to Module 4B/);
  assert.doesNotMatch(migration, /"project_id"|"wbs_node_id"|"cost_code_id"/);
});


// Keep Pass 125 limited to the one required schema file before repository/service/routes exist.
test('Module 4A Pass 125 adds only the reviewed Zod boundary file', () => {
  assert.match(schema, /MODULE_4A_PERMISSION_CODES/);
  assert.match(schema, /MODULE_4A_ERROR_CODES/);
  assert.match(schema, /MODULE_4A_EVENT_TYPES/);
  assert.match(schema, /MODULE_4A_HTTP_ROUTES/);
  assert.match(schema, /export function createModule4aError/);
});

// Keep every approved Module-4 route represented while later reviewed 4B fields may extend the same schemas.
test('Module 4A Zod contract preserves the exact six-route surface after later reviewed gates', () => {
  for (const route of [
    '/api/v1/boqs',
    '/api/v1/boqs/:id/revisions',
    '/api/v1/boqs/:id/revisions/:revId/items',
    '/api/v1/boqs/:id/revisions/:revId/freeze',
    '/api/v1/boqs/:id/revisions/:revId/export'
  ]) assert.ok(schema.includes(route), route);
  assert.doesNotMatch(schema, /\/api\/v1\/boqs\/:id\/import/);
});

// Keep company/security/lifecycle/amount authority out of every client-owned BOQ command.
test('Module 4A request schemas reject server-owned authority and amount input', () => {
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'status',
    'revisionNo', 'amount', 'approvedBy', 'currentRevisionId'
  ]) {
    assert.match(schema, new RegExp(`'${field}'`), field);
  }
  assert.match(schema, /createBoqBodySchema = z\.object\(\{[\s\S]*tenderId:[\s\S]*code:[\s\S]*title:[\s\S]*currency:[\s\S]*\}\)\.strict\(\)/);
  assert.match(schema, /boqItemInputSchema = z\.object\(\{[\s\S]*rowKey:[\s\S]*parentRowKey:[\s\S]*itemCode:[\s\S]*quantity:[\s\S]*rate:[\s\S]*\}\)\.strict\(\)/);
  const itemInputSection = schema.slice(schema.indexOf('export const boqItemInputSchema'), schema.indexOf('export type BoqItemInput'));
  assert.doesNotMatch(itemInputSection, /amount:/);
});

// Keep decimal precision, page size and item-set size bounded before repository logic is generated.
test('Module 4A Zod contract bounds decimals, pagination and item-set replacement', () => {
  assert.match(schema, /MODULE_4A_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /MODULE_4A_MAX_ITEMS_PER_REVISION = 1000/);
  assert.match(schema, /at most 14 whole digits and 4 decimal places/);
  assert.match(schema, /at most 16 whole digits and 2 decimal places/);
  assert.match(schema, /z\.array\(boqItemInputSchema\)\.max\(MODULE_4A_MAX_ITEMS_PER_REVISION\)/);
});

// Keep transient hierarchy validation explicit so persistent item UUIDs remain server-owned.
test('Module 4A item-set schema validates same-request hierarchy keys and cycles', () => {
  assert.match(schema, /rowKey must be unique within the submitted BOQ revision/);
  assert.match(schema, /parentRowKey must reference another row in the same submitted revision/);
  assert.match(schema, /A BOQ item cannot be its own parent/);
  assert.match(schema, /BOQ item hierarchy cannot contain a cycle/);
  assert.match(contract, /`rowKey` and `parentRowKey` are transient request-only hierarchy keys/);
  assert.match(contract, /They are never persisted/);
});

// Keep response decimals serialized and shared success-envelope ownership explicit without inventing an export payload.
test('Module 4A Pass 125 freezes safe response DTOs while deferring unsupported export transport details', () => {
  assert.match(schema, /boqResponseSchema/);
  assert.match(schema, /boqRevisionResponseSchema/);
  assert.match(schema, /boqItemResponseSchema/);
  assert.match(schema, /listBoqsResponseSchema/);
  assert.match(schema, /boqRevisionDetailsResponseSchema/);
  assert.match(contract, /all decimals as decimal strings/);
  assert.match(contract, /exact synchronous-versus-queued export response is intentionally left/);
});

// Keep Pass 125 evidence honest while Stage 5 still lacks genuine live acceptance.
test('Module 4A schema gate is maintained without promoting static Stage-5 evidence', () => {
  assert.equal(rootPackage.scripts['module-4a:schema:gate'], 'node scripts/module-4a/verify-stage-6-schema.mjs');
  assert.match(contract, /Pass-125 concrete API boundary/);
  assert.match(contract, /STAGE_5_ACCEPTED_READY_FOR_STAGE_6/);
});


// Keep Pass 126 at the repository boundary without introducing service or HTTP behavior early.
test('Module 4A Pass 126 adds the reviewed repository as the second backend source file', () => {
  assert.match(repository, /export class BoqRepository/);
  assert.match(repository, /DatabaseClient \| TransactionClient/);
  assert.match(contract, /Pass-126 repository boundary/);
  assert.equal(rootPackage.scripts['module-4a:repository:gate'], 'node scripts/module-4a/verify-stage-6-repository.mjs');
});

// Keep BOQ master ownership derived only from the trusted company repository scope.
test('Module 4A repository scopes BOQ master reads and creates to the authenticated company', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /async listBoqs[\s\S]*scope\.where\(/);
  assert.match(repository, /async findBoqById[\s\S]*scope\.where\(\{ id,[\s\S]*buildProjectVisibilityWhere/);
  assert.match(repository, /async findTenderById[\s\S]*scope\.where\(\{ id: tenderId \}\)/);
  assert.match(repository, /async createBoq[\s\S]*scope\.createData\(/);
});

// Keep every child read/write anchored through a BOQ belonging to the active company.
test('Module 4A repository scopes revisions and items through their company-owned BOQ', () => {
  assert.match(repository, /async findBoqRevisionById[\s\S]*boq: \{ companyId: scope\.companyId \}/);
  assert.match(repository, /async listBoqRevisionItems[\s\S]*boq: \{ companyId: scope\.companyId \}/);
  assert.match(repository, /async replaceBoqRevisionItems[\s\S]*boq: \{ companyId: scope\.companyId \}/);
  assert.match(repository, /async sumBoqRevisionAmount[\s\S]*boq: \{ companyId: scope\.companyId \}/);
});

// Keep lifecycle locks explicitly tenant-scoped before the later service composes transactions.
test('Module 4A repository row locks include explicit company ownership predicates', () => {
  assert.match(repository, /FROM boqs[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(repository, /FROM boq_revisions br[\s\S]*INNER JOIN boqs b[\s\S]*b\.company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE OF br/);
});

// Keep freeze/current-revision writes guarded while business orchestration remains for Pass 127.
test('Module 4A repository exposes guarded freeze and current revision persistence only', () => {
  assert.match(repository, /async freezeBoqRevision[\s\S]*status: 'DRAFT'[\s\S]*status: 'FROZEN'[\s\S]*approvedBy/);
  assert.match(repository, /async setCurrentRevision[\s\S]*scope\.where\(\{ id: boqId \}\)[\s\S]*currentRevisionId: revisionId/);
  assert.match(repository, /async createBoqRevision[\s\S]*revisionNo: input\.revisionNo/);
});

// Preserve the original internal hierarchy boundary while allowing the later reviewed Stage-10 mapping columns.
test('Module 4A repository keeps transient hierarchy keys out after Module 4B mapping activation', () => {
  const itemInput = repository.match(/export type BoqItemRepositoryInput = Readonly<\{[\s\S]*?\n\}>;/)?.[0] ?? '';
  assert.match(itemInput, /id: string/);
  assert.match(itemInput, /parentId\?: string \| null/);
  assert.match(itemInput, /amount: string/);
  assert.doesNotMatch(itemInput, /rowKey|parentRowKey|projectId|costTypeId/);
  assert.match(itemInput, /wbsNodeId\?: string \| null/);
  assert.match(itemInput, /costCodeId\?: string \| null/);
  assert.match(contract, /The repository does not accept browser `amount`, `companyId`, project scope or lifecycle authority/);
});


// Keep Pass 127 at the service boundary while the HTTP layer remains for Pass 128.
test('Module 4A Pass 127 adds the reviewed transactional service without routes', () => {
  assert.match(service, /export class BoqService/);
  assert.match(service, /withTransaction/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(contract, /Pass-127 service boundary/);
  assert.equal(rootPackage.scripts['module-4a:service:gate'], 'node scripts/module-4a/verify-stage-6-service.mjs');
});

// Keep all five source permissions authoritative in the service, independent of later UI hiding.
test('Module 4A service rechecks the reviewed permissions from trusted request context', () => {
  for (const permission of permissions) {
    assert.ok(service.includes(`'${permission}'`), permission);
  }
  assert.match(service, /hasPermission\(permission\)/);
  assert.match(service, /throw new AuthorizationError/);
});

// Keep BOQ creation and revision numbering atomic with only the three reviewed domain events.
test('Module 4A service makes create and revision lifecycle writes atomic with audit and outbox', () => {
  assert.match(service, /async createBoq[\s\S]*withTransaction[\s\S]*eventType: 'boq\.created'/);
  assert.match(service, /async createRevision[\s\S]*lockBoqForWrite[\s\S]*revisionNo = \(latest\?\.revisionNo \?\? 0\) \+ 1[\s\S]*eventType: 'boq\.revision_created'/);
  assert.match(service, /async freezeRevision[\s\S]*eventType: 'boq\.revision_frozen'/);
  assert.doesNotMatch(service, /eventType: 'boq\.item|eventType: 'boq\.updated|eventType: 'boq\.export/);
});

// Keep BOQ amounts exact, server-owned and bounded to the DECIMAL(18,2) range.
test('Module 4A service calculates quantity times rate without JavaScript floating point', () => {
  assert.match(service, /decimalToScale4/);
  assert.match(service, /BigInt\(whole\)/);
  assert.match(service, /PRODUCT_TO_MINOR_UNITS_DIVISOR/);
  assert.match(service, /PRODUCT_ROUND_HALF_UP/);
  assert.match(service, /MAX_MONEY_MINOR_UNITS/);
  assert.match(service, /amount: line\.amount/);
  assert.doesNotMatch(service, /parseFloat|Number\(item\.quantity\)|Number\(item\.rate\)/);
});

// Keep complete item replacement draft-only and auditable with no extra item domain event.
test('Module 4A service locks revisions before all-or-nothing item replacement and audits rate changes', () => {
  assert.match(service, /async replaceRevisionItems[\s\S]*lockBoqRevisionForWrite[\s\S]*status !== REVISION_DRAFT[\s\S]*BOQ_REVISION_LOCKED/);
  assert.match(service, /replaceBoqRevisionItems[\s\S]*action: 'boq\.items_replaced'/);
  assert.match(service, /before:[\s\S]*items: beforeItems\.map\(itemAuditSnapshot\)/);
  assert.match(service, /after:[\s\S]*items: items\.map\(itemAuditSnapshot\)/);
});

// Keep freeze retry-safe and make the frozen revision current in the same transaction.
test('Module 4A service freezes once, records the approver and does not duplicate freeze side effects on retry', () => {
  assert.match(service, /requireActorUserId/);
  assert.match(service, /lockedRevision\.status === REVISION_FROZEN[\s\S]*return \{ revision, items, totalAmount/);
  assert.match(service, /freezeBoqRevision\(boqId, revisionId, actorUserId\)/);
  assert.match(service, /setCurrentRevision\(boqId, revisionId\)/);
});

// Keep export transport simple while allowing the later reviewed Stage-10 Project policy to re-authorize the BOQ.
test('Module 4A export source remains bounded after Module 4B Project-scope activation', () => {
  assert.match(service, /async getRevisionExportSource/);
  assert.match(service, /requireBoqPermission[\s\S]*'boq\.export'/);
  assert.match(service, /findBoqById\(boqId\)/);
  assert.match(service, /findBoqRevisionById\(boqId, revisionId\)/);
  assert.doesNotMatch(service, /costTypeId|enqueueJob|createDocument|uploadIntent/);
});


// Keep Pass 128 limited to the exact six reviewed Fastify operations and normal module registration.
test('Module 4A Pass 128 completes the five-file backend module and registers it in app.ts', () => {
  assert.match(httpRoutes, /export async function registerBoqRoutes/);
  assert.match(moduleIndex, /export \{ registerBoqRoutes \} from '\.\/boq\.routes\.js'/);
  assert.match(app, /import \{ registerBoqRoutes \} from '\.\/modules\/boq\/index\.js'/);
  assert.match(app, /app\.register\(registerBoqRoutes, \{ database: options\.database \}\)/);
  assert.equal(rootPackage.scripts['module-4a:http:gate'], 'node scripts/module-4a/verify-stage-6-http.mjs');
});

// Keep the six source operations and add only the two reviewed Pass-367 readback routes.
test('Module 4 routes expose six source operations plus exactly two readback repairs', () => {
  const registrations = [...httpRoutes.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.deepEqual(registrations, [
    'GET /api/v1/boqs',
    'GET /api/v1/boqs/:id',
    'GET /api/v1/boqs/:id/revisions/:revId',
    'POST /api/v1/boqs',
    'POST /api/v1/boqs/:id/revisions',
    'PUT /api/v1/boqs/:id/revisions/:revId/items',
    'POST /api/v1/boqs/:id/revisions/:revId/freeze',
    'GET /api/v1/boqs/:id/revisions/:revId/export'
  ]);
  assert.doesNotMatch(httpRoutes, /\/api\/v1\/boqs\/:id\/import|app\.patch|app\.delete/);
});

// Keep authentication explicit after Stage 10; exact Company/Project permission is revalidated by the service.
test('Module 4 routes authenticate every reviewed operation before service resource authorization', () => {
  assert.equal((httpRoutes.match(/await authenticateRequest\(request, options\.database\)/g) ?? []).length, 8);
  assert.doesNotMatch(httpRoutes, /requireRoutePermission\(/);
  assert.doesNotMatch(httpRoutes, /hasPermission\(/);
});

// Keep the route boundary Zod-validated and preserve bodyless freeze/server-owned request authority.
test('Module 4A routes parse reviewed schemas and do not accept server-owned amount or lifecycle fields', () => {
  for (const schemaName of [
    'listBoqsQuerySchema', 'createBoqBodySchema', 'createBoqRevisionBodySchema',
    'replaceBoqRevisionItemsBodySchema', 'freezeBoqRevisionBodySchema',
    'exportBoqRevisionQuerySchema'
  ]) assert.ok(httpRoutes.includes(schemaName), schemaName);
  assert.match(httpRoutes, /parseRequest\(freezeBoqRevisionBodySchema, request\.body \?\? \{\}, 'body'\)/);
  const itemBody = httpRoutes.slice(httpRoutes.indexOf("operationId: 'module4aReplaceBoqRevisionItems'"), httpRoutes.indexOf("operationId: 'module4aFreezeBoqRevision'"));
  assert.match(itemBody, /wbsNodeId/);
  assert.match(itemBody, /costCodeId/);
  assert.doesNotMatch(itemBody, /amount:|companyId|projectId|costTypeId/);
});

// Keep client DTOs safe and decimals/date serialization explicit instead of returning raw Prisma records.
test('Module 4A HTTP responses omit companyId and serialize dates and decimals deliberately', () => {
  assert.match(httpRoutes, /function serializeBoq/);
  assert.match(httpRoutes, /function serializeRevision/);
  assert.match(httpRoutes, /function serializeItem/);
  assert.match(httpRoutes, /effectiveDate: revision\.effectiveDate\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(httpRoutes, /quantity: item\.quantity\.toString\(\)/);
  assert.match(httpRoutes, /rate: item\.rate\.toString\(\)/);
  assert.match(httpRoutes, /amount: item\.amount\.toString\(\)/);
  const serializeBoqSection = httpRoutes.slice(httpRoutes.indexOf('function serializeBoq'), httpRoutes.indexOf('function serializeRevision'));
  assert.doesNotMatch(serializeBoqSection, /companyId/);
});

// Resolve the previously deferred export transport with bounded synchronous CSV and no new business side effects.
test('Module 4A Pass 128 uses safe synchronous CSV export inside the shared data envelope', () => {
  assert.match(schema, /exportBoqRevisionResponseSchema[\s\S]*mimeType: z\.literal\('text\/csv'\)/);
  assert.match(httpRoutes, /function csvField/);
  assert.match(httpRoutes, /\^\[=\+\\-@\]/);
  assert.match(httpRoutes, /function buildCsvExport/);
  assert.match(httpRoutes, /mimeType: 'text\/csv'/);
  assert.match(httpRoutes, /return reply\.send\(\{ data: buildCsvExport\(source\) \}\)/);
  assert.doesNotMatch(httpRoutes, /enqueueJob|recordOutboxEvent|createDocument|uploadIntent/);
  assert.match(contract, /synchronous CSV serialization/);
});

// Keep OpenAPI metadata attached to the six source operations plus the two reviewed readback repairs.
test('Module 4A routes expose bearer-secured OpenAPI operation metadata for every approved route', () => {
  for (const operationId of [
    'module4aListBoqs',
    'module4Pass367GetBoqDetails',
    'module4Pass367GetBoqRevisionDetails',
    'module4aCreateBoq',
    'module4aCreateBoqRevision',
    'module4aReplaceBoqRevisionItems',
    'module4aFreezeBoqRevision',
    'module4aExportBoqRevision'
  ]) assert.ok(httpRoutes.includes(`operationId: '${operationId}'`), operationId);
  assert.equal((httpRoutes.match(/security: BEARER_SECURITY/g) ?? []).length, 8);
  assert.match(app, /version: '0\.38\.0'/);
});


// Keep Pass 129 as a real PostgreSQL/Fastify workflow test instead of a mocked route-only check.
test('Module 4A Pass 129 adds one guarded live integration workflow and maintained gate', () => {
  assert.equal(rootPackage.scripts['module-4a:integration:gate'], 'node scripts/module-4a/verify-stage-6-integration.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4a:integration:gate:live'], 'node scripts/module-4a/verify-stage-6-integration.mjs --mode=live');
  assert.match(rootPackage.scripts['test:integration:module-4a'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:integration:module-4a'], /test:db:prepare/);
  assert.match(rootPackage.scripts['test:integration:module-4a'], /module-4a-api\.integration\.test\.mjs/);
  assert.match(integrationTest, /createFoundationTestDatabaseClient/);
  assert.match(integrationTest, /buildApp/);
  assert.match(integrationTest, /app\.inject/);
});

// Keep the main Stage-6 workflow covered through the exact reviewed public BOQ operations.
test('Module 4A Pass 129 integration covers create, revision, item replacement, freeze and export', () => {
  for (const fragment of [
    "url: '/api/v1/boqs'",
    "url: `/api/v1/boqs/${boqId}/revisions`",
    "url: `/api/v1/boqs/${boqId}/revisions/${revisionId}/items`",
    "url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/freeze`",
    "url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/export`"
  ]) assert.ok(integrationTest.includes(fragment), fragment);
  assert.match(integrationTest, /assert\.equal\(details\.totalAmount, '283\.66'\)/);
  assert.match(integrationTest, /assert\.equal\(child\.parentId, section\.id\)/);
  assert.match(integrationTest, /assert\.equal\(response\.json\(\)\.data\.revision\.status, 'FROZEN'\)/);
  assert.match(integrationTest, /assert\.equal\(errorCode\(response\), 'BOQ_REVISION_LOCKED'\)/);
});

// Keep business persistence evidence explicit: exact amounts, immutable history, audit and reviewed events.
test('Module 4A Pass 129 integration verifies durable amounts, historical revisions, audit and outbox', () => {
  assert.match(integrationTest, /client\.boqItem\.findMany/);
  assert.match(integrationTest, /client\.boqRevision\.findUnique/);
  assert.match(integrationTest, /currentRevisionId, revision2\.id/);
  assert.match(integrationTest, /'boq\.created', 'boq\.revision_created', 'boq\.items_replaced', 'boq\.revision_frozen'/);
  assert.match(integrationTest, /eventType: \{ in: \['boq\.created', 'boq\.revision_created', 'boq\.revision_frozen'\] \}/);
  assert.match(integrationTest, /'99999999999999\.9999'/);
  assert.match(integrationTest, /assert\.equal\(revision2ItemsAfterFailure\[0\]\.itemCode, 'V2-001'\)/);
});

// Keep live evidence honest: Stage 5 and the disposable database flag are mandatory before executing the live gate.
test('Module 4A Pass 129 live gate cannot promote skipped or prerequisite-blocked tests', () => {
  assert.match(integrationGate, /STAGE_5_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(integrationGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationGate, /module-4a-postgresql-fastify-workflow/);
  assert.match(integrationGate, /STAGE_6_INTEGRATION_VERIFIED_READY_FOR_PASS_130/);
  assert.match(integrationGate, /negative RBAC matrix/);
  assert.match(integrationGate, /cross-company HTTP\/repository\/service isolation/);
});


// Keep Pass 130 verification-focused and wired into the maintained Stage-6 gate surface.
test('Module 4A Pass 130 adds guarded security verification without changing BOQ production files', () => {
  assert.equal(rootPackage.scripts['module-4a:security:gate'], 'node scripts/module-4a/verify-stage-6-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4a:security:gate:live'], 'node scripts/module-4a/verify-stage-6-security.mjs --mode=live');
  assert.match(rootPackage.scripts['test:security:module-4a'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:security:module-4a'], /\^Module 4A security/);
  assert.match(securityGate, /productionRuntimeChanges: 0/);
  assert.match(contract, /Pass-130 security, company-isolation and database-integrity boundary/);
});

// Keep all six routes authenticated and prove each reviewed permission independently at runtime.
test('Module 4A Pass 130 covers authentication and the exact five-permission RBAC matrix', () => {
  assert.match(integrationTest, /Module 4A security enforces authentication and the exact five-permission route matrix/);
  for (const email of [
    'boq-reader@example.test',
    'boq-creator@example.test',
    'boq-editor@example.test',
    'boq-freezer@example.test',
    'boq-exporter@example.test',
    'boq-no-permission@example.test'
  ]) assert.ok(integrationTest.includes(email), email);
  assert.match(integrationTest, /assertSafePublicError\(unauthenticated, 401, 'AUTHENTICATION_REQUIRED'\)/);
  assert.match(integrationTest, /assertSafePublicError\(denied, 403, 'FORBIDDEN'\)/);
  assert.match(integrationTest, /approvedBy, FREEZER_ID/);
});

// Keep company ownership hidden through HTTP and re-enforced by repository and service boundaries.
test('Module 4A Pass 130 attacks cross-company HTTP, repository and service access plus untrusted authority fields', () => {
  assert.match(integrationTest, /Module 4A security hides foreign-company records and rejects client-owned authority/);
  assert.match(integrationTest, /TENDER_B_ID/);
  assert.match(integrationTest, /assertSafePublicError\(response, 409, 'BOQ_SCOPE_CONFLICT'\)/);
  assert.match(integrationTest, /assertSafePublicError\(denied, 404, 'BOQ_NOT_FOUND'\)/);
  assert.match(integrationTest, /repository\.findBoqById\(boqB\.id\)/);
  assert.match(integrationTest, /service\.getRevisionExportSource\(boqB\.id, revisionB\.id\)/);
  for (const field of ['companyId', 'actorUserId', 'status', 'currentRevisionId', 'projectScope', 'revisionNo', 'approvedBy', 'amount']) {
    assert.ok(integrationTest.includes(field), field);
  }
  assert.match(integrationTest, /assertSafePublicError\(denied, 400, 'INVALID_REQUEST'\)/);
});

// Keep the actual PostgreSQL constraints under attack, not only the Prisma schema text.
test('Module 4A Pass 130 directly verifies tenant, revision, hierarchy, decimal and current-revision constraints plus indexes', () => {
  assert.match(integrationTest, /Module 4A security attacks the live Stage-6 database constraints and reviewed indexes directly/);
  for (const name of [
    'boqs_tender_company_fkey',
    'boqs_current_revision_belongs_to_boq_fkey',
    'boq_revisions_revision_positive',
    'boq_revisions_status_allowed',
    'boq_items_parent_not_self',
    'boq_items_parent_same_revision_fkey',
    'boqs_company_code_uq',
    'boqs_company_tender_created_idx',
    'boq_revisions_boq_revision_uq',
    'boq_items_revision_parent_idx'
  ]) assert.ok(integrationTest.includes(name), name);
  assert.match(integrationTest, /currency: 'usd'/);
  assert.match(integrationTest, /quantity: '-1\.0000'/);
  assert.match(integrationTest, /currentRevisionId: revisionA2\.id/);
});

// Keep the historical Stage-6 deferral evidence while allowing the same regression suite to evolve at Stage 10.
test('Module 4A Pass 130 live gate remains historical while Stage-10 relationships are regression-tested', () => {
  assert.match(securityGate, /STAGE_5_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(securityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(securityGate, /module-4a-rbac-isolation-database-attacks/);
  assert.match(securityGate, /STAGE_6_SECURITY_VERIFIED_READY_FOR_PASS_131/);
  assert.match(securityGate, /deferredColumns: \['project_id', 'wbs_node_id', 'cost_code_id'\]/);
  assert.match(integrationTest, /projectId/);
  assert.match(integrationTest, /wbsNodeId/);
  assert.match(integrationTest, /costCodeId/);
});


// Keep Pass 131 focused on generated API/OpenAPI contract proof instead of adding another business endpoint.
test('Module 4A Pass 131 wires a guarded generated OpenAPI contract gate', () => {
  assert.equal(rootPackage.scripts['module-4a:api-contract:gate'], 'node scripts/module-4a/verify-stage-6-api-contract.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4a:api-contract:gate:live'], 'node scripts/module-4a/verify-stage-6-api-contract.mjs --mode=live');
  assert.match(rootPackage.scripts['test:api-contract:module-4a'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:api-contract:module-4a'], /\^Module 4A API contract/);
  assert.match(apiContractGate, /module-4a-generated-openapi-contract/);
  assert.match(contract, /Pass-131 OpenAPI, API-contract and stable-error boundary/);
});

// Keep the public error schema aligned with the actual shared envelope: requestId belongs inside error.
test('Module 4A Pass 131 corrects and locks the shared error envelope shape in OpenAPI', () => {
  assert.match(httpRoutes, /required: \['error'\]/);
  assert.match(httpRoutes, /required: \['code', 'message', 'requestId'\]/);
  assert.doesNotMatch(httpRoutes, /required: \['error', 'requestId'\]/);
  for (const code of [
    'INVALID_REQUEST', 'AUTHENTICATION_REQUIRED', 'FORBIDDEN', 'INTERNAL_SERVER_ERROR',
    'BOQ_NOT_FOUND', 'BOQ_REVISION_LOCKED', 'INVALID_BOQ_ITEM', 'BOQ_SCOPE_CONFLICT'
  ]) assert.ok(httpRoutes.includes(`'${code}'`), code);
});

// Keep generated success documentation exact enough to prevent company ownership or numeric precision drift.
test('Module 4A Pass 131 documents exact success DTOs and decimal strings instead of generic objects', () => {
  for (const schemaName of [
    'BOQ_RESPONSE_JSON_SCHEMA', 'BOQ_REVISION_RESPONSE_JSON_SCHEMA', 'BOQ_ITEM_RESPONSE_JSON_SCHEMA',
    'LIST_BOQS_SUCCESS_SCHEMA', 'REVISION_DETAILS_SUCCESS_SCHEMA', 'EXPORT_SUCCESS_SCHEMA'
  ]) assert.ok(httpRoutes.includes(schemaName), schemaName);
  assert.doesNotMatch(httpRoutes, /SUCCESS_RESPONSE_SCHEMA/);
  assert.match(httpRoutes, /amount: MONEY_SCHEMA/);
  assert.match(httpRoutes, /quantity: DECIMAL_QUANTITY_RATE_SCHEMA/);
  assert.match(httpRoutes, /rate: DECIMAL_QUANTITY_RATE_SCHEMA/);
});

// Keep the live generated Swagger assertion tied to exactly six reviewed BOQ operations and no future-scope APIs.
test('Module 4A Pass 131 live API-contract test inspects generated openapi.json and exact operation inventory', () => {
  assert.match(integrationTest, /Module 4 API contract exposes six source operations plus two Pass-367 readback operations and stable schemas/);
  assert.match(integrationTest, /url: '\/openapi\.json'/);
  for (const operationId of [
    'module4aListBoqs', 'module4Pass367GetBoqDetails', 'module4Pass367GetBoqRevisionDetails', 'module4aCreateBoq', 'module4aCreateBoqRevision',
    'module4aReplaceBoqRevisionItems', 'module4aFreezeBoqRevision', 'module4aExportBoqRevision'
  ]) assert.ok(integrationTest.includes(operationId), operationId);
  assert.match(integrationTest, /documentedBoqOperations\.sort\(\), actualOperations\.sort\(\)/);
  assert.match(integrationTest, /route\.includes\('\/import'\)/);
  assert.match(integrationTest, /route\.includes\('\/project'\)/);
});

// Keep live evidence honest and hand off only to the first React Stage-6 pass after real contract verification.
test('Module 4A Pass 131 live gate requires Stage 5 plus explicit disposable database execution before Pass 132', () => {
  assert.match(apiContractGate, /STAGE_5_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(apiContractGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(apiContractGate, /STAGE_6_API_CONTRACT_VERIFIED_READY_FOR_PASS_132/);
  assert.match(apiContractGate, /Pass 132 - Module 4A React BOQ register and create\/revision UI/);
  assert.match(apiContractGate, /deferredColumns: \['project_id', 'wbs_node_id', 'cost_code_id'\]/);
});


// Keep Pass 132 inside the source-defined React feature structure and consume only existing Stage-6 API operations.
test('Module 4A Pass 132 adds the BOQ register/create/revision React feature without inventing backend routes', () => {
  assert.equal(rootPackage.scripts['module-4a:react-register:gate'], 'node scripts/module-4a/verify-stage-6-react-register.mjs');
  assert.match(webBoqApi, /function listBoqs/);
  assert.match(webBoqApi, /function createBoq/);
  assert.match(webBoqApi, /function createBoqRevision/);
  assert.doesNotMatch(webBoqApi, /importBoq|deleteBoq|patchBoq/);
  assert.match(webBoqApi, /function getBoqDetails/);
  assert.match(webBoqApi, /function getBoqRevisionDetails/);
  assert.match(reactRegisterGate, /STAGE_6_REACT_REGISTER_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING/);
});

// Keep browser-owned Module 4 writes restricted while allowing the reviewed Stage-10 Project relationship.
test('Module 4 React API keeps company lifecycle totals and unreviewed authority server-owned', () => {
  const createInput = webBoqApi.slice(webBoqApi.indexOf('export type CreateBoqInput'), webBoqApi.indexOf('export type CreateBoqRevisionInput'));
  const revisionInput = webBoqApi.slice(webBoqApi.indexOf('export type CreateBoqRevisionInput'), webBoqApi.indexOf('export type BoqItemInput'));
  assert.match(createInput, /tenderId\?:[\s\S]*projectId\?:[\s\S]*code:[\s\S]*title:[\s\S]*currency:/);
  assert.match(revisionInput, /effectiveDate:[\s\S]*notes:/);
  assert.doesNotMatch(createInput, /companyId|actorUserId|permissions|projectScope|status|revisionNo|amount|approvedBy|currentRevisionId|wbsNodeId|costCodeId/);
  assert.doesNotMatch(revisionInput, /companyId|actorUserId|permissions|projectScope|status|revisionNo|amount|approvedBy|currentRevisionId|projectId|wbsNodeId|costCodeId/);
});

// TanStack Query must own BOQ server state and refresh the single module query family after mutations.
test('Module 4A React hooks use one TanStack Query family for all Stage-6 BOQ mutations', () => {
  assert.match(webBoqHooks, /const BOQS_QUERY_KEY = \['module-4a', 'boqs'\] as const/);
  assert.match(webBoqHooks, /useQuery\(/);
  assert.equal((webBoqHooks.match(/useMutation\(/g) ?? []).length, 5);
  assert.equal((webBoqHooks.match(/invalidateQueries\(\{ queryKey: BOQS_QUERY_KEY \}\)/g) ?? []).length, 4);
});

// The register and create form must follow the reviewed permission split and avoid unauthorized Tender discovery calls.
test('Module 4A BOQ page is permission-aware and uses React Hook Form plus Zod for creation', () => {
  assert.match(webBoqsPage, /usePermission\('boq\.read'\)/);
  assert.match(webBoqsPage, /usePermission\('boq\.create'\)/);
  assert.match(webBoqsPage, /usePermission\('tenders\.read'\)/);
  assert.match(webBoqsPage, /useTenders\(\{ page: 1, pageSize: 100 \}, canCreate && canReadTenders\)/);
  assert.match(webBoqsPage, /useForm<CreateBoqValues>/);
  assert.match(webBoqsPage, /zodResolver\(createBoqSchema\)/);
  assert.match(webBoqsPage, /Create BOQ/);
  assert.match(webBoqsPage, /Manage Tender and Project BOQs/);
  assert.match(webBoqsPage, /Select a Tender, a Project, or both/);
});

// Revision creation must use the explicit boq.edit permission and leave revision numbering/status server-owned.
test('Module 4A revision creation keeps numbering, lifecycle and approver authority on the server', () => {
  assert.match(webBoqRevisionPanel, /usePermission\('boq\.edit'\)/);
  assert.match(webBoqRevisionPanel, /useForm<CreateRevisionValues>/);
  assert.match(webBoqRevisionPanel, /zodResolver\(createRevisionSchema\)/);
  assert.match(webBoqRevisionPanel, /Create revision/);
  assert.match(webBoqRevisionPanel, /server assigns the revision number/);
  assert.doesNotMatch(webBoqRevisionPanel, /revisionNo\s*:|status\s*:|approvedBy\s*:/);
});

// Stage 10 keeps Company BOQ permission and assigned-Project discovery as the two workspace entry paths.
test('workspace shell exposes BOQ Management for Company read or an assigned Project scope', () => {
  assert.match(webAdminShell, /const canReadBoqsCompanyWide = usePermission\('boq\.read'\)/);
  assert.match(webAdminShell, /const canReadBoqs = canReadBoqsCompanyWide[\s\S]*projectScope\.kind === 'restricted'/);
  assert.match(webAdminShell, /canReadBoqs && \([\s\S]*>BOQ Management<\/button>/);
  assert.match(webAdminShell, /activeView === 'boqs' && <BoqsPage \/>/);
});


// Pass 133 must consume the remaining three approved Stage-6 operations without widening the backend surface.
test('Module 4A Pass 133 adds item replacement, freeze and export API clients only', () => {
  assert.equal(rootPackage.scripts['module-4a:react-workflow:gate'], 'node scripts/module-4a/verify-stage-6-react-workflow.mjs');
  assert.match(webBoqApi, /function replaceBoqRevisionItems/);
  assert.match(webBoqApi, /function freezeBoqRevision/);
  assert.match(webBoqApi, /function exportBoqRevision/);
  assert.match(webBoqApi, /method: 'PUT'/);
  assert.match(webBoqApi, /method: 'POST'[\s\S]*freeze/);
  assert.doesNotMatch(webBoqApi, /function listBoqRevisions|importBoq|deleteBoq|patchBoq/);
  assert.match(webBoqApi, /function getBoqRevisionDetails/);
});

// Browser item input keeps hierarchy transient and amounts server-owned while Stage 10 adds reviewed mapping IDs.
test('Module 4 BOQ item authority stays server-owned after Stage-10 mapping activation', () => {
  const itemInput = webBoqApi.slice(webBoqApi.indexOf('export type BoqItemInput'), webBoqApi.indexOf('export type ReplaceBoqRevisionItemsInput'));
  assert.match(itemInput, /rowKey:[\s\S]*parentRowKey[\s\S]*itemCode:[\s\S]*description:[\s\S]*unit:[\s\S]*quantity:[\s\S]*rate:[\s\S]*wbsNodeId\?:[\s\S]*costCodeId\?:/);
  assert.doesNotMatch(itemInput, /\bid:|boqRevisionId|parentId|amount|companyId|projectId|costTypeId/);
  assert.match(webBoqApi, /freezeBoqRevision[\s\S]*method: 'POST'[\s\S]*\}\);/);
  const freezeSection = webBoqApi.slice(webBoqApi.indexOf('export function freezeBoqRevision'), webBoqApi.indexOf('/** Export one authorized'));
  assert.doesNotMatch(freezeSection, /body:/);
});

// The item editor must stay simple, form-validated and permission-aware while hierarchy remains transient.
test('Module 4A Pass 133 renders a React Hook Form hierarchical item grid with edit/freeze/export permissions', () => {
  assert.match(webBoqRevisionPanel, /useFieldArray/);
  assert.match(webBoqRevisionPanel, /useForm<BoqItemsValues>/);
  assert.match(webBoqRevisionPanel, /zodResolver\(boqItemsSchema\)/);
  assert.match(webBoqRevisionPanel, /parentRowKey/);
  assert.match(webBoqRevisionPanel, /Hierarchical BOQ item grid/);
  assert.match(webBoqRevisionPanel, /usePermission\('boq\.edit'\)/);
  assert.match(webBoqRevisionPanel, /usePermission\('boq\.freeze'\)/);
  assert.match(webBoqRevisionPanel, /usePermission\('boq\.export'\)/);
  assert.match(webBoqRevisionPanel, /Save item set/);
  assert.match(webBoqRevisionPanel, /Freeze revision/);
  assert.match(webBoqRevisionPanel, /Export CSV/);
  assert.doesNotMatch(webBoqRevisionPanel, /register\([^\n]*amount/);
});

// Pass 367 repairs the source gap with durable history and revision-detail reads used by the existing comparison UI.
test('Module 4 Pass 367 restores revision history and comparison from server readback', () => {
  assert.match(webBoqRevisionPanel, /Durable revision history/);
  assert.match(webBoqRevisionPanel, /loaded from the server/);
  assert.match(webBoqRevisionPanel, /useBoqDetails/);
  assert.match(webBoqRevisionPanel, /useBoqRevisionDetails/);
  assert.match(webBoqRevisionPanel, /Revision comparison/);
  assert.match(webBoqRevisionPanel, /buildComparisonRows/);
  assert.match(webBoqRevisionPanel, /Server-calculated result/);
  assert.match(webBoqRevisionPanel, /totalAmount/);
});

// Preserve the original Stage-6 ownership decision while allowing only Module 4B to activate those deferred relationships.
test('Module 4A deferral is completed only by the reviewed Module 4B Stage-10 relationships', () => {
  assert.match(contract, /Project\/WBS\/cost-code mapping belongs to Module 4B/);
  assert.match(webBoqApi, /projectId/);
  assert.match(webBoqApi, /wbsNodeId/);
  assert.match(webBoqApi, /costCodeId/);
  assert.doesNotMatch(webBoqApi, /costTypeId/);
  assert.doesNotMatch(webBoqHooks, /attachProject|boq-mappings/);
});

// Pass 133 remains prepared until the upstream live acceptance and dependency-backed web build exist.
test('Module 4A Pass 133 workflow gate records honest prepared evidence and hands off to Playwright', () => {
  assert.match(reactWorkflowGate, /STAGE_6_REACT_WORKFLOW_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING/);
  assert.match(reactWorkflowGate, /dependencyBackedWebBuildRequired: true/);
  assert.match(reactWorkflowGate, /productionBackendChanges: 0/);
  assert.match(reactWorkflowGate, /databaseChanges: 0/);
  assert.match(reactWorkflowGate, /Pass 134 - Module 4A Playwright BOQ browser workflow and permission verification/);
  assert.match(reactWorkflowGate, /deferredColumns: \['project_id', 'wbs_node_id', 'cost_code_id'\]/);
});


// Keep Pass 134 limited to browser verification and one maintained gate without changing Module 4A runtime files.
test('Module 4A Pass 134 adds one focused Playwright workflow and guarded gate', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-4a'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-4a:playwright:gate'], 'node scripts/module-4a/verify-stage-6-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4a:playwright:gate:live'], 'node scripts/module-4a/verify-stage-6-playwright.mjs --mode=live');
  assert.match(playwrightGate, /productionRuntimeChanges: 0/);
  assert.match(playwrightGate, /Pass 135 - Module 4A performance, concurrency and operational verification/);
});

// Keep the shared Playwright runner deterministic by selecting exactly one module suite at a time.
test('Module 4A Pass 134 is wired into the shared Playwright configuration without affecting older suites', () => {
  assert.match(playwrightConfig, /RUN_MODULE_4A_E2E/);
  assert.match(playwrightConfig, /module-4a-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /enabledModuleCount/);
  for (const olderFlag of ['RUN_MODULE_24A_E2E', 'RUN_MODULE_18_E2E', 'RUN_MODULE_22_E2E', 'RUN_MODULE_2_E2E', 'RUN_MODULE_3_E2E']) {
    assert.ok(playwrightConfig.includes(olderFlag), olderFlag);
  }
});

// Cover the full Stage-6 commercial browser path through hierarchy, totals, freeze, export and comparison.
test('Module 4A Pass 134 covers the main BOQ browser workflow with real database assertions', () => {
  assert.match(browserTest, /Create one Tender-linked BOQ/);
  assert.match(browserTest, /parent\/child hierarchy/);
  assert.match(browserTest, /Total: PKR 283\.66/);
  assert.match(browserTest, /Revision 1 · FROZEN/);
  assert.match(browserTest, /waitForEvent\('download'\)/);
  assert.match(browserTest, /Revision 1: PKR 283\.66/);
  assert.match(browserTest, /Revision 2: PKR 500\.00/);
  assert.match(browserTest, /childItem\?\.parentId/);
  assert.match(browserTest, /approvedBy\)\.toBe\(MANAGER_ID\)/);
});

// Keep UI permission checks separate from API authorization so hidden buttons never become the security boundary.
test('Module 4A Pass 134 verifies read, edit, freeze, export and no-read browser permissions', () => {
  for (const email of [
    'pass134-boq-reader@example.test',
    'pass134-boq-editor@example.test',
    'pass134-boq-freezer@example.test',
    'pass134-boq-exporter@example.test',
    'pass134-no-boq@example.test'
  ]) assert.ok(browserTest.includes(email), email);
  assert.match(browserTest, /forbiddenCreate\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /forbiddenFreeze\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /noBoqPage\.getByRole\('button', \{ name: 'BOQ Management' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /expect\(noBoqRequests\)\.toHaveLength\(0\)/);
});

// Keep company, actor, lifecycle, calculated amount and future Module 4B mapping authority out of browser writes.
test('Module 4A Pass 134 verifies server-owned request authority and exact reviewed request shapes', () => {
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'projectId', 'wbsNodeId', 'costCodeId',
    'status', 'currentRevisionId', 'revisionNo', 'approvedBy', 'amount', 'parentId'
  ]) assert.ok(browserTest.includes(`'${field}'`), field);
  assert.match(browserTest, /\['code', 'currency', 'tenderId', 'title'\]/);
  assert.match(browserTest, /\['effectiveDate', 'notes'\]/);
  assert.match(browserTest, /'description', 'itemCode', 'parentRowKey', 'quantity', 'rate', 'rowKey', 'unit'/);
  assert.match(browserTest, /freezeRequests\[0\]\.body\)\.toBeNull\(\)/);
  assert.match(browserTest, /exportRequests\[0\]\.body\)\.toBeNull\(\)/);
});

// Keep live browser evidence blocked until genuine Stage-5 acceptance and explicit Module 4A E2E selection exist.
test('Module 4A Pass 134 live gate cannot promote a prepared browser suite from static evidence', () => {
  assert.match(playwrightGate, /STAGE_5_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(playwrightGate, /RUN_MODULE_4A_E2E_REQUIRED/);
  assert.match(playwrightGate, /STAGE_6_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_135/);
  assert.match(playwrightGate, /runtimeVerificationComplete: passed && mode === 'live' && stage5LiveAccepted/);
});


// Keep Pass 135 verification-only and reuse the existing integration suite rather than adding runtime abstractions.
test('Module 4A Pass 135 adds one guarded operational gate and no new production capability', () => {
  assert.equal(rootPackage.scripts['module-4a:operations:gate'], 'node scripts/module-4a/verify-stage-6-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4a:operations:gate:live'], 'node scripts/module-4a/verify-stage-6-operations.mjs --mode=live');
  assert.match(rootPackage.scripts['test:operations:module-4a'], /Module 4A operational\|overflowing item replacement/);
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(contract, /Pass-135 operational verification boundary/);
});

// Verify concurrency coverage protects revision numbering, complete replacement and idempotent freeze side effects.
test('Module 4A Pass 135 covers the reviewed lifecycle concurrency risks', () => {
  assert.match(integrationTest, /Module 4A operational concurrency serializes revision numbering, item replacement and freeze retries/);
  assert.match(integrationTest, /Promise\.all\([\s\S]*Concurrent revision A[\s\S]*Concurrent revision B/);
  assert.match(integrationTest, /persistedItems\.length, 1/);
  assert.match(integrationTest, /boq\.revision_frozen/);
  assert.match(integrationTest, /auditLog\.count[\s\S]*1/);
  assert.match(integrationTest, /outboxEvent\.count[\s\S]*1/);
});

// Verify performance checks use planner/index evidence instead of brittle wall-clock thresholds.
test('Module 4A Pass 135 verifies reviewed PostgreSQL indexes without hard duration thresholds', () => {
  assert.match(integrationTest, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.match(integrationTest, /boqs_company_tender_created_idx/);
  assert.match(integrationTest, /boq_revisions_boq_status_revision_idx/);
  assert.match(integrationTest, /Execution Time/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
});

// Keep live operational acceptance dependent on browser evidence and clean/previous-schema migration proof.
test('Module 4A Pass 135 live gate requires Pass 134 and runs migration plus rollback-aware operational verification', () => {
  assert.match(operationsGate, /STAGE_6_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-4a/);
  assert.match(operationsGate, /clean database migration deployment/);
  assert.match(operationsGate, /upgrade from immediately previous supported schema/);
  assert.match(operationsGate, /failed overflowing item replacement rolls back without partial writes/);
  assert.match(operationsGate, /STAGE_6_OPERATIONS_VERIFIED_READY_FOR_PASS_136/);
});

// Keep Pass 136 as one final maintained gate instead of adding another runtime layer.
test('Module 4A Pass 136 adds one final Stage-6 acceptance gate with no new business capability', () => {
  assert.equal(rootPackage.scripts['module-4a:gate'], 'node scripts/module-4a/verify-stage-6.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-4a:gate:live'], 'node scripts/module-4a/verify-stage-6.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-4a:acceptance:live'], 'npm run module-4a:gate:live');
  assert.match(contract, /Pass-136 final Stage-6 acceptance boundary/);
  assert.match(contract, /does not add a BOQ table, route, repository method, service method, permission, event, worker or React production file/);
});

// Keep Stage 6 blocked until the prior stage has genuine live evidence and the live environment is explicitly disposable.
test('Module 4A Pass 136 live gate requires Stage-5 acceptance and explicit disposable test configuration', () => {
  assert.match(finalStageGate, /STAGE_5_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(finalStageGate, /RUN_CONSTRUCTION_ERP_MODULE_4A_LIVE_GATE/);
  assert.match(finalStageGate, /RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE/);
  assert.match(finalStageGate, /RUN_MODULE_4A_E2E=1 is required/);
  assert.match(finalStageGate, /validateTestDatabaseEnvironment/);
  assert.match(finalStageGate, /package-lock\.json/);
});

// Final live acceptance must rerun the complete dependency-backed gate instead of trusting stale per-pass evidence.
test('Module 4A Pass 136 final live gate reruns build, migration, integration and browser verification', () => {
  for (const required of [
    "['clean-install', 'npm', ['ci']]",
    "['typecheck', 'npm', ['run', 'typecheck']]",
    "['lint', 'npm', ['run', 'lint']]",
    "['prisma-validate', 'npm', ['run', 'db:validate']]",
    "['prisma-generate', 'npm', ['run', 'db:generate']]",
    "['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']]",
    "['build', 'npm', ['run', 'build']]",
    "['module-4a-backend-security-api-operational-integration', 'npm', ['run', 'test:integration:module-4a']]",
    "['module-4a-browser-workflow', 'npm', ['run', 'test:e2e:module-4a']]"
  ]) assert.ok(finalStageGate.includes(required), required);
  assert.match(finalStageGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
});

// Successful Stage 6 must hand off to Project Management while keeping Project/WBS mapping deferred to Module 4B.
test('Module 4A Pass 136 closes Commercial Core only and hands off to Module 5 Project Management', () => {
  assert.match(finalStageGate, /Module 5 - Project Management/);
  assert.match(finalStageGate, /deferredColumns: \['project_id', 'wbs_node_id', 'cost_code_id'\]/);
  assert.match(finalStageGate, /ownedTables: \['boqs', 'boq_revisions', 'boq_items'\]/);
  assert.match(finalStageGate, /routeCount: 6/);
  assert.match(finalStageGate, /permissions: \['boq\.read', 'boq\.create', 'boq\.edit', 'boq\.freeze', 'boq\.export'\]/);
});



// Pass 171 adds client-side CSV import into the existing whole-set draft item command instead of inventing a backend import route.
test('Pass 171 BOQ CSV import validates the complete file before populating the existing draft worksheet', () => {
  assert.match(webBoqRevisionPanel, /BOQ_IMPORT_HEADERS = \['item_code', 'parent_item_code', 'description', 'unit', 'quantity', 'rate'\]/);
  assert.match(webBoqRevisionPanel, /function parseCsvRow\(/);
  assert.match(webBoqRevisionPanel, /function parseBoqImportCsv\(/);
  assert.match(webBoqRevisionPanel, /rowKeyByCode/);
  assert.match(webBoqRevisionPanel, /is duplicated/);
  assert.match(webBoqRevisionPanel, /unknown parent_item_code/);
  assert.match(webBoqRevisionPanel, /boqItemsSchema\.safeParse\(\{ items \}\)/);
  assert.match(webBoqRevisionPanel, /aria-label="Import BOQ CSV"/);
  assert.match(webBoqRevisionPanel, /itemForm\.reset\(\{ items \}\)/);
  assert.match(webBoqRevisionPanel, /does not save until you choose Save item set/);
  assert.doesNotMatch(webBoqApi, /importBoq|uploadBoqCsv|\/import/);
});

// Keep the maintained browser path proving imported hierarchy is still persisted by the reviewed replace-items API.
test('Pass 171 Playwright prepares CSV import hierarchy coverage without changing browser authority', () => {
  assert.match(browserTest, /getByLabel\('Import BOQ CSV'\)\.setInputFiles/);
  assert.match(browserTest, /item_code,parent_item_code,description,unit,quantity,rate/);
  assert.match(browserTest, /1\.1,1\.0,Foundation child item/);
  assert.match(browserTest, /getByLabel\('Item 2 parent'\)[\s\S]*toHaveText\('1\.0'\)/);
  assert.match(browserTest, /childItem\?\.parentId/);
});
