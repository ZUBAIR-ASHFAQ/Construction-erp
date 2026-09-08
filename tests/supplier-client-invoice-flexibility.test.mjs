import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('supplier invoice editor uploads evidence through Documents and links it to the created invoice', () => {
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  assert.match(workspace, /useUploadDocument\(\)/);
  assert.match(workspace, /useCreateDocumentLink\(\)/);
  assert.match(workspace, /accept="image\/jpeg,image\/png,application\/pdf"/);
  assert.match(workspace, /resourceType: 'supplier_invoice', resourceId: created\.id/);
  assert.ok(workspace.indexOf('createInvoice.mutateAsync') < workspace.indexOf('uploadInvoiceDocument.mutateAsync'));
  assert.match(workspace, /attachSelectedInvoiceEvidence/);
  assert.match(workspace, /retry an upload that failed/);
  assert.match(workspace, /image \/ PDF \(required\)/);
  assert.ok(workspace.indexOf('linkInvoiceDocument.mutateAsync') < workspace.indexOf('postInvoice.mutateAsync(created.id)'));
});

test('local development provides private S3-compatible storage and creates the invoice bucket', () => {
  const compose = read('docker-compose.yml');
  const storageConfig = read('packages/config/src/storage.ts');
  const rootPackage = JSON.parse(read('package.json'));
  assert.match(compose, /minio\/minio:/);
  assert.match(compose, /construction_erp_object_storage_data:\/data/);
  assert.match(compose, /mc mb --ignore-existing local\/construction-erp/);
  assert.match(compose, /MINIO_API_CORS_ALLOW_ORIGIN: http:\/\/localhost:5173/);
  assert.match(storageConfig, /nodeEnv === 'development' \? 'minioadmin' : null/);
  assert.equal(rootPackage.scripts['storage:up'], 'docker compose up -d minio minio-init');
});

test('direct Client Invoice command derives ownership and totals server-side then posts AR atomically', () => {
  const schema = read('apps/api/src/modules/client-billing/client-billing.schema.ts');
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  assert.match(schema, /createDirectClientInvoiceBodySchema/);
  assert.match(routes, /app\.post\('\/api\/v1\/client-billing\/invoices'/);
  assert.match(service, /requireProjectPermission\(administration, input\.projectId, 'client_invoices\.create'/);
  assert.match(service, /claimId: null/);
  assert.match(service, /input\.lines\.reduce\(\(sum, line\) => sum \+ moneyToMinorUnits\(line\.amount\)/);
  assert.match(service, /postInvoiceToFinance\(tx, invoice/);
  assert.match(service, /operation: 'client-billing\.direct-invoice-create'/);
});

test('client and supplier payment screens preserve optional invoice allocation', () => {
  const client = read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');
  const supplier = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  assert.match(client, /Direct payment \(no invoice\)/);
  assert.match(client, /Payment against invoice/);
  assert.match(client, /useAllocateClientReceipt/);
  assert.match(supplier, /Invoice allocation is optional/);
  assert.match(supplier, /useAllocateSupplierPayment/);
});

test('supplier payment can allocate to an invoice atomically and exposes both remaining balances', () => {
  const schema = read('apps/api/src/modules/supplier-payables/supplier-payables.schema.ts');
  const repository = read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts');
  const service = read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  assert.match(schema, /supplierInvoiceId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /allocatedAmount: z\.string\(\)/);
  assert.match(schema, /remainingAmount: z\.string\(\)/);
  assert.match(repository, /include: \{ allocations:/);
  assert.match(service, /if \(input\.supplierInvoiceId\)/);
  assert.match(service, /createSupplierPaymentAllocations\(created\.id/);
  assert.match(workspace, /Invoice \(optional\)/);
  assert.match(workspace, /watchedPaymentProjectId \? \{ projectId: watchedPaymentProjectId \}/);
  assert.match(workspace, /Total \{displayMoney\(invoice\.totalAmount\)\}/);
  assert.match(workspace, /Outstanding \{displayMoney\(invoice\.outstandingAmount\)\}/);
  assert.match(workspace, /Number\(payment\.remainingAmount\) > 0/);
});

test('supplier invoice lists can download only the document linked to that invoice', () => {
  const documentSchema = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  const documentRepository = read('apps/api/src/modules/documents-audit/documents-audit.repository.ts');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  assert.match(documentSchema, /resourceType: z\.enum\(DOCUMENT_LINK_RESOURCE_TYPES\)\.optional\(\)/);
  assert.match(documentRepository, /links: \{ some: \{ linkedResourceType: input\.resourceType, linkedResourceId: input\.resourceId \} \}/);
  assert.match(workspace, /listDocuments\(\{/);
  assert.match(workspace, /resourceType: 'supplier_invoice'/);
  assert.match(workspace, /getDocumentDownload\(document\.id\)/);
  assert.match(workspace, /URL\.createObjectURL\(await response\.blob\(\)\)/);
  assert.match(workspace, /anchor\.download = download\.version\.originalName/);
  assert.match(workspace, />Download<\/button>/);
});

test('supplier payable posting rejects invoices without a completed attachment', () => {
  const repository = read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts');
  const service = read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  assert.match(repository, /hasSupplierInvoiceAttachment/);
  assert.match(repository, /linkedResourceType: 'supplier_invoice'/);
  assert.match(repository, /currentVersionId: \{ not: null \}/);
  assert.match(service, /Attach the supplier invoice image or PDF before posting the invoice/);
});
