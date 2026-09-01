import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION_NAME = '20260831000300_final21_dashboard_persistence';
const MIGRATION = `packages/database/prisma/migrations/${MIGRATION_NAME}/migration.sql`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Extract one Prisma model block for focused persistence assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let index = start; index < schema.length; index += 1) {
    if (schema[index] === '{') depth += 1;
    if (schema[index] === '}') {
      depth -= 1;
      if (depth === 0) return schema.slice(start, index + 1);
    }
  }
  return '';
}

test('B1.2 adds exactly the two required Dashboard persistence models', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['DashboardPreference', 'DashboardSavedFilter']) {
    assert.match(prisma, new RegExp(`model ${model}\\b`), `missing ${model}`);
    assert.equal((prisma.match(new RegExp(`model ${model} \\{`, 'g')) ?? []).length, 1);
  }
});

test('B1.2 DashboardPreference stores only user layout and optional default Project', () => {
  const model = prismaModel('DashboardPreference');
  for (const field of ['companyId', 'userId', 'layoutJson', 'defaultProjectId', 'updatedAt']) {
    assert.match(model, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  assert.match(model, /@@unique\(\[companyId, userId\], map: "dashboard_preferences_company_user_uq"\)/);
  assert.match(model, /user\s+User\s+@relation\("DashboardPreferenceUser", fields: \[userId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /defaultProject\s+Project\?\s+@relation\("DashboardPreferenceDefaultProject", fields: \[defaultProjectId, companyId\], references: \[id, companyId\]/);
});

test('B1.2 DashboardSavedFilter is company/user scoped and stores filter JSON only', () => {
  const model = prismaModel('DashboardSavedFilter');
  for (const field of ['companyId', 'userId', 'name', 'filterJson', 'createdAt']) {
    assert.match(model, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  assert.match(model, /user\s+User\s+@relation\("DashboardSavedFilterUser", fields: \[userId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /dashboard_saved_filters_company_user_created_idx/);
});

test('B1.2 Dashboard persistence never stores operational or financial source-of-truth values', () => {
  const models = [prismaModel('DashboardPreference'), prismaModel('DashboardSavedFilter')].join('\n');
  assert.doesNotMatch(models, /actualCost|progressPercent|billedAmount|receivedAmount|outstandingAmount|payableAmount|cashBalance|profitAmount/i);
});

test('B1.2 forward migration creates only the two required Dashboard tables', () => {
  assert.equal(exists(MIGRATION), true);
  const migration = read(MIGRATION);
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 2);
  assert.match(migration, /CREATE TABLE "dashboard_preferences"/);
  assert.match(migration, /CREATE TABLE "dashboard_saved_filters"/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('B1.2 migration fails closed on user and default Project company ownership', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /dashboard_preferences_user_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("user_id", "company_id"\) REFERENCES "users"\("id", "company_id"\)/);
  assert.match(migration, /dashboard_preferences_default_project_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("default_project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /dashboard_saved_filters_user_company_fkey/);
});

test('B1.2 adds bounded ownership indexes without introducing a report or KPI engine', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /dashboard_preferences_company_user_uq/);
  assert.match(migration, /dashboard_preferences_company_default_project_idx/);
  assert.match(migration, /dashboard_saved_filters_company_user_created_idx/);
  assert.doesNotMatch(migration, /report_definition|widget_definition|formula|query_text|source_data/i);
});

test('B1.2 persistence remains source-of-truth free while later Dashboard reads are added', () => {
  const repository = read('apps/api/src/modules/dashboard/dashboard.repository.ts');
  assert.doesNotMatch(repository, /costActual|clientInvoice|clientReceipt|supplierInvoice|journalLine|stageProgressUpdate/);
});

test('B1.2 migration is gate-registered and checksum locked', () => {
  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
  const gate = gates.gates.find((entry) => entry.gate === 'final-21-pass-b1-2-dashboard-persistence');
  assert.ok(gate);
  assert.equal(gate.stage, 57);
  assert.deepEqual(gate.migrations, [MIGRATION_NAME]);
  assert.match(checksums.migrations[MIGRATION_NAME] ?? '', /^[a-f0-9]{64}$/);
});
