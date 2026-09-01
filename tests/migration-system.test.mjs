import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  migrationsBeforeLatestGate,
  migrationsInLatestGate,
  validateMigrationInventory,
} from '../scripts/migrations/lib.mjs';

const gateManifest = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksumManifest = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const verifier = await readFile('scripts/migrations/verify-gates.mjs', 'utf8');
const compose = await readFile('docker-compose.yml', 'utf8');
const initSql = await readFile('docker/postgres/init/01-create-migration-test-db.sql', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Flatten the ordered migration list declared by the gate manifest. */
function gatedMigrations() {
  return gateManifest.gates.flatMap((gate) => gate.migrations);
}

/** Return every migration except the currently latest accepted gate. */
function expectedPreviousMigrations() {
  const latest = gateManifest.gates.at(-1);
  return latest ? gatedMigrations().slice(0, -latest.migrations.length) : [];
}

test('migration inventory is fully assigned, ordered and checksum-locked', async () => {
  const result = await validateMigrationInventory();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.migrationDirectories, gatedMigrations());
  assert.equal(new Set(result.migrationDirectories).size, result.migrationDirectories.length);
});

test('migration gates remain ordered and the latest gate is the current Final-21 pass', () => {
  assert.equal(gateManifest.formatVersion, 1);
  assert.equal(gateManifest.provider, 'postgresql');
  assert.equal(gateManifest.gates.length, gatedMigrations().length);
  for (let index = 1; index < gateManifest.gates.length; index += 1) {
    assert.ok(gateManifest.gates[index].stage >= gateManifest.gates[index - 1].stage, 'migration gate stages must be non-decreasing');
  }
  const latest = gateManifest.gates.at(-1);
  assert.equal(latest?.stage, 60);
  assert.equal(latest?.gate, 'final-21-repair-project-stage-create-flow');
  assert.deepEqual(latest?.migrations, ['20260901000200_final21_project_stage_create_repair']);
});

test('previous-schema calculation rebuilds every accepted migration before the latest gate', () => {
  assert.deepEqual(migrationsBeforeLatestGate(gateManifest), expectedPreviousMigrations());
  assert.deepEqual(migrationsInLatestGate(gateManifest), gateManifest.gates.at(-1)?.migrations ?? []);
});

test('all applied/reviewed migration SQL has a locked SHA-256 checksum', () => {
  assert.equal(checksumManifest.algorithm, 'sha256');
  for (const migration of gatedMigrations()) {
    assert.match(checksumManifest.migrations[migration], /^[a-f0-9]{64}$/, `missing checksum for ${migration}`);
  }
});

test('static migration policy checker runs without project dependencies', () => {
  const result = spawnSync(process.execPath, ['scripts/migrations/check-migrations.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Migration policy check passed/);
});

test('live verifier has explicit destructive safety guards', () => {
  assert.match(verifier, /MIGRATION_TEST_DATABASE_URL/);
  assert.match(verifier, /RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE/);
  assert.match(verifier, /migration\[_-\]\?test/);
  assert.match(verifier, /DROP SCHEMA IF EXISTS public CASCADE/);
  assert.match(verifier, /migrate', 'deploy/);
  assert.match(verifier, /migrate', 'status/);
});

test('root exposes separate clean and previous-schema migration verification commands', () => {
  assert.equal(rootPackage.version, '0.38.0');
  assert.ok(rootPackage.scripts['db:migrations:check']);
  assert.ok(rootPackage.scripts['db:migrations:verify']);
  assert.ok(rootPackage.scripts['db:migrations:verify:clean']);
  assert.ok(rootPackage.scripts['db:migrations:verify:previous']);
  const scriptNames = Object.keys(rootPackage.scripts ?? {});
  assert.equal(scriptNames.some((name) => /^module-|^pass-/.test(name)), false);
});

test('local PostgreSQL initialization provisions a dedicated disposable migration-test database', () => {
  assert.match(compose, /docker-entrypoint-initdb\.d/);
  assert.match(initSql, /CREATE DATABASE construction_erp_migration_test/);
});
