import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const appSource = await readFile('apps/api/src/app.ts', 'utf8');
const adminSchema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const moduleSchema = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.routes.ts', 'utf8');
const procurementRoutes = await readFile('apps/api/src/modules/procurement/procurement.routes.ts', 'utf8');
const procurementRepository = await readFile('apps/api/src/modules/procurement/procurement.repository.ts', 'utf8');
const procurementWebApi = await readFile('apps/web/src/features/procurement/api/procurement-api.ts', 'utf8');
const shell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260829000900_final21_vendors_subcontractors_alignment/migration.sql', 'utf8');

/** Extract one Prisma model block for focused Final-21 assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

/** Return true when one repository path still exists. */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('B4 exposes the exact final Supplier & Subcontractor permission, error, event and route vocabulary', () => {
  for (const permission of ['vendors.read', 'vendors.create', 'vendors.update', 'subcontractors.read', 'subcontractors.manage']) {
    assert.match(moduleSchema, new RegExp(`'${permission.replaceAll('.', '\\.')}'`));
  }
  for (const code of ['VENDOR_NOT_FOUND', 'DUPLICATE_VENDOR_CODE', 'SUBCONTRACTOR_NOT_FOUND', 'VENDOR_LINK_INVALID']) {
    assert.match(moduleSchema, new RegExp(`'${code}'`));
  }
  for (const eventType of ['vendor.created', 'vendor.updated', 'subcontractor.created', 'subcontractor.updated']) {
    assert.match(moduleSchema, new RegExp(`'${eventType.replaceAll('.', '\\.')}'`));
  }

  const expectedRoutes = [
    "'/api/v1/vendors'",
    "'/api/v1/vendors/:id'",
    "'/api/v1/vendors/:id/contacts'",
    "'/api/v1/subcontractors'",
    "'/api/v1/subcontractors/:id'"
  ];
  for (const route of expectedRoutes) assert.match(moduleSchema, new RegExp(route.replaceAll('/', '\\/')));
  assert.equal((moduleSchema.match(/Object\.freeze\(\{ method:/g) ?? []).length, 8);
});

test('B4 Prisma master tables match final ownership and remove active operational Subcontract models', () => {
  const vendor = prismaModel('Vendor');
  const contact = prismaModel('VendorContact');
  const subcontractor = prismaModel('Subcontractor');

  for (const field of ['companyId', 'code', 'legalName', 'displayName', 'taxNo', 'paymentTermsDays', 'currency', 'status', 'qualificationStatus']) {
    assert.match(vendor, new RegExp(`\\b${field}\\b`));
  }
  assert.match(vendor, /@@unique\(\[companyId, code\], map: "vendors_company_code_uq"\)/);
  assert.match(contact, /email\s+String\?/);
  assert.match(contact, /phone\s+String\?/);
  assert.match(contact, /role\s+String\?/);
  assert.match(subcontractor, /vendorId\s+String\?/);
  assert.match(subcontractor, /specialty\s+String/);
  assert.match(subcontractor, /defaultTerms\s+String\?/);
  assert.doesNotMatch(subcontractor, /legalName|contactJson|complianceStatus|subcontracts/);
  for (const removedModel of ['Subcontract', 'SubcontractItem', 'SubcontractPaymentApplication', 'SubcontractRevision', 'SubcontractRetentionRelease', 'SubcontractPaymentLine']) {
    assert.doesNotMatch(prisma, new RegExp(`model ${removedModel} \\{`));
  }
});

test('B4 repositories and services enforce company ownership and module-owned lifecycle rules', () => {
  assert.match(repository, /requireCompanyRepositoryScope\(\)/);
  assert.match(repository, /scope\.where\(\{ id: vendorId \}\)/);
  assert.match(repository, /scope\.createData\(input\)/);
  assert.match(repository, /purchaseOrder\.aggregate/);
  assert.match(service, /vendor\.status !== ACTIVE/);
  assert.match(service, /createVendorsSubcontractorsError\('VENDOR_LINK_INVALID'\)/);
  assert.match(service, /eventType: 'vendor\.created'/);
  assert.match(service, /eventType: 'vendor\.updated'/);
  assert.match(service, /eventType: 'subcontractor\.created'/);
  assert.match(service, /eventType: 'subcontractor\.updated'/);
  assert.match(service, /SupplierPayablesService/);
  assert.match(service, /payableSummary/);
  assert.doesNotMatch(service, /payableSummaryAvailable: false/);
  assert.doesNotMatch(service, /payment application|retention release|executeSubcontract|certify/i);
});

test('B4 moves Vendor CRUD out of Procurement while keeping a read-only Vendor dependency for PO validation', () => {
  assert.doesNotMatch(procurementRoutes, /\/api\/v1\/procurement\/vendors/);
  assert.doesNotMatch(procurementRepository, /createVendor\(|updateVendor\(|createVendorContact\(|listVendors\(/);
  assert.match(procurementRepository, /findVendorById\(vendorId: string\)/);
  assert.match(procurementWebApi, /authenticatedRequest<Page<Vendor>>\('vendors\?page=1&pageSize=100'\)/);
});

test('B4 removes the obsolete operational Subcontracts production modules and registers the final master module', async () => {
  assert.equal(await exists('apps/api/src/modules/subcontracts'), false);
  assert.equal(await exists('apps/web/src/features/subcontracts'), false);
  assert.match(appSource, /registerVendorsSubcontractorsRoutes/);
  assert.doesNotMatch(appSource, /registerSubcontractsRoutes/);
  assert.match(shell, /Suppliers & Subcontractors/);
  assert.match(shell, /vendors-subcontractors/);
  assert.doesNotMatch(shell, /subcontracts\.(read|create|execute|certify|close)/);
});

test('B4 forward migration aligns master tables and retires only active legacy permissions', () => {
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS "vendors_company_code_uq"/);
  assert.match(migration, /ALTER COLUMN "email" DROP NOT NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "specialty" VARCHAR\(200\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "default_terms" TEXT/);
  assert.match(migration, /'vendors\.read'/);
  assert.match(migration, /'subcontractors\.manage'/);
  assert.match(migration, /DELETE FROM "permissions"/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"subcontracts"/i);
});

test('B4 prevents stale operational Subcontract permissions from being re-assigned', () => {
  for (const permission of ['subcontracts.read', 'subcontracts.create', 'subcontracts.execute', 'subcontracts.certify', 'subcontracts.close']) {
    assert.doesNotMatch(adminSchema, new RegExp(`'${permission.replaceAll('.', '\\.')}'`));
    assert.match(migration, new RegExp(`'${permission.replaceAll('.', '\\.')}'`));
  }
});

test('B4 route handlers are permission checked and Zod validated at the boundary', () => {
  assert.match(routes, /parseRequest\(listVendorsQuerySchema/);
  assert.match(routes, /parseRequest\(createVendorBodySchema/);
  assert.match(routes, /parseRequest\(updateVendorBodySchema/);
  assert.match(routes, /parseRequest\(createVendorContactBodySchema/);
  assert.match(routes, /parseRequest\(listSubcontractorsQuerySchema/);
  assert.match(routes, /parseRequest\(createSubcontractorBodySchema/);
  assert.match(routes, /parseRequest\(updateSubcontractorBodySchema/);
  assert.match(routes, /requireRoutePermission\('vendors\.read'\)/);
  assert.match(routes, /requireRoutePermission\('subcontractors\.manage'\)/);
});
