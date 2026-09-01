import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION_NAME = '20260831000200_final21_reports_persistence';
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

test('B20.2 adds exactly the three required Reports persistence models', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['ReportDefinition', 'ReportRun', 'SavedReportFilter']) {
    assert.match(prisma, new RegExp(`model ${model}\\b`), `missing ${model}`);
    assert.equal((prisma.match(new RegExp(`model ${model} \\{`, 'g')) ?? []).length, 1);
  }
});

test('B20.2 ReportDefinition stores only catalog metadata and permits shared definitions', () => {
  const model = prismaModel('ReportDefinition');
  for (const field of [
    'companyId', 'code', 'name', 'domain', 'requiredPermissions', 'filterSchemaJson', 'outputFormats', 'status'
  ]) assert.match(model, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  assert.match(model, /companyId\s+String\?/);
  assert.match(model, /requiredPermissions\s+Json/);
  assert.match(model, /filterSchemaJson\s+Json/);
  assert.match(model, /outputFormats\s+Json/);
  assert.doesNotMatch(model, /sql|formula|queryText|sourceData/i);
});

test('B20.2 ReportRun keeps export state company/user scoped and links files to Documents', () => {
  const model = prismaModel('ReportRun');
  for (const field of [
    'companyId', 'reportCode', 'requestedBy', 'filtersJson', 'outputFormat', 'status',
    'fileId', 'startedAt', 'finishedAt', 'errorCode'
  ]) assert.match(model, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  assert.match(model, /requester\s+User\s+@relation\("ReportRunRequester", fields: \[requestedBy, companyId\], references: \[id, companyId\]/);
  assert.match(model, /file\s+Document\?\s+@relation\("ReportRunFile", fields: \[fileId, companyId\], references: \[id, companyId\]/);
});

test('B20.2 SavedReportFilter is company/user scoped and stores validated filter JSON only', () => {
  const model = prismaModel('SavedReportFilter');
  for (const field of ['companyId', 'userId', 'reportCode', 'name', 'filtersJson', 'createdAt']) {
    assert.match(model, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  assert.match(model, /user\s+User\s+@relation\("SavedReportFilterUser", fields: \[userId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /saved_report_filters_company_user_report_idx/);
});

test('B20.2 forward migration creates only the three Reports tables and preserves history', () => {
  assert.equal(exists(MIGRATION), true);
  const migration = read(MIGRATION);
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 3);
  for (const table of ['report_definitions', 'report_runs', 'saved_report_filters']) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('B20.2 migration fails closed on report requester, export file and saved-filter ownership', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /report_runs_requester_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("requested_by", "company_id"\) REFERENCES "users"\("id", "company_id"\)/);
  assert.match(migration, /report_runs_file_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("file_id", "company_id"\) REFERENCES "documents"\("id", "company_id"\)/);
  assert.match(migration, /saved_report_filters_user_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("user_id", "company_id"\) REFERENCES "users"\("id", "company_id"\)/);
});

test('B20.2 adds bounded indexes and no duplicated report source-of-truth fields', () => {
  const models = [
    prismaModel('ReportDefinition'),
    prismaModel('ReportRun'),
    prismaModel('SavedReportFilter')
  ].join('\n');
  assert.match(models, /report_definitions_company_status_domain_idx/);
  assert.match(models, /report_runs_company_requester_status_idx/);
  assert.match(models, /report_runs_company_report_code_idx/);
  assert.match(models, /saved_report_filters_company_user_report_idx/);
  assert.doesNotMatch(models, /actualCost|billedAmount|receivedAmount|profitAmount|payableAmount|stageProgress/);
});

test('B20.2 persistence stays isolated while later read-model work remains migration-free', () => {
  const repository = read('apps/api/src/modules/reports/reports.repository.ts');
  assert.match(read('apps/api/src/modules/reports/reports.service.ts'), /export class ReportsService/);
  assert.doesNotMatch(repository, /costActual|clientInvoice|clientReceipt|supplierInvoice|journalLine|attendanceEntry/);
});

test('B20.2 migration is gate-registered and checksum locked', () => {
  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
  const gate = gates.gates.find((entry) => entry.gate === 'final-21-pass-b20-2-reports-persistence');
  assert.ok(gate);
  assert.equal(gate.stage, 56);
  assert.deepEqual(gate.migrations, [MIGRATION_NAME]);
  assert.match(checksums.migrations[MIGRATION_NAME] ?? '', /^[a-f0-9]{64}$/);
});
