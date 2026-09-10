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
});

test('restricted Employee directory reads follow assigned Project Team membership', async () => {
  const repository = await read('apps/api/src/modules/employees/employees.repository.ts');
  const service = await read('apps/api/src/modules/employees/employees.service.ts');

  assert.match(repository, /allowedProjectIds\?: readonly string\[\] \| null/);
  assert.match(repository, /projectTeamAssignments:/);
  assert.match(service, /security\.projectScope\.kind === 'restricted'/);
  assert.match(service, /findEmployeeById\(employeeId, allowedProjectIds\)/);
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
