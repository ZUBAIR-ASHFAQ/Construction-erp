import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationName = '20260912000600_project_operational_resource_scope';

test('Materials are Project-owned and restricted actors cannot list, create, procure, or consume another Project material', async () => {
  const prisma = await read('packages/database/prisma/schema.prisma');
  const migration = await read(`packages/database/prisma/migrations/${migrationName}/migration.sql`);
  const repository = await read('apps/api/src/modules/inventory/inventory.repository.ts');
  const service = await read('apps/api/src/modules/inventory/inventory.service.ts');
  const procurementRepository = await read('apps/api/src/modules/procurement/procurement.repository.ts');
  const procurementService = await read('apps/api/src/modules/procurement/procurement.service.ts');
  const materialsWorkspace = await read('apps/web/src/features/inventory/components/materials-workspace.tsx');
  const procurementWorkspace = await read('apps/web/src/features/procurement/components/procurement-workspace.tsx');
  const procurementApi = await read('apps/web/src/features/procurement/api/procurement-api.ts');
  const procurementHooks = await read('apps/web/src/features/procurement/hooks/procurement.ts');

  assert.match(prisma, /model Material[\s\S]*projectId\s+String\?[\s\S]*project\s+Project\?[\s\S]*@@unique\(\[companyId, projectId, code\]/);
  assert.match(migration, /ADD COLUMN "project_id" UUID/);
  assert.match(migration, /materials_project_company_fkey/);
  assert.match(repository, /projectId: \{ in: \[\.\.\.new Set\(visibility\.allowedProjectIds\)\] \}/);
  assert.match(service, /resolveMaterialProjectId/);
  assert.match(service, /requireProjectPermission\(users, projectId, 'materials\.manage'/);
  assert.match(service, /requireMaterialProject\(material, input\.projectId\)/);
  assert.match(service, /requireMaterialProject\(material, purchaseOrder\.projectId\)/);
  assert.match(procurementRepository, /findActiveMaterials\(materialIds: readonly string\[\], projectId: string\)/);
  assert.match(procurementRepository, /projectId, status: 'ACTIVE'/);
  assert.match(procurementService, /findActiveMaterials\(materialIds, input\.projectId\)/);
  assert.match(materialsWorkspace, /projectId,/);
  assert.match(materialsWorkspace, /Project material scope/);
  assert.match(procurementWorkspace, /useMaterials\(props\.projectId \|\| undefined/);
  assert.match(procurementApi, /new URLSearchParams\(\{ projectId, page: '1', pageSize: '100' \}\)/);
  assert.match(procurementHooks, /queryKey: \[\.\.\.PROCUREMENT_QUERY_KEY, 'vendors', projectId\]/);
  assert.match(procurementWorkspace, /useProcurementVendors\(props\.projectId \|\| null/);
});

test('Site Manager receives only Project-safe procurement, supplier, client receipt/invoice and employee compensation grants', async () => {
  const migration = await read(`packages/database/prisma/migrations/${migrationName}/migration.sql`);
  const expected = [
    'requisitions.approve', 'purchase_orders.issue',
    'supplier_payables.read', 'supplier_invoices.create', 'supplier_invoices.post', 'supplier_payments.create', 'supplier_payments.allocate',
    'client_invoices.create', 'client_invoices.read',
    'client_receipts.read', 'client_receipts.create', 'client_receipts.allocate',
    'employees.compensation.manage'
  ];
  for (const permission of expected) assert.ok(migration.includes(`'${permission}'`), `missing ${permission}`);
  for (const forbidden of [
    'admin.users.manage', 'admin.roles.manage', 'organization.manage',
    'project_profitability.read', 'project_profitability.finance.read', 'project_profitability.portfolio.read',
    'documents.read', 'documents.upload', 'documents.link', 'documents.version',
    'finance.read', 'payroll.read', 'payroll.create', 'payroll.calculate', 'payroll.finalize'
  ]) assert.doesNotMatch(migration, new RegExp(`'${forbidden.replaceAll('.', '\\.')}'`));
});

test('Supplier and subcontractor payments are Project-scoped and use the Project account for restricted managers', async () => {
  const supplierService = await read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  const subcontractService = await read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts');
  const subcontractPage = await read('apps/web/src/features/vendors-subcontractors/pages/subcontract-payments-page.tsx');
  const supplierWorkspace = await read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');

  assert.match(supplierService, /security\.projectScope\.kind === 'restricted' && !paymentProjectId/);
  assert.match(supplierService, /findVendorById\(input\.vendorId, paymentProjectId \?\? undefined\)/);
  assert.match(supplierService, /cashBank\.projectId !== paymentProjectId/);
  assert.match(subcontractService, /cashBank\.projectId !== contract\.projectId/);
  assert.match(subcontractPage, /finance\.accounts\.manage/);
  assert.match(supplierWorkspace, /account\.projectId === watchedPaymentProjectId/);
});

test('Site Manager can create Project client invoices/receipts and pay own employees without receiving company-wide client or payroll authority', async () => {
  const billingPage = await read('apps/web/src/features/client-billing/pages/client-billing-page.tsx');
  const billingWorkspace = await read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  const receiptService = await read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const receiptWorkspace = await read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');
  const employeeService = await read('apps/api/src/modules/employees/employees.service.ts');
  const labourService = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');

  assert.match(billingPage, /canReadClients=\{usePermission\('clients\.read'\)\}/);
  assert.match(billingWorkspace, /Derived from selected Project/);
  assert.match(billingWorkspace, /if \(!props\.canReadClients\) setClientId/);
  assert.match(receiptService, /cashBankAccount\.projectId !== input\.projectId/);
  assert.match(receiptWorkspace, /account\.projectId === receiptProjectId/);
  assert.match(employeeService, /employees\.compensation\.manage/);
  assert.match(labourService, /payroll\.payments\.create/);
});

test('Patch 13 migration is registered and checksum locked', async () => {
  const migration = await read(`packages/database/prisma/migrations/${migrationName}/migration.sql`);
  const checksums = JSON.parse(await read('packages/database/prisma/migration-checksums.json'));
  const gates = JSON.parse(await read('packages/database/prisma/migration-gates.json'));
  assert.equal(checksums.migrations[migrationName], createHash('sha256').update(migration).digest('hex'));
  assert.ok(gates.gates.some((gate) => gate.gate === 'project-operational-resource-scope' && gate.migrations.includes(migrationName)));
});
