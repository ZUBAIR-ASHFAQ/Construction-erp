import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260829000400_final21_client_billing_without_contract/migration.sql', 'utf8');
const schema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/client-billing/api/client-billing-api.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/client-billing/components/client-billing-workspace.tsx', 'utf8');

/** Extract one Prisma model block for focused Final-21 assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

test('active Client Billing has no standalone ClientContract or RetentionLedger model', () => {
  assert.doesNotMatch(prisma, /model ClientContract \{/);
  assert.doesNotMatch(prisma, /model RetentionLedger \{/);
  for (const source of [schema, repository, service, routes, webApi, workspace]) {
    assert.doesNotMatch(source, /ClientContract|client_contracts|retentionLedger|client_retention\.release|client-billing\/contracts/);
  }
});

test('Client Billing owns project settings while claims and invoices belong directly to project and client', () => {
  const settings = prismaModel('ProjectBillingSetting');
  const claim = prismaModel('ProgressClaim');
  const invoice = prismaModel('ClientInvoice');
  const invoiceLine = prismaModel('ClientInvoiceLine');

  assert.match(settings, /projectId\s+String\s+@map\("project_id"\)/);
  assert.match(settings, /billingMethod\s+String\s+@map\("billing_method"\)/);
  assert.match(settings, /retentionPercent\s+Decimal\?/);
  assert.match(claim, /companyId\s+String/);
  assert.match(claim, /projectId\s+String/);
  assert.match(claim, /clientId\s+String/);
  assert.doesNotMatch(claim, /contractId/);
  assert.match(invoice, /clientId\s+String/);
  assert.doesNotMatch(invoice, /contractId/);
  assert.match(invoiceLine, /clientInvoiceId\s+String/);
});

test('Client Billing route surface matches the final project-settings claim and invoice contract', () => {
  const expected = [
    '/api/v1/client-billing/projects/:projectId/settings',
    '/api/v1/client-billing/claims',
    '/api/v1/client-billing/claims/:id/finalize',
    '/api/v1/client-billing/claims/:id/invoice',
    '/api/v1/client-billing/invoices',
    '/api/v1/client-billing/invoices/:id'
  ];
  for (const route of expected) assert.match(schema, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(schema, /client-billing\/contracts|retention\/:id\/release/);
});

test('Client Billing uses final permission vocabulary and blocks old Contract permissions', () => {
  for (const code of [
    'client_billing.read', 'client_billing.settings.manage', 'claims.create', 'claims.edit',
    'claims.finalize', 'client_invoices.create', 'client_invoices.read'
  ]) assert.match(schema, new RegExp(`'${code.replace('.', '\\.')}'`));
  assert.doesNotMatch(schema, /client_contracts\.manage|client_claims\.certify|client_invoices\.issue|client_retention\.release/);
});

test('A10 migration keeps legacy tables for A11 while removing them from active ownership', () => {
  assert.match(migration, /Legacy client_contracts and retention_ledger tables remain/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "project_billing_settings"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "company_id" UUID/);
  assert.match(migration, /ALTER COLUMN "contract_id" DROP NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "client_invoice_lines"/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"client_contracts"/i);
  assert.doesNotMatch(migration, /DROP TABLE\s+"retention_ledger"/i);
});

test('Client Billing keeps calculations server-side and derives Client ownership from Project', () => {
  assert.match(service, /clientId: project\.clientId/);
  assert.match(service, /percentageOf\(gross, settings\?\.retentionPercent/);
  assert.match(service, /gross - retention - deductions/);
  assert.match(service, /postSourceJournalInTransaction/);
  assert.doesNotMatch(service, /financePostingDeferred/);
  assert.match(workspace, /react-hook-form/);
  assert.match(workspace, /zodResolver/);
});
