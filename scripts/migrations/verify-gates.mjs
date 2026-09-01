import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import {
  databaseDir,
  migrationsBeforeLatestGate,
  migrationsInLatestGate,
  makePreviousGatePrismaCopy,
  validateMigrationInventory,
} from './lib.mjs';

const CONFIRM = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const RESET_SQL = `DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nGRANT ALL ON SCHEMA public TO CURRENT_USER;\n`;

/** Parse mode. */
function parseMode() {
  const argument = process.argv.find((value) => value.startsWith('--mode='));
  const mode = argument ? argument.slice('--mode='.length) : 'all';
  if (!['all', 'clean', 'previous'].includes(mode)) {
    throw new Error('Mode must be one of: all, clean, previous.');
  }
  return mode;
}

/** Validate disposable database url. */
function validateDisposableDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error('MIGRATION_TEST_DATABASE_URL is required for live migration verification.');
  }
  if (process.env.MIGRATION_TEST_CONFIRM !== CONFIRM) {
    throw new Error(`Set MIGRATION_TEST_CONFIRM=${CONFIRM} to acknowledge that the migration test database will be destroyed.`);
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('MIGRATION_TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('MIGRATION_TEST_DATABASE_URL must use postgres:// or postgresql://.');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).toLowerCase();
  if (!databaseName || !/(migration[_-]?test|migrate[_-]?test)/.test(databaseName)) {
    throw new Error('For safety, the migration-test database name must contain "migration_test", "migration-test", "migrate_test", or "migrate-test".');
  }
  if (['postgres', 'template0', 'template1', 'construction_erp'].includes(databaseName)) {
    throw new Error(`Refusing to destroy protected database name: ${databaseName}`);
  }
  return rawUrl;
}

/** Run one child-process command and reject when it fails. */
function run(command, args, { cwd = databaseDir, env = process.env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

/** Run one Prisma CLI command against the selected schema. */
async function prisma(args, { schema = 'prisma/schema.prisma', input, env } = {}) {
  await run('pnpm', ['exec', 'prisma', ...args, '--schema', schema], { cwd: databaseDir, input, env });
}

/** Return reset public schema. */
async function resetPublicSchema(env, schema = 'prisma/schema.prisma') {
  await prisma(['db', 'execute', '--stdin'], { schema, input: RESET_SQL, env });
}

/** Verify clean database. */
async function verifyCleanDatabase(env) {
  console.log('\n[clean] Resetting disposable database to an empty public schema...');
  await resetPublicSchema(env);
  console.log('[clean] Applying all committed migrations from zero...');
  await prisma(['migrate', 'deploy'], { env });
  await prisma(['migrate', 'status'], { env });
  console.log('[clean] Clean-database migration verification passed.');
}

/** Verify previous supported schema. */
async function verifyPreviousSupportedSchema(env, inventory) {
  const previous = migrationsBeforeLatestGate(inventory.gateManifest);
  const latest = migrationsInLatestGate(inventory.gateManifest);
  if (latest.length === 0) throw new Error('Latest migration gate contains no migrations.');

  console.log('\n[previous] Resetting disposable database...');
  await resetPublicSchema(env);

  let temp;
  try {
    temp = await makePreviousGatePrismaCopy(previous);
    if (previous.length > 0) {
      console.log(`[previous] Reconstructing previous supported schema from ${previous.length} earlier migration(s)...`);
      const tempSchema = path.join(temp.tempPrismaDir, 'schema.prisma');
      await prisma(['migrate', 'deploy'], { schema: tempSchema, env });
    } else {
      console.log('[previous] No earlier gate migrations exist; previous supported schema is the empty database.');
    }

    console.log(`[previous] Applying latest gate migration(s): ${latest.join(', ')}`);
    await prisma(['migrate', 'deploy'], { env });
    await prisma(['migrate', 'status'], { env });
    console.log('[previous] Previous-supported-schema upgrade verification passed.');
  } finally {
    if (temp?.tempRoot) await rm(temp.tempRoot, { recursive: true, force: true });
  }
}

const mode = parseMode();
const inventory = await validateMigrationInventory();
if (inventory.errors.length > 0) {
  throw new Error(`Static migration policy failed before live verification:\n- ${inventory.errors.join('\n- ')}`);
}

const databaseUrl = validateDisposableDatabaseUrl(process.env.MIGRATION_TEST_DATABASE_URL);
const env = { ...process.env, DATABASE_URL: databaseUrl };

console.log(`Migration verification mode: ${mode}`);
console.log(`Committed migrations: ${inventory.migrationDirectories.length}`);
console.log(`Declared gates: ${inventory.gateManifest.gates.length}`);

if (mode === 'all' || mode === 'clean') await verifyCleanDatabase(env);
if (mode === 'all' || mode === 'previous') await verifyPreviousSupportedSchema(env, inventory);

console.log('\nFoundation migration-gate verification completed successfully.');
