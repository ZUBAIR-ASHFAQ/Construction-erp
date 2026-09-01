import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const backendDir = 'apps/api/src/modules/approvals';
const frontendDir = 'apps/web/src/features/approvals';
const schema = await readFile(`${backendDir}/approvals.schema.ts`, 'utf8');
const repository = await readFile(`${backendDir}/approvals.repository.ts`, 'utf8');
const service = await readFile(`${backendDir}/approvals.service.ts`, 'utf8');
const routes = await readFile(`${backendDir}/approvals.routes.ts`, 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const integrationTest = await readFile('tests/integration/module-22-api.integration.test.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-22-browser.spec.mjs', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const timingWorker = await readFile('apps/api/src/workers/approval-timing.worker.ts', 'utf8');
const pass91Migration = await readFile('packages/database/prisma/migrations/20260822001440_module_22_definition_activation_integrity/migration.sql', 'utf8');
const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8'));

const permissions = [
  'approvals.inbox.read',
  'approvals.act',
  'approval_definitions.read',
  'approval_definitions.manage',
  'approval_delegations.manage'
];
const errors = [
  'APPROVAL_REQUEST_NOT_FOUND',
  'APPROVAL_NOT_ASSIGNED',
  'APPROVAL_ALREADY_COMPLETED',
  'INVALID_APPROVAL_ACTION',
  'APPROVAL_DEFINITION_INVALID'
];
const events = [
  'approval.requested',
  'approval.step_approved',
  'approval.rejected',
  'approval.returned',
  'approval.completed',
  'approval.expired'
];
const approvedRoutes = [
  "app.get('/api/v1/approvals/inbox'",
  "app.get('/api/v1/approvals/requests/:id'",
  "app.post('/api/v1/approvals/requests/:id/actions'",
  "app.get('/api/v1/approvals/definitions'",
  "app.post('/api/v1/approvals/definitions'",
  "app.patch('/api/v1/approvals/definitions/:id'",
  "app.get('/api/v1/approvals/delegations'",
  "app.post('/api/v1/approvals/delegations'"
];

test('Module 22 keeps the required five-file Fastify module structure', async () => {
  assert.deepEqual((await readdir(backendDir)).sort(), [
    'approvals.repository.ts',
    'approvals.routes.ts',
    'approvals.schema.ts',
    'approvals.service.ts',
    'index.ts'
  ]);
});

test('Module 22 keeps the approved permissions/errors and the reviewed durable event contract', () => {
  for (const value of [...permissions, ...errors, ...events]) assert.ok(schema.includes(`'${value}'`), value);
  assert.equal((schema.match(/approval\.(?:requested|step_approved|rejected|returned|completed|expired)'/g) ?? []).length, events.length);
});

test('Module 22 exposes the seven source routes plus the approved delegation readback and no public request-creation route', () => {
  for (const route of approvedRoutes) assert.ok(routes.includes(route), route);
  assert.equal((routes.match(/app\.(?:get|post|patch)\('/g) ?? []).length, approvedRoutes.length);
  assert.doesNotMatch(routes, /app\.post\('\/api\/v1\/approvals\/requests'\s*,/);
  assert.match(app, /registerApprovalsRoutes/);
  assert.match(app, /swagger/);
});

test('Module 22 persistence keeps generic project scope after Project Management exists', () => {
  for (const model of ['ApprovalDefinition', 'ApprovalStep', 'ApprovalRequest', 'ApprovalAction', 'ApprovalDelegation']) {
    const block = prisma.match(new RegExp(`model\\s+${model}\\s*\\{[\\s\\S]*?\\n\\}`));
    assert.ok(block, model);
    assert.doesNotMatch(block[0], /projectId|@map\("project_id"\)/);
  }
  assert.match(prisma, /model\s+Project\s*\{/);
  assert.match(schema, /approvalApproverTypeSchema = z\.enum\(\['USER', 'ROLE'\]\)/);
});

test('Module 22 Stage 3 migration is gate-registered and checksum locked', () => {
  const stage3 = gates.gates.filter((gate) => gate.stage === 3).flatMap((gate) => gate.migrations);
  assert.deepEqual(stage3, [
    '20260822001400_module_22_approval_workflows_core',
    '20260822001410_module_22_delegated_approver_identity',
    '20260822001420_module_22_approval_request_source_keys',
    '20260822001430_module_22_approval_timing_policy',
    '20260822001440_module_22_definition_activation_integrity'
  ]);
  for (const migration of stage3) assert.match(checksums.migrations[migration], /^[a-f0-9]{64}$/);
});

test('Module 22 conditions are allow-listed data and never executable code', () => {
  for (const operator of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in']) {
    assert.ok(schema.includes(`'${operator}'`), operator);
  }
  const productionSource = `${schema}\n${repository}\n${service}\n${routes}`;
  assert.doesNotMatch(productionSource, /\beval\s*\(/);
  assert.doesNotMatch(productionSource, /\bnew\s+Function\s*\(/);
});

test('Module 22 keeps request snapshots, append-only actions and Foundation action idempotency', () => {
  assert.match(service, /requestApproval\s*\(/);
  assert.match(service, /definitionVersion/);
  assert.match(service, /payloadSnapshotJson/);
  assert.match(repository, /approvalAction\.create\s*\(/);
  assert.doesNotMatch(repository, /approvalAction\.(?:update|updateMany|delete|deleteMany)\s*\(/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /'approvals\.action'/);
});

test('Module 22 request creation can join an owner transaction and replay a stable source key', () => {
  assert.match(prisma, /sourceKey\s+String\s+@map\(\"source_key\"\)/);
  assert.match(prisma, /@@unique\(\[companyId, sourceKey\]/);
  assert.match(service, /requestApprovalInTransaction\(tx: TransactionClient/);
  assert.match(service, /serializeStableSourceKey\(createStableSourceKey\(input\.sourceKey\)\)/);
  assert.match(repository, /lockApprovalRequestSourceKey/);
  assert.match(repository, /findApprovalRequestBySourceKey/);
  assert.match(integrationTest, /joins the owning transaction and replays the same source key/);
});

test('Module 22 records and uniquely counts the represented approval authority', () => {
  assert.match(prisma, /representedApproverUserId\s+String\s+@map\("represented_approver_user_id"\)/);
  assert.match(prisma, /@@unique\(\[approvalRequestId, stepNo, representedApproverUserId\]/);
  assert.match(repository, /findRepresentedApproverActionForStep/);
  assert.match(repository, /representedApproverUserId: input\.representedApproverUserId/);
  assert.match(service, /resolveUnusedRepresentedApproverUserId/);
  assert.match(service, /representedApproverUserId,/);
  assert.match(integrationTest, /delegated approval authority is counted only once/);
});

test('Module 22 validates active definitions and hardens persisted approval relationships', () => {
  assert.match(schema, /const approverRefSchema = uuidSchema/);
  assert.match(schema, /A USER approval step must require exactly one approval/);
  assert.match(service, /async function assertDefinitionCanActivate/);
  assert.match(service, /approverUserIds\.length < step\.minApprovals/);
  assert.match(service, /if \(result\.status === 'ACTIVE'\)/);
  assert.match(prisma, /@@unique\(\[id, companyId, versionNo\], map: "approval_definitions_id_company_version_uq"\)/);
  for (const constraint of [
    'approval_definitions_status_allowed',
    'approval_steps_approver_type_allowed',
    'approval_steps_user_single_approval',
    'approval_requests_definition_company_version_fkey',
    'approval_requests_requester_company_fkey',
    'approval_requests_current_step_fkey',
    'approval_requests_status_completion_consistent',
    'approval_actions_action_allowed',
    'approval_delegations_from_user_company_fkey',
    'approval_delegations_to_user_company_fkey'
  ]) assert.ok(pass91Migration.includes(constraint), constraint);
  assert.match(integrationTest, /validates approvers before activation and rejects invalid company relationships/);
});

test('Module 22 schedules reminder, escalation and expiry work through the Foundation queue', () => {
  for (const field of ['reminderAfterMinutes', 'escalateAfterMinutes', 'expireAfterMinutes']) {
    assert.ok(schema.includes(field), field);
    assert.ok(prisma.includes(field), field);
    assert.ok(service.includes(field), field);
  }
  assert.match(service, /scheduleApprovalStepTiming/);
  assert.match(service, /enqueueJob\(tx/);
  assert.match(timingWorker, /APPROVAL_REMINDER/);
  assert.match(timingWorker, /APPROVAL_ESCALATION/);
  assert.match(timingWorker, /APPROVAL_EXPIRED/);
  assert.match(timingWorker, /request\.status !== 'PENDING' \|\| request\.currentStepNo !== payload\.stepNo/);
  assert.match(timingWorker, /approval\.expired/);
  assert.equal(apiPackage.scripts['worker:approval-timing'], 'tsx src/workers/approval-timing.worker.ts');
  assert.equal(rootPackage.scripts['module-22:gate'], 'node scripts/module-22/verify-stage-3.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-22:acceptance:live'], 'node scripts/module-22/run-live-acceptance.mjs');
});

test('Module 22 keeps the required React feature with TanStack Query, React Hook Form and Zod', async () => {
  for (const relativePath of [
    'api/approvals-api.ts',
    'hooks/approvals.ts',
    'components/approval-inbox.tsx',
    'components/approval-admin.tsx',
    'pages/approvals-page.tsx'
  ]) await access(`${frontendDir}/${relativePath}`);

  const hooks = await readFile(`${frontendDir}/hooks/approvals.ts`, 'utf8');
  const inbox = await readFile(`${frontendDir}/components/approval-inbox.tsx`, 'utf8');
  const admin = await readFile(`${frontendDir}/components/approval-admin.tsx`, 'utf8');
  assert.match(hooks, /@tanstack\/react-query/);
  assert.match(`${inbox}\n${admin}`, /react-hook-form/);
  assert.match(`${inbox}\n${admin}`, /zod/);
});

test('Module 22 integration and browser suites cover the main workflow and negative security cases', () => {
  for (const pattern of [/Fastify|inject/, /cross-company/i, /idempot/i, /delegation readback/i, /ROLE/, /APPROVE/, /REJECT/, /RETURN/, /403/]) {
    assert.match(integrationTest, pattern);
  }
  for (const pattern of [/Create definition version/, /Decision timeline/, /Existing delegations/, /APPROVE/, /REJECT/, /RETURN/, /delegat/i, /403/]) {
    assert.match(browserTest, pattern);
  }
});

test('Module 22 Stage 3 acceptance uses consolidated support files without runtime pass metadata', async () => {
  assert.equal(rootPackage.scripts['module-22:gate'], 'node scripts/module-22/verify-stage-3.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-22:gate:live'], 'node scripts/module-22/verify-stage-3.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-22:acceptance:live'], 'node scripts/module-22/run-live-acceptance.mjs');
  assert.doesNotMatch(schema, /MODULE_22_STAGE_3_SCOPE/);
  await access('scripts/module-22/verify-stage-3.mjs');
  await access('scripts/module-22/run-live-acceptance.mjs');
});


// Keep the approval action and request workflows readable without introducing another service layer.
test('Pass 172 splits oversized approval workflows into purpose-specific helpers in the same service file', () => {
  for (const helper of [
    'loadApprovalActionContext',
    'applyApprovedAction',
    'applyTerminalApprovalAction',
    'recordApprovalActionAudit',
    'actOnApprovalInTransaction',
    'findReplayableApprovalRequest',
    'resolveApprovalStart',
    'recordApprovalRequestedEvidence',
    'createApprovalRequest'
  ]) {
    assert.match(service, new RegExp(`private async ${helper}\\(`), helper);
  }
  assert.match(service, /async actOnApproval\(requestId: string/);
  assert.match(service, /async requestApprovalInTransaction\(tx: TransactionClient/);
  assert.doesNotMatch(service, /resourceType: string,\s*resourceType: string/);
});
