import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inventoryPage = await readFile('apps/web/src/features/inventory/pages/materials-page.tsx', 'utf8');
const vendorRoutes = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.routes.ts', 'utf8');
const vendorSchema = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts', 'utf8');
const vendorService = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts', 'utf8');
const vendorWorkspace = await readFile('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260912000500_site_manager_material_vendor_scope_fix/migration.sql', 'utf8');
const authHooks = await readFile('apps/web/src/features/administration/hooks/auth.tsx', 'utf8');
const shell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const profitabilityPage = await readFile('apps/web/src/features/project-profitability/pages/project-profitability-page.tsx', 'utf8');
const supplierPayablesPage = await readFile('apps/web/src/features/supplier-payables/pages/supplier-payables-page.tsx', 'utf8');
const clientReceiptsPage = await readFile('apps/web/src/features/client-receipts/pages/client-receipts-page.tsx', 'utf8');

test('Site Manager receives Material-master management without Administration, profitability, or Documents grants', () => {
  assert.match(inventoryPage, /usePermission\('materials\.manage'\)/);
  assert.match(migration, /permission\."code" = 'materials\.manage'/);
  for (const permission of ['documents.read', 'documents.upload', 'documents.link', 'documents.version']) {
    assert.match(migration, new RegExp(`'${permission.replaceAll('.', '\\.')}'`));
  }
  for (const forbidden of ['admin.users.manage', 'admin.roles.manage', 'project_profitability.read', 'project_profitability.finance.read', 'project_profitability.portfolio.read']) {
    assert.doesNotMatch(migration, new RegExp(`permission\.\"code\" = '${forbidden.replaceAll('.', '\\.')}'`));
  }
  assert.match(authHooks, /return hasAnyIdentityPermission\(identity, \['documents\.read', 'audit\.read'\]\);/);
  assert.doesNotMatch(authHooks, /\['documents\.read', 'audit\.read'\]\) \|\| hasRestrictedProjectMembership/);
  assert.match(shell, /const canUseProjectProfitability = hasAnyIdentityPermission\(auth\.identity, PROJECT_PROFITABILITY_PERMISSIONS\);/);
  assert.doesNotMatch(profitabilityPage, /hasRestrictedProjects/);
  assert.match(profitabilityPage, /const canRead = usePermission\('project_profitability\.read'\);/);
  assert.match(supplierPayablesPage, /canUploadDocuments=\{usePermission\('documents\.upload'\)\}/);
  assert.match(clientReceiptsPage, /canUploadDocuments=\{usePermission\('documents\.upload'\)\}/);
});

test('Project-scoped supplier and subcontractor JSON boundaries accept the projectId already used by UI and service', () => {
  assert.match(vendorSchema, /createSubcontractorBodySchema = z\.object\(\{[\s\S]*?projectId: uuidSchema\.optional\(\)/);
  assert.match(vendorSchema, /createVendorBodySchema = z\.object\(\{[\s\S]*?projectId: uuidSchema\.optional\(\)/);
  assert.match(vendorService, /const projectId = this\.creationProjectId\(input\.projectId\)/);
  assert.match(vendorService, /if \(projectId\) await repository\.assignSubcontractorToProject\(subcontractor\.id, projectId\)/);
  assert.match(vendorService, /if \(projectId\) await repository\.assignVendorToProject\(vendor\.id, projectId\)/);
  assert.match(vendorWorkspace, /projectId: values\.projectId/);

  assert.match(vendorRoutes, /VENDOR_LIST_QUERY_JSON_SCHEMA[\s\S]*?projectId: UUID_JSON_SCHEMA/);
  assert.match(vendorRoutes, /CREATE_VENDOR_BODY_JSON_SCHEMA[\s\S]*?properties: \{ projectId: UUID_JSON_SCHEMA, \.\.\.VENDOR_BODY_PROPERTIES \}/);
  assert.match(vendorRoutes, /SUBCONTRACTOR_LIST_QUERY_JSON_SCHEMA[\s\S]*?projectId: UUID_JSON_SCHEMA/);
  assert.match(vendorRoutes, /CREATE_SUBCONTRACTOR_BODY_JSON_SCHEMA[\s\S]*?properties: \{ projectId: UUID_JSON_SCHEMA, \.\.\.SUBCONTRACTOR_BODY_PROPERTIES \}/);
});
