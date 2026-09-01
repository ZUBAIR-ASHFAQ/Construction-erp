import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile, readdir } from 'node:fs/promises';

const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const gate = await readFile('scripts/foundation/verify-stage-0.mjs', 'utf8');
const gateLib = await readFile('scripts/foundation/gate-lib.mjs', 'utf8');
const bootstrap = await readFile('packages/bootstrap/src/provision.ts', 'utf8');
const contracts = await readFile('packages/contracts/src/index.ts', 'utf8');
const recovery = await readFile('scripts/recovery/run-drill.mjs', 'utf8');
const liveAcceptanceRunner = await readFile('scripts/foundation/run-live-acceptance.mjs', 'utf8');

const required = [
  'apps/api/src/app.ts',
  'packages/config/src/server.ts',
  'packages/database/prisma/schema.prisma',
  'packages/request-context/src/index.ts',
  'packages/tenant-scope/src/index.ts',
  'packages/errors/src/index.ts',
  'packages/logging/src/index.ts',
  'packages/audit/src/index.ts',
  'packages/outbox/src/index.ts',
  'packages/idempotency/src/index.ts',
  'packages/numbering/src/index.ts',
  'packages/storage/src/index.ts',
  'packages/queue/src/index.ts',
  'packages/contracts/src/index.ts',
  'packages/bootstrap/src/index.ts',
  'packages/testing/src/index.ts',
  'packages/operations/src/index.ts',
  'docs/recovery/README.md',
  'docs/foundation/STAGE-0-ACCEPTANCE.md',
  'scripts/foundation/run-live-acceptance.mjs'
];

test('Stage-0 Foundation acceptance gate remains machine-checkable', async () => {
  assert.equal(rootPackage.version, '0.38.0');
  await Promise.all(required.map((file) => access(file)));
  assert.equal(rootPackage.scripts['foundation:gate'], 'node scripts/foundation/verify-stage-0.mjs --mode=static');
  assert.equal(rootPackage.scripts['foundation:gate:live'], 'node scripts/foundation/verify-stage-0.mjs --mode=live');
  assert.equal(rootPackage.scripts['foundation:acceptance:live'], 'node scripts/foundation/run-live-acceptance.mjs');
});

test('Foundation still owns the canonical company root after Project Management is generated', () => {
  assert.match(schema, /model\s+Company\s*\{/);
  assert.match(schema, /model\s+User\s*\{/);
  assert.match(schema, /model\s+Project\s*\{/);
  for (const model of ['AuditLog', 'OutboxEvent', 'IdempotencyRecord', 'NumberSequence', 'QueueJob', 'CompanyConfiguration', 'InitialBootstrapRun']) {
    assert.match(schema, new RegExp(`model\\s+${model}\\s*\\{`));
  }
  assert.match(schema, /projectScope\s+Json\s+@map\("project_scope"\)/);
});

test('all seven Stage-0 migrations remain present and immutable before later stage migrations', async () => {
  const dirs = (await readdir('packages/database/prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(dirs.slice(0, 7), [
    '20260822000100_foundation_company_master',
    '20260822000200_foundation_audit_infrastructure',
    '20260822000300_foundation_transactional_outbox',
    '20260822000400_foundation_idempotency_infrastructure',
    '20260822000500_foundation_number_sequence_infrastructure',
    '20260822000600_foundation_queue_infrastructure',
    '20260822000700_foundation_initial_provisioning'
  ]);
  assert.deepEqual(dirs.slice(7, 10), [
    '20260822000800_module_24a_users_rbac_core',
    '20260822000900_module_24a_access_session_security',
    '20260822001000_module_24a_invitation_recovery'
  ]);
  assert.deepEqual(dirs.slice(10, 12), [
    '20260822001100_module_18_document_management_core',
    '20260822001200_module_18_upload_intents'
  ]);
});

test('integration contracts needed by later modules remain defined before Stage 1', () => {
  for (const symbol of ['createStableSourceKey', 'createResourceReference', 'createDocumentReference', 'createFinancialPostingCommand', 'INTEGRATION_EVENT_ENVELOPE_VERSION']) {
    assert.match(contracts, new RegExp(symbol));
  }
});

test('initial provisioning preserves Module 24A identity ownership through a durable handoff', () => {
  assert.match(bootstrap, /IDENTITY_PENDING/);
  assert.match(bootstrap, /BootstrapIdentityProvisioner/);
  assert.match(bootstrap, /completeIdentity/);
  assert.match(schema, /model\s+Role\s*\{/);
});

test('live acceptance requires migrations, database integration and both recovery systems', () => {
  assert.match(gate, /db:migrations:verify/);
  assert.match(gate, /test:integration/);
  assert.match(gate, /recovery:drill/);
  assert.match(gate, /READY_FOR_STAGE_1_LIVE/);
  assert.match(recovery, /restore-postgres/);
  assert.match(recovery, /restore-object-storage/);
});

test('Foundation live runner creates fresh recovery backups before the gate', () => {
  assert.match(liveAcceptanceRunner, /baseline:full/);
  assert.match(liveAcceptanceRunner, /recovery:backup:postgres/);
  assert.match(liveAcceptanceRunner, /recovery:backup:storage/);
  assert.match(liveAcceptanceRunner, /foundation:gate:live/);
  assert.match(liveAcceptanceRunner, /RUN_FOUNDATION_DB_TESTS/);
});

test('acceptance evidence is intentionally secret-free', () => {
  assert.match(gateLib, /safeEnvironmentSummary/);
  for (const forbidden of ['DATABASE_URL:', 'STORAGE_SECRET_ACCESS_KEY:', 'PGPASSWORD:', 'accessKeyId:', 'password:']) {
    assert.doesNotMatch(gateLib, new RegExp(forbidden));
  }
});
