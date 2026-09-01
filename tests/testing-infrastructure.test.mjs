import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

test('Pass 18 provides a reusable testing workspace package', async () => {
  const pkg = JSON.parse(await read('packages/testing/package.json'));
  assert.equal(pkg.name, '@construction-erp/testing');
  assert.equal(pkg.version, '0.18.0');
  assert.equal(pkg.dependencies['@construction-erp/database'], 'workspace:*');
  assert.equal(pkg.dependencies['@construction-erp/request-context'], 'workspace:*');
});

test('live test database helpers use explicit destructive safety gates', async () => {
  const environment = await read('packages/testing/src/environment.ts');
  const script = await read('scripts/testing/lib.mjs');
  for (const source of [environment, script]) {
    assert.match(source, /RESET_CONSTRUCTION_ERP_TEST_DATABASE/);
    assert.match(source, /foundation/i);
    assert.match(source, /test/i);
    assert.match(source, /construction_erp/);
  }
});

test('test database reset and rollback helpers are explicit', async () => {
  const source = await read('packages/testing/src/database.ts');
  assert.match(source, /TRUNCATE TABLE/);
  assert.match(source, /withRollbackTestTransaction/);
  assert.match(source, /RollbackSentinel/);
  assert.match(source, /client\.\$transaction/);
});

test('deterministic authenticated request context is available for isolation tests', async () => {
  const source = await read('packages/testing/src/context.ts');
  assert.match(source, /createDeterministicTestRequestContext/);
  assert.match(source, /runWithAuthenticatedTestContext/);
  assert.match(source, /bindRequestSecurityContext/);
  assert.match(source, /projectScope/);
});

test('Pass 18 includes dedicated Foundation integration-test database bootstrap', async () => {
  const envExample = await read('.env.test.example');
  const dockerInit = await read('docker/postgres/init/02-create-foundation-test-db.sql');
  assert.match(envExample, /construction_erp_foundation_test/);
  assert.match(envExample, /RUN_FOUNDATION_DB_TESTS=1/);
  assert.match(dockerInit, /CREATE DATABASE construction_erp_foundation_test/);
});
