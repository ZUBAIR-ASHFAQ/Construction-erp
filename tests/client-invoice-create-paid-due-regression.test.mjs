import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

/** Verify the Client Invoice API derives paid/due from existing receipt allocations without new balance columns. */
test('Client Invoice paid and due balances remain server-derived from posted receipt allocations', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const repository = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const schema = read('apps/api/src/modules/client-billing/client-billing.schema.ts');
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');

  assert.match(prisma, /receiptAllocations ClientReceiptAllocation\[\]/);
  assert.doesNotMatch(prisma, /allocatedAmount\s+Decimal|outstandingAmount\s+Decimal/);
  assert.match(repository, /function invoiceInclude\(\)/);
  assert.match(repository, /receiptAllocations:/);
  assert.match(repository, /receipt: \{ status: 'POSTED' as const \}/);
  assert.match(service, /const allocated = \(invoice\.receiptAllocations \?\? \[\]\)/);
  assert.match(service, /allocatedAmount: minorUnitsToMoney\(allocated\)/);
  assert.match(service, /outstandingAmount: minorUnitsToMoney\(total - allocated\)/);
  assert.match(service, /if \(allocated > total\)/);
  assert.match(schema, /allocatedAmount: exactNonNegativeMoneySchema/);
  assert.match(schema, /outstandingAmount: exactNonNegativeMoneySchema/);
  assert.match(routes, /'allocatedAmount', 'outstandingAmount'/);
});

/** Verify direct invoice creation still keeps Client, invoice code and totals server-owned. */
test('Direct Client Invoice creation keeps ownership and numbering server-owned', () => {
  const schema = read('apps/api/src/modules/client-billing/client-billing.schema.ts');
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');

  const directBody = schema.match(/createDirectClientInvoiceBodySchema = z\.object\(\{[\s\S]*?\n\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(directBody, /projectId: uuidSchema/);
  assert.match(directBody, /invoiceDate: dateSchema/);
  assert.match(directBody, /lines: z\.array\(directClientInvoiceLineInputSchema\)/);
  assert.doesNotMatch(directBody, /clientId:|invoiceNo:|subtotal:|totalAmount:|allocatedAmount:|outstandingAmount:/);
  assert.match(service, /const project = await repository\.findProject\(input\.projectId, visibility\)/);
  assert.match(service, /clientId: project\.clientId/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: INVOICE_SEQUENCE_KEY \}\)/);
  assert.match(workspace, /The server generates the invoice code automatically/);
});

/** Verify direct invoice creation is operational-only and does not require or write Client Receivable. */
test('Direct Client Invoice creation does not require or post Finance accounts', () => {
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');
  const hooks = read('apps/web/src/features/client-billing/hooks/client-billing.ts');
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  const profitabilityRepository = read('apps/api/src/modules/project-profitability/project-profitability.repository.ts');
  const profitabilityService = read('apps/api/src/modules/project-profitability/project-profitability.service.ts');

  const direct = service.slice(service.indexOf('private async createDirectInvoiceOnce'), service.indexOf('/** List permission-visible Client Invoices. */'));
  const directHook = hooks.slice(hooks.indexOf('export function useCreateDirectClientInvoice'), hooks.indexOf('/** Load Client Invoices. */'));
  assert.match(direct, /revenueAccountId: null/);
  assert.doesNotMatch(direct, /requireInvoicePostingAccounts|postInvoiceToFinance|CLIENT-RECEIVABLE|client_invoice\.posted|financeSourceKey/);
  assert.match(routes, /without immediate Finance posting/);
  assert.match(workspace, /No Finance \/ Accounts Receivable journal is posted until a Client Receipt is allocated/);
  assert.match(workspace, /'Create invoice'/);
  assert.doesNotMatch(directHook, /FINANCE_QUERY_KEY|invalidateInvoiceEffects/);

  assert.match(profitabilityRepository, /invoice: \{ select: \{ projectId: true, claimId: true, invoiceDate: true, status: true \} \}/);
  assert.match(profitabilityService, /filter\(\(source\) => source\.invoice\.claimId !== null\)/);
  assert.match(profitabilityService, /if \(!financeInvoiceIds\.has\(invoiceId\)\) throw createProjectProfitabilityError\('PROFITABILITY_SOURCE_INCOMPLETE'\)/);
});

/** Verify the first receipt allocation safely creates the deferred AR/revenue posting before reducing AR. */
test('Direct Client Invoice Finance posting is deferred until Client Receipt allocation', () => {
  const billingService = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const receiptService = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');

  assert.match(billingService, /async ensureDirectInvoiceFinancePostingInTransaction\(tx: TransactionClient, invoice: any\)/);
  assert.match(billingService, /if \(invoice\.claimId !== null\) return null/);
  assert.match(billingService, /const accounts = await this\.requireInvoicePostingAccounts\(repository\)/);
  assert.match(billingService, /const finance = await this\.postInvoiceToFinance\(tx, invoice, accounts\.receivable\.id, accounts\.revenue\.id\)/);

  const allocation = receiptService.slice(receiptService.indexOf('private async allocateClientReceiptOnce'), receiptService.indexOf('/** Reverse one selected Client Receipt allocation'));
  assert.match(receiptService, /import \{ ClientBillingService \} from '\.\.\/client-billing\/client-billing\.service\.js'/);
  assert.match(allocation, /await new ClientBillingService\(this\.db\)\.ensureDirectInvoiceFinancePostingInTransaction\(tx, invoiceDetail\)/);
  assert.ok(allocation.indexOf('ensureDirectInvoiceFinancePostingInTransaction') < allocation.indexOf('repository.createAllocation'));
  assert.ok(allocation.indexOf('ensureDirectInvoiceFinancePostingInTransaction') < allocation.indexOf("sourceType: 'client_receipt_allocation'"));
});

/** Verify the browser selects Client then only that Client's Projects and defaults invoice date to today. */
test('Client Billing direct invoice UI selects Client then matching Project and defaults today', () => {
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  const api = read('apps/web/src/features/client-billing/api/client-billing-api.ts');

  assert.match(workspace, /const \[clientId, setClientId\] = useState\(''\)/);
  assert.match(workspace, /projects\.filter\(\(project\) => project\.clientId === clientId\)/);
  assert.match(workspace, />Client\s*<select value=\{clientId\}/);
  assert.match(workspace, />Project\s*<select value=\{projectId\} disabled=\{!clientId\}/);
  assert.match(workspace, /function todayDateInputValue\(\): string/);
  assert.match(workspace, /invoiceDate: todayDateInputValue\(\)/);
  assert.match(api, /allocatedAmount: string/);
  assert.match(api, /outstandingAmount: string/);
  assert.match(workspace, /Total paid \{displayMoney\(invoice\.allocatedAmount\)\}/);
  assert.match(workspace, /Due \{displayMoney\(invoice\.outstandingAmount\)\}/);
});

/** Verify receipt allocation mutations already refresh the Client Billing invoice cache. */
test('Client Receipt allocation refreshes Client Billing paid/due reads', () => {
  const hooks = read('apps/web/src/features/client-receipts/hooks/client-receipts.ts');
  assert.match(hooks, /CLIENT_BILLING_QUERY_KEY = \['client-billing'\]/);
  assert.match(hooks, /queryClient\.invalidateQueries\(\{ queryKey: CLIENT_BILLING_QUERY_KEY \}\)/);
  assert.match(hooks, /useAllocateClientReceipt/);
  assert.match(hooks, /useUnallocateClientReceipt/);
});
