import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('New Supplier Invoice can create a normal Supplier master and auto-select it', () => {
  const page = read('apps/web/src/features/supplier-payables/pages/supplier-payables-page.tsx');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  const vendorRoutes = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.routes.ts');
  const vendorSchema = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts');
  const vendorService = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts');
  const vendorRepository = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts');
  const styles = read('apps/web/src/styles.css');

  assert.match(page, /canCreateVendors=\{usePermission\('vendors\.create'\)\}/);
  assert.match(workspace, /import \{ useCreateVendor, useVendors \}/);
  assert.match(workspace, /props\.canCreateVendors && <button[^>]*>\+ Create supplier<\/button>/);
  assert.match(workspace, /supplierForm\.handleSubmit\(submitSupplier\)/);
  assert.match(workspace, /Create & select supplier/);
  assert.match(workspace, /supplierForm\.reset\(\{ \.\.\.EMPTY_SUPPLIER_FORM, projectId: invoiceForm\.getValues\('projectId'\) \}\)/);
  assert.match(workspace, /invoiceForm\.setValue\('vendorId', supplier\.id, \{ shouldDirty: true, shouldValidate: true \}\)/);

  for (const field of ['Project', 'Code', 'Display name', 'Legal name', 'Tax number', 'Payment terms days', 'Currency', 'Qualification']) {
    assert.ok(workspace.includes(field), `missing quick Supplier field ${field}`);
  }

  assert.match(vendorRoutes, /app\.post\('\/api\/v1\/vendors'/);
  assert.match(vendorRoutes, /requireRoutePermission\('vendors\.create'\)/);
  assert.match(vendorSchema, /export const createVendorBodySchema = z\.object\(/);
  assert.match(vendorService, /async createVendor\(input: CreateVendorBody\)/);
  assert.match(vendorService, /assignVendorToProject\(vendor\.id, projectId\)/);
  assert.match(vendorRepository, /async createVendor\(input:/);
  assert.match(vendorRepository, /async assignVendorToProject\(vendorId: string, projectId: string\)/);

  assert.match(styles, /\.supplier-invoice-vendor-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.supplier-invoice-vendor-row\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
