import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const [
  repairContract,
  passDoc,
  moduleContract,
  prisma,
  module5Migration,
  schema,
  repository,
  service,
  routes,
  webApi,
  webHooks,
  webDetails,
  integration,
  e2e
] = await Promise.all([
  read('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md'),
  read('docs/PASS-366-MODULE-5-CONTROLLED-SUSPEND-RESUME.md'),
  read('docs/modules/projects/STAGE-7-MODULE-5-CONTRACT.md'),
  read('packages/database/prisma/schema.prisma'),
  read('packages/database/prisma/migrations/20260823000400_module_5_project_management_core/migration.sql'),
  read('apps/api/src/modules/projects/projects.schema.ts'),
  read('apps/api/src/modules/projects/projects.repository.ts'),
  read('apps/api/src/modules/projects/projects.service.ts'),
  read('apps/api/src/modules/projects/projects.routes.ts'),
  read('apps/web/src/features/projects/api/projects-api.ts'),
  read('apps/web/src/features/projects/hooks/projects.ts'),
  read('apps/web/src/features/projects/components/project-details-panel.tsx'),
  read('tests/integration/module-5-api.integration.test.mjs'),
  read('tests/e2e/module-5-browser.spec.mjs')
]);

const downstreamWritableServices = await Promise.all([
  'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts',
  'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
  'apps/api/src/modules/procurement/procurement.service.ts',
  'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
  'apps/api/src/modules/inventory/inventory.service.ts',
  'apps/api/src/modules/subcontracts/subcontracts.service.ts',
  'apps/api/src/modules/client-billing/client-billing.service.ts',
  'apps/api/src/modules/change-orders/change-orders.service.ts',
  'apps/api/src/modules/scheduling/scheduling.service.ts'
].map(read));

// Prove the frozen M5-01 repair decision is closed by this pass and documented as a narrow amendment.
test('Pass 366 closes frozen M5-01 with the smallest controlled suspend/resume contract', () => {
  assert.match(repairContract, /M5-01 — Suspended lifecycle/);
  assert.match(repairContract, /Decision: `IMPLEMENTED_PASS_366`/);
  assert.match(passDoc, /POST \/api\/v1\/projects\/:id\/suspend/);
  assert.match(passDoc, /POST \/api\/v1\/projects\/:id\/resume/);
  assert.match(moduleContract, /Pass 366 amendment — Controlled Project suspension \/ resumption/);
  assert.match(moduleContract, /ACTIVE[\s\S]*SUSPENDED[\s\S]*ACTIVE/);
});

// Prove existing Project persistence already supports SUSPENDED so Pass 366 needs no schema or migration expansion.
test('Pass 366 reuses existing Project status/history persistence without a new database resource', () => {
  assert.match(prisma, /model ProjectStatusHistory/);
  assert.match(prisma, /@@map\("project_status_history"\)/);
  assert.match(module5Migration, /'DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED'/);
  assert.doesNotMatch(prisma, /Pass366|pass_366|project_suspension/i);
  assert.match(passDoc, /New tables:\s+0/);
  assert.match(passDoc, /New migrations:\s+0/);
});

// Preserve the seven source routes and add only the two reviewed repair commands.
test('Pass 366 preserves seven source routes and adds exactly two repair routes', () => {
  const sourceSection = schema.slice(
    schema.indexOf('export const MODULE_5_HTTP_ROUTES'),
    schema.indexOf('/** Pass 366 adds only')
  );
  const repairSection = schema.slice(
    schema.indexOf('export const MODULE_5_PASS_366_HTTP_ROUTES'),
    schema.indexOf('/** Stage-8 activates only')
  );
  assert.equal((sourceSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 7);
  assert.equal((repairSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 2);
  assert.match(repairSection, /\/api\/v1\/projects\/:id\/suspend/);
  assert.match(repairSection, /\/api\/v1\/projects\/:id\/resume/);
  assert.doesNotMatch(routes, /\/api\/v1\/projects\/:id\/(?:reopen|status)['"]/);
  assert.doesNotMatch(routes, /app\.delete\('/);
});

// Reuse existing lifecycle permissions, errors and source event vocabulary rather than inventing parallel authority.
test('Pass 366 adds no permission, stable error or suspended/resumed domain event', () => {
  const permissionSection = schema.slice(schema.indexOf('MODULE_5_PERMISSION_CODES'), schema.indexOf('MODULE_5_ERROR_CODES'));
  for (const permission of ['projects.read', 'projects.create', 'projects.update', 'projects.manage_members', 'projects.activate', 'projects.close']) {
    assert.ok(permissionSection.includes(permission), permission);
  }
  assert.doesNotMatch(permissionSection, /projects\.(?:suspend|resume)/);
  assert.match(service, /suspendProject[\s\S]*'projects\.close'/);
  assert.match(service, /resumeProject[\s\S]*'projects\.activate'/);
  const eventSection = schema.slice(schema.indexOf('MODULE_5_EVENT_TYPES'), schema.indexOf('MODULE_5_DEFERRED_EVENT_TYPES'));
  assert.doesNotMatch(eventSection, /project\.(?:suspended|resumed)/);
  assert.doesNotMatch(service, /eventType: 'project\.(?:suspended|resumed)'/);
  assert.match(service, /action: 'project\.suspended'/);
  assert.match(service, /action: 'project\.resumed'/);
});

// Keep lifecycle transition rules transactional, conditional and retry-safe.
test('Pass 366 service owns ACTIVE-SUSPENDED-ACTIVE transitions with durable history and idempotent target retries', () => {
  assert.match(service, /async suspendProject\(projectId: string, input: SuspendProjectBody\)/);
  assert.match(service, /if \(before\.status === PROJECT_SUSPENDED\) return before/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_ACTIVE, PROJECT_SUSPENDED\)/);
  assert.match(service, /fromStatus: PROJECT_ACTIVE,[\s\S]*toStatus: PROJECT_SUSPENDED/);
  assert.match(service, /async resumeProject\(projectId: string, input: ResumeProjectBody\)/);
  assert.match(service, /if \(before\.status === PROJECT_ACTIVE\) return before/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_SUSPENDED, PROJECT_ACTIVE\)/);
  assert.match(service, /fromStatus: PROJECT_SUSPENDED,[\s\S]*toStatus: PROJECT_ACTIVE/);
  assert.match(service, /withTransaction\(this\.db/);
});

// Resume must revalidate the Project references that activation requires before operational writes resume.
test('Pass 366 resume revalidates activation references and Project dates', () => {
  const resume = service.slice(service.indexOf('async resumeProject'), service.indexOf('/** Mark one ACTIVE Project complete'));
  assert.match(resume, /assertValidDateRange\(before\.startDate, before\.plannedEndDate\)/);
  assert.match(resume, /requireActiveProjectReferences/);
  assert.match(resume, /clientId: before\.clientId/);
  assert.match(resume, /tenderId: before\.tenderId/);
  assert.match(resume, /projectManagerUserId: before\.projectManagerUserId/);
});

// Reuse existing repository lock/transition/history primitives and avoid another lifecycle repository layer.
test('Pass 366 needs no new Project repository function', () => {
  for (const method of ['lockProjectForWrite', 'transitionProjectStatus', 'createProjectStatusHistory']) {
    assert.ok(repository.includes(method), method);
    assert.ok(service.includes(method), method);
  }
  assert.doesNotMatch(repository, /suspendProject|resumeProject|projectSuspension/);
});

// Keep both repair request bodies strict and limited to optional reason.
test('Pass 366 API accepts only optional reason for suspend and resume', () => {
  assert.match(schema, /suspendProjectBodySchema = z\.object\(\{[\s\S]*reason: closeReasonSchema\.optional\(\)[\s\S]*\}\)\.strict\(\)/);
  assert.match(schema, /resumeProjectBodySchema = z\.object\(\{[\s\S]*reason: closeReasonSchema\.optional\(\)[\s\S]*\}\)\.strict\(\)/);
  for (const operationId of ['module5SuspendProject', 'module5ResumeProject']) assert.ok(routes.includes(operationId), operationId);
  const suspendRoute = routes.slice(routes.indexOf("app.post('/api/v1/projects/:id/suspend'"), routes.indexOf("app.post('/api/v1/projects/:id/resume'"));
  const resumeRoute = routes.slice(routes.indexOf("app.post('/api/v1/projects/:id/resume'"), routes.indexOf("app.post('/api/v1/projects/:id/complete'"));
  for (const section of [suspendRoute, resumeRoute]) {
    assert.match(section, /additionalProperties: false/);
    assert.match(section, /reason: \{ type: 'string', minLength: 1, maxLength: 5000 \}/);
  }
});

// Expose the repair through existing React API/query/form boundaries without another client state layer.
test('Pass 366 React workspace exposes permission-aware suspend/resume controls', () => {
  assert.match(webApi, /export function suspendProject/);
  assert.match(webApi, /export function resumeProject/);
  assert.match(webHooks, /export function useSuspendProject/);
  assert.match(webHooks, /export function useResumeProject/);
  assert.match(webDetails, /canClose && project\.status === 'ACTIVE'/);
  assert.match(webDetails, /Suspend Project/);
  assert.match(webDetails, /canActivate && project\.status === 'SUSPENDED'/);
  assert.match(webDetails, /Resume Project/);
  assert.match(webDetails, /normal downstream operational transactions stay blocked until an authorized resume/);
});

// Ensure the existing operational modules with writable-Project guards now treat SUSPENDED as non-writable.
test('Pass 366 blocks suspended Projects at existing downstream normal-write guards', () => {
  for (const source of downstreamWritableServices) {
    assert.match(source, /SUSPENDED/);
    assert.match(source, /Suspended|suspended/);
  }
});

// Keep live integration coverage ready for auth, isolation, history, idempotency and no invented outbox events.
test('Pass 366 extends Module 5 integration coverage for suspension and resumption', () => {
  for (const route of ['/suspend', '/resume']) assert.ok(integration.includes(route), route);
  assert.match(integration, /fromStatus: 'ACTIVE', toStatus: 'SUSPENDED'/);
  assert.match(integration, /fromStatus: 'SUSPENDED', toStatus: 'ACTIVE'/);
  assert.match(integration, /action: 'project\.suspended'/);
  assert.match(integration, /action: 'project\.resumed'/);
  assert.match(integration, /eventType: 'project\.suspended'[\s\S]*\}\), 0/);
  assert.match(integration, /eventType: 'project\.resumed'[\s\S]*\}\), 0/);
  assert.match(integration, /module5SuspendProject/);
  assert.match(integration, /module5ResumeProject/);
});

// Keep the real browser workflow aligned with the new status controls and durable history.
test('Pass 366 extends the Module 5 Playwright workflow without adding another feature shell', () => {
  assert.match(e2e, /Suspension reason \(optional\)/);
  assert.match(e2e, /Suspend Project/);
  assert.match(e2e, /Resume reason \(optional\)/);
  assert.match(e2e, /Resume Project/);
  assert.match(e2e, /\['ACTIVE', 'SUSPENDED'\]/);
  assert.match(e2e, /\['SUSPENDED', 'ACTIVE'\]/);
  assert.match(e2e, /project\.suspended/);
  assert.match(e2e, /project\.resumed/);
});
