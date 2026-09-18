import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('Supplier Payment uses server-backed searchable Supplier and Project pickers in both payment entry surfaces', () => {
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  const vendorApi = read('apps/web/src/features/vendors-subcontractors/api/vendors-subcontractors-api.ts');
  const projectApi = read('apps/web/src/features/projects/api/projects-api.ts');
  const vendorRepository = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts');
  const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');

  assert.match(workspace, /paymentVendorSearchText/);
  assert.match(workspace, /paymentProjectSearchText/);
  assert.match(workspace, /search: paymentVendorSearchText\.trim\(\)/);
  assert.match(workspace, /search: paymentProjectSearchText\.trim\(\)/);
  assert.match(workspace, /id="supplier-payment-vendor"/);
  assert.match(workspace, /id="supplier-payment-project"/);
  assert.match(workspace, /handlePaymentVendorSearch/);
  assert.match(workspace, /handlePaymentProjectSearch/);
  assert.match(workspace, /Search active suppliers by name or code/);
  assert.match(workspace, /Search projects by name or code/);
  assert.match(workspace, /Company-level<\/strong><span>Direct payment/);
  assert.doesNotMatch(workspace, /<label>Vendor<select \{\.\.\.paymentForm\.register\('vendorId'\)\}/);
  assert.doesNotMatch(workspace, /<label>Project \(optional\)<select \{\.\.\.paymentForm\.register\('projectId'\)\}/);

  assert.match(vendorApi, /if \(input\.search\) query\.set\('search', input\.search\)/);
  assert.match(projectApi, /if \(input\.search\) query\.set\('search', input\.search\)/);
  assert.match(vendorRepository, /displayName: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(projectRepository, /name: \{ contains: search, mode: 'insensitive' as const \}/);
});

test('Supplier Payment can quick-create and auto-select a Supplier or Project using existing master APIs', () => {
  const page = read('apps/web/src/features/supplier-payables/pages/supplier-payables-page.tsx');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  const vendorRoutes = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.routes.ts');
  const vendorSchema = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts');
  const vendorService = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts');
  const projectRoutes = read('apps/api/src/modules/projects/projects.routes.ts');
  const projectSchema = read('apps/api/src/modules/projects/projects.schema.ts');
  const projectService = read('apps/api/src/modules/projects/projects.service.ts');

  assert.match(page, /canCreateVendors=\{usePermission\('vendors\.create'\)\}/);
  assert.match(page, /canCreateProjects=\{usePermission\('projects\.create'\)\}/);
  assert.match(workspace, /openCreatePaymentSupplierModal/);
  assert.match(workspace, /openCreatePaymentProjectModal/);
  assert.match(workspace, /quickCreateTarget === 'payment'/);
  assert.match(workspace, /props\.createPaymentModalOpen && !createSupplierOpen && !createProjectOpen && !createClientOpen/);
  assert.match(workspace, /paymentForm\.setValue\('vendorId', supplier\.id/);
  assert.match(workspace, /paymentForm\.setValue\('projectId', project\.id/);
  assert.match(workspace, /paymentForm\.setValue\('supplierInvoiceId', ''/);
  assert.match(workspace, /Create & select supplier/);
  assert.match(workspace, /Create Project/);
  assert.match(workspace, /\+ Create client/);

  assert.match(vendorRoutes, /app\.post\('\/api\/v1\/vendors'/);
  assert.match(vendorSchema, /export const createVendorBodySchema = z\.object\(/);
  assert.match(vendorService, /async createVendor\(input: CreateVendorBody\)/);
  assert.match(projectRoutes, /app\.post\('\/api\/v1\/projects'/);
  assert.match(projectSchema, /export const createProjectBodySchema = z\.object\(/);
  assert.match(projectService, /async createProject\(input: CreateProjectBody\)/);
});
