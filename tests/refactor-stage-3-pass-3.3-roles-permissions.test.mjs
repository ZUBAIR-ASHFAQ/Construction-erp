import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');
const authentication = await readFile('apps/api/src/plugins/authentication.ts', 'utf8');
const adminApi = await readFile('apps/web/src/features/administration/api/admin-api.ts', 'utf8');
const rolesPage = await readFile('apps/web/src/features/administration/pages/roles-page.tsx', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260828000300_administration_permission_aliases/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const migrationChecksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));

const finalPermissions = [
  'admin.users.read',
  'admin.users.manage',
  'admin.roles.read',
  'admin.roles.manage'
];

/** Verify the current final Administration permission codes are part of the server-owned catalog. */
test('Pass 3.3 adds final Administration user and role permissions', () => {
  for (const permission of finalPermissions) {
    assert.ok(schema.includes(`'${permission}'`), `missing final permission ${permission}`);
  }
  assert.match(schema, /USERS_RBAC_PERMISSION_CODES/);
  assert.match(service, /for \(const code of USERS_RBAC_PERMISSION_CODES\)/);
});

/** Verify legacy and final Administration permissions are expanded during the transition. */
test('Pass 3.3 keeps legacy permission aliases compatible during migration', () => {
  assert.match(schema, /function expandAdministrationPermissionAliases/);
  assert.match(schema, /\['roles\.manage', 'admin\.roles\.manage'\]/);
  assert.match(schema, /\['users\.manage', 'admin\.users\.manage'\]/);
  assert.match(authentication, /expandAdministrationPermissionAliases/);
  assert.match(service, /expandAdministrationPermissionAliases/);
});

/** Verify the final Module 2 role and user-role routes exist under the Administration API. */
test('Pass 3.3 exposes final Administration role routes', () => {
  for (const route of [
    "app.get('/api/v1/admin/roles'",
    "app.post('/api/v1/admin/roles'",
    "app.put('/api/v1/admin/roles/:id/permissions'",
    "app.put('/api/v1/admin/users/:id/roles'"
  ]) {
    assert.ok(routes.includes(route), `missing final route ${route}`);
  }
  assert.match(routes, /replaceAdminUserRolesBodySchema/);
  assert.match(routes, /service\.replaceAdminUserRoles\(params\.id, body\)/);
});

/** Verify final user-role replacement changes only company roles and does not consume Project scope. */
test('Pass 3.3 separates company roles from Project-scoped assignments', () => {
  const bodySchema = schema.match(/replaceAdminUserRolesBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\);/);
  assert.ok(bodySchema);
  assert.match(bodySchema[0], /roleIds/);
  assert.doesNotMatch(bodySchema[0], /scopeId/);
  assert.match(repository, /async listCompanyUserRoleAssignments\(userId: string\)/);
  assert.match(repository, /async deleteCompanyUserRoleAssignments\(userId: string\)/);
  assert.match(repository, /scopeType: 'COMPANY'/);
  assert.match(repository, /scopeId: null/);
  assert.match(service, /async replaceAdminUserRoles\(userId: string, input: ReplaceAdminUserRolesBody\)/);
  assert.match(service, /deleteCompanyUserRoleAssignments\(userId\)/);
});

/** Verify role permission replacement remains server checked and audit traced. */
test('Pass 3.3 preserves privilege escalation and audit controls', () => {
  assert.match(service, /input\.permissionCodes\.some\(\(code\) => !hasPermission\(code\)\)/);
  assert.match(service, /findPermissionsByCodes\(input\.permissionCodes\)/);
  assert.match(service, /action: 'role\.permissions_changed'/);
  assert.match(service, /action: 'user\.roles_changed'/);
});

/** Verify the React role editor uses final endpoints without erasing unrelated module permissions. */
test('Pass 3.3 moves role UI calls to final Administration endpoints safely', () => {
  assert.match(adminApi, /`admin\/roles\?\$\{query\.toString\(\)\}`/);
  assert.match(adminApi, /'admin\/roles'/);
  assert.match(adminApi, /`admin\/roles\/\$\{roleId\}\/permissions`/);
  assert.match(adminApi, /`admin\/users\/\$\{userId\}\/roles`/);
  assert.match(rolesPage, /USER_RBAC_PERMISSION_CODES/);
  assert.match(rolesPage, /preservedCodes/);
  assert.match(rolesPage, /admin\.roles\.manage/);
});


/** Verify existing databases receive final permission rows without dropping legacy grants. */
test('Pass 3.3 migration seeds and maps final Administration permission aliases', () => {
  for (const permission of finalPermissions) assert.ok(migration.includes(`'${permission}'`));
  assert.match(migration, /INSERT INTO "role_permissions"/);
  assert.match(migration, /ON CONFLICT \("role_id", "permission_id"\) DO NOTHING/);
  const gate = migrationGates.gates.find((item) => item.gate === 'refactor-stage-3-pass-3-3-administration-role-permissions');
  assert.ok(gate);
  assert.deepEqual(gate.migrations, ['20260828000300_administration_permission_aliases']);
  assert.match(migrationChecksums.migrations['20260828000300_administration_permission_aliases'], /^[a-f0-9]{64}$/);
});
