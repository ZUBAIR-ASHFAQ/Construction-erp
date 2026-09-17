import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Supplier list exposes project-scoped posted payable outstanding', async () => {
  const [service, repository, workspace] = await Promise.all([
    read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts'),
    read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts'),
    read('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx')
  ]);
  assert.match(service, /getVendorPayableSummaries/);
  assert.match(repository, /projectId \? \{ projectId \} : requiredProjectScopeWhere/);
  assert.match(repository, /supplierPayment: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(workspace, /<th>Payables<\/th>/);
  assert.match(workspace, /Selected Project outstanding/);
});

test('Client remaining reuses the Project Profitability commercial summary', async () => {
  const [service, page] = await Promise.all([
    read('apps/api/src/modules/clients/clients.service.ts'),
    read('apps/web/src/features/clients/pages/clients-page.tsx')
  ]);
  assert.match(service, /new ProjectProfitabilityService/);
  assert.match(service, /commercialSummary\.remainingToReceive/);
  assert.match(page, /<th>Client remaining<\/th>/);
  assert.match(page, /remainingByCurrency/);
});

test('Account Ledger presents signed movement and routes source reasons', async () => {
  const [repository, schema, page, shell] = await Promise.all([
    read('apps/api/src/modules/finance/finance.repository.ts'),
    read('apps/api/src/modules/finance/finance.schema.ts'),
    read('apps/web/src/features/finance/pages/finance-page.tsx'),
    read('apps/web/src/features/administration/components/admin-shell.tsx')
  ]);
  assert.match(repository, /sourceType: true, sourceId: true, sourceKey: true/);
  assert.match(schema, /sourceType: tokenSchema/);
  assert.match(page, /<th>Movement<\/th>/);
  assert.match(page, /finance-money-in/);
  assert.match(page, /finance-money-out/);
  assert.match(page, /onOpenSource/);
  assert.match(shell, /supplier_payment: 'supplier-payment'/);
  assert.match(shell, /initialPaymentId=\{linkedSupplierPaymentId\}/);
});
