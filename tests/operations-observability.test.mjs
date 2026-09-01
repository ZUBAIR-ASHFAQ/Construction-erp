import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';

const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const operationsPackage = JSON.parse(await readFile('packages/operations/package.json', 'utf8'));
const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8'));
const health = await readFile('packages/operations/src/health.ts', 'utf8');
const metrics = await readFile('packages/operations/src/metrics.ts', 'utf8');
const diagnostics = await readFile('packages/operations/src/diagnostics.ts', 'utf8');
const plugin = await readFile('apps/api/src/plugins/operations.ts', 'utf8');
const config = await readFile('packages/config/src/operations.ts', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const main = await readFile('apps/api/src/main.ts', 'utf8');
const outboxDiagnostics = await readFile('packages/outbox/src/diagnostics.ts', 'utf8');
const envExample = await readFile('apps/api/.env.example', 'utf8');

test('Pass 19 adds a dedicated operations package and API dependency', () => {
  assert.equal(rootPackage.version, '0.38.0');
  assert.equal(operationsPackage.name, '@construction-erp/operations');
  assert.equal(operationsPackage.version, '0.19.0');
  assert.equal(apiPackage.dependencies['@construction-erp/operations'], 'workspace:*');
});

test('liveness is process-only while readiness checks PostgreSQL and storage with a timeout', () => {
  assert.match(health, /getLivenessReport/);
  assert.match(health, /getReadinessReport/);
  assert.match(health, /database\.\$queryRaw`SELECT 1`/);
  assert.match(health, /storage\.checkHealth\(\)/);
  assert.match(health, /withTimeout/);
  assert.match(health, /DEPENDENCY_TIMEOUT/);
  assert.match(health, /status: ready \? 'ready' : 'not-ready'/);
});

test('HTTP metrics use low-cardinality route templates and never identity labels', () => {
  assert.match(metrics, /construction_erp_http_requests_total/);
  assert.match(metrics, /construction_erp_http_request_duration_seconds_sum/);
  assert.match(metrics, /status_class/);
  assert.match(metrics, /normalizeRoute/);
  assert.doesNotMatch(metrics, /companyId/);
  assert.doesNotMatch(metrics, /actorUserId/);
  assert.doesNotMatch(metrics, /requestId/);
  assert.doesNotMatch(metrics, /correlationId/);
});

test('queue and outbox diagnostics are aggregate-only', () => {
  assert.match(diagnostics, /getQueueDiagnostics/);
  assert.match(diagnostics, /getOutboxDiagnostics/);
  assert.match(diagnostics, /construction_erp_queue_due_jobs/);
  assert.match(diagnostics, /construction_erp_outbox_due_events/);
  assert.match(outboxDiagnostics, /groupBy/);
  assert.match(outboxDiagnostics, /dueEvents/);
  assert.match(outboxDiagnostics, /staleProcessingEvents/);
  for (const forbidden of ['payload', 'resource_id', 'company_id', 'actor_user_id']) {
    assert.doesNotMatch(outboxDiagnostics, new RegExp(forbidden));
  }
});

test('operational HTTP surfaces include health, readiness, metrics and async diagnostics', () => {
  for (const route of ['/health', '/readiness', '/metrics', '/operations/queues', '/operations/outbox']) {
    assert.match(plugin, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.match(plugin, /cache-control/);
  assert.match(plugin, /text\/plain; version=0\.0\.4/);
  assert.match(plugin, /report\.status === 'ready' \? 200 : 503/);
});

test('diagnostic endpoints default closed in production because RBAC does not exist yet', () => {
  assert.match(config, /OPERATIONS_DIAGNOSTICS_ENABLED/);
  assert.match(config, /nodeEnv !== 'production'/);
  assert.match(config, /OPERATIONS_READINESS_TIMEOUT_MS/);
  assert.match(config, /OPERATIONS_STALE_LEASE_SECONDS/);
  assert.match(serverConfig, /operations: OperationsConfig/);
  assert.match(serverConfig, /loadOperationsConfig/);
  assert.match(envExample, /OPERATIONS_DIAGNOSTICS_ENABLED/);
});

test('Pass 19 implements bounded graceful shutdown and safe fatal logging', () => {
  assert.match(main, /process\.once\('SIGTERM'/);
  assert.match(main, /process\.once\('SIGINT'/);
  assert.match(main, /shutdownGraceMs/);
  assert.match(main, /shutdown\.grace_period_exceeded/);
  assert.match(main, /toSafeErrorLog/);
  assert.doesNotMatch(main, /app\.log\.(?:error|fatal)\(error\)/);
});

test('Pass 19 remains observability-only and owns no Prisma migration', async () => {
  const migrations = (await readdir('packages/database/prisma/migrations', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrations.some((name) => name.includes('operations') || name.includes('observability')), false);
  assert.ok(migrations.includes('20260822000700_foundation_initial_provisioning'));
});
