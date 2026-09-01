import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const backendDir = 'apps/api/src/modules/clients';
const schema = await readFile(`${backendDir}/clients.schema.ts`, 'utf8');
const repository = await readFile(`${backendDir}/clients.repository.ts`, 'utf8');
const service = await readFile(`${backendDir}/clients.service.ts`, 'utf8');
const routeSource = await readFile(`${backendDir}/clients.routes.ts`, 'utf8');
const moduleIndex = await readFile(`${backendDir}/index.ts`, 'utf8');
const appSource = await readFile('apps/api/src/app.ts', 'utf8');
const integrationSource = await readFile('tests/integration/module-2-api.integration.test.mjs', 'utf8');
const webApiSource = await readFile('apps/web/src/features/clients/api/clients-api.ts', 'utf8');
const webHooksSource = await readFile('apps/web/src/features/clients/hooks/clients.ts', 'utf8');
const webDetailsSource = await readFile('apps/web/src/features/clients/components/client-details-panel.tsx', 'utf8');
const webOpportunitySource = await readFile('apps/web/src/features/clients/components/opportunity-pipeline.tsx', 'utf8');
const webPageSource = await readFile('apps/web/src/features/clients/pages/clients-page.tsx', 'utf8');
const webTendersPageSource = await readFile('apps/web/src/features/tendering-estimation/pages/tenders-page.tsx', 'utf8');
const webProjectsPageSource = await readFile('apps/web/src/features/projects/pages/projects-page.tsx', 'utf8');
const adminShellSource = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const browserE2eSource = await readFile('tests/e2e/module-2-browser.spec.mjs', 'utf8');
const playwrightConfigSource = await readFile('playwright.config.mjs', 'utf8');
const module2GateSource = await readFile('scripts/module-2/verify-stage-4.mjs', 'utf8');
const module2LiveRunnerSource = await readFile('scripts/module-2/run-live-acceptance.mjs', 'utf8');
const prismaSchemaSource = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260823000100_module_2_crm_client_management_core/migration.sql', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const permissions = [
  'clients.read',
  'clients.create',
  'clients.update',
  'opportunities.read',
  'opportunities.manage'
];
const errors = [
  'CLIENT_NOT_FOUND',
  'DUPLICATE_CLIENT_CODE',
  'INVALID_OPPORTUNITY_STAGE',
  'CLIENT_IN_USE',
  'OPPORTUNITY_NOT_FOUND'
];
const events = [
  'client.created',
  'client.updated',
  'opportunity.created',
  'opportunity.stage_changed'
];
const routes = [
  '/api/v1/clients',
  '/api/v1/clients/:id',
  '/api/v1/clients/:id/contacts',
  '/api/v1/clients/:id/archive',
  '/api/v1/opportunities',
  '/api/v1/opportunities/:id',
  '/api/v1/opportunities/:id/change-stage',
  '/api/v1/opportunities/:id/notes',
  '/api/v1/opportunities/:id/reopen'
];

// Keep Module 2 on the required five-file backend structure after Fastify registration.
test('Module 2 now has exactly the approved five backend files', async () => {
  assert.deepEqual((await readdir(backendDir)).sort(), [
    'clients.repository.ts',
    'clients.routes.ts',
    'clients.schema.ts',
    'clients.service.ts',
    'index.ts'
  ]);
});

// Keep the frozen permission, error, event and route contracts available to later Module 2 layers.
test('Module 2 schema exports the reviewed stable contracts', () => {
  for (const value of [...permissions, ...errors, ...events, ...routes, 'DUPLICATE_PRIMARY_CONTACT']) {
    assert.ok(schema.includes(`'${value}'`), value);
  }
  assert.match(schema, /MODULE_2_MAX_PAGE_SIZE = 100/);
});

// Keep lifecycle and opportunity-stage values synchronized with the Stage-4 contract and database checks.
test('Module 2 schema keeps the approved lifecycle and stage enums', () => {
  assert.match(schema, /clientStatusSchema = z\.enum\(\['ACTIVE', 'ARCHIVED'\]\)/);
  assert.match(schema, /clientContactStatusSchema = z\.enum\(\['ACTIVE', 'INACTIVE'\]\)/);
  assert.match(schema, /opportunityStageSchema = z\.enum\(\['LEAD', 'QUALIFIED', 'TENDERING', 'WON', 'LOST'\]\)/);
  assert.match(schema, /opportunityReopenTargetStageSchema = z\.enum\(\['LEAD', 'QUALIFIED', 'TENDERING'\]\)/);
});

// Verify every reviewed Module 2 request boundary has an explicit strict Zod object.
test('Module 2 provides all required request and query schemas', () => {
  for (const name of [
    'clientIdParamsSchema',
    'opportunityIdParamsSchema',
    'listClientsQuerySchema',
    'createClientBodySchema',
    'updateClientBodySchema',
    'archiveClientBodySchema',
    'createClientContactBodySchema',
    'createOpportunityBodySchema',
    'listOpportunitiesQuerySchema',
    'changeOpportunityStageBodySchema',
    'createOpportunityNoteBodySchema',
    'reopenOpportunityBodySchema'
  ]) {
    assert.match(schema, new RegExp(`export const ${name} = z\\.object\\(`), name);
  }
  assert.ok((schema.match(/\}\)\.strict\(\)/g) ?? []).length >= 12);
});

// Keep ownership, actor, permission and lifecycle authority on the server rather than public request bodies.
test('Module 2 public body schemas do not accept client-owned security fields', () => {
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope']) {
    assert.doesNotMatch(schema, new RegExp(`\\b${field}\\s*:`));
  }

  const createOpportunity = schema.slice(
    schema.indexOf('export const createOpportunityBodySchema'),
    schema.indexOf('/** Bounded opportunity-pipeline filters')
  );
  assert.doesNotMatch(createOpportunity, /\bstage\s*:/);

  const createClient = schema.slice(
    schema.indexOf('export const createClientBodySchema'),
    schema.indexOf('/** Update only editable client-master fields')
  );
  assert.doesNotMatch(createClient, /\bstatus\s*:/);
});

// Keep financial values precise and enforce the source-required ranges before service logic runs.
test('Module 2 validates decimals, probability, credit terms and pagination at the boundary', () => {
  assert.match(schema, /estimatedValue: moneySchema/);
  assert.match(schema, /probabilitySchema = z\.number\(\)\.int\(\)\.min\(0\)\.max\(100\)/);
  assert.match(schema, /creditTermsDaysSchema = z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(MODULE_2_MAX_PAGE_SIZE\)/);
  assert.match(schema, /non-negative decimal string/);
});

// Keep contact identity data normalized at the API boundary without adding another helper layer.
test('Module 2 normalizes email and phone through the Zod schemas', () => {
  assert.match(schema, /emailSchema = .*\.transform\(\(value\) => value\.toLowerCase\(\)\)/);
  assert.match(schema, /value\.replace\(\/\[\\s\(\)\.\-\]\/g, ''\)/);
  assert.match(schema, /\^\\\+\?\\d\{7,15\}\$/);
});

// Keep the reviewed command semantics explicit at the HTTP boundary.
test('Module 2 keeps archive bodyless and reopen requires target stage plus reason', () => {
  assert.match(schema, /archiveClientBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /reopenOpportunityBodySchema = z\.object\(\{[\s\S]*targetStage: opportunityReopenTargetStageSchema,[\s\S]*reason: z\.string\(\)\.trim\(\)\.min\(1\)/);
});

// Keep stable Module 2 business conflicts mapped through the shared public error classes.
test('Module 2 exposes one simple stable error factory for later service logic', () => {
  assert.match(schema, /export function createModule2Error\(code: Module2ErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ConflictError/);
});


// Keep all required CRM persistence operations in one simple company-scoped repository.
test('Module 2 repository implements the required client, contact, opportunity and note methods', () => {
  for (const name of [
    'listClients',
    'findClientById',
    'findClientByCode',
    'createClient',
    'updateClient',
    'listClientContacts',
    'createClientContact',
    'findPrimaryContact',
    'findActiveUserById',
    'countClientOpportunities',
    'listOpportunities',
    'findOpportunityById',
    'createOpportunity',
    'updateOpportunityStage',
    'listOpportunityNotes',
    'createOpportunityNote'
  ]) {
    assert.match(repository, new RegExp(`async ${name}\\(`), name);
  }
});

// Keep company ownership derived from request context instead of caller-supplied repository arguments.
test('Module 2 repository derives company scope from the shared tenant helper', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /scope\.where\(/);
  assert.match(repository, /scope\.createData\(/);
  assert.doesNotMatch(repository, /companyId:\s*input\.companyId/);
});

// Keep list reads bounded so later APIs cannot accidentally issue unbounded grid queries.
test('Module 2 repository enforces bounded pagination for client and opportunity lists', () => {
  assert.match(repository, /function assertPageWindow\(/);
  assert.match(repository, /MODULE_2_MAX_PAGE_SIZE/);
  assert.match(repository, /async listClients\([\s\S]*assertPageWindow\(input\)/);
  assert.match(repository, /async listOpportunities\([\s\S]*assertPageWindow\(input\)/);
});

// Keep note reads scoped through the opportunity and note writes limited to an active same-company author.
test('Module 2 opportunity notes enforce opportunity and author company ownership', () => {
  assert.match(repository, /opportunity:\s*\{ companyId: scope\.companyId \}/);
  assert.match(repository, /where: scope\.where\(\{ id: input\.opportunityId \}\)/);
  assert.match(repository, /id: input\.authorUserId, status: 'ACTIVE'/);
});

// Keep repository responsibilities limited to persistence; audit, outbox and transition rules belong to the service pass.
test('Module 2 repository does not contain service orchestration concerns', () => {
  assert.doesNotMatch(repository, /recordAudit|recordOutbox|withTransaction|INVALID_OPPORTUNITY_STAGE|client\.created|opportunity\.stage_changed/);
});


// Keep all current Module 2 write commands in one simple service with trusted permission checks.
test('Module 2 service implements client, contact and opportunity commands without extra service files', () => {
  for (const name of [
    'listClients',
    'getClient',
    'listOpportunities',
    'getOpportunity',
    'createClient',
    'updateClient',
    'archiveClient',
    'createClientContact',
    'createOpportunity',
    'changeOpportunityStage',
    'reopenOpportunity',
    'createOpportunityNote'
  ]) {
    assert.match(service, new RegExp(`async ${name}\\(`), name);
  }
  assert.match(service, /hasPermission/);
  assert.match(service, /requireActorUserId/);
  assert.match(service, /new AuthorizationError\(\)/);
});

// Keep client writes, audit records and outbox events atomic.
test('Module 2 client commands write audit and source events inside transactions', () => {
  assert.match(service, /withTransaction\(this\.db/);
  assert.match(service, /recordAudit\(tx/);
  assert.match(service, /recordOutboxEvent\(tx/);
  assert.match(service, /eventType: 'client\.created'/);
  assert.match(service, /eventType: 'client\.updated'/);
  assert.doesNotMatch(service, /eventType: 'client\.archived'/);
});

// Keep archive non-destructive and block new contacts on archived clients.
test('Module 2 archives clients without delete logic and blocks contacts for archived clients', () => {
  assert.match(service, /status: CLIENT_ARCHIVED/);
  assert.match(service, /client\.status !== CLIENT_ACTIVE/);
  assert.match(service, /createModule2Error\('CLIENT_IN_USE'\)/);
  assert.doesNotMatch(service, /deleteClient|\.delete\(/);
});

// Keep the source-required duplicate-primary behavior as a warning instead of silently demoting history.
test('Module 2 contact creation returns the duplicate-primary warning without demotion logic', () => {
  assert.match(service, /findPrimaryContact\(clientId\)/);
  assert.match(service, /DUPLICATE_PRIMARY_CONTACT/);
  assert.doesNotMatch(service, /demote|unsetPrimary|updatePrimary/);
});

// Keep database uniqueness as the final race guard for client codes.
test('Module 2 client service translates concurrent unique conflicts to the stable duplicate-code error', () => {
  assert.match(service, /error\.code === 'P2002'/);
  assert.match(service, /createModule2Error\('DUPLICATE_CLIENT_CODE'\)/);
});


// Keep opportunity creation server-owned at LEAD and validate both parent client and selected owner.
test('Module 2 opportunity creation requires an active client and active same-company owner', () => {
  assert.match(service, /async createOpportunity\([\s\S]*this\.requirePermission\('opportunities\.manage'\)/);
  assert.match(service, /findClientById\(input\.clientId\)/);
  assert.match(service, /client\.status !== CLIENT_ACTIVE/);
  assert.match(service, /findActiveUserById\(input\.ownerUserId\)/);
  assert.match(service, /stage: OPPORTUNITY_LEAD/);
  assert.match(service, /eventType: 'opportunity\.created'/);
  assert.match(service, /action: 'opportunity\.created'/);
});

// Keep the stage flow explicit and small instead of introducing a generic workflow engine.
test('Module 2 opportunity stage changes use the approved explicit transition map', () => {
  assert.match(service, /LEAD: Object\.freeze\(\['QUALIFIED', 'LOST'\]\)/);
  assert.match(service, /QUALIFIED: Object\.freeze\(\['TENDERING', 'LOST'\]\)/);
  assert.match(service, /TENDERING: Object\.freeze\(\['WON', 'LOST'\]\)/);
  assert.match(service, /WON: Object\.freeze\(\[\]\)/);
  assert.match(service, /LOST: Object\.freeze\(\[\]\)/);
  assert.match(service, /function canChangeOpportunityStage\(/);
  assert.doesNotMatch(service, /StateMachine|WorkflowEngine/);
});

// Keep stage updates concurrency-safe so two commands cannot both commit from one stale source stage.
test('Module 2 repository changes opportunity stage only from the expected current stage', () => {
  assert.match(repository, /async updateOpportunityStage\(id: string, expectedStage: string, targetStage: string\)/);
  assert.match(repository, /scope\.where\(\{ id, stage: expectedStage \}\)/);
  assert.match(service, /updateOpportunityStage\([\s\S]*before\.stage,[\s\S]*input\.targetStage/);
  assert.match(service, /if \(!updated\) throw createModule2Error\('INVALID_OPPORTUNITY_STAGE'\)/);
});

// Keep WON reopen explicit, reason-audited and on the existing stage-changed event contract.
test('Module 2 reopen allows only WON and records the reason without inventing a new event', () => {
  assert.match(service, /async reopenOpportunity\([\s\S]*before\.stage !== 'WON'/);
  assert.match(service, /action: 'opportunity\.reopened'/);
  assert.match(service, /reason: input\.reason/);
  assert.match(service, /eventType: 'opportunity\.stage_changed'/);
  assert.doesNotMatch(service, /eventType: 'opportunity\.reopened'/);
});

// Keep activity-note authors server-derived and avoid unsupported note events/audit noise.
test('Module 2 opportunity notes use the authenticated active actor and remain append-only', () => {
  assert.match(service, /const actorUserId = requireActorUserId\(\)/);
  assert.match(service, /findActiveUserById\(actorUserId\)/);
  assert.match(service, /createOpportunityNote\(\{[\s\S]*authorUserId: actorUserId/);
  assert.doesNotMatch(service, /eventType: 'opportunity\.note/);
  assert.doesNotMatch(repository, /updateOpportunityNote|deleteOpportunityNote/);
});

// Keep opportunity creation and stage changes atomic with their audit/outbox records.
test('Module 2 opportunity business changes keep audit and outbox in the owning transaction', () => {
  const opportunityService = service.slice(service.indexOf('async createOpportunity('));
  assert.match(opportunityService, /withTransaction\(this\.db/);
  assert.match(opportunityService, /recordAudit\(tx/);
  assert.match(opportunityService, /recordOutboxEvent\(tx/);
  assert.match(opportunityService, /eventType: 'opportunity\.created'/);
  assert.match(opportunityService, /eventType: 'opportunity\.stage_changed'/);
});


// Keep read orchestration simple while returning only Module-2-owned detail and summary data.
test('Module 2 read services provide bounded lists and scoped detail views', () => {
  assert.match(service, /async listClients\([\s\S]*this\.requirePermission\('clients\.read'\)/);
  assert.match(service, /async getClient\([\s\S]*listClientContacts\(clientId\)[\s\S]*countClientOpportunities\(clientId\)/);
  assert.match(service, /commercialSummary:\s*\{[\s\S]*opportunityCount/);
  assert.match(service, /async listOpportunities\([\s\S]*this\.requirePermission\('opportunities\.read'\)/);
  assert.match(service, /async getOpportunity\([\s\S]*listOpportunityNotes\(opportunityId\)/);
  assert.match(service, /const pageSize = input\.pageSize \?\? 25/);
});

// Keep the route surface exactly on the reviewed 12-route contract with no generic CRUD additions.
test('Module 2 Fastify routes expose exactly the reviewed HTTP surface', () => {
  const registered = [...routeSource.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .sort();

  const expected = [
    'GET /api/v1/clients',
    'POST /api/v1/clients',
    'GET /api/v1/clients/:id',
    'PATCH /api/v1/clients/:id',
    'POST /api/v1/clients/:id/contacts',
    'POST /api/v1/clients/:id/archive',
    'GET /api/v1/opportunities',
    'POST /api/v1/opportunities',
    'GET /api/v1/opportunities/:id',
    'POST /api/v1/opportunities/:id/change-stage',
    'POST /api/v1/opportunities/:id/notes',
    'POST /api/v1/opportunities/:id/reopen'
  ].sort();

  assert.deepEqual(registered, expected);
  assert.doesNotMatch(routeSource, /app\.delete\(/);
});

// Keep HTTP handlers thin: authenticate, check route permission, parse Zod, then call the service.
test('Module 2 routes authenticate and recheck stable permissions before service calls', () => {
  assert.match(routeSource, /authenticateRequest/);
  assert.match(routeSource, /function requireRoutePermission\(permission: Module2PermissionCode\)/);
  for (const permission of permissions) {
    assert.ok(routeSource.includes(`requireRoutePermission('${permission}')`), permission);
  }
  assert.match(routeSource, /function parseRequest</);
  assert.doesNotMatch(routeSource, /recordAudit|recordOutboxEvent|withTransaction|new ClientsRepository/);
});

// Keep the OpenAPI contract explicit for protected routes, pagination and server-owned request bodies.
test('Module 2 routes publish OpenAPI metadata without client-owned authority fields', () => {
  assert.match(routeSource, /security: BEARER_SECURITY/);
  assert.match(routeSource, /operationId: 'module2ListClients'/);
  assert.match(routeSource, /operationId: 'module2CreateOpportunity'/);
  assert.match(routeSource, /pageSize: \{ type: 'integer', minimum: 1, maximum: 100 \}/);
  assert.match(routeSource, /estimatedValue: \{ type: 'string', pattern:/);
  assert.doesNotMatch(routeSource, /\bcompanyId\s*:/);
  assert.doesNotMatch(routeSource, /\bactorUserId\s*:/);
  assert.doesNotMatch(routeSource, /\bprojectScope\s*:/);
});

// Keep the module registration public surface simple and wire it into Fastify only when a database exists.
test('Module 2 index exports the five layers and app.ts registers the routes', () => {
  assert.match(moduleIndex, /export \{ ClientsRepository \}/);
  assert.match(moduleIndex, /export \{ ClientsService \}/);
  assert.match(moduleIndex, /export \{ registerClientsRoutes \}/);
  assert.match(appSource, /import \{ registerClientsRoutes \} from '\.\/modules\/clients\/index\.js';/);
  assert.match(appSource, /app\.register\(registerClientsRoutes, \{ database: options\.database \}\);/);
});


// Keep one maintained live integration file that exercises repository, service and Fastify behavior together.
test('Module 2 has one focused live integration command and test file', () => {
  assert.equal(
    packageJson.scripts['test:integration:module-2'],
    'npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 tests/integration/module-2-api.integration.test.mjs'
  );
  assert.match(integrationSource, /Module 2 full API workflow persists CRM state, audit and outbox records/);
  assert.match(integrationSource, /Module 2 repository and service re-enforce company scope and permissions/);
});

// Keep live negative coverage for authentication, RBAC, company isolation and server-owned authority.
test('Module 2 integration coverage includes required negative security cases', () => {
  assert.match(integrationSource, /statusCode, 401/);
  assert.match(integrationSource, /statusCode, 403/);
  assert.match(integrationSource, /CLIENT_NOT_FOUND/);
  assert.match(integrationSource, /OPPORTUNITY_NOT_FOUND/);
  assert.match(integrationSource, /ownerUserId: ADMIN_B_ID/);
  assert.match(integrationSource, /companyId: COMPANY_B_ID/);
  assert.match(integrationSource, /stage: 'WON'/);
});

// Keep transaction/concurrency evidence around the database uniqueness and compare-and-set stage guards.
test('Module 2 integration coverage verifies single-commit behavior under concurrent commands', () => {
  assert.match(integrationSource, /Module 2 concurrent client and stage commands leave one committed business result/);
  assert.match(integrationSource, /\[201, 409\]/);
  assert.match(integrationSource, /\[200, 409\]/);
  assert.match(integrationSource, /eventType: 'client\.created'/);
  assert.match(integrationSource, /eventType: 'opportunity\.stage_changed'/);
});

// Keep database constraints as a second integrity boundary for tenant relationships and numeric/lifecycle rules.
test('Module 2 migration protects company relationships and critical values at PostgreSQL level', () => {
  for (const constraint of [
    'client_contacts_client_company_fkey',
    'opportunities_client_company_fkey',
    'opportunities_owner_company_fkey',
    'clients_credit_terms_nonnegative',
    'opportunities_estimated_value_nonnegative',
    'opportunities_probability_range',
    'opportunities_stage_allowed',
    'opportunity_notes_note_not_blank'
  ]) {
    assert.ok(migration.includes(constraint), constraint);
  }
});

// Keep the indexes used by tenant filtering, pipeline filters and activity-history reads explicit and reviewed.
test('Module 2 migration contains the reviewed company and pipeline indexes', () => {
  for (const indexName of [
    'clients_company_code_uq',
    'clients_company_status_idx',
    'clients_company_display_name_idx',
    'client_contacts_company_client_status_idx',
    'client_contacts_client_primary_status_idx',
    'opportunities_company_client_created_idx',
    'opportunities_company_stage_close_idx',
    'opportunities_company_owner_stage_idx',
    'opportunity_notes_opportunity_created_idx'
  ]) {
    assert.ok(migration.includes(indexName), indexName);
  }
});

// Keep one maintained integration suite responsible for the dedicated Module 2 security/integrity regression.
test('Module 2 integration coverage verifies authentication, safe errors and database integrity', () => {
  assert.match(integrationSource, /Module 2 security requires authentication on every protected CRM route/);
  assert.match(integrationSource, /AUTHENTICATION_REQUIRED/);
  assert.match(integrationSource, /assertSafePublicError/);
  assert.match(integrationSource, /Module 2 database constraints reject invalid values and cross-company relationships/);
  assert.match(integrationSource, /Module 2 database exposes the reviewed tenant\/filter indexes/);
  assert.match(integrationSource, /OPPORTUNITY_B_ID\), false/);
});


// Keep performance verification inside the maintained integration suite instead of adding another test framework.
test('Module 2 operational verification checks query plans, stable pagination and existing concurrency controls', () => {
  assert.match(integrationSource, /Module 2 operational queries use reviewed indexes and bounded stable pagination/);
  assert.match(integrationSource, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  for (const indexName of [
    'clients_company_code_uq',
    'clients_company_display_name_idx',
    'opportunities_company_stage_close_idx',
    'opportunities_company_owner_stage_idx',
    'opportunity_notes_opportunity_created_idx'
  ]) {
    assert.ok(integrationSource.includes(indexName), indexName);
  }
  assert.match(integrationSource, /firstClientPage/);
  assert.match(integrationSource, /secondClientPage/);
  assert.match(integrationSource, /firstOpportunityPage/);
  assert.match(integrationSource, /secondOpportunityPage/);
  assert.match(integrationSource, /Module 2 concurrent client and stage commands leave one committed business result/);
});

// Keep the React feature inside the reviewed api/hooks/components/pages structure without extra architecture folders.
test('Module 2 frontend keeps one API file, one hooks file, one page and focused client/opportunity components', async () => {
  assert.deepEqual((await readdir('apps/web/src/features/clients/api')).sort(), ['clients-api.ts']);
  assert.deepEqual((await readdir('apps/web/src/features/clients/hooks')).sort(), ['clients.ts']);
  assert.deepEqual((await readdir('apps/web/src/features/clients/components')).sort(), [
    'client-details-panel.tsx',
    'opportunity-pipeline.tsx'
  ]);
  assert.deepEqual((await readdir('apps/web/src/features/clients/pages')).sort(), ['clients-page.tsx']);
});

// Keep the browser API on the reviewed Module 2 surface without client-owned authority fields.
test('Module 2 browser API covers client/contact and opportunity workflows with server-owned authority', () => {
  for (const name of [
    'listClients',
    'getClient',
    'createClient',
    'updateClient',
    'createClientContact',
    'archiveClient',
    'listOpportunities',
    'getOpportunity',
    'createOpportunity',
    'changeOpportunityStage',
    'createOpportunityNote',
    'reopenOpportunity'
  ]) {
    assert.match(webApiSource, new RegExp(`export function ${name}\\(`), name);
  }
  assert.match(webApiSource, /type OpportunityStage = 'LEAD' \| 'QUALIFIED' \| 'TENDERING' \| 'WON' \| 'LOST'/);
  assert.match(webApiSource, /estimatedValue: string/);
  const createOpportunityType = webApiSource.slice(
    webApiSource.indexOf('export type CreateOpportunityInput'),
    webApiSource.indexOf('export type ReopenOpportunityInput')
  );
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'stage']) {
    assert.doesNotMatch(createOpportunityType, new RegExp(`\\b${field}\\b\\s*:`));
  }
});

// Keep TanStack Query ownership centralized in the small Module 2 hooks file.
test('Module 2 hooks refresh the right client and opportunity query families after mutations', () => {
  for (const name of [
    'useClients',
    'useClient',
    'useCreateClient',
    'useUpdateClient',
    'useCreateClientContact',
    'useArchiveClient',
    'useOpportunities',
    'useOpportunity',
    'useCreateOpportunity',
    'useChangeOpportunityStage',
    'useCreateOpportunityNote',
    'useReopenOpportunity'
  ]) {
    assert.match(webHooksSource, new RegExp(`export function ${name}\\(`), name);
  }
  assert.match(webHooksSource, /CLIENTS_QUERY_KEY/);
  assert.match(webHooksSource, /OPPORTUNITIES_QUERY_KEY/);
  assert.match(webHooksSource, /invalidateQueries\(\{ queryKey: OPPORTUNITIES_QUERY_KEY \}\)/);
});

// Keep client list/create UI permission-aware and server-paginated while allowing opportunity-only users into CRM.
test('Module 2 CRM page independently respects client and opportunity read permissions', () => {
  assert.match(webPageSource, /usePermission\('clients\.read'\)/);
  assert.match(webPageSource, /usePermission\('opportunities\.read'\)/);
  assert.match(webPageSource, /useClients\([\s\S]*canReadClients\)/);
  assert.match(webPageSource, /Search clients/);
  assert.match(webPageSource, /All statuses/);
  assert.match(webPageSource, /Create client/);
  assert.match(webPageSource, /Page \{page\} of \{pageCount\}/);
  assert.match(webPageSource, /canReadOpportunities && <OpportunityPipeline \/>/);
});

// Keep detail/edit/contact/archive actions behind clients.update and preserve archive as a command.
test('Module 2 client details expose contacts and update/archive actions only to allowed users', () => {
  assert.match(webDetailsSource, /usePermission\('clients\.update'\)/);
  assert.match(webDetailsSource, /Save client/);
  assert.match(webDetailsSource, /Add contact/);
  assert.match(webDetailsSource, /Archive client/);
  assert.match(webDetailsSource, /DUPLICATE_PRIMARY_CONTACT/);
  assert.match(webDetailsSource, /Archived clients remain available for history/);
});

// Keep opportunity pipeline filters, creation and selection on server state rather than a local workflow store.
test('Module 2 opportunity pipeline exposes creation, stage filters, ownership and server pagination', () => {
  assert.match(webOpportunitySource, /usePermission\('opportunities\.read'\)/);
  assert.match(webOpportunitySource, /usePermission\('opportunities\.manage'\)/);
  assert.match(webOpportunitySource, /useOpportunities\(/);
  assert.match(webOpportunitySource, /All stages/);
  assert.match(webOpportunitySource, /Owner user ID/);
  assert.match(webOpportunitySource, /Create opportunity/);
  assert.match(webOpportunitySource, /estimatedValue: '0\.00'/);
  assert.match(webOpportunitySource, /Page \{page\} of \{pageCount\}/);
  assert.doesNotMatch(webOpportunitySource, /companyId|projectScope/);
});

// Keep stage actions explicit and small while the API remains authoritative for transition validation.
test('Module 2 opportunity UI uses the reviewed simple stage map and explicit WON reopen command', () => {
  assert.match(webOpportunitySource, /function getNormalStageTargets\(/);
  assert.match(webOpportunitySource, /case 'LEAD':[\s\S]*\['QUALIFIED', 'LOST'\]/);
  assert.match(webOpportunitySource, /case 'QUALIFIED':[\s\S]*\['TENDERING', 'LOST'\]/);
  assert.match(webOpportunitySource, /case 'TENDERING':[\s\S]*\['WON', 'LOST'\]/);
  assert.match(webOpportunitySource, /Reopen won opportunity/);
  assert.match(webOpportunitySource, /Reopen opportunity/);
  assert.doesNotMatch(webOpportunitySource, /WorkflowEngine|StateMachine/);
});

// Keep activity notes append-only in the UI with no edit/delete controls.
test('Module 2 opportunity detail shows append-only activity notes and authenticated-author behavior', () => {
  assert.match(webOpportunitySource, /Activity notes/);
  assert.match(webOpportunitySource, /Add activity note/);
  assert.match(webOpportunitySource, /useCreateOpportunityNote/);
  assert.doesNotMatch(webOpportunitySource, /Edit note|Delete note|updateOpportunityNote|deleteOpportunityNote/);
});

// Keep CRM navigation available to either client-read or opportunity-read users.
test('workspace shell exposes CRM through the stable Module 2 read permissions', () => {
  assert.match(adminShellSource, /const canReadClients = usePermission\('clients\.read'\)/);
  assert.match(adminShellSource, /const canReadOpportunities = usePermission\('opportunities\.read'\)/);
  assert.match(adminShellSource, /const canUseCrm = canReadClients \|\| canReadOpportunities/);
  assert.match(adminShellSource, /canUseCrm && \([\s\S]*>CRM & Clients<\/button>/);
  assert.match(adminShellSource, /activeView === 'clients' && \([\s\S]*<ClientsPage/);
});


// Keep one real browser workflow for the complete Module 2 client/contact/opportunity journey.
test('Module 2 Playwright covers the approved CRM workflow and permission-aware UI', () => {
  assert.equal(
    packageJson.scripts['test:e2e:module-2'],
    'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs'
  );
  for (const value of [
    'Create client',
    'Add contact',
    'Save client',
    'Create opportunity',
    'Move to QUALIFIED',
    'Move to TENDERING',
    'Move to WON',
    'Add note',
    'Reopen opportunity',
    'Apply filters'
  ]) {
    assert.ok(browserE2eSource.includes(value), value);
  }
});

// Keep browser acceptance evidence for hidden controls, API denial and opportunity-only navigation.
test('Module 2 Playwright verifies permissions beyond visual button hiding', () => {
  assert.match(browserE2eSource, /forbiddenStageChange\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserE2eSource, /OPPORTUNITY_READER_EMAIL/);
  assert.match(browserE2eSource, /NO_ACCESS_EMAIL/);
  assert.match(browserE2eSource, /getByRole\('heading', \{ name: 'No module access' \}\)/);
  assert.match(browserE2eSource, /request\.pathname\.startsWith\('\/api\/v1\/clients'\)/);
});

// Keep browser request bodies free of server-owned authority and lifecycle fields.
test('Module 2 Playwright checks browser-owned request boundaries', () => {
  assert.match(browserE2eSource, /function assertServerOwnedAuthority\(requests\)/);
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope']) {
    assert.ok(browserE2eSource.includes(`'${field}'`), field);
  }
  assert.match(browserE2eSource, /createOpportunityRequest\.body\)\.not\.toHaveProperty\('stage'\)/);
  assert.match(browserE2eSource, /createClientRequest\.body\)\.not\.toHaveProperty\('status'\)/);
});

// Keep Playwright able to select exactly the Module 2 browser suite without running another stage suite.
test('Playwright config supports the isolated Module 2 browser mode', () => {
  assert.match(playwrightConfigSource, /RUN_MODULE_2_E2E/);
  assert.match(playwrightConfigSource, /module-2-browser\.spec\.mjs/);
  assert.match(playwrightConfigSource, /enabledModuleCount !== 1/);
});


// Keep Stage 4 closure on one reviewed static/live gate instead of pass-specific acceptance scripts.
test('Module 2 exposes one consolidated Stage-4 acceptance gate', () => {
  assert.equal(packageJson.scripts['module-2:gate'], 'node scripts/module-2/verify-stage-4.mjs --mode=static');
  assert.equal(packageJson.scripts['module-2:gate:live'], 'node scripts/module-2/verify-stage-4.mjs --mode=live');
  assert.equal(packageJson.scripts['module-2:acceptance:live'], 'node scripts/module-2/run-live-acceptance.mjs');
  assert.match(module2GateSource, /STAGE_4_ACCEPTED_READY_FOR_STAGE_5/);
  assert.match(module2GateSource, /Module 3 - Tendering & Estimation/);
});

// Keep the live Module 2 gate blocked until the prerequisite shared stages are genuinely accepted.
test('Module 2 live acceptance requires accepted Module 22 Stage-3 evidence', () => {
  assert.match(module2GateSource, /STAGE_3_ACCEPTED_READY_FOR_STAGE_4/);
  assert.match(module2GateSource, /STAGE_3_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(module2LiveRunnerSource, /module-22-evidence\/stage-3-live\.json/);
  assert.match(module2LiveRunnerSource, /module-22:acceptance:live/);
});

// Keep final live acceptance on the existing migration, integration and browser workflows rather than another test framework.
test('Module 2 final live gate reuses the reviewed build, database, integration and Playwright commands', () => {
  for (const value of [
    "['typecheck', 'npm', ['run', 'typecheck']]",
    "['lint', 'npm', ['run', 'lint']]",
    "['prisma-validate', 'npm', ['run', 'db:validate']]",
    "['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']]",
    "['module-2-repository-service-api-integration', 'npm', ['run', 'test:integration:module-2']]",
    "['module-2-browser-workflow', 'npm', ['run', 'test:e2e:module-2']]"
  ]) {
    assert.ok(module2GateSource.includes(value), value);
  }
  assert.match(module2GateSource, /RUN_MODULE_2_E2E/);
  assert.match(module2GateSource, /validateTestDatabaseEnvironment/);
});

// Keep Stage 4 ownership limited to CRM records until later Tender, Project, Billing and Finance owners exist.
test('Module 2 final schema still defers future-module relationships', () => {
  const clientSection = prismaSchemaSource.slice(
    prismaSchemaSource.indexOf('model Client {'),
    prismaSchemaSource.indexOf('model ClientContact {')
  );
  const opportunitySection = prismaSchemaSource.slice(
    prismaSchemaSource.indexOf('model Opportunity {'),
    prismaSchemaSource.indexOf('model OpportunityNote {')
  );

  for (const field of ['tenderId', 'projectId', 'clientInvoiceId', 'accountsReceivableId']) {
    assert.doesNotMatch(clientSection, new RegExp(`\\b${field}\\b`));
    assert.doesNotMatch(opportunitySection, new RegExp(`\\b${field}\\b`));
  }
});


// Pass 171 closes the CRM minimum-UI downstream links using existing Tender/Project list filters only.
test('Pass 171 links Client detail to authorized Tender and Project registers without new CRM APIs', () => {
  assert.match(webDetailsSource, /useTenders\([\s\S]*clientId: client\.id[\s\S]*pageSize: 5/);
  assert.match(webDetailsSource, /useProjects\([\s\S]*clientId: client\.id[\s\S]*pageSize: 5/);
  assert.match(webDetailsSource, /Open Client Tenders/);
  assert.match(webDetailsSource, /Open Client Projects/);
  assert.match(webDetailsSource, /Each target module still applies its own server authorization/);
  assert.match(adminShellSource, /function showClientTenders\(clientId: string\)/);
  assert.match(adminShellSource, /function showClientProjects\(clientId: string\)/);
  assert.match(adminShellSource, /<TendersPage[\s\S]*initialClientId=\{linkedClientId\}/);
  assert.match(adminShellSource, /<ProjectsPage[\s\S]*initialClientId=\{linkedClientId\}/);
  assert.match(webTendersPageSource, /initialClientId[\s\S]*clientId \? \{ clientId \}/);
  assert.match(webProjectsPageSource, /initialClientId[\s\S]*clientId \? \{ clientId \}/);
  assert.doesNotMatch(webApiSource, /listClientTenders|listClientProjects|client-links/);
});
