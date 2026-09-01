import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260831000100_final21_permission_contract_alignment/migration.sql', 'utf8');
const repository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

/** Extract one Prisma model block for focused persistence assertions. */
function prismaModel(name) {
  return prisma.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

/** Verify Permission matches the Final-21 code/description/domain contract without legacy UUID/name state. */
test('R9 aligns Permission to stable code description and domain fields', () => {
  const permission = prismaModel('Permission');
  assert.match(permission, /code\s+String\s+@id\s+@db\.VarChar\(150\)/);
  assert.match(permission, /description\s+String\s+@db\.VarChar\(500\)/);
  assert.match(permission, /domain\s+String\s+@db\.VarChar\(100\)/);
  assert.doesNotMatch(permission, /\bid\s+String|\bname\s+String/);
});

/** Verify role grants reference the stable permission code directly as required by Module 2. */
test('R9 aligns RolePermission to role_id and permission_code', () => {
  const rolePermission = prismaModel('RolePermission');
  assert.match(rolePermission, /permissionCode\s+String\s+@map\("permission_code"\)/);
  assert.match(rolePermission, /@relation\(fields: \[permissionCode\], references: \[code\]/);
  assert.match(rolePermission, /@@id\(\[roleId, permissionCode\]/);
  assert.doesNotMatch(rolePermission, /^\s*permissionId\s/m);
  assert.doesNotMatch(rolePermission, /@map\(\"permission_id\"\)/);
});

/** Verify the forward migration preserves descriptions and grants before removing legacy columns. */
test('R9 migration converts legacy permission UUID grants without rewriting history', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "description"/);
  assert.match(migration, /COALESCE\(NULLIF\(btrim\("name"\), ''\), "code"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "permission_code"/);
  assert.match(migration, /permission\."id" = role_permission\."permission_id"/);
  assert.match(migration, /found an unresolved role permission/);
  assert.match(migration, /DROP COLUMN "permission_id"/);
  assert.match(migration, /PRIMARY KEY USING INDEX "permissions_code_uq"/);
  assert.match(migration, /DROP COLUMN "id"/);
  assert.match(migration, /DROP COLUMN "name"/);
  assert.match(migration, /FOREIGN KEY \("permission_code"\) REFERENCES "permissions"\("code"\)/);
});

/** Verify runtime Administration reads and writes role grants by code rather than internal permission IDs. */
test('R9 Administration runtime uses permissionCode end to end', () => {
  assert.match(repository, /async createCompanyRolePermissions\(roleId: string, permissionCodes: readonly string\[\]\)/);
  assert.match(repository, /\{ roleId, permissionCode \}/);
  assert.match(repository, /select: \{ permissionCode: true \}/);
  assert.doesNotMatch(repository, /permissionIds|\{ roleId, permissionId \}/);
  assert.match(service, /permissions\.map\(\(permission\) => permission\.code\)/);
  assert.match(service, /description: code/);
  assert.match(service, /data: activePermissionCodes\.map\(\(permissionCode\)/);
  assert.doesNotMatch(service, /permissionIds|permission\.id/);
});

/** Verify the historical R9 gate remains ordered after later Final-21 migrations are appended. */
test('R9 keeps its forward-only migration gate and prior migrations ordered', () => {
  const r9 = gates.gates.find((gate) => gate.gate === 'final-21-repair-r9-permission-contract-alignment');
  assert.equal(r9?.stage, 55);
  assert.deepEqual(r9?.migrations, ['20260831000100_final21_permission_contract_alignment']);
  assert.ok(gates.gates.some((gate) => gate.migrations.includes('20260830000600_final21_project_profitability_permissions')));
  assert.ok((gates.gates.at(-1)?.stage ?? 0) >= 55);
});
