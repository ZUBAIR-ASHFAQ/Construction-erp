import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/projects/STAGE-7-MODULE-5-CONTRACT.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const contractGate = await readFile('scripts/module-5/verify-stage-7-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-5/verify-stage-7-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-5/verify-stage-7-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-5/verify-stage-7-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-5/verify-stage-7-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-5/verify-stage-7-http.mjs', 'utf8');
const integrationGate = await readFile('scripts/module-5/verify-stage-7-integration.mjs', 'utf8');
const securityGate = await readFile('scripts/module-5/verify-stage-7-security.mjs', 'utf8');
const apiContractGate = await readFile('scripts/module-5/verify-stage-7-api-contract.mjs', 'utf8');
const reactRegisterGate = await readFile('scripts/module-5/verify-stage-7-react-register.mjs', 'utf8');
const reactWorkflowGate = await readFile('scripts/module-5/verify-stage-7-react-workflow.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-5/verify-stage-7-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-5/verify-stage-7-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-5/verify-stage-7.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-5-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const integration = await readFile('tests/integration/module-5-api.integration.test.mjs', 'utf8');
const schema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/projects/projects.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/projects/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const projectsApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const projectsHooks = await readFile('apps/web/src/features/projects/hooks/projects.ts', 'utf8');
const projectDetailsPanel = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');
const projectsPage = await readFile('apps/web/src/features/projects/pages/projects-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260823000400_module_5_project_management_core/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

const stage7Routes = [
  'GET   /api/v1/projects',
  'POST  /api/v1/projects',
  'GET   /api/v1/projects/:id',
  'PATCH /api/v1/projects/:id',
  'POST  /api/v1/projects/:id/activate',
  'POST  /api/v1/projects/:id/complete',
  'POST  /api/v1/projects/:id/close'
];
const permissions = [
  'projects.read',
  'projects.create',
  'projects.update',
  'projects.manage_members',
  'projects.activate',
  'projects.close'
];
const errors = [
  'PROJECT_NOT_FOUND',
  'DUPLICATE_PROJECT_CODE',
  'PROJECT_SCOPE_FORBIDDEN',
  'PROJECT_NOT_READY_TO_CLOSE',
  'INVALID_PROJECT_STATUS_TRANSITION'
];

// Keep Project Management at Stage 7 and preserve the corrected handoff to Module 24B.
test('Module 5 contract follows the corrected Stage-7 dependency order', () => {
  assert.match(contract, /Stage 6 — Module 4A BOQ Commercial Core/);
  assert.match(contract, /Stage 8 — Module 24B Project Scope Activation/);
  assert.match(contract, /Module 6 WBS & Cost Codes follows/);
  assert.match(contract, /Module 4B BOQ Project Mapping/);
});

// Keep Stage 7 ownership to the Project master and lifecycle history only.
test('Module 5 contract owns Project master and status history while deferring membership', () => {
  assert.match(contract, /projects\nproject_status_history/);
  assert.match(contract, /project_members/);
  assert.match(contract, /project_members[\s\S]*Stage 8 — Module 24B/);
  assert.match(contract, /project-scoped authorization activation/);
});

// Keep the Stage-7 HTTP surface to seven Project operations and defer the Appendix membership route.
test('Module 5 contract freezes seven Stage-7 routes without generic CRUD or premature membership', () => {
  for (const route of stage7Routes) assert.ok(contract.includes(route), route);
  assert.match(contract, /PUT \/api\/v1\/projects\/:id\/members/);
  assert.match(contract, /reserved for Stage 8/);
  assert.match(contract, /DELETE \/api\/v1\/projects\/:id/);
  assert.match(contract, /POST\s+\/api\/v1\/projects\/:id\/suspend/);
  assert.match(contract, /must therefore \*\*not invent\*\* a suspend or resume route/);
});

// Preserve the source permission vocabulary without inventing a projects.complete permission.
test('Module 5 contract freezes source permissions and gives completion existing close authority', () => {
  for (const permission of permissions) assert.ok(contract.includes(permission), permission);
  assert.match(contract, /projects\.close\s+-> complete and close lifecycle commands/);
  assert.match(contract, /defines no separate `projects\.complete` permission/);
});

// Keep the five Appendix Project business errors stable.
test('Module 5 contract freezes the reviewed Project business errors', () => {
  for (const errorCode of errors) assert.ok(contract.includes(errorCode), errorCode);
});

// Keep Project ownership, valid master references and lifecycle state server-controlled.
test('Module 5 contract freezes Project master invariants and server-owned authority', () => {
  assert.match(contract, /active same-company Client/);
  assert.match(contract, /same-company `WON` Tender/);
  assert.match(contract, /active same-company Project Manager user/);
  assert.match(contract, /plannedEndDate >= startDate/);
  assert.match(contract, /companyId[\s\S]*actorUserId[\s\S]*permissions[\s\S]*projectScope[\s\S]*status/);
  assert.match(contract, /DRAFT[\s\S]*ACTIVE[\s\S]*COMPLETED[\s\S]*CLOSED/);
});

// Defer member events but keep Stage-7 lifecycle events explicit.
test('Module 5 contract emits only Stage-7 Project lifecycle events', () => {
  for (const eventName of ['project.created', 'project.activated', 'project.completed', 'project.closed']) {
    assert.ok(contract.includes(eventName), eventName);
  }
  assert.match(contract, /project\.member_changed[\s\S]*reserved for Stage 8/);
});

// Keep the frozen Stage-7 contract guarded while Pass 142 completes the reviewed HTTP boundary.
test('Module 5 contract gate still requires genuine Stage-6 live acceptance', async () => {
  assert.equal(rootPackage.scripts['module-5:contract:gate'], 'node scripts/module-5/verify-stage-7-contract.mjs');
  assert.match(contractGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(contractGate, /STAGE_7_CONTRACT_FROZEN_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(contractGate, /runtimeImplementationAllowed: passed && stage6LiveAccepted/);
  assert.doesNotMatch(migration, /CREATE TABLE "project_members"/);
  await access('apps/api/src/modules/projects/projects.schema.ts');
  await access('apps/api/src/modules/projects/projects.repository.ts');
  await access('apps/api/src/modules/projects/projects.service.ts');
  await access('apps/api/src/modules/projects/projects.routes.ts');
  await access('apps/api/src/modules/projects/index.ts');
});

// Keep the Module 5 migration limited to Project master/lifecycle ownership even after Module 24B adds later persistence.
test('Module 5 migration remains limited to Stage-7 Project persistence', () => {
  assert.match(prisma, /model Project \{/);
  assert.match(prisma, /model ProjectStatusHistory \{/);
  assert.doesNotMatch(migration, /CREATE TABLE "project_members"/);
  assert.match(prisma, /@@unique\(\[companyId, projectCode\], map: "projects_company_project_code_uq"\)/);
  assert.match(prisma, /@@unique\(\[id, companyId\], map: "projects_id_company_uq"\)/);
});

// Keep normal Project ownership references company-safe at the database boundary.
test('Module 5 migration enforces same-company Client, Tender and Project Manager references', () => {
  assert.match(migration, /CONSTRAINT "projects_company_id_fkey"/);
  assert.match(migration, /FOREIGN KEY \("client_id", "company_id"\)[\s\S]*REFERENCES "clients"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("tender_id", "company_id"\)[\s\S]*REFERENCES "tenders"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("project_manager_user_id", "company_id"\)[\s\S]*REFERENCES "users"\("id", "company_id"\)/);
});

// Keep Project lifecycle values, dates and currency structurally valid before service logic exists.
test('Module 5 migration hardens Project dates, currency and lifecycle values', () => {
  assert.match(migration, /projects_currency_format/);
  assert.match(migration, /projects_dates_valid/);
  assert.match(migration, /"planned_end_date" >= "start_date"/);
  assert.match(migration, /projects_status_allowed/);
  for (const status of ['DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED']) assert.ok(migration.includes(`'${status}'`));
});

// Keep lifecycle history append-ready with valid status values and direct actor/project references.
test('Module 5 migration creates constrained Project lifecycle history', () => {
  assert.match(migration, /CREATE TABLE "project_status_history"/);
  assert.match(migration, /project_status_history_from_status_allowed/);
  assert.match(migration, /project_status_history_to_status_allowed/);
  assert.match(migration, /project_status_history_status_changed/);
  assert.match(migration, /CONSTRAINT "project_status_history_project_id_fkey"/);
  assert.match(migration, /CONSTRAINT "project_status_history_changed_by_fkey"/);
});

// Keep Stage-7 register/lookups backed by reviewed Project indexes without adding membership persistence.
test('Module 5 migration adds the reviewed Project lookup indexes and no project_members table', () => {
  for (const indexName of [
    'projects_company_status_planned_end_idx',
    'projects_company_client_status_idx',
    'projects_company_tender_idx',
    'projects_company_manager_status_idx',
    'project_status_history_project_changed_idx'
  ]) assert.ok(migration.includes(indexName), indexName);
  assert.doesNotMatch(migration, /CREATE TABLE "project_members"/);
});

// Keep Pass 138 registered as one reviewed migration gate and gated by Stage-6 live acceptance.
test('Module 5 persistence is registered as the Stage-7 migration gate', () => {
  const gate = migrationGates.gates.find((item) => item.gate === 'module-5-project-management-core-persistence');
  assert.ok(gate);
  assert.equal(gate.stage, 7);
  assert.deepEqual(gate.migrations, ['20260823000400_module_5_project_management_core']);
  assert.equal(rootPackage.scripts['module-5:persistence:gate'], 'node scripts/module-5/verify-stage-7-persistence.mjs');
  assert.match(persistenceGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(persistenceGate, /STAGE_7_PERSISTENCE_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(persistenceGate, /runtimeDeploymentAllowed: passed && stage6LiveAccepted/);
});

// Keep Pass 139 limited to the one required schema source file before repository/service/routes exist.
test('Module 5 Pass 139 adds only the reviewed Zod boundary file', () => {
  assert.match(schema, /MODULE_5_PERMISSION_CODES/);
  assert.match(schema, /MODULE_5_ERROR_CODES/);
  assert.match(schema, /MODULE_5_EVENT_TYPES/);
  assert.match(schema, /MODULE_5_HTTP_ROUTES/);
  assert.match(schema, /export function createModule5Error/);
});

// Keep exactly seven Stage-7 Project routes while membership remains deferred to Module 24B.
test('Module 5 Zod contract preserves the Stage-7 HTTP and membership boundary', () => {
  for (const route of [
    '/api/v1/projects',
    '/api/v1/projects/:id',
    '/api/v1/projects/:id/activate',
    '/api/v1/projects/:id/complete',
    '/api/v1/projects/:id/close'
  ]) assert.ok(schema.includes(route), route);
  const routeSection = schema.slice(schema.indexOf('export const MODULE_5_HTTP_ROUTES'), schema.indexOf('/** Pass 366 adds only'));
  const repairRouteSection = schema.slice(schema.indexOf('export const MODULE_5_PASS_366_HTTP_ROUTES'), schema.indexOf('/** Stage-8 activates only'));
  assert.equal((routeSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 7);
  assert.equal((repairRouteSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 2);
  assert.match(repairRouteSection, /\/api\/v1\/projects\/:id\/suspend/);
  assert.match(repairRouteSection, /\/api\/v1\/projects\/:id\/resume/);
  assert.match(schema, /MODULE_24B_HTTP_ROUTES[\s\S]*\/api\/v1\/projects\/:id\/members/);
  assert.doesNotMatch(routeSection, /\/api\/v1\/projects\/:id\/members/);
  assert.match(schema, /project\.member_changed/);
  assert.match(contract, /project\.member_changed[\s\S]*reserved for Module 24B/);
});

// Keep server-owned Project lifecycle and authorization fields out of every client command.
test('Module 5 request schemas reject server-owned authority fields by strict shape', () => {
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'status',
    'statusHistory', 'changedBy', 'createdAt', 'updatedAt'
  ]) assert.match(schema, new RegExp(`'${field}'`), field);

  const createSection = schema.slice(schema.indexOf('export const createProjectBodySchema'), schema.indexOf('/** Update only normal editable'));
  const updateSection = schema.slice(schema.indexOf('export const updateProjectBodySchema'), schema.indexOf('/** Activation is an explicit'));
  assert.match(createSection, /projectCode:/);
  assert.doesNotMatch(updateSection, /projectCode:/);
  for (const forbidden of ['companyId:', 'actorUserId:', 'permissions:', 'projectScope:', 'status:', 'changedBy:']) {
    assert.doesNotMatch(createSection, new RegExp(forbidden));
    assert.doesNotMatch(updateSection, new RegExp(forbidden));
  }
});

// Keep Project dates, pagination and lifecycle commands bounded at the API boundary.
test('Module 5 Zod contract validates dates, pagination and explicit lifecycle command bodies', () => {
  assert.match(schema, /MODULE_5_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /plannedEndDate cannot precede startDate/);
  assert.match(schema, /activateProjectBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /completeProjectBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /closeProjectBodySchema = z\.object\(\{[\s\S]*reason:[\s\S]*\}\)\.strict\(\)/);
  assert.match(contract, /one-date PATCH against the stored other date/);
});

// Keep safe output DTOs sufficient for the Project register/detail without inventing another history route.
test('Module 5 Pass 139 freezes safe Project and status-history response DTOs', () => {
  assert.match(schema, /projectResponseSchema/);
  assert.match(schema, /projectStatusHistoryResponseSchema/);
  assert.match(schema, /listProjectsResponseSchema/);
  assert.match(schema, /projectDetailsResponseSchema/);
  const responseSection = schema.slice(schema.indexOf('export const projectResponseSchema'), schema.indexOf('const MODULE_5_ERROR_MESSAGES'));
  assert.doesNotMatch(responseSection, /companyId:/);
  assert.match(contract, /Project detail includes append-only `statusHistory`/);
});

// Keep Project business errors mapped to stable shared public error classes.
test('Module 5 Pass 139 maps the five reviewed business errors without leaking internal errors', () => {
  for (const errorCode of errors) assert.ok(schema.includes(errorCode), errorCode);
  assert.match(schema, /PROJECT_NOT_FOUND:[\s\S]*NotFoundError/);
  assert.match(schema, /PROJECT_SCOPE_FORBIDDEN:[\s\S]*AuthorizationError/);
  assert.match(schema, /DUPLICATE_PROJECT_CODE:[\s\S]*ConflictError/);
  assert.match(schema, /PROJECT_NOT_READY_TO_CLOSE:[\s\S]*ConflictError/);
  assert.match(schema, /INVALID_PROJECT_STATUS_TRANSITION:[\s\S]*ConflictError/);
});

// Keep Pass 139 evidence honest while Stage 6 still lacks genuine live acceptance.
test('Module 5 schema gate is maintained without promoting static Stage-6 evidence', () => {
  assert.equal(rootPackage.scripts['module-5:schema:gate'], 'node scripts/module-5/verify-stage-7-schema.mjs');
  assert.match(schemaGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(schemaGate, /STAGE_7_SCHEMA_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && stage6LiveAccepted/);
  assert.match(contract, /Pass-139 Zod boundary preparation status/);
});



// Keep the Stage-7 five-file backend complete after Pass 142 without adding membership runtime.
test('Module 5 Pass 142 completes the reviewed five-file Project backend', async () => {
  assert.match(repository, /export class ProjectsRepository/);
  assert.match(service, /export class ProjectsService/);
  await access('apps/api/src/modules/projects/projects.routes.ts');
  await access('apps/api/src/modules/projects/index.ts');
});

// Keep every Project-master read/write anchored to the authenticated company rather than caller ownership data.
test('Module 5 repository derives company scope from trusted request context', () => {
  assert.match(repository, /const scope = requireCompanyRepositoryScope\(\)/);
  for (const method of [
    'listProjects', 'findProjectById', 'findProjectByCode', 'findProjectByTenderId',
    'findClientById', 'findTenderById', 'findProjectManagerById', 'createProject',
    'updateProject', 'lockProjectForWrite', 'transitionProjectStatus'
  ]) assert.match(repository, new RegExp(`async ${method}\\(`), method);
  assert.doesNotMatch(repository, /companyId\s*:\s*string/);
  assert.match(repository, /company_id = \$\{scope\.companyId\}::uuid/);
});

// Keep Project register persistence bounded and aligned with the reviewed Stage-7 filters.
test('Module 5 repository implements bounded Project register filters and matching total', () => {
  assert.match(repository, /MODULE_5_MAX_PAGE_SIZE/);
  assert.match(repository, /Repository skip must be a non-negative integer/);
  assert.match(repository, /Repository take must be between 1 and/);
  for (const filter of ['clientId', 'tenderId', 'status']) assert.match(repository, new RegExp(`input\\.${filter}`), filter);
  assert.match(repository, /projectCode:[\s\S]*contains: search/);
  assert.match(repository, /name:[\s\S]*contains: search/);
  assert.match(repository, /this\.db\.project\.count\(\{ where \}\)/);
});

// Keep related-record validation lookups same-company and leave lifecycle checks for the service.
test('Module 5 repository exposes only same-company Client, Tender and active manager lookups', () => {
  assert.match(repository, /async findClientById[\s\S]*scope\.where\(\{ id: clientId \}\)/);
  assert.match(repository, /async findTenderById[\s\S]*scope\.where\(\{ id: tenderId \}\)/);
  assert.match(repository, /async findProjectManagerById[\s\S]*scope\.where\(\{ id: userId, status: 'ACTIVE' \}\)/);
  assert.doesNotMatch(repository, /status:\s*'WON'[\s\S]*findTenderById/);
  assert.match(contract, /optional same-company `WON` Tender/);
});

// Keep creation/update fields separate from lifecycle status changes and Project code ownership.
test('Module 5 repository separates master updates from lifecycle transitions', () => {
  const updateSection = repository.slice(repository.indexOf('async updateProject('), repository.indexOf('/** Lock one company-owned Project'));
  assert.doesNotMatch(updateSection, /projectCode/);
  assert.doesNotMatch(updateSection, /status:/);
  assert.doesNotMatch(updateSection, /companyId/);
  assert.match(repository, /async transitionProjectStatus\(projectId: string, expectedStatus: string, targetStatus: string\)/);
  assert.match(repository, /where: scope\.where\(\{ id: projectId, status: expectedStatus \}\)/);
});

// Keep lifecycle history append-only and reachable only through a company-owned Project.
test('Module 5 repository scopes lifecycle history through its parent Project', () => {
  assert.match(repository, /async listProjectStatusHistory[\s\S]*project: \{ companyId: scope\.companyId \}/);
  assert.match(repository, /async createProjectStatusHistory/);
  assert.match(repository, /this\.db\.project\.findFirst\([\s\S]*scope\.where\(\{ id: input\.projectId \}\)/);
  assert.match(repository, /this\.db\.projectStatusHistory\.create/);
  assert.doesNotMatch(repository, /projectStatusHistory\.update/);
  assert.doesNotMatch(repository, /projectStatusHistory\.delete/);
});

// Keep the Module-3 one-primary-Project rule supportable without adding split-award behavior in Stage 7.
test('Module 5 repository can detect an existing same-company Project for a Tender', () => {
  assert.match(repository, /async findProjectByTenderId\(tenderId: string\)/);
  assert.match(repository, /where: scope\.where\(\{ tenderId \}\)/);
  assert.match(contract, /Pass 140 keeps a same-company Tender-to-Project lookup/);
});

// Keep Pass 140 evidence honest while Stage 6 still lacks genuine live acceptance.
test('Module 5 repository gate is maintained without promoting static Stage-6 evidence', () => {
  assert.equal(rootPackage.scripts['module-5:repository:gate'], 'node scripts/module-5/verify-stage-7-repository.mjs');
  assert.match(repositoryGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(repositoryGate, /STAGE_7_REPOSITORY_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage6LiveAccepted/);
  assert.match(contract, /Pass-140 repository preparation status/);
});

// Keep the seven Stage-7 Project master workflows intact while Module 24B adds only its reviewed membership command.
test('Module 5 service preserves the reviewed Project master workflows', () => {
  for (const method of [
    'listProjects', 'getProject', 'createProject', 'updateProject',
    'activateProject', 'suspendProject', 'resumeProject', 'completeProject', 'closeProject'
  ]) assert.match(service, new RegExp(`async ${method}\\(`), method);
  assert.doesNotMatch(service, /addProjectMember|updateProjectMember|removeProjectMember|reopenProject/);
});

// Keep creation and activation dependent on active same-company Client/manager and optional WON Tender.
test('Module 5 service validates active Project references and the one-primary-Project Tender rule', () => {
  assert.match(service, /client\.status !== CLIENT_ACTIVE/);
  assert.match(service, /findProjectManagerById/);
  assert.match(service, /tender\.status !== TENDER_WON/);
  assert.match(repository, /async lockTenderForProjectLink\(tenderId: string\)/);
  assert.match(repository, /FROM tenders[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(service, /findProjectByTenderId\(tenderId\)/);
  assert.match(service, /already linked to its primary Project/);
});

// Keep Project dates valid when PATCH changes only one side of the stored date range.
test('Module 5 service validates merged stored and PATCH dates before updating', () => {
  assert.match(service, /const nextStartDate = input\.startDate[\s\S]*: before\.startDate/);
  assert.match(service, /const nextPlannedEndDate = input\.plannedEndDate[\s\S]*: before\.plannedEndDate/);
  assert.match(service, /assertValidDateRange\(nextStartDate, nextPlannedEndDate\)/);
});

// Keep ordinary master updates away from closed Projects and away from lifecycle status ownership.
test('Module 5 service blocks normal closed-Project updates and never writes status through master update', () => {
  const updateSection = service.slice(service.indexOf('async updateProject('), service.indexOf('/** Replace one Project\'s complete membership set'));
  assert.match(updateSection, /locked\.status === PROJECT_CLOSED/);
  assert.match(updateSection, /INVALID_PROJECT_STATUS_TRANSITION/);
  assert.doesNotMatch(updateSection, /status:\s*PROJECT_/);
  assert.doesNotMatch(updateSection, /projectCode:/);
});

// Keep lifecycle transitions explicit, serialized and retry-safe without duplicate side effects.
test('Module 5 service preserves the original lifecycle and the Pass-366 ACTIVE/SUSPENDED branch', () => {
  assert.match(service, /PROJECT_DRAFT[\s\S]*PROJECT_ACTIVE[\s\S]*PROJECT_SUSPENDED[\s\S]*PROJECT_COMPLETED[\s\S]*PROJECT_CLOSED/);
  assert.match(service, /lockProjectForWrite/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_DRAFT, PROJECT_ACTIVE\)/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_ACTIVE, PROJECT_SUSPENDED\)/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_SUSPENDED, PROJECT_ACTIVE\)/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_ACTIVE, PROJECT_COMPLETED\)/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_COMPLETED, PROJECT_CLOSED\)/);
  assert.match(service, /if \(before\.status === PROJECT_SUSPENDED\) return before/);
  assert.match(service, /if \(before\.status === PROJECT_ACTIVE\) return before/);
  assert.match(service, /if \(before\.status === PROJECT_COMPLETED\) return before/);
  assert.match(service, /if \(before\.status === PROJECT_CLOSED\) return before/);
});

// Keep Project creation, lifecycle history, audit and approved outbox events inside transactions.
test('Module 5 service records lifecycle history, audit and only the approved Stage-7 events', () => {
  for (const eventName of ['project.created', 'project.activated', 'project.completed', 'project.closed']) {
    assert.match(service, new RegExp(`eventType: '${eventName.replace('.', '\\.')}'`), eventName);
  }
  for (const auditAction of ['project.created', 'project.updated', 'project.activated', 'project.suspended', 'project.resumed', 'project.completed', 'project.closed']) {
    assert.match(service, new RegExp(`action: '${auditAction.replace('.', '\\.')}'`), auditAction);
  }
  assert.match(service, /fromStatus: null,[\s\S]*toStatus: PROJECT_DRAFT/);
  assert.match(service, /fromStatus: PROJECT_DRAFT,[\s\S]*toStatus: PROJECT_ACTIVE/);
  assert.match(service, /fromStatus: PROJECT_ACTIVE,[\s\S]*toStatus: PROJECT_SUSPENDED/);
  assert.match(service, /fromStatus: PROJECT_SUSPENDED,[\s\S]*toStatus: PROJECT_ACTIVE/);
  assert.match(service, /fromStatus: PROJECT_ACTIVE,[\s\S]*toStatus: PROJECT_COMPLETED/);
  assert.match(service, /fromStatus: PROJECT_COMPLETED,[\s\S]*toStatus: PROJECT_CLOSED/);
  assert.doesNotMatch(service, /eventType: 'project\.updated'/);
  assert.doesNotMatch(service, /eventType: 'project\.(?:suspended|resumed)'/);
});

// Keep close blockers pluggable without inventing future finance or operational tables early.
test('Module 5 service uses a small close-readiness hook and stable close blocker error', () => {
  assert.match(service, /closeReadinessCheck\?: ProjectCloseReadinessCheck/);
  assert.match(service, /this\.closeReadinessCheck && !\(await this\.closeReadinessCheck\(tx, projectId\)\)/);
  assert.match(service, /PROJECT_NOT_READY_TO_CLOSE/);
  assert.doesNotMatch(service, /budget|journal|procurement|invoice|wbs_node/i);
});

// Keep Pass 141 evidence honest while Module 4A live Stage-6 acceptance is still blocked.
test('Module 5 service gate is maintained without promoting static Stage-6 evidence', () => {
  assert.equal(rootPackage.scripts['module-5:service:gate'], 'node scripts/module-5/verify-stage-7-service.mjs');
  assert.match(serviceGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(serviceGate, /STAGE_7_SERVICE_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && stage6LiveAccepted/);
  assert.match(contract, /Pass-141 service preparation status/);
});


// Keep all seven Stage-7 Project operations intact while Module 24B adds only its reviewed membership command.
test('Module 5 Pass 142 routes remain intact after Module 24B membership activation', () => {
  assert.match(routes, /export async function registerProjectsRoutes/);
  for (const [method, route] of [
    ['get', '/api/v1/projects'],
    ['post', '/api/v1/projects'],
    ['get', '/api/v1/projects/:id'],
    ['patch', '/api/v1/projects/:id'],
    ['post', '/api/v1/projects/:id/activate'],
    ['post', '/api/v1/projects/:id/complete'],
    ['post', '/api/v1/projects/:id/close']
  ]) assert.match(routes, new RegExp(`app\\.${method}\\('${route.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'`));
  assert.match(routes, /app\.put\('\/api\/v1\/projects\/:id\/members'/);
  assert.match(routes, /app\.post\('\/api\/v1\/projects\/:id\/suspend'/);
  assert.match(routes, /app\.post\('\/api\/v1\/projects\/:id\/resume'/);
  assert.doesNotMatch(routes, /\/reopen/);
});

// Keep create authorization company-scoped while Stage 8 moves existing-Project checks to exact resource policy.
test('Module 5 Pass 142 routes remain authenticated while Module 24B activates exact Project authorization', () => {
  assert.match(routes, /module5CreateProject[\s\S]*requireRoutePermission\('projects\.create'\)/);
  for (const routePermission of [
    'projects.read', 'projects.update', 'projects.activate', 'projects.close', 'projects.manage_members'
  ]) assert.doesNotMatch(routes, new RegExp(`requireRoutePermission\('${routePermission.replace('.', '\\.')}\'\)`));
  for (const servicePermission of [
    'projects.read', 'projects.update', 'projects.activate', 'projects.close', 'projects.manage_members'
  ]) assert.match(service, new RegExp(`requireProjectPermission\\([\\s\\S]{0,180}'${servicePermission.replace('.', '\\.')}\'`), servicePermission);
  assert.doesNotMatch(routes, /projects\.complete/);
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\)/g) ?? []).length, 10);
});

// Keep strict Zod parsing and safe serialization at the HTTP boundary.
test('Module 5 Pass 142 uses strict boundary schemas and omits company authority from Project DTOs', () => {
  for (const parser of [
    'listProjectsQuerySchema', 'createProjectBodySchema', 'projectIdParamsSchema',
    'updateProjectBodySchema', 'activateProjectBodySchema', 'completeProjectBodySchema', 'closeProjectBodySchema'
  ]) assert.ok(routes.includes(parser), parser);
  assert.match(routes, /serializeProject\(/);
  assert.match(routes, /serializeStatusHistory\(/);
  const serializationSection = routes.slice(routes.indexOf('function serializeProject('), routes.indexOf('/** Serialize one append-only'));
  assert.doesNotMatch(serializationSection, /companyId/);
  assert.match(routes, /request\.body \?\? \{\}/);
});

// Keep Module 5 registered in the application and exported through its simple module index.
test('Module 5 Pass 142 wires the Project module into app.ts and index.ts', () => {
  assert.match(moduleIndex, /export \{ registerProjectsRoutes \} from '\.\/projects\.routes\.js'/);
  assert.match(moduleIndex, /export \{ ProjectsService \} from '\.\/projects\.service\.js'/);
  assert.match(moduleIndex, /export \{ ProjectsRepository \} from '\.\/projects\.repository\.js'/);
  assert.match(app, /import \{ registerProjectsRoutes \} from '\.\/modules\/projects\/index\.js'/);
  assert.match(app, /app\.register\(registerProjectsRoutes, \{ database: options\.database \}\)/);
});

// Keep Swagger metadata explicit while deferring deeper generated-contract assertions to Pass 145.
test('Module 5 Pass 142 gives every Project operation bearer security and stable response envelopes', () => {
  for (const operationId of [
    'module5ListProjects', 'module5CreateProject', 'module5GetProject', 'module5UpdateProject',
    'module5ActivateProject', 'module5SuspendProject', 'module5ResumeProject', 'module5CompleteProject', 'module5CloseProject'
  ]) assert.ok(routes.includes(operationId), operationId);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 10);
  assert.match(routes, /PROJECT_NOT_FOUND_RESPONSE/);
  assert.match(routes, /PROJECT_CREATE_CONFLICT_RESPONSE/);
  assert.match(routes, /PROJECT_UPDATE_CONFLICT_RESPONSE/);
  assert.match(routes, /PROJECT_LIFECYCLE_CONFLICT_RESPONSE/);
  assert.match(routes, /PROJECT_CLOSE_CONFLICT_RESPONSE/);
  assert.match(routes, /AUTHORIZATION_RESPONSE = errorResponseSchema\(\['FORBIDDEN'\]\)/);
});

// Keep Pass 142 evidence honest while Module 4A live Stage-6 acceptance remains blocked.
test('Module 5 HTTP gate is maintained without promoting static Stage-6 evidence', () => {
  assert.equal(rootPackage.scripts['module-5:http:gate'], 'node scripts/module-5/verify-stage-7-http.mjs');
  assert.match(httpGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(httpGate, /STAGE_7_HTTP_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage6LiveAccepted/);
  assert.match(contract, /Pass-142 HTTP preparation status/);
});


// Keep Pass 143 focused on the real Project master and lifecycle workflow.
test('Module 5 Pass 143 prepares one real PostgreSQL and Fastify workflow suite', () => {
  assert.match(integration, /const live = process\.env\.RUN_FOUNDATION_DB_TESTS === '1'/);
  assert.match(integration, /@construction-erp\/testing/);
  assert.match(integration, /apps\/api\/dist\/app\.js/);
  assert.match(integration, /resetFoundationTestData/);
  assert.match(integration, /status: 'WON'/);
  assert.match(integration, /POST[\s\S]*\/api\/v1\/projects/);
  assert.match(integration, /\/activate/);
  assert.match(integration, /\/complete/);
  assert.match(integration, /\/close/);
});

// Prove the integration workflow persists lifecycle history, audit and exactly the approved Stage-7 events.
test('Module 5 Pass 143 checks durable Project lifecycle evidence and retry safety', () => {
  for (const status of ['DRAFT', 'ACTIVE', 'COMPLETED', 'CLOSED']) {
    assert.ok(integration.includes(`'${status}'`), status);
  }
  for (const action of ['project.created', 'project.updated', 'project.activated', 'project.completed', 'project.closed']) {
    assert.ok(integration.includes(`'${action}'`), action);
  }
  for (const eventType of ['project.created', 'project.activated', 'project.completed', 'project.closed']) {
    assert.ok(integration.includes(`'${eventType}'`), eventType);
  }
  assert.match(integration, /projectStatusHistory/);
  assert.match(integration, /INVALID_PROJECT_STATUS_TRANSITION/);
  assert.match(integration, /eventType: 'project\.updated'/);
});

// Preserve the Module 3 one-primary-Project rule during Project conversion.
test('Module 5 Pass 143 proves one won Tender cannot create a second primary Project', () => {
  assert.match(integration, /one-primary-Project rule/);
  assert.match(integration, /PRJ-TENDER-PRIMARY/);
  assert.match(integration, /PRJ-TENDER-DUPLICATE/);
  assert.match(integration, /fieldError\.field === 'tenderId'/);
  assert.match(integration, /client\.project\.count/);
  assert.match(integration, /client\.projectStatusHistory\.count/);
});

// Keep the live integration command explicitly destructive-test guarded and Stage-6 gated.
test('Module 5 Pass 143 maintains static and live integration commands without false acceptance', () => {
  assert.match(rootPackage.scripts['test:integration:module-5'], /RUN_FOUNDATION_DB_TESTS/);
  assert.equal(rootPackage.scripts['module-5:integration:gate'], 'node scripts/module-5/verify-stage-7-integration.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-5:integration:gate:live'], 'node scripts/module-5/verify-stage-7-integration.mjs --mode=live');
  assert.match(integrationGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(integrationGate, /STAGE_6_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(integrationGate, /STAGE_7_INTEGRATION_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(integrationGate, /STAGE_7_INTEGRATION_VERIFIED_READY_FOR_PASS_144/);
});

// Keep the historical Pass-143 workflow free of Module 24B behavior while allowing later OpenAPI regressions in the same file.
test('Module 5 Pass 143 does not pull Module 24B membership or Pass 144 security scope forward', () => {
  assert.match(integrationGate, /negative permission matrix/);
  assert.match(integrationGate, /cross-company HTTP\/repository\/service isolation/);
  assert.match(integrationGate, /direct PostgreSQL foreign-key\/check\/index attack tests/);
  const pass143Integration = integration.slice(0, integration.indexOf('/** Return one generated Project OpenAPI operation'));
  assert.doesNotMatch(pass143Integration, /\/api\/v1\/projects\/.*\/members/);
  assert.doesNotMatch(pass143Integration, /project_members/);
  assert.match(contract, /Pass-143 integration preparation status/);
});


// Keep Pass 144 focused on the active Stage-7 authentication and permission boundary.
test('Module 5 Pass 144 verifies authentication and the active Project permission matrix', () => {
  assert.match(integration, /Module 5 security enforces authentication and the active Stage-7 permission matrix/);
  for (const email of [
    'project-reader@example.test',
    'project-creator@example.test',
    'project-updater@example.test',
    'project-activator@example.test',
    'project-closer@example.test',
    'project-no-permission@example.test'
  ]) assert.ok(integration.includes(email), email);
  assert.match(integration, /AUTHENTICATION_REQUIRED/);
  assert.match(integration, /FORBIDDEN/);
  assert.doesNotMatch(integration, /project-member@example\.test/);
});

// Prove Stage 7 hides foreign-company Project data through HTTP, repository and service boundaries.
test('Module 5 Pass 144 verifies cross-company isolation at all Project runtime boundaries', () => {
  assert.match(integration, /Module 5 security hides foreign-company Projects/);
  assert.match(integration, /PRJ-COMPANY-A/);
  assert.match(integration, /PRJ-COMPANY-B/);
  assert.match(integration, /ProjectsRepository/);
  assert.match(integration, /ProjectsService/);
  assert.match(integration, /repository\.findProjectById\(projectB\.id\)/);
  assert.match(integration, /service\.getProject\(projectB\.id\)/);
  assert.match(integration, /PROJECT_NOT_FOUND/);
});

// Keep company, actor, permission, scope and lifecycle state outside client authority.
test('Module 5 Pass 144 rejects client-owned Project authority and unsafe pagination', () => {
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'status', 'statusHistory', 'changedBy']) {
    assert.ok(integration.includes(field), field);
  }
  assert.match(integration, /pageSize=101/);
  assert.match(integration, /INVALID_REQUEST/);
  assert.match(integration, /public error leaked/);
});

// Attack the real Stage-7 constraints and verify the reviewed index/constraint inventory is present.
test('Module 5 Pass 144 prepares direct PostgreSQL integrity and catalog attacks', () => {
  assert.match(integration, /Module 5 security attacks the live Stage-7 database constraints and reviewed indexes directly/);
  for (const name of [
    'projects_company_project_code_uq',
    'projects_company_status_planned_end_idx',
    'projects_client_company_fkey',
    'projects_tender_company_fkey',
    'projects_manager_company_fkey',
    'projects_currency_format',
    'projects_dates_valid',
    'projects_status_allowed',
    'project_status_history_status_changed'
  ]) assert.ok(integration.includes(name), name);
  assert.match(integration, /pg_indexes/);
  assert.match(integration, /pg_constraint/);
});

// Keep the live security run destructive-test guarded and blocked until genuine Stage-6 acceptance exists.
test('Module 5 Pass 144 maintains static and live security gates without false acceptance', () => {
  assert.match(rootPackage.scripts['test:security:module-5'], /RUN_FOUNDATION_DB_TESTS/);
  assert.equal(rootPackage.scripts['module-5:security:gate'], 'node scripts/module-5/verify-stage-7-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-5:security:gate:live'], 'node scripts/module-5/verify-stage-7-security.mjs --mode=live');
  assert.match(securityGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(securityGate, /STAGE_6_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(securityGate, /STAGE_7_SECURITY_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(securityGate, /STAGE_7_SECURITY_VERIFIED_READY_FOR_PASS_145/);
  assert.match(securityGate, /membershipDeferredToModule24B: true/);
});

// Keep Pass 145 focused on generated OpenAPI/API-contract proof instead of adding another Project business endpoint.
test('Module 5 Pass 145 wires a guarded generated OpenAPI contract gate', () => {
  assert.equal(rootPackage.scripts['module-5:api-contract:gate'], 'node scripts/module-5/verify-stage-7-api-contract.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-5:api-contract:gate:live'], 'node scripts/module-5/verify-stage-7-api-contract.mjs --mode=live');
  assert.match(rootPackage.scripts['test:api-contract:module-5'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:api-contract:module-5'], /\^Module 5 API contract/);
  assert.match(apiContractGate, /module-5-generated-openapi-contract/);
  assert.match(contract, /Pass-145 OpenAPI, exact API-contract and stable-error preparation status/);
});

// Keep Stage-7 conflicts stable while Stage 8 documents exact Project-scope authorization failures.
test('Module 5 Pass 145 conflicts remain stable under Module 24B Project-scope activation', () => {
  assert.match(routes, /PROJECT_CREATE_CONFLICT_RESPONSE = errorResponseSchema\(\['DUPLICATE_PROJECT_CODE'\]\)/);
  assert.match(routes, /PROJECT_UPDATE_CONFLICT_RESPONSE = errorResponseSchema\(\['INVALID_PROJECT_STATUS_TRANSITION'\]\)/);
  assert.match(routes, /PROJECT_LIFECYCLE_CONFLICT_RESPONSE = errorResponseSchema\(\['INVALID_PROJECT_STATUS_TRANSITION'\]\)/);
  assert.match(routes, /PROJECT_CLOSE_CONFLICT_RESPONSE = errorResponseSchema\(\[[\s\S]*'PROJECT_NOT_READY_TO_CLOSE'[\s\S]*'INVALID_PROJECT_STATUS_TRANSITION'/);
  assert.match(routes, /AUTHORIZATION_RESPONSE = errorResponseSchema\(\['FORBIDDEN'\]\)/);
  assert.match(routes, /PROJECT_SCOPE_AUTHORIZATION_RESPONSE = errorResponseSchema\(\['FORBIDDEN', 'PROJECT_SCOPE_FORBIDDEN'\]\)/);
  assert.doesNotMatch(routes, /const AUTHORIZATION_RESPONSE = errorResponseSchema\(\[[^\]]*PROJECT_SCOPE_FORBIDDEN/);
});

// Keep generated success documentation exact and keep company ownership outside Project DTOs.
test('Module 5 Pass 145 documents exact Project register, detail and lifecycle success schemas', () => {
  for (const schemaName of [
    'PROJECT_RESPONSE_JSON_SCHEMA', 'PROJECT_STATUS_HISTORY_JSON_SCHEMA',
    'PROJECT_SUCCESS_SCHEMA', 'PROJECT_DETAILS_SUCCESS_SCHEMA', 'LIST_PROJECTS_SUCCESS_SCHEMA'
  ]) assert.ok(routes.includes(schemaName), schemaName);
  assert.doesNotMatch(routes, /SUCCESS_RESPONSE_SCHEMA/);
  const projectResponseSection = routes.slice(routes.indexOf('const PROJECT_RESPONSE_JSON_SCHEMA'), routes.indexOf('const PROJECT_STATUS_HISTORY_JSON_SCHEMA'));
  assert.doesNotMatch(projectResponseSection, /companyId/);
});

// Preserve the historical seven source operations while accepting only the two explicit Pass-366 lifecycle repair additions.
test('Module 5 Pass 145 live API-contract test inspects generated openapi.json and exact operation inventory', () => {
  assert.match(integration, /Module 5 API contract preserves seven source operations plus the two Pass-366 lifecycle repair operations/);
  assert.match(integration, /url: '\/openapi\.json'/);
  for (const operationId of [
    'module5ListProjects', 'module5CreateProject', 'module5GetProject', 'module5UpdateProject',
    'module5ActivateProject', 'module5SuspendProject', 'module5ResumeProject', 'module5CompleteProject', 'module5CloseProject'
  ]) assert.ok(integration.includes(operationId), operationId);
  assert.match(integration, /documentedModule5Operations\.sort\(\), actualOperations\.sort\(\)/);
  assert.match(integration, /documentedProjectOperations\.includes\('PUT \/api\/v1\/projects\/\{id\}\/members'\)/);
  assert.match(integration, /'\/reopen'/);
  assert.match(integration, /PROJECT_SCOPE_FORBIDDEN/);
});

// Keep live evidence honest and hand off only to the first React Project pass after real API-contract verification.
test('Module 5 Pass 145 live gate requires Stage 6 plus explicit disposable database execution before Pass 146', () => {
  assert.match(apiContractGate, /STAGE_6_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(apiContractGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(apiContractGate, /STAGE_7_API_CONTRACT_VERIFIED_READY_FOR_PASS_146/);
  assert.match(apiContractGate, /Pass 146 - Module 5 React Project register, create and detail UI/);
  assert.match(apiContractGate, /membershipDeferredToModule24B: true/);
});


// Keep the Pass-146 Project register/create/detail foundation intact while Pass 147 extends the same feature files.
test('Module 5 React API and TanStack Query layer retain the Pass-146 foundation', () => {
  for (const functionName of ['listProjects', 'getProject', 'createProject']) {
    assert.match(projectsApi, new RegExp(`export function ${functionName}\\(`), functionName);
  }
  for (const hookName of ['useProjects', 'useProject', 'useCreateProject']) {
    assert.match(projectsHooks, new RegExp(`export function ${hookName}\\(`), hookName);
  }
  const stage7Api = projectsApi.slice(0, projectsApi.indexOf('/** Replace one Project'));
  assert.doesNotMatch(stage7Api, /replaceProjectMembers/);
  assert.match(projectsHooks, /\['module-5', 'projects'\]/);
});

// Keep Project list filters on the server and keep Project lifecycle state server-owned.
test('Module 5 Pass 146 Project register uses reviewed server filters without client-side Project filtering', () => {
  for (const field of ['search', 'clientId', 'tenderId', 'status', 'page', 'pageSize']) {
    assert.ok(projectsApi.includes(field), field);
  }
  assert.match(projectsPage, /useProjects\(\{/);
  assert.match(projectsPage, /pageSize: 25/);
  assert.doesNotMatch(projectsPage, /projects\.filter\(/);
  assert.match(projectsPage, /PROJECT_STATUSES/);
});

// Keep the create form permission-aware when it reads Client, Tender and user master data.
test('Module 5 Pass 146 creates Projects from permission-aware master choices and trusted server authority', () => {
  assert.match(projectsPage, /usePermission\('projects\.create'\)/);
  assert.match(projectsPage, /usePermission\('clients\.read'\)/);
  assert.match(projectsPage, /usePermission\('tenders\.read'\)/);
  assert.match(projectsPage, /usePermission\('users\.read'\)/);
  assert.match(projectsPage, /useClients\(\{ status: 'ACTIVE'/);
  assert.match(projectsPage, /useTenders\(\{ status: 'WON'/);
  assert.match(projectsPage, /user\.status === 'ACTIVE'/);
  assert.match(projectsPage, /useForm<CreateProjectValues>/);
  assert.match(projectsPage, /zodResolver\(createProjectSchema\)/);
  assert.match(projectsPage, /plannedEndDate < value\.startDate/);
});

// Keep company, actor, permission, project scope and lifecycle fields out of browser Project writes.
test('Module 5 Pass 146 browser create contract does not send server-owned Project authority', () => {
  const createInputSection = projectsApi.slice(projectsApi.indexOf('export type CreateProjectInput'), projectsApi.indexOf('export type UpdateProjectInput'));
  for (const forbidden of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'status', 'statusHistory', 'changedBy']) {
    assert.doesNotMatch(createInputSection, new RegExp(forbidden));
  }
  assert.match(projectsPage, /currency: values\.currency\.toUpperCase\(\)/);
  const createHandlerSection = projectsPage.slice(projectsPage.indexOf('async function handleCreate'), projectsPage.indexOf('return ('));
  assert.doesNotMatch(createHandlerSection, /companyId\s*:|actorUserId\s*:|projectScope\s*:|status\s*:/);
});

// Keep the original Project detail and lifecycle-history read model while Pass 147 adds reviewed actions around it.
test('Module 5 Project detail still renders the Stage-7 Project master and lifecycle history', () => {
  assert.match(projectDetailsPanel, /export function ProjectDetailsPanel/);
  assert.match(projectDetailsPanel, /Lifecycle history/);
  assert.match(projectDetailsPanel, /details\.statusHistory\.map/);
  assert.match(projectDetailsPanel, /Module 24B now owns Project membership and Project-scoped authorization/);
});

// Keep Stage-7 Project navigation wired while later Module 24B may widen discovery for PROJECT-scoped readers.
test('Module 5 Pass 146 keeps permission-aware Project navigation after Stage-8 registration', () => {
  assert.match(adminShell, /useProjectWorkspaceVisibility/);
  assert.match(adminShell, /Project Management/);
  assert.match(adminShell, /activeView === 'projects'/);
  assert.match(projectsPage, /if \(!canRead\)/);
  assert.doesNotMatch(projectsPage, /project_members|manage members|Manage members|projects\.manage_members|\/members/);
  assert.match(projectDetailsPanel, /usePermission\('projects\.manage_members'\)/);
});

// Keep the Project UI responsive without adding a new styling system.
test('Module 5 Pass 146 reuses the existing UI system with a small Project-specific layout section', () => {
  assert.match(webStyles, /\/\* Module 5 Project Management \*\//);
  assert.match(webStyles, /\.project-filter-grid/);
  assert.match(webStyles, /\.project-form-grid/);
  assert.match(webStyles, /\.project-detail-grid/);
  assert.match(webStyles, /@media \(max-width: 720px\)/);
});

// Keep Pass 146 evidence honest until genuine Stage-6 acceptance and a dependency-backed web build are available.
test('Module 5 Pass 146 maintains a static React gate without false runtime acceptance', () => {
  assert.equal(rootPackage.scripts['module-5:react-register:gate'], 'node scripts/module-5/verify-stage-7-react-register.mjs');
  assert.match(reactRegisterGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(reactRegisterGate, /STAGE_7_REACT_REGISTER_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(reactRegisterGate, /dependencyBackedWebBuildRequired: true/);
  assert.match(reactRegisterGate, /membershipDeferredToModule24B: true/);
  assert.match(reactRegisterGate, /Pass 147 - Module 5 React Project edit, lifecycle controls and commercial summary/);
});

// Keep Pass 147 inside the seven reviewed Stage-7 Project operations with no membership API.
test('Module 5 Pass 147 adds only update and reviewed lifecycle browser API calls', () => {
  for (const functionName of ['updateProject', 'activateProject', 'suspendProject', 'resumeProject', 'completeProject', 'closeProject']) {
    assert.match(projectsApi, new RegExp(`export function ${functionName}\\(`), functionName);
  }
  for (const hookName of ['useUpdateProject', 'useActivateProject', 'useSuspendProject', 'useResumeProject', 'useCompleteProject', 'useCloseProject']) {
    assert.match(projectsHooks, new RegExp(`export function ${hookName}\\(`), hookName);
  }
  assert.match(projectsApi, /projects\/\$\{projectId\}\/activate/);
  assert.match(projectsApi, /projects\/\$\{projectId\}\/suspend/);
  assert.match(projectsApi, /projects\/\$\{projectId\}\/resume/);
  assert.match(projectsApi, /projects\/\$\{projectId\}\/complete/);
  assert.match(projectsApi, /projects\/\$\{projectId\}\/close/);
  const stage7Api = projectsApi.slice(0, projectsApi.indexOf('/** Replace one Project'));
  assert.doesNotMatch(stage7Api, /\/members|\/reopen/);
});

// Keep Project code, company and lifecycle authority out of the normal browser PATCH.
test('Module 5 Pass 147 edit form sends only editable Project master fields', () => {
  const updateInput = projectsApi.slice(projectsApi.indexOf('export type UpdateProjectInput'), projectsApi.indexOf('export type CloseProjectInput'));
  for (const allowed of ['name', 'clientId', 'tenderId', 'currency', 'startDate', 'plannedEndDate', 'projectManagerUserId', 'location']) {
    assert.match(updateInput, new RegExp(`${allowed}\\?`), allowed);
  }
  for (const forbidden of ['projectCode', 'companyId', 'actorUserId', 'permissions', 'projectScope', 'status', 'statusHistory', 'changedBy']) {
    assert.doesNotMatch(updateInput, new RegExp(forbidden), forbidden);
  }
  assert.match(projectDetailsPanel, /useForm<EditProjectValues>/);
  assert.match(projectDetailsPanel, /zodResolver\(editProjectSchema\)/);
  assert.match(projectDetailsPanel, /plannedEndDate < value\.startDate/);
  assert.match(projectDetailsPanel, /currency: values\.currency\.toUpperCase\(\)/);
});

// Keep lifecycle controls permission-aware and aligned to the DRAFT -> ACTIVE -> COMPLETED -> CLOSED workflow.
test('Module 5 Pass 147 renders only reviewed permission-aware lifecycle controls', () => {
  assert.match(projectDetailsPanel, /usePermission\('projects\.update'\)/);
  assert.match(projectDetailsPanel, /usePermission\('projects\.activate'\)/);
  assert.match(projectDetailsPanel, /usePermission\('projects\.close'\)/);
  assert.match(projectDetailsPanel, /project\.status === 'DRAFT'[\s\S]*Activate Project/);
  assert.match(projectDetailsPanel, /project\.status === 'ACTIVE'[\s\S]*Suspend Project/);
  assert.match(projectDetailsPanel, /project\.status === 'SUSPENDED'[\s\S]*Resume Project/);
  assert.match(projectDetailsPanel, /project\.status === 'ACTIVE'[\s\S]*Complete Project/);
  assert.match(projectDetailsPanel, /project\.status === 'COMPLETED'[\s\S]*Close Project/);
  assert.match(projectDetailsPanel, /project\.status !== 'CLOSED'/);
  assert.match(projectDetailsPanel, /project\.status === 'SUSPENDED'[\s\S]*normal downstream operational transactions stay blocked/);
  assert.doesNotMatch(projectDetailsPanel, /projects\.complete/);
  assert.match(projectDetailsPanel, /usePermission\('projects\.manage_members'\)/);
});

// Keep activate/complete bodyless and close limited to its optional reason field.
test('Module 5 Pass 147 bodies remain stable while Pass 366 adds reason-only suspend/resume bodies', () => {
  const activateSection = projectsApi.slice(projectsApi.indexOf('export function activateProject'), projectsApi.indexOf('/** Suspend one ACTIVE Project'));
  const suspendSection = projectsApi.slice(projectsApi.indexOf('export function suspendProject'), projectsApi.indexOf('/** Resume one SUSPENDED Project'));
  const resumeSection = projectsApi.slice(projectsApi.indexOf('export function resumeProject'), projectsApi.indexOf('/** Mark one ACTIVE Project'));
  const completeSection = projectsApi.slice(projectsApi.indexOf('export function completeProject'), projectsApi.indexOf('/** Close one COMPLETED Project'));
  const closeSection = projectsApi.slice(projectsApi.indexOf('export function closeProject'));
  assert.doesNotMatch(activateSection, /body:/);
  assert.doesNotMatch(completeSection, /body:/);
  assert.match(suspendSection, /input\.reason \? \{ body: JSON\.stringify\(input\) \} : \{\}/);
  assert.match(resumeSection, /input\.reason \? \{ body: JSON\.stringify\(input\) \} : \{\}/);
  assert.match(closeSection, /input\.reason \? \{ body: JSON\.stringify\(input\) \} : \{\}/);
  assert.match(projectDetailsPanel, /useForm<ProjectTransitionValues>/);
  assert.match(projectDetailsPanel, /useForm<CloseProjectValues>/);
  assert.match(projectDetailsPanel, /Lifecycle reason is too long/);
});

// Keep the commercial summary source-derived and permission-aware without inventing Project-owned commercial totals.
test('Module 5 Pass 147 shows permission-aware Client and Tender source summaries', () => {
  assert.match(projectDetailsPanel, /Commercial \/ source summary/);
  assert.match(projectDetailsPanel, /getClient\(project\.clientId\)/);
  assert.match(projectDetailsPanel, /enabled: canReadClients/);
  assert.match(projectDetailsPanel, /getTender\(project\.tenderId as string\)/);
  assert.match(projectDetailsPanel, /enabled: canReadTenders && project\.tenderId !== null/);
  assert.match(projectDetailsPanel, /commercialSummary\.opportunityCount/);
  assert.match(projectDetailsPanel, /submittedAmount[\s\S]*latestEligibleEstimate\?\.tenderTotal/);
  assert.match(projectDetailsPanel, /Budget, finance and billing values remain owned by their later modules/);
});

// Keep later Project modules as honest placeholders while allowing the reviewed Module 24B membership workflow to activate.
test('Module 5 Pass 147 keeps later Project modules deferred while Stage-8 membership coexists safely', () => {
  assert.match(projectDetailsPanel, /Downstream Project modules/);
  assert.match(projectDetailsPanel, /WBS, budgeting, procurement, field, scheduling, billing and finance navigation will activate/);
  assert.match(projectDetailsPanel, /Project team \/ members/);
  assert.match(projectDetailsPanel, /useReplaceProjectMembers/);
  assert.doesNotMatch(projectsPage, /project_members|projects\.manage_members|\/members/);
});

// Keep the completed Project workspace responsive using the existing stylesheet only.
test('Module 5 Pass 147 extends the existing responsive Project styles without a new styling system', () => {
  assert.match(webStyles, /\.project-summary-grid/);
  assert.match(webStyles, /\.project-action-row/);
  assert.match(webStyles, /\.project-close-form/);
  assert.match(webStyles, /\.project-lifecycle-section/);
  assert.match(webStyles, /@media \(max-width: 720px\)[\s\S]*\.project-close-form/);
});

// Keep Pass 147 evidence static until Stage 6 live acceptance and a dependency-backed web build exist.
test('Module 5 Pass 147 maintains a React-workflow gate without false runtime acceptance', () => {
  assert.equal(rootPackage.scripts['module-5:react-workflow:gate'], 'node scripts/module-5/verify-stage-7-react-workflow.mjs');
  assert.match(reactWorkflowGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(reactWorkflowGate, /STAGE_7_REACT_WORKFLOW_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(reactWorkflowGate, /dependencyBackedWebBuildRequired: true/);
  assert.match(reactWorkflowGate, /membershipDeferredToModule24B: true/);
  assert.match(reactWorkflowGate, /Pass 148 - Module 5 Playwright Project browser workflow and permission verification/);
});



// Keep Pass 148 verification-only and reuse the shared browser infrastructure with one focused Project suite.
test('Module 5 Pass 148 adds one focused Playwright workflow and guarded gate', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-5'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-5:playwright:gate'], 'node scripts/module-5/verify-stage-7-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-5:playwright:gate:live'], 'node scripts/module-5/verify-stage-7-playwright.mjs --mode=live');
  assert.match(playwrightGate, /productionRuntimeChanges: 0/);
  assert.match(playwrightGate, /membershipDeferredToModule24B: true/);
  assert.match(playwrightGate, /Pass 149 - Module 5 performance, concurrency, migration\/recovery and operational verification/);
});

// Keep the shared Playwright runner deterministic by selecting exactly one module suite at a time.
test('Module 5 Pass 148 is wired into the shared Playwright configuration without affecting older suites', () => {
  assert.match(playwrightConfig, /RUN_MODULE_5_E2E/);
  assert.match(playwrightConfig, /module-5-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /enabledModuleCount/);
  for (const olderFlag of ['RUN_MODULE_24A_E2E', 'RUN_MODULE_18_E2E', 'RUN_MODULE_22_E2E', 'RUN_MODULE_2_E2E', 'RUN_MODULE_3_E2E', 'RUN_MODULE_4A_E2E']) {
    assert.ok(playwrightConfig.includes(olderFlag), olderFlag);
  }
});

// Cover the complete Stage-7 Project browser path through source linking, master editing and lifecycle close.
test('Module 5 Pass 148 covers the main Project browser workflow with real database assertions', () => {
  assert.match(browserTest, /Create a Tender-linked DRAFT Project/);
  assert.match(browserTest, /Commercial \/ source summary/);
  assert.match(browserTest, /Pass 148 Main Project Updated/);
  assert.match(browserTest, /Activate Project/);
  assert.match(browserTest, /Complete Project/);
  assert.match(browserTest, /Close Project/);
  assert.match(browserTest, /\[null, 'DRAFT'\]/);
  assert.match(browserTest, /\['DRAFT', 'ACTIVE'\]/);
  assert.match(browserTest, /\['ACTIVE', 'COMPLETED'\]/);
  assert.match(browserTest, /\['COMPLETED', 'CLOSED'\]/);
  assert.match(browserTest, /project\.created/);
  assert.match(browserTest, /project\.closed/);
});

// Keep UI permission checks separate from API authorization so hidden controls never become the security boundary.
test('Module 5 Pass 148 verifies read, create, update, activate, close and no-read browser permissions', () => {
  for (const email of [
    'pass148-project-reader@example.test',
    'pass148-project-updater@example.test',
    'pass148-project-activator@example.test',
    'pass148-project-closer@example.test',
    'pass148-no-project@example.test'
  ]) assert.ok(browserTest.includes(email), email);
  assert.match(browserTest, /forbiddenCreate\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /forbiddenUpdate\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /forbiddenActivate\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /noProjectPage\.getByRole\('button', \{ name: 'Project Management' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /expect\(noProjectRequests\)\.toHaveLength\(0\)/);
});

// Keep company, actor, Project-scope and lifecycle authority out of all browser writes.
test('Module 5 Pass 148 verifies server-owned request authority and exact reviewed request shapes', () => {
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'status', 'statusHistory', 'changedBy']) {
    assert.ok(browserTest.includes(`'${field}'`), field);
  }
  assert.match(browserTest, /'clientId',[\s\S]*'projectCode',[\s\S]*'tenderId'/);
  assert.match(browserTest, /updateRequest\?\.body\)\.not\.toHaveProperty\('projectCode'\)/);
  assert.match(browserTest, /activateRequest\?\.body\)\.toBeNull\(\)/);
  assert.match(browserTest, /completeRequest\?\.body\)\.toBeNull\(\)/);
  assert.match(browserTest, /Object\.keys\(closeRequest\?\.body \?\? \{\}\)\)\.toEqual\(\['reason'\]\)/);
  assert.match(browserTest, /expect\(request\.pathname\)\.not\.toContain\('\/members'\)/);
});

// Keep live browser evidence blocked until genuine Stage-6 acceptance and explicit Module 5 E2E selection exist.
test('Module 5 Pass 148 live gate cannot promote a prepared browser suite from static evidence', () => {
  assert.match(playwrightGate, /STAGE_6_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(playwrightGate, /RUN_MODULE_5_E2E_REQUIRED/);
  assert.match(playwrightGate, /STAGE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_149/);
  assert.match(playwrightGate, /runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted/);
});

// Keep Pass 149 verification-only and reuse the existing Module 5 PostgreSQL integration suite.
test('Module 5 Pass 149 adds a guarded operational gate without production runtime changes', () => {
  assert.equal(rootPackage.scripts['test:operations:module-5'].includes('--test-name-pattern="^Module 5 operational"'), true);
  assert.equal(rootPackage.scripts['module-5:operations:gate'], 'node scripts/module-5/verify-stage-7-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-5:operations:gate:live'], 'node scripts/module-5/verify-stage-7-operations.mjs --mode=live');
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /membershipDeferredToModule24B: true/);
  assert.match(operationsGate, /Pass 150 - Module 5 final Stage-7 acceptance gate/);
});

// Prove concurrency covers duplicate creation, Tender linking and retry-safe lifecycle side effects.
test('Module 5 Pass 149 verifies concurrent Project creation and lifecycle retries', () => {
  assert.match(integration, /Module 5 operational concurrency serializes Project creation and lifecycle retries/);
  assert.match(integration, /OPS-DUPLICATE-001/);
  assert.match(integration, /DUPLICATE_PROJECT_CODE/);
  assert.match(integration, /OPS-TENDER-A/);
  assert.match(integration, /OPS-TENDER-B/);
  assert.match(integration, /project\.activated/);
  assert.match(integration, /project\.suspended/);
  assert.match(integration, /project\.resumed/);
  assert.match(integration, /project\.completed/);
  assert.match(integration, /project\.closed/);
  assert.match(integration, /projectStatusHistory\.count\(\{ where: \{ projectId: project\.id \} \}\), 6/);
});

// Verify PostgreSQL query plans use reviewed Stage-7 indexes without hardware-specific duration assertions.
test('Module 5 Pass 149 verifies reviewed Project and lifecycle-history query plans', () => {
  assert.match(integration, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.match(integration, /projects_company_status_planned_end_idx/);
  assert.match(integration, /project_status_history_project_changed_idx/);
  assert.match(integration, /Execution Time/);
  assert.doesNotMatch(operationsGate, /milliseconds|\bms\b|under \d+/i);
  assert.match(operationsGate, /hardDurationThresholds: false/);
});

// Keep live operations gated by Stage-6 acceptance, Pass-148 browser proof and clean/previous migration verification.
test('Module 5 Pass 149 live gate requires upstream acceptance and migration recovery proof', () => {
  assert.match(operationsGate, /STAGE_6_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(operationsGate, /STAGE_7_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_149/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-5/);
  assert.match(operationsGate, /STAGE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_150/);
  assert.match(operationsGate, /runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted && playwrightLiveVerified/);
});



// Keep Pass 150 as one final maintained Stage-7 gate with no new Project runtime behavior.
test('Module 5 Pass 150 adds the final static/live acceptance commands without production changes', () => {
  assert.equal(rootPackage.scripts['module-5:gate'], 'node scripts/module-5/verify-stage-7.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-5:gate:live'], 'node scripts/module-5/verify-stage-7.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-5:acceptance:live'], 'npm run module-5:gate:live');
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /ownedTables: \['projects', 'project_status_history'\]/);
  assert.match(finalGate, /routeCount: 7/);
});

// Preserve the Stage-6 prerequisite and rerun the complete dependency-backed Stage-7 proof before acceptance.
test('Module 5 Pass 150 live gate reruns build, database, API and browser verification', () => {
  assert.match(finalGate, /STAGE_6_ACCEPTED_READY_FOR_STAGE_7/);
  assert.match(finalGate, /STAGE_6_LIVE_ACCEPTANCE_REQUIRED/);
  for (const token of [
    "['clean-install', 'npm', ['ci']]",
    "['typecheck', 'npm', ['run', 'typecheck']]",
    "['lint', 'npm', ['run', 'lint']]",
    "['prisma-validate', 'npm', ['run', 'db:validate']]",
    "['prisma-generate', 'npm', ['run', 'db:generate']]",
    "['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']]",
    "['build', 'npm', ['run', 'build']]",
    "['module-5-backend-security-api-operational-integration', 'npm', ['run', 'test:integration:module-5']]",
    "['module-5-browser-workflow', 'npm', ['run', 'test:e2e:module-5']]"
  ]) assert.ok(finalGate.includes(token), token);
  assert.match(finalGate, /RUN_MODULE_5_E2E/);
  assert.match(finalGate, /MIGRATION_TEST_DATABASE_URL/);
  assert.match(finalGate, /package-lock\.json/);
});

// Only genuine live success may hand Stage 7 to Module 24B Project Scope Activation.
test('Module 5 Pass 150 freezes the truthful Stage-7 acceptance and Stage-8 handoff', () => {
  assert.match(finalGate, /STAGE_7_STATIC_GATE_PASSED_STAGE_6_LIVE_ACCEPTANCE_PENDING/);
  assert.match(finalGate, /STAGE_7_ACCEPTED_READY_FOR_STAGE_8/);
  assert.match(finalGate, /Module 24B - Project Scope Activation/);
  assert.match(finalGate, /project_members/);
  assert.match(finalGate, /projects\.manage_members/);
  assert.match(finalGate, /project\.member_changed/);
  assert.match(finalGate, /validated project-scoped authorization/);
});

// Keep the original Stage-7 migration ownership unchanged while the later Module 24B gate extends the shared Project HTTP layer.
test('Module 5 Pass 150 keeps Stage-7 persistence ownership unchanged under Module 24B', () => {
  assert.doesNotMatch(migration, /CREATE TABLE "project_members"/);
  assert.match(routes, /\/api\/v1\/projects\/:id\/members/);
  assert.match(service, /async replaceProjectMembers\(/);
});
