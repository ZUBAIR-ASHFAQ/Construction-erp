import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260903000200_subcontract_payment_ledger/migration.sql', 'utf8');
const schema = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.routes.ts', 'utf8');
const api = await readFile('apps/web/src/features/vendors-subcontractors/api/vendors-subcontractors-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/vendors-subcontractors/hooks/vendors-subcontractors.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/vendors-subcontractors/components/subcontract-payments-workspace.tsx', 'utf8');
const shell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');

/** Extract one Prisma model block for focused assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

test('subcontract payment persistence belongs to subcontract contracts and Cash/Bank, not Supplier Payables', () => {
  const payment = prismaModel('SubcontractPayment');
  assert.match(payment, /subcontractContractId\s+String/);
  assert.match(payment, /cashBankAccountId\s+String/);
  assert.match(payment, /paymentNo\s+String/);
  assert.match(payment, /amount\s+Decimal/);
  assert.match(payment, /status\s+String/);
  assert.doesNotMatch(payment, /vendorId|supplierInvoiceId|allocation/i);
  assert.match(prismaModel('SubcontractContract'), /payments\s+SubcontractPayment\[\]/);
  assert.match(prismaModel('SubcontractContract'), /@@unique\(\[id, companyId\], map: "subcontract_contracts_id_company_uq"\)/);
});

test('forward migration enforces company-safe contract payments without restoring legacy subcontract payment application tables', () => {
  assert.match(migration, /CREATE TABLE "subcontract_payments"/);
  assert.match(migration, /CREATE UNIQUE INDEX "subcontract_contracts_id_company_uq"/);
  assert.match(migration, /FOREIGN KEY \("subcontract_contract_id", "company_id"\) REFERENCES "subcontract_contracts"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("cash_bank_account_id", "company_id"\) REFERENCES "cash_bank_accounts"\("id", "company_id"\)/);
  assert.doesNotMatch(migration, /retention_release|payment_application|subcontract_revision/i);
});

test('subcontract payment API is contract-backed, bounded and idempotent', () => {
  assert.match(schema, /'\/api\/v1\/subcontract-payments'/);
  assert.match(schema, /'\/api\/v1\/subcontract-ledger'/);
  assert.match(schema, /subcontractContractId: uuidSchema/);
  assert.match(schema, /cashBankAccountId: uuidSchema/);
  assert.match(routes, /headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/);
  assert.match(routes, /readIdempotencyKey\(request\.headers/);
  assert.match(routes, /requireRoutePermission\('subcontractors\.manage'\)/);
  assert.match(routes, /requireRoutePermission\('subcontractors\.read'\)/);
});

test('service rejects overpayment and posts Finance plus Project Cost automatically', () => {
  assert.match(service, /Subcontractor Payment cannot exceed the remaining subcontract contract balance/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: SUBCONTRACT_PAYMENT_SEQUENCE_KEY \}\)/);
  assert.match(service, /postSourceJournalInTransaction/);
  assert.match(service, /SUBCONTRACT-EXPENSE/);
  assert.match(service, /upsertSubcontractPaymentCostActual/);
  assert.match(service, /eventType: 'subcontract\.payment_posted'/);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /sourceType: 'subcontract_payment'/);
});

test('subcontract ledger is source-derived from posted contract payments', () => {
  assert.match(repository, /payments: \{ where: \{ status: 'POSTED' \}, select: \{ amount: true \} \}/);
  assert.match(service, /paidAmount: minorUnitsToMoney\(paidAmount\)/);
  assert.match(service, /balanceAmount: minorUnitsToMoney\(contractAmount - paidAmount\)/);
});

test('web API and hooks use dedicated subcontract payment and ledger endpoints', () => {
  assert.match(api, /authenticatedRequest<Page<SubcontractPayment>>\(`subcontract-payments/);
  assert.match(api, /authenticatedRequest<SubcontractPayment>\('subcontract-payments'/);
  assert.match(api, /'Idempotency-Key': crypto\.randomUUID\(\)/);
  assert.match(api, /authenticatedRequest<Page<SubcontractLedgerRow>>\(`subcontract-ledger/);
  assert.match(hooks, /useSubcontractPayments/);
  assert.match(hooks, /useSubcontractLedger/);
  assert.match(hooks, /useCreateSubcontractPayment/);
});

test('subcontract New Payment and Ledger screens show subcontractor data and no Supplier Payables data', () => {
  assert.match(workspace, /New Subcontractor Payment/);
  assert.match(workspace, /Subcontractor Ledger/);
  assert.match(workspace, /Subcontract \/ Project/);
  assert.match(workspace, /Contract amount/);
  assert.match(workspace, /Paid/);
  assert.match(workspace, /Balance/);
  assert.doesNotMatch(workspace, /Supplier Payables|Supplier Aging|Supplier Invoice|Vendor|useVendors|vendorId/);
});

test('application shell routes subcontractor payment and ledger to the dedicated workspace while Supplier screens remain unchanged', () => {
  assert.match(shell, /<SubcontractPaymentsPage view="payment" \/>/);
  assert.match(shell, /<SubcontractPaymentsPage view="ledger" \/>/);
  assert.doesNotMatch(shell, /subcontractor-payment' && <SupplierPayablesPage/);
  assert.doesNotMatch(shell, /subcontractor-ledger' && <SupplierPayablesPage/);
  assert.match(shell, /supplier-payment' && <SupplierPayablesPage initialTab="payments" \/>/);
  assert.match(shell, /supplier-ledger' && <SupplierPayablesPage initialTab="aging" \/>/);
});
