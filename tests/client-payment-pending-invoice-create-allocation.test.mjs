import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
function read(relativePath) { return readFileSync(new URL(relativePath, ROOT), 'utf8'); }

test('new Client Payment selects one pending project invoice directly or stays a direct payment', () => {
  const schema = read('apps/api/src/modules/client-receipts/client-receipts.schema.ts');
  const service = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const routes = read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
  const api = read('apps/web/src/features/client-receipts/api/client-receipts-api.ts');
  const workspace = read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');

  assert.match(schema, /clientInvoiceId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(routes, /clientInvoiceId: NULLABLE_UUID/);
  assert.match(api, /clientInvoiceId\?: string \| null/);
  assert.match(workspace, /Pending Client Invoice \(optional\)/);
  assert.match(workspace, /Direct payment \(no invoice\)/);
  assert.match(workspace, /invoice\.outstandingAmount/);
  assert.match(workspace, /invoice\.outstandingAmount !== '0\.00'/);
  assert.match(workspace, /receiptType: values\.clientInvoiceId \? 'INVOICE_PAYMENT' : 'ADVANCE'/);
  assert.match(workspace, /clientInvoiceId: values\.clientInvoiceId \|\| null/);
  assert.doesNotMatch(workspace, /<label>Payment treatment/);

  assert.match(service, /allocateClientReceiptOnce\(tx, receipt\.id, \{[\s\S]*clientInvoiceId: input\.clientInvoiceId,[\s\S]*amount: input\.amount[\s\S]*\}, visibility\)/);
});

test('inline invoice payment uses create-authorized scope while later manual allocation still requires allocate permission', () => {
  const service = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const workspace = read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');

  assert.match(service, /authorizedVisibility\?: ClientReceiptsRepositoryVisibility/);
  assert.match(service, /const visibility = authorizedVisibility[\s\S]*\?\? await this\.resolveVisibility\(new AdministrationRepository\(tx\), 'client_receipts\.allocate', now\)/);
  assert.match(workspace, /props\.canAllocate && receiptDetailQuery\.data\.status === 'POSTED'/);
  assert.match(workspace, /allocationReceipt && props\.canAllocate/);
  assert.doesNotMatch(workspace, /INVOICE_PAYMENT" disabled=\{!props\.canAllocate/);
});

test('invoice payment updates derived invoice due and posts correct Client Receivable ledger activity', () => {
  const receiptService = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const billingService = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const billingRepository = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const receiptRepository = read('apps/api/src/modules/client-receipts/client-receipts.repository.ts');
  const receiptHooks = read('apps/web/src/features/client-receipts/hooks/client-receipts.ts');

  assert.match(receiptService, /ensureDirectInvoiceFinancePostingInTransaction\(tx, invoiceDetail\)/);
  assert.match(billingService, /accountId: receivableAccountId[\s\S]*debit: minorUnitsToMoney\(total\)[\s\S]*credit: ZERO_MONEY/);
  assert.match(receiptService, /accountId: accounts\.clientReceivableAccountId[\s\S]*debit: ZERO_MONEY[\s\S]*credit: input\.amount/);
  assert.match(receiptRepository, /sumAllocatedAmountForInvoice\(clientInvoiceId: string\)/);
  assert.match(billingRepository, /receiptAllocations:[\s\S]*receipt: \{ status: 'POSTED'/);
  assert.match(billingService, /allocatedAmount: minorUnitsToMoney\(allocated\)/);
  assert.match(billingService, /outstandingAmount: minorUnitsToMoney\(total - allocated\)/);
  assert.match(receiptHooks, /FINANCE_QUERY_KEY = \['final21', 'finance'\]/);
  assert.match(receiptHooks, /CLIENT_BILLING_QUERY_KEY = \['client-billing'\]/);
});

test('first invoice-linked Client Payment provisions missing AR and revenue control accounts safely', () => {
  const billingService = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const billingRepository = read('apps/api/src/modules/client-billing/client-billing.repository.ts');

  assert.match(billingRepository, /async ensureBillingControlAccount/);
  assert.match(billingRepository, /companyId_accountCode/);
  assert.match(billingRepository, /update: \{\}/);
  assert.match(billingService, /existingReceivable \?\? repository\.ensureBillingControlAccount/);
  assert.match(billingService, /existingRevenue \?\? repository\.ensureBillingControlAccount/);
  assert.match(billingService, /accountType: 'ASSET'/);
  assert.match(billingService, /accountType: 'REVENUE'/);
});
