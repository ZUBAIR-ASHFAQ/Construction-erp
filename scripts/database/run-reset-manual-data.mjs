import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '../..');
const sqlFile = resolve(scriptDirectory, 'reset-manual-data-preserve-admin.sql');
const schemaFile = resolve(workspaceRoot, 'packages/database/prisma/schema.prisma');
const apiEnvFile = resolve(workspaceRoot, 'apps/api/.env');

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

if (!process.env.DATABASE_URL) {
  console.error('Manual-data reset aborted: DATABASE_URL is not set and apps/api/.env does not contain it.');
  process.exit(1);
}

if (!existsSync(sqlFile) || !existsSync(schemaFile)) {
  console.error('Manual-data reset aborted: required database reset files are missing.');
  process.exit(1);
}

console.log('Resetting manually entered ERP data while preserving the bootstrap System Administrator credentials...');

const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@construction-erp/database',
    'exec',
    'prisma',
    'db',
    'execute',
    '--schema',
    schemaFile,
    '--file',
    sqlFile
  ],
  {
    cwd: workspaceRoot,
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

console.log('Manual-data reset completed. System Administrator credentials were preserved; non-admin users and operational data were removed.');
