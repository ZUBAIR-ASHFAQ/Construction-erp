import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000700_foundation_initial_provisioning/migration.sql',
  'utf8'
);
const types = await readFile('packages/bootstrap/src/types.ts', 'utf8');
const normalize = await readFile('packages/bootstrap/src/normalize.ts', 'utf8');
const fingerprint = await readFile('packages/bootstrap/src/fingerprint.ts', 'utf8');
const provision = await readFile('packages/bootstrap/src/provision.ts', 'utf8');
const identity = await readFile('packages/bootstrap/src/identity.ts', 'utf8');
const errors = await readFile('packages/bootstrap/src/errors.ts', 'utf8');
const cli = await readFile('scripts/bootstrap/initial.mjs', 'utf8');
const bootstrapPackage = JSON.parse(await readFile('packages/bootstrap/package.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

test('Pass 17 adds a dedicated Foundation bootstrap package and controlled CLI', () => {
  assert.equal(rootPackage.version, '0.38.0');
  assert.equal(bootstrapPackage.name, '@construction-erp/bootstrap');
  assert.equal(bootstrapPackage.version, '0.17.0');
  assert.ok(rootPackage.scripts['bootstrap:initial']);
  assert.match(cli, /INITIAL_BOOTSTRAP_CONFIRM/);
  assert.match(cli, /PROVISION_CONSTRUCTION_ERP_INITIAL_COMPANY/);
  assert.match(cli, /bootstrapInitialInstallation/);
});

test('initial provisioning persists required company configuration and durable identity handoff state', () => {
  assert.match(schema, /model\s+CompanyConfiguration\s*\{/);
  assert.match(schema, /@@map\("company_configurations"\)/);
  assert.match(schema, /model\s+InitialBootstrapRun\s*\{/);
  assert.match(schema, /@@map\("initial_bootstrap_runs"\)/);
  assert.match(migration, /CREATE TABLE "company_configurations"/);
  assert.match(migration, /CREATE TABLE "initial_bootstrap_runs"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
});

test('bootstrap state allows only identity-pending or completed and records completion proof', () => {
  for (const marker of [
    'IDENTITY_PENDING',
    'COMPLETED',
    'administrator_user_id',
    'system_role_ids_by_code',
    'completed_at',
    'initial_bootstrap_runs_identity_completion_shape'
  ]) assert.match(migration, new RegExp(marker));
  assert.match(types, /BootstrapIdentityProvisioner/);
  assert.match(types, /administratorUserId/);
  assert.match(types, /systemRoleIdsByCode/);
  assert.match(identity, /exactly one role UUID for each requested system-role code/);
});

test('Foundation bootstrap never steals Module 24A table ownership', () => {
  assert.doesNotMatch(migration, /CREATE TABLE "users"/i);
  assert.doesNotMatch(migration, /CREATE TABLE "roles"/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"users"/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"roles"/i);
  assert.match(types, /Module 24A implements this adapter/);
  assert.match(provision, /Module 24A supplies an identity adapter/);
});

test('company, configuration and number sequences share one transaction', () => {
  assert.match(provision, /client\.\$transaction/);
  assert.match(provision, /tx\.company\.create/);
  assert.match(provision, /tx\.companyConfiguration\.create/);
  assert.match(provision, /ensureProvisionedNumberSequence\(tx/);
  assert.doesNotMatch(provision, /new PrismaClient/);
});

test('bootstrap is concurrency-safe and idempotent without company-scoped request context', () => {
  assert.match(provision, /pg_advisory_xact_lock/);
  assert.match(provision, /bootstrapFingerprint/);
  assert.match(provision, /requestFingerprint !== fingerprint/);
  assert.match(errors, /INITIAL_BOOTSTRAP_KEY_REUSED/);
  assert.match(errors, /INITIAL_BOOTSTRAP_ALREADY_INITIALIZED/);
  assert.doesNotMatch(provision, /requireRequestSecurityContext/);
  assert.doesNotMatch(types.match(/InitialBootstrapInput[\s\S]*?}>;/)?.[0] ?? '', /companyId\s*:/);
});

test('a different bootstrap key cannot create another initial company', () => {
  assert.match(provision, /tx\.initialBootstrapRun\.count/);
  assert.match(provision, /tx\.company\.count/);
  assert.match(provision, /bootstrapAlreadyInitialized/);
});

test('bootstrap input rejects persisted secrets and never accepts administrator credentials', () => {
  assert.match(normalize, /SENSITIVE_CONFIG_KEYS/);
  for (const marker of ['password', 'token', 'secret', 'apikey', 'databaseurl']) {
    assert.match(normalize.toLowerCase(), new RegExp(marker));
  }
  assert.doesNotMatch(types, /password\s*:/i);
  assert.doesNotMatch(types, /token\s*:/i);
  assert.doesNotMatch(types, /mfaSecret/i);
  assert.doesNotMatch(migration, /password|refresh_token|access_token|mfa_secret/i);
});

test('bootstrap input uses deterministic normalized identity and sequence definitions', () => {
  assert.match(normalize, /normalizeNumberSequenceDefinition/);
  assert.match(normalize, /duplicate sequence keys/);
  assert.match(normalize, /duplicate role codes/);
  assert.match(normalize, /references undefined system role/);
  assert.match(fingerprint, /createHash\('sha256'\)/);
  assert.match(fingerprint, /Object\.keys.*sort/);
  assert.match(fingerprint, /typeof value === 'bigint'/);
});

test('Pass 17 migration defends JSON and fingerprint/status invariants', () => {
  for (const marker of [
    'company_configurations_settings_object',
    'initial_bootstrap_runs_fingerprint_shape',
    'initial_bootstrap_runs_status_allowed',
    'initial_bootstrap_runs_admin_role_codes_array',
    'initial_bootstrap_runs_system_roles_array',
    'initial_bootstrap_runs_identity_completion_shape'
  ]) assert.match(migration, new RegExp(marker));
});

// Verify replayed completion proof cannot silently drift from the original reviewed role set.
test('bootstrap replay validates exact and unique persisted system-role completion proof', () => {
  assert.match(identity, /different role UUID for each requested system-role code/);
  assert.match(identity, /Persisted system role identifiers must be unique per role code/);
  assert.match(provision, /expectedRoleCodes/);
  assert.match(provision, /persistedRoleCodes/);
  assert.match(provision, /Completed bootstrap role proof does not match the original bootstrap input/);
});
