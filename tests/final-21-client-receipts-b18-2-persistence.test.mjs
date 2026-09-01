import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION_NAME = '20260830000500_final21_client_receipts_persistence_integrity';
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

test('B18.2 adds exactly the two required Client Receipts source models', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(prisma, /model ClientReceipt\b/);
  assert.match(prisma, /model ClientReceiptAllocation\b/);
  assert.equal((prisma.match(/model ClientReceipt \{/g) ?? []).length, 1);
  assert.equal((prisma.match(/model ClientReceiptAllocation \{/g) ?? []).length, 1);
});

test('B18.2 ClientReceipt persists the required Final-21 receipt fields with precise money', () => {
  const model = prismaModel('ClientReceipt');
  for (const field of [
    'companyId', 'clientId', 'projectId', 'stageId', 'receiptNo', 'receiptDate', 'amount',
    'paymentMethod', 'cashBankAccountId', 'reference', 'receiptType', 'status', 'createdBy', 'postedAt'
  ]) assert.match(model, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  assert.match(model, /amount\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.match(model, /@@unique\(\[companyId, receiptNo\], map: "client_receipts_company_receipt_no_uq"\)/);
});

test('B18.2 enforces Client -> Project, optional Stage, Cash/Bank and creator ownership relationally', () => {
  const receipt = prismaModel('ClientReceipt');
  const project = prismaModel('Project');
  assert.match(project, /@@unique\(\[id, companyId, clientId\], map: "projects_id_company_client_uq"\)/);
  assert.match(receipt, /client\s+Client\s+@relation\(fields: \[clientId, companyId\], references: \[id, companyId\]/);
  assert.match(receipt, /project\s+Project\s+@relation\(fields: \[projectId, companyId, clientId\], references: \[id, companyId, clientId\]/);
  assert.match(receipt, /stage\s+ProjectStage\?\s+@relation\("ClientReceiptStage", fields: \[stageId, projectId\], references: \[id, projectId\]/);
  assert.match(receipt, /cashBankAccount\s+CashBankAccount\s+@relation\(fields: \[cashBankAccountId, companyId\], references: \[id, companyId\]/);
  assert.match(receipt, /creator\s+User\s+@relation\("ClientReceiptCreator", fields: \[createdBy, companyId\], references: \[id, companyId\]/);
});

test('B18.2 allocation model keeps only allocation ownership fields and no duplicated Company/Project/Client columns', () => {
  const allocation = prismaModel('ClientReceiptAllocation');
  for (const field of ['receiptId', 'clientInvoiceId', 'amount', 'allocatedAt', 'allocatedBy']) {
    assert.match(allocation, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  assert.doesNotMatch(allocation, /\bcompanyId\b|\bprojectId\b|\bclientId\b|\bstageId\b/);
  assert.match(allocation, /receipt\s+ClientReceipt\s+@relation/);
  assert.match(allocation, /invoice\s+ClientInvoice\s+@relation/);
  assert.match(allocation, /actor\s+User\s+@relation\("ClientReceiptAllocationActor"/);
});

test('B18.2 forward migration creates only the two Module 16 tables and preserves history', () => {
  assert.equal(exists(MIGRATION), true);
  const migration = read(MIGRATION);
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 2);
  assert.match(migration, /CREATE TABLE "client_receipts"/);
  assert.match(migration, /CREATE TABLE "client_receipt_allocations"/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test('B18.2 migration fails closed on receipt owner scope through composite foreign keys', () => {
  const migration = read(MIGRATION);
  for (const constraint of [
    'client_receipts_client_company_fkey',
    'client_receipts_project_owner_fkey',
    'client_receipts_stage_project_fkey',
    'client_receipts_cash_bank_company_fkey',
    'client_receipts_created_by_company_fkey'
  ]) assert.ok(migration.includes(constraint), `missing ${constraint}`);
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id", "client_id"\) REFERENCES "projects"\("id", "company_id", "client_id"\)/);
  assert.match(migration, /FOREIGN KEY \("stage_id", "project_id"\) REFERENCES "project_stages"\("id", "project_id"\)/);
});

test('B18.2 allocation trigger rejects cross-Company, cross-Client, cross-Project and wrong-actor writes', () => {
  const migration = read(MIGRATION);
  assert.match(migration, /CREATE FUNCTION "final21_validate_client_receipt_allocation_scope"/);
  assert.match(migration, /invoice_company_id IS DISTINCT FROM receipt_company_id/);
  assert.match(migration, /invoice_client_id IS DISTINCT FROM receipt_client_id/);
  assert.match(migration, /invoice_project_id IS DISTINCT FROM receipt_project_id/);
  assert.match(migration, /actor_company_id IS DISTINCT FROM receipt_company_id/);
  assert.match(migration, /CREATE TRIGGER "client_receipt_allocations_scope_integrity"/);
});

test('B18.2 adds bounded receipt/allocation indexes without storing manual balances', () => {
  const receipt = prismaModel('ClientReceipt');
  const allocation = prismaModel('ClientReceiptAllocation');
  assert.match(receipt, /client_receipts_company_project_status_date_idx/);
  assert.match(receipt, /client_receipts_company_client_status_date_idx/);
  assert.match(receipt, /client_receipts_project_stage_date_idx/);
  assert.match(allocation, /client_receipt_allocations_receipt_at_idx/);
  assert.match(allocation, /client_receipt_allocations_invoice_at_idx/);
  assert.doesNotMatch(receipt + allocation, /outstandingBalance|advanceBalance|profitAmount|receivedTotal/);
});

test('B18.2 seeds exactly the four frozen Client Receipts permissions for later runtime use', () => {
  const migration = read(MIGRATION);
  for (const permission of [
    'client_receipts.read',
    'client_receipts.create',
    'client_receipts.allocate',
    'client_receipts.reverse'
  ]) assert.ok(migration.includes(permission), `missing ${permission}`);
  assert.match(migration, /role\."code" = 'system-admin'/);
});

test('B18.2 persistence remains isolated while later boundary work stays unregistered', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-2-client-receipts-persistence-integrity.json'));
  const doc = read('docs/PASS-B18-2-FINAL21-CLIENT-RECEIPTS-PERSISTENCE-INTEGRITY.md');
  assert.match(doc, /runtime remains deliberately deferred/i);
  assert.equal(exists('apps/api/src/modules/client-receipts/client-receipts.schema.ts'), true);
  assert.match(doc, /does not add the backend module, routes, services, repositories, or React feature/i);
  assert.equal(evidence.runtimeDeferred, true);
  assert.equal(evidence.runtimeDeferred, true);
});

test('B18.2 migration is gate-registered and checksum locked', () => {
  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
  const gate = gates.gates.find((entry) => entry.gate === 'final-21-pass-b18-2-client-receipts-persistence-integrity');
  assert.ok(gate);
  assert.equal(gate.stage, 53);
  assert.deepEqual(gate.migrations, [MIGRATION_NAME]);
  assert.match(checksums.migrations[MIGRATION_NAME] ?? '', /^[a-f0-9]{64}$/);
});

test('B18.2 documents B18.3 as boundary-contract work and records acceptance evidence', () => {
  const doc = read('docs/PASS-B18-2-FINAL21-CLIENT-RECEIPTS-PERSISTENCE-INTEGRITY.md');
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-2-client-receipts-persistence-integrity.json'));
  assert.match(doc, /B18\.3 - Client Receipts boundary contract alignment/i);
  assert.match(doc, /does not add the backend module, routes, services, repositories, or React feature/i);
  assert.equal(evidence.pass, 'B18.2');
  assert.equal(evidence.databaseMigrationAdded, true);
  assert.equal(evidence.nextPass, 'B18.3 Client Receipts boundary contract alignment');
});
