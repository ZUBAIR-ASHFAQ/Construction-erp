import { access, readFile } from 'node:fs/promises';
import process from 'node:process';

const REQUIRED_CONFIRMATIONS = Object.freeze({
  MODULE_24A_LIVE_GATE_CONFIRM: 'RUN_CONSTRUCTION_ERP_MODULE_24A_LIVE_GATE',
  TEST_DATABASE_CONFIRM: 'RESET_CONSTRUCTION_ERP_TEST_DATABASE',
  MIGRATION_TEST_CONFIRM: 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE',
});

/** Parse and safety-check one PostgreSQL URL used by the destructive acceptance gate. */
function validateDatabaseUrl(name, rawUrl, allowedPattern) {
  if (!rawUrl) throw new Error(`${name} is required for Module 24A live acceptance.`);
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${name} must use postgres:// or postgresql://.`);
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).toLowerCase();
  if (!allowedPattern.test(databaseName)) {
    throw new Error(`${name} must point to an explicitly disposable test database; received database name ${databaseName || '<empty>'}.`);
  }
  if (['postgres', 'template0', 'template1', 'construction_erp'].includes(databaseName)) {
    throw new Error(`${name} refuses protected database name: ${databaseName}`);
  }
}

/** Verify package-lock.json is a modern npm lockfile that is synchronized with the root manifest. */
async function validateLockfile() {
  try {
    await access('package-lock.json');
  } catch {
    throw new Error('package-lock.json is missing. Run npm run module-24a:lockfile before Module 24A live acceptance.');
  }

  const [manifest, lockfile] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('package-lock.json', 'utf8').then(JSON.parse),
  ]);
  if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 2 || !lockfile.packages?.['']) {
    throw new Error('package-lock.json is not a modern reproducible npm lockfile. Regenerate it with npm run module-24a:lockfile.');
  }
  const root = lockfile.packages[''];
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if ((root[field] ?? {})[name] !== spec) {
        throw new Error(`package-lock.json is not synchronized with ${field}.${name}.`);
      }
    }
  }
  if (JSON.stringify(root.workspaces ?? []) !== JSON.stringify(manifest.workspaces ?? [])) {
    throw new Error('package-lock.json workspace declarations are not synchronized with package.json.');
  }
}

await validateLockfile();
for (const [name, expected] of Object.entries(REQUIRED_CONFIRMATIONS)) {
  if (process.env[name] !== expected) throw new Error(`Set ${name}=${expected} before the destructive Module 24A live gate.`);
}
if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 for Module 24A live acceptance.');
if (process.env.RUN_MODULE_24A_AUDIT_GUARD !== '1') throw new Error('Set RUN_MODULE_24A_AUDIT_GUARD=1 for Module 24A live acceptance.');
if (process.env.RUN_MODULE_24A_E2E !== '1') throw new Error('Set RUN_MODULE_24A_E2E=1 for Module 24A live acceptance.');
if (!process.env.AUTH_ACTION_TOKEN_SECRET || process.env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
  throw new Error('AUTH_ACTION_TOKEN_SECRET must be configured with at least 32 characters for the live authentication workflow.');
}
validateDatabaseUrl('TEST_DATABASE_URL', process.env.TEST_DATABASE_URL, /(foundation[_-]?test|integration[_-]?test|erp[_-]?test|test[_-]?erp)/);
validateDatabaseUrl('MIGRATION_TEST_DATABASE_URL', process.env.MIGRATION_TEST_DATABASE_URL, /(migration[_-]?test|migrate[_-]?test)/);
console.log('Module 24A live prerequisites are safe and complete.');
