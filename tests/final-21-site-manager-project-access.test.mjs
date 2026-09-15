import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('authentication enforces System Admin all-project access and explicit Site Manager scopes', async () => {
  const repository = await read('apps/api/src/modules/administration/administration.repository.ts');

  assert.doesNotMatch(repository, /TEMPORARY_AUTHORIZATION_BYPASS/);
  assert.match(repository, /code: 'system-admin'/);
  assert.match(repository, /isSystem: true/);
  assert.match(repository, /this\.db\.userProjectScope\.findMany/);
  assert.match(repository, /kind: 'restricted' as const, projectIds: projectScopes\.map/);
});

test('Site Manager creation provisions direct credentials, role, and Project scopes in one transaction', async () => {
  const schema = await read('apps/api/src/modules/administration/administration.schema.ts');
  const service = await read('apps/api/src/modules/administration/administration.service.ts');
  const routes = await read('apps/api/src/modules/administration/administration.routes.ts');
  const api = await read('apps/web/src/features/administration/api/admin-api.ts');
  const page = await read('apps/web/src/features/administration/pages/users-page.tsx');

  assert.match(schema, /siteManagerProjectIds: z\.array\(uuidSchema\)\.min\(1\)/);
  assert.match(schema, /password: newPasswordSchema\.optional\(\)/);
  assert.match(service, /const SITE_MANAGER_ROLE_CODE = 'site-manager'/);
  assert.match(service, /passwordHash = input\.password \? await hashPassword\(input\.password\) : null/);
  assert.match(service, /status: siteManagerRole \? USER_ACTIVE : USER_INACTIVE/);
  assert.match(service, /repository\.findCompanyProjectsByIds\(siteManagerProjectIds\)/);
  assert.match(service, /repository\.createUserRole/);
  assert.match(service, /repository\.createUserProjectScopes/);
  assert.match(service, /if \(!siteManagerRole\) await issueInvitation\(repository, tx, user\.id\)/);
  assert.match(routes, /siteManagerProjectIds:/);
  assert.match(api, /siteManagerProjectIds\?: string\[\]/);
  assert.match(page, /Create Site Manager login/);
  assert.match(page, /no invitation is required/);
  assert.match(page, /Set \/ reset login password/);
  assert.match(service, /replacementPasswordHash = input\.password \? await hashPassword\(input\.password\) : null/);
  assert.match(service, /PASSWORD_RESET_BY_ADMIN/);
  assert.match(page, /Assigned Projects/);
});

test('forward migration creates least-privilege Site Manager roles and backfills Project managers', async () => {
  const migration = await read('packages/database/prisma/migrations/20260910000200_site_manager_project_access/migration.sql');
  const leastPrivilegeMigration = await read('packages/database/prisma/migrations/20260910000300_site_manager_least_privilege/migration.sql');
  const permissionCatalogMigration = await read('packages/database/prisma/migrations/20260910000400_project_operations_permission_catalog/migration.sql');
  const projectResourceMigration = await read('packages/database/prisma/migrations/20260912000100_site_manager_project_resource_scope/migration.sql');
  const managerScopeSyncMigration = await read('packages/database/prisma/migrations/20260912000200_project_manager_scope_sync/migration.sql');
  const gates = await read('packages/database/prisma/migration-gates.json');
  const checksums = await read('packages/database/prisma/migration-checksums.json');

  assert.match(migration, /'site-manager'/);
  assert.match(migration, /INSERT INTO "role_permissions"/);
  assert.match(migration, /INSERT INTO "user_roles"/);
  assert.match(migration, /INSERT INTO "user_project_scopes"/);
  assert.doesNotMatch(migration, /'admin\.[^']+'/);
  assert.doesNotMatch(migration, /'finance\.[^']+'/);
  assert.doesNotMatch(migration, /'payroll\.[^']+'/);
  assert.match(gates, /20260910000200_site_manager_project_access/);
  assert.match(checksums, /20260910000200_site_manager_project_access/);
  assert.match(leastPrivilegeMigration, /'employees\.read'/);
  assert.match(leastPrivilegeMigration, /DELETE FROM "role_permissions"/);
  assert.match(gates, /20260910000300_site_manager_least_privilege/);
  assert.match(checksums, /20260910000300_site_manager_least_privilege/);
  assert.match(permissionCatalogMigration, /'inventory\.read'/);
  assert.match(permissionCatalogMigration, /'budgets\.read'/);
  assert.match(permissionCatalogMigration, /role\."code" = 'system-admin'/);
  assert.match(permissionCatalogMigration, /role\."code" = 'site-manager'/);
  assert.match(gates, /20260910000400_project_operations_permission_catalog/);
  assert.match(checksums, /20260910000400_project_operations_permission_catalog/);
  assert.match(projectResourceMigration, /CREATE TABLE "vendor_project_assignments"/);
  assert.match(projectResourceMigration, /CREATE TABLE "subcontractor_project_assignments"/);
  assert.match(projectResourceMigration, /'employees\.create'/);
  assert.match(projectResourceMigration, /'vendors\.create'/);
  assert.match(projectResourceMigration, /'subcontractors\.manage'/);
  assert.match(projectResourceMigration, /'purchase_orders\.create'/);
  assert.match(managerScopeSyncMigration, /INSERT INTO "user_roles"/);
  assert.match(managerScopeSyncMigration, /INSERT INTO "user_project_scopes"/);
  assert.match(managerScopeSyncMigration, /administrator_role\."code" = 'system-admin'/);
  assert.match(gates, /20260912000100_site_manager_project_resource_scope/);
  assert.match(gates, /20260912000200_project_manager_scope_sync/);
  assert.match(checksums, /20260912000100_site_manager_project_resource_scope/);
  assert.match(checksums, /20260912000200_project_manager_scope_sync/);
});

test('restricted Employee directory reads follow only active assigned Project Team membership', async () => {
  const repository = await read('apps/api/src/modules/employees/employees.repository.ts');
  const service = await read('apps/api/src/modules/employees/employees.service.ts');

  assert.match(repository, /allowedProjectIds\?: readonly string\[\] \| null/);
  assert.match(repository, /projectTeamAssignments:/);
  assert.match(repository, /some: \{ projectId: \{ in: \[\.\.\.new Set\(input\.allowedProjectIds\)\] \}, status: 'ACTIVE' \}/);
  assert.match(repository, /some: \{ projectId: \{ in: \[\.\.\.new Set\(allowedProjectIds\)\] \}, status: 'ACTIVE' \}/);
  assert.match(service, /security\.projectScope\.kind === 'restricted'/);
  assert.match(service, /findEmployeeById\(employeeId, allowedProjectIds\)/);
});


test('Project-first workflow assigns Site Manager only from Administration Users and keeps Project ownership synchronized', async () => {
  const projectPage = await read('apps/web/src/features/projects/pages/projects-page.tsx');
  const projectDetails = await read('apps/web/src/features/projects/components/project-details-panel.tsx');
  const usersPage = await read('apps/web/src/features/administration/pages/users-page.tsx');
  const service = await read('apps/api/src/modules/administration/administration.service.ts');
  const repository = await read('apps/api/src/modules/administration/administration.repository.ts');

  assert.doesNotMatch(projectPage, /createForm\.register\('projectManagerUserId'\)/);
  assert.match(projectPage, /Create the Project first\. Assign its Site Manager afterward from Administration → Users\./);
  assert.doesNotMatch(projectDetails, /editForm\.register\('projectManagerUserId'\)/);
  assert.match(projectDetails, /Site Manager assignment is managed from Administration → Users after the Project exists\./);
  assert.match(usersPage, /Step 2 · Create Site Manager login/);
  assert.match(usersPage, /Site Manager role is assigned automatically/);
  assert.match(usersPage, /project\.projectManagerUserId === null/);
  assert.match(usersPage, /Assigned to another Site Manager/);
  assert.match(service, /repository\.assignProjectManagerToProjects\(user\.id, siteManagerProjectIds\)/);
  assert.match(service, /repository\.clearProjectManagerFromProjects\(userId, removedProjectIds\)/);
  assert.match(service, /A selected Project is already assigned to another Site Manager/);
  assert.match(repository, /async assignProjectManagerToProjects/);
  assert.match(repository, /projectManagerUserId: userId/);
  assert.match(repository, /async clearProjectManagerFromProjects/);
});

test('Project Manager assignment synchronizes Site Manager role and login Project scope transactionally', async () => {
  const service = await read('apps/api/src/modules/projects/projects.service.ts');
  const repository = await read('apps/api/src/modules/administration/administration.repository.ts');

  assert.match(service, /syncProjectManagerAccess/);
  assert.match(service, /SYSTEM_ADMIN_ROLE_CODE = 'system-admin'/);
  assert.match(service, /SITE_MANAGER_ROLE_CODE = 'site-manager'/);
  assert.match(service, /deleteUserProjectScope\(previousManagerUserId, projectId, SITE_MANAGER_ROLE_CODE\)/);
  assert.match(service, /repository\.upsertUserRole/);
  assert.match(service, /repository\.upsertUserProjectScope/);
  assert.match(service, /project\.id,[\s\S]*project\.projectManagerUserId/);
  assert.match(service, /before\.projectManagerUserId,[\s\S]*updated\.projectManagerUserId/);
  assert.match(repository, /async upsertUserRole/);
  assert.match(repository, /companyId_userId_roleId/);
  assert.match(repository, /async upsertUserProjectScope/);
  assert.match(repository, /companyId_userId_projectId/);
});

test('Site Manager operational resources and frontend selectors stay bound to trusted Project scope', async () => {
  const projects = await read('apps/api/src/modules/projects/projects.repository.ts');
  const vendors = await read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts');
  const procurement = await read('apps/api/src/modules/procurement/procurement.service.ts');
  const inventory = await read('apps/api/src/modules/inventory/inventory.repository.ts');
  const employeePage = await read('apps/web/src/features/employees/pages/employees-page.tsx');
  const vendorWorkspace = await read('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx');
  const procurementPage = await read('apps/web/src/features/procurement/pages/procurement-page.tsx');
  const inventoryWorkspace = await read('apps/web/src/features/inventory/components/inventory-workspace.tsx');

  assert.match(projects, /id: \{ in: \[\.\.\.new Set\(input\.allowedProjectIds\)\] \}/);
  assert.match(vendors, /projectAssignments: \{ some: projectWhere\(allowedProjectIds, projectId\) \}/);
  assert.match(procurement, /security\.projectScope\.kind === 'restricted'/);
  assert.match(inventory, /projectId: \{ in: projectIds \}/);
  assert.match(employeePage, /useProjects\(\{ page: 1, pageSize: 100 \}\)/);
  assert.match(vendorWorkspace, /useProjects\(\{ page: 1, pageSize: 100 \}\)/);
  assert.match(procurementPage, /useProjects\(\{ page: 1, pageSize: 100 \}/);
  assert.match(inventoryWorkspace, /useProjects\(\{ page: 1, pageSize: 100 \}/);
});

test('admin can maintain Site Manager permissions while protected roles cannot be deleted', async () => {
  const repository = await read('apps/api/src/modules/administration/administration.repository.ts');
  const service = await read('apps/api/src/modules/administration/administration.service.ts');
  const routes = await read('apps/api/src/modules/administration/administration.routes.ts');
  const api = await read('apps/web/src/features/administration/api/admin-api.ts');
  const page = await read('apps/web/src/features/administration/pages/roles-page.tsx');

  assert.match(service, /companyRole\.code === SITE_MANAGER_ROLE_CODE/);
  assert.match(service, /code\.startsWith\('admin\.'\)/);
  assert.match(service, /companyRole\.isSystem \|\| companyRole\.code === SYSTEM_ADMIN_ROLE_CODE/);
  assert.match(service, /createAdministrationError\('ROLE_IN_USE'\)/);
  assert.match(repository, /countCompanyRoleUserAssignments/);
  assert.match(repository, /countCompanyRoleProjectScopes/);
  assert.match(repository, /lockCompanyRoleForWrite/);
  assert.match(routes, /app\.delete\('\/api\/v1\/admin\/roles\/:id'/);
  assert.match(api, /export function deleteRole/);
  assert.match(page, /Save permissions/);
  assert.match(page, /className="danger-button"/);
  assert.match(page, /!role\.isSystem/);
});

test('Site Manager can create an expense inside assigned Project scope without Finance post authority', async () => {
  const service = await read('apps/api/src/modules/site-expenses/site-expenses.service.ts');
  const workspace = await read('apps/web/src/features/site-expenses/components/site-expenses-workspace.tsx');
  const migration = await read('packages/database/prisma/migrations/20260910000200_site_manager_project_access/migration.sql');

  assert.match(migration, /'site_expenses\.create'/);
  assert.doesNotMatch(migration, /'site_expenses\.post'/);
  assert.match(service, /postSiteExpenseOnce\(tx, created\.id, 'site_expenses\.create'\)/);
  assert.match(service, /permission: SiteExpensePermissionCode = 'site_expenses\.post'/);
  assert.match(service, /resolveVisibility\(new AdministrationRepository\(tx\), permission/);
  assert.match(service, /requireProjectPermission\(new AdministrationRepository\(tx\), locked\.projectId, permission/);
  assert.match(workspace, /const canSubmit = props\.canCreate;/);
  assert.match(workspace, /const canUseAccounts = props\.canReadFinance \|\| props\.canManageAccounts/);
  assert.match(workspace, /paymentMode: canUseAccounts \? 'CASH' : 'PAYABLE'/);
  assert.match(workspace, /canUseAccounts && <option value="CASH">Cash<\/option>/);
  assert.match(workspace, /canUseAccounts && <option value="BANK">Bank<\/option>/);
});
