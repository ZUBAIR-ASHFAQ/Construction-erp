import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('New Supplier Invoice can create a normal Project and select it without losing the invoice draft', () => {
  const page = read('apps/web/src/features/supplier-payables/pages/supplier-payables-page.tsx');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');

  assert.match(page, /canCreateProjects=\{usePermission\('projects\.create'\)\}/);
  assert.match(page, /canReadClients=\{usePermission\('clients\.read'\)\}/);
  assert.match(page, /canCreateClients=\{usePermission\('clients\.create'\)\}/);
  assert.match(workspace, /import \{ useCreateProject, useProjects \}/);
  assert.match(workspace, /props\.canCreateProjects && <button[^>]*>\+ Create project<\/button>/);
  assert.match(workspace, /projectForm\.handleSubmit\(submitProject\)/);
  assert.match(workspace, /invoiceForm\.setValue\('projectId', project\.id, \{ shouldDirty: true, shouldValidate: true \}\)/);

  for (const label of ['Project name', 'Client', 'Commercial model', 'Project value', 'Currency', 'Start date', 'Planned end date', 'Location (optional)']) {
    assert.ok(workspace.includes(label), `missing quick Project field ${label}`);
  }
  assert.match(workspace, /<option value="FIXED_PRICE">Fixed Price<\/option>/);
  assert.match(workspace, /<option value="COST_PLUS_PERCENTAGE">Cost \+ Percentage<\/option>/);
  assert.match(workspace, /selectedProjectModel === 'COST_PLUS_PERCENTAGE'/);
  assert.match(workspace, /currency: values\.currency\.toUpperCase\(\)/);
  assert.match(workspace, /location: values\.location \|\| null/);
});

test('Supplier Invoice quick Project popup can search or create a full Client and return to the Project form', () => {
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');

  assert.match(workspace, /useClients, useCreateClient/);
  assert.match(workspace, /search: clientSearchText\.trim\(\)/);
  assert.match(workspace, /id="supplier-invoice-project-client-search"/);
  assert.match(workspace, /role="combobox"/);
  assert.match(workspace, /props\.canCreateClients \? <button[^>]*>\+ Create client<\/button>/);
  assert.match(workspace, /quickClientForm\.handleSubmit\(submitClient\)/);
  assert.match(workspace, /projectForm\.setValue\('clientId', client\.id, \{ shouldDirty: true, shouldValidate: true \}\)/);
  assert.match(workspace, /setCreateClientOpen\(false\);\s*setCreateProjectOpen\(true\);/);

  for (const label of [
    'Display name',
    'Legal name',
    'Tax number',
    'Credit terms (days)',
    'Billing address',
    'Primary contact (optional)',
    'Contact name',
    'Contact title',
    'Contact email',
    'Contact phone'
  ]) {
    assert.ok(workspace.includes(label), `missing full Client field ${label}`);
  }
  assert.match(workspace, /taxNo: values\.taxNo \? values\.taxNo : null/);
  assert.match(workspace, /creditTermsDays: values\.creditTermsDays/);
  assert.match(workspace, /title: values\.contactTitle \? values\.contactTitle : null/);
  assert.match(workspace, /email: values\.contactEmail \? values\.contactEmail : null/);
  assert.match(workspace, /phone: values\.contactPhone \? values\.contactPhone : null/);
  assert.match(workspace, /isPrimary: values\.contactIsPrimary/);
});

test('New Supplier Invoice uses server-backed searchable Supplier and Project pickers', () => {
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  const vendorApi = read('apps/web/src/features/vendors-subcontractors/api/vendors-subcontractors-api.ts');
  const projectApi = read('apps/web/src/features/projects/api/projects-api.ts');
  const vendorRepository = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts');
  const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');

  assert.match(workspace, /id="supplier-invoice-vendor"/);
  assert.match(workspace, /id="supplier-invoice-project"/);
  assert.match(workspace, /handleInvoiceVendorSearch/);
  assert.match(workspace, /handleInvoiceProjectSearch/);
  assert.match(workspace, /search: invoiceVendorSearchText\.trim\(\)/);
  assert.match(workspace, /search: invoiceProjectSearchText\.trim\(\)/);
  assert.match(workspace, /Search active suppliers by name or code/);
  assert.match(workspace, /Search projects by name or code/);
  assert.doesNotMatch(workspace, /<select id="supplier-invoice-vendor"/);
  assert.doesNotMatch(workspace, /<select id="supplier-invoice-project"/);

  assert.match(vendorApi, /if \(input\.search\) query\.set\('search', input\.search\)/);
  assert.match(projectApi, /if \(input\.search\) query\.set\('search', input\.search\)/);
  assert.match(vendorRepository, /displayName: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(projectRepository, /name: \{ contains: search, mode: 'insensitive' as const \}/);
});

test('existing Project and Client backend stacks remain the authority for quick creation', () => {
  const projectRoutes = read('apps/api/src/modules/projects/projects.routes.ts');
  const projectSchema = read('apps/api/src/modules/projects/projects.schema.ts');
  const projectService = read('apps/api/src/modules/projects/projects.service.ts');
  const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');
  const clientRoutes = read('apps/api/src/modules/clients/clients.routes.ts');
  const clientSchema = read('apps/api/src/modules/clients/clients.schema.ts');
  const clientService = read('apps/api/src/modules/clients/clients.service.ts');
  const clientRepository = read('apps/api/src/modules/clients/clients.repository.ts');

  assert.match(projectRoutes, /app\.post\('\/api\/v1\/projects'/);
  assert.match(projectRoutes, /requireRoutePermission\('projects\.create'\)/);
  assert.match(projectSchema, /export const createProjectBodySchema = z\.object\(/);
  assert.match(projectService, /async createProject\(input: CreateProjectBody\)/);
  assert.match(projectRepository, /async createProject\(input: CreateProjectRepositoryInput\)/);

  assert.match(clientRoutes, /app\.post\('\/api\/v1\/clients'/);
  assert.match(clientRoutes, /requireRoutePermission\('clients\.create'\)/);
  assert.match(clientSchema, /export const createClientBodySchema = z\.object\(/);
  assert.match(clientService, /async createClient\(input: CreateClientBody\)/);
  assert.match(clientRepository, /async createClient\(input:/);
});
