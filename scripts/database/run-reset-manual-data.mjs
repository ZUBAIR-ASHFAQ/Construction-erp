import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const sqlFile = resolve(scriptDirectory, 'reset-manual-data-preserve-admin.sql');
const databasePackageDirectory = resolve(workspaceRoot, 'packages/database');
const schemaFile = resolve(databasePackageDirectory, 'prisma/schema.prisma');
const apiEnvFile = resolve(workspaceRoot, 'apps/api/.env');
const developmentDatabaseConfigFile = resolve(workspaceRoot, 'packages/config/src/database.ts');
const confirmationFlag = '--confirm-reset';

if (!process.argv.includes(confirmationFlag)) {
  console.error(
    `Manual-data reset aborted: destructive reset requires ${confirmationFlag}. `
    + 'Use the workspace db:reset:manual-data command rather than invoking this file accidentally.'
  );
  process.exit(1);
}

/** Read one environment value without adding a dotenv dependency. */
function readEnvValue(filePath, key) {
  if (!existsSync(filePath)) return null;

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || match[1] !== key) continue;

    let value = match[2];
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, '').trim();
    }

    return value || null;
  }

  return null;
}

if (!process.env.DATABASE_URL) {
  const databaseUrl = readEnvValue(apiEnvFile, 'DATABASE_URL');
  if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
}

// Match the API's development configuration behavior. The API falls back to
// DEVELOPMENT_DATABASE_URL when DATABASE_URL is absent outside production, so
// this explicit maintenance command must target that same database rather than
// failing while the running API is successfully connected to it.
if (!process.env.DATABASE_URL && (process.env.NODE_ENV ?? 'development') !== 'production') {
  if (existsSync(developmentDatabaseConfigFile)) {
    const configSource = readFileSync(developmentDatabaseConfigFile, 'utf8');
    const match = configSource.match(
      /DEVELOPMENT_DATABASE_URL\s*=\s*(['"])(postgres(?:ql)?:\/\/[^'"]+)\1/u
    );
    if (match?.[2]) {
      process.env.DATABASE_URL = match[2];
      console.log('DATABASE_URL is not set; using the application development database URL.');
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    'Manual-data reset aborted: DATABASE_URL is not set. Set it explicitly for production/remote databases, '
    + 'or configure apps/api/.env.'
  );
  process.exit(1);
}

if (!existsSync(sqlFile) || !existsSync(schemaFile)) {
  console.error('Manual-data reset aborted: required database reset files are missing.');
  process.exit(1);
}

console.log(
  'Resetting manually entered ERP data while preserving the bootstrap System Administrator credentials and built-in roles...'
);

// Run Prisma from the database package and pass package-relative paths. This
// avoids Windows shell splitting absolute workspace paths such as
// `D:\Construction erp\...` at spaces when pnpm is launched through cmd.exe.
const result = spawnSync(
  'pnpm',
  [
    'exec',
    'prisma',
    'db',
    'execute',
    '--schema',
    'prisma/schema.prisma',
    '--file',
    '../../scripts/database/reset-manual-data-preserve-admin.sql'
  ],
  {
    cwd: databasePackageDirectory,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
);

if (result.error) {
  console.error(`Manual-data reset failed to start: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(
  'Manual-data reset completed. System Administrator credentials and built-in roles were preserved; custom roles, non-admin users, and operational data were removed.'
);
