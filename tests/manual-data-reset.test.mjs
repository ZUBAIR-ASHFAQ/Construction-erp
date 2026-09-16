import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sqlPath = new URL('../scripts/database/reset-manual-data-preserve-admin.sql', import.meta.url);
const runnerPath = new URL('../scripts/database/run-reset-manual-data.mjs', import.meta.url);
const schemaPath = new URL('../packages/database/prisma/schema.prisma', import.meta.url);

const operationalTables = [
  'projects',
  'clients',
  'vendors',
  'materials',
  'subcontractors',
  'employees',
  'payroll_runs',
  'site_expenses',
  'supplier_invoices',
  'supplier_payments',
  'client_invoices',
  'client_receipts',
  'journals',
  'gl_accounts'
];

test('manual data reset is explicit and preserves the bootstrap administrator credential', async () => {
  const [sql, runner] = await Promise.all([
    readFile(sqlPath, 'utf8'),
    readFile(runnerPath, 'utf8')
  ]);

  assert.match(sql, /administrator\."email" = 'admin@example\.com'/u);
  assert.match(sql, /administrator\."password_hash" AS "password_hash"/u);
  assert.match(sql, /administrator\."password_hash" IS DISTINCT FROM guard\."password_hash"/u);
  assert.doesNotMatch(sql, /UPDATE\s+"users"[\s\S]*"password_hash"/u);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+"users"[\s\S]*=\s*guard\."administrator_id"\s*;/u);

  assert.match(runner, /--confirm-reset/u);
  assert.match(runner, /DEVELOPMENT_DATABASE_URL/u);
  assert.match(runner, /using the application development database URL/u);
  assert.match(runner, /NODE_ENV \?\? 'development'/u);
  assert.match(runner, /cwd: databasePackageDirectory/u);
  assert.match(runner, /'prisma\/schema\.prisma'/u);
  assert.match(runner, /'\.\.\/\.\.\/scripts\/database\/reset-manual-data-preserve-admin\.sql'/u);
  assert.doesNotMatch(runner, /'--schema',\s*schemaFile/u);
  assert.doesNotMatch(runner, /'--file',\s*sqlFile/u);
});

test('manual data reset removes business data and non-admin accounts without dropping authorization infrastructure', async () => {
  const sql = await readFile(sqlPath, 'utf8');

  for (const table of operationalTables) {
    assert.equal(sql.includes(`"${table}"`), true, `${table} must be reset`);
  }

  assert.match(sql, /DELETE FROM "users" account[\s\S]*account\."id" <> guard\."administrator_id"/u);
  assert.match(sql, /DELETE FROM "roles" role[\s\S]*role\."is_system" = FALSE/u);
  assert.match(sql, /role\."code" = 'system-admin'[\s\S]*role\."is_system" = TRUE/u);

  const truncateBlock = sql.match(/TRUNCATE TABLE([\s\S]*?)RESTART IDENTITY;/u)?.[1] ?? '';
  assert.notEqual(truncateBlock, '', 'reset must contain one explicit operational TRUNCATE block');
  assert.doesNotMatch(truncateBlock, /"companies"/u);
  assert.doesNotMatch(truncateBlock, /"permissions"/u);
  assert.doesNotMatch(truncateBlock, /"roles"/u);
  assert.doesNotMatch(truncateBlock, /"role_permissions"/u);
  assert.doesNotMatch(truncateBlock, /"initial_bootstrap_runs"/u);
  assert.doesNotMatch(truncateBlock, /"company_configurations"/u);
});

test('manual data reset table coverage stays aligned with the current Prisma operational models', async () => {
  const [sql, schema] = await Promise.all([
    readFile(sqlPath, 'utf8'),
    readFile(schemaPath, 'utf8')
  ]);

  const protectedTables = new Set([
    'companies',
    'company_configurations',
    'initial_bootstrap_runs',
    'users',
    'auth_sessions',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'number_sequences'
  ]);

  const schemaTables = [...schema.matchAll(/@@map\("([^"]+)"\)/gu)].map((match) => match[1]);
  const resetTables = new Set([...sql.matchAll(/^\s*"([a-z0-9_]+)"[,]?$/gmu)].map((match) => match[1]));

  for (const table of schemaTables) {
    if (protectedTables.has(table)) continue;
    assert.equal(resetTables.has(table), true, `${table} must be covered by the operational reset`);
  }
});
