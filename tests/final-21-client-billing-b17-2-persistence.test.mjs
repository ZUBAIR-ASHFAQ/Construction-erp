import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION_NAME = '20260830000300_final21_client_billing_persistence_integrity';
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

test('B17.2 adds only one forward persistence-integrity migration', () => {
  assert.equal(exists(MIGRATION), true);
  const migration = read(MIGRATION);
  assert.doesNotMatch(migration, /CREATE TABLE/i);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /DELETE FROM\s+"progress_claim|DELETE FROM\s+"client_invoice/i);
});

test('B17.2 gives Progress Claim lines a real Project Stage relation without duplicating Project ownership', () => {
  const model = prismaModel('ProgressClaimLine');
  assert.match(model, /stageId\s+String\?/);
  assert.match(model, /stage\s+ProjectStage\?\s+@relation\("ProgressClaimLineStage", fields: \[stageId\], references: \[id\]/);
  assert.match(model, /@@index\(\[stageId\], map: "progress_claim_lines_stage_idx"\)/);
  assert.doesNotMatch(model, /\bprojectId\b|\bcompanyId\b/);
});

test('B17.2 gives Client Invoice lines Stage and Finance revenue-account relations without duplicate ownership columns', () => {
  const model = prismaModel('ClientInvoiceLine');
  assert.match(model, /stage\s+ProjectStage\?\s+@relation\("ClientInvoiceLineStage", fields: \[stageId\], references: \[id\]/);
  assert.match(model, /revenueAccount\s+GlAccount\?\s+@relation\("ClientInvoiceLineRevenueAccount", fields: \[revenueAccountId\], references: \[id\]/);
  assert.match(model, /@@index\(\[stageId\], map: "client_invoice_lines_stage_idx"\)/);
  assert.match(model, /@@index\(\[revenueAccountId\], map: "client_invoice_lines_revenue_account_idx"\)/);
  assert.doesNotMatch(model, /\bprojectId\b|\bcompanyId\b/);
});

test('B17.2 wires the inverse Stage and GL relations instead of introducing duplicate masters', () => {
  const stage = prismaModel('ProjectStage');
  const account = prismaModel('GlAccount');
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(stage, /progressClaimLines\s+ProgressClaimLine\[\]\s+@relation\("ProgressClaimLineStage"\)/);
  assert.match(stage, /clientInvoiceLines\s+ClientInvoiceLine\[\]\s+@relation\("ClientInvoiceLineStage"\)/);
  assert.match(account, /clientInvoiceLines\s+ClientInvoiceLine\[\]\s+@relation\("ClientInvoiceLineRevenueAccount"\)/);
  assert.equal((prisma.match(/model ProjectStage \{/g) ?? []).length, 1);
  assert.equal((prisma.match(/model GlAccount \{/g) ?? []).length, 1);
});

test('B17.2 fails closed when existing Stage or revenue-account ownership is invalid', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /Progress Claim line Stage scope is invalid/);
  assert.match(migration, /Client Invoice line Stage scope is invalid/);
  assert.match(migration, /Client Invoice line revenue account scope is invalid/);
  assert.match(migration, /stage\."project_id" IS DISTINCT FROM claim\."project_id"/);
  assert.match(migration, /stage\."project_id" IS DISTINCT FROM invoice\."project_id"/);
  assert.match(migration, /account\."company_id" IS DISTINCT FROM invoice\."company_id"/);
});

test('B17.2 adds database foreign keys and one shared scope trigger for future writes', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /progress_claim_lines_stage_fkey/);
  assert.match(migration, /client_invoice_lines_stage_fkey/);
  assert.match(migration, /client_invoice_lines_revenue_account_fkey/);
  assert.match(migration, /CREATE FUNCTION "final21_validate_client_billing_line_scope"/);
  assert.match(migration, /CREATE TRIGGER "progress_claim_lines_scope_integrity"/);
  assert.match(migration, /CREATE TRIGGER "client_invoice_lines_scope_integrity"/);
  assert.match(migration, /Client Billing Stage must belong to the same Project and Company/);
  assert.match(migration, /Client Invoice revenue account must belong to the same Company/);
});

test('B17.2 records that Finance posting was intentionally deferred at the persistence-only checkpoint', () => {
  const doc = read('docs/PASS-B17-2-FINAL21-CLIENT-BILLING-PERSISTENCE-INTEGRITY.md');
  assert.match(doc, /post Client Invoices to Finance \/ AR/);
});

test('B17.2 migration is gate-registered and checksum locked', () => {
  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
  const gate = gates.gates.find((entry) => entry.gate === 'final-21-pass-b17-2-client-billing-persistence-integrity');
  assert.ok(gate);
  assert.equal(gate.stage, 51);
  assert.deepEqual(gate.migrations, [MIGRATION_NAME]);
  assert.match(checksums.migrations[MIGRATION_NAME] ?? '', /^[a-f0-9]{64}$/);
});

test('B17.2 documents the next boundary as Zod contract alignment only', () => {
  const doc = read('docs/PASS-B17-2-FINAL21-CLIENT-BILLING-PERSISTENCE-INTEGRITY.md');
  assert.match(doc, /B17\.3 - Client Billing boundary contract alignment/i);
  assert.match(doc, /does not change Client Billing repositories, services, routes, or React behavior/i);
});
