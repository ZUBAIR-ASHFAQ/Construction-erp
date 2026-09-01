import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260828000500_administration_departments/migration.sql', 'utf8');
const boundary = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');

test('Pass 3.5 adds the final company-owned Department master', () => {
  const department = schema.match(/model Department \{[\s\S]*?@@map\("departments"\)\n\}/)?.[0] ?? '';
  assert.match(department, /companyId String\s+@map\("company_id"\) @db\.Uuid/);
  assert.match(department, /name\s+String\s+@db\.VarChar\(160\)/);
  assert.match(department, /status\s+String\s+@default\("ACTIVE"\)/);
  assert.match(department, /company Company @relation\(fields: \[companyId\], references: \[id\]/);
});

test('Pass 3.5 forward migration creates Departments and the final permission', () => {
  assert.match(migration, /CREATE TABLE "departments"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
  assert.match(migration, /'admin\.departments\.manage'/);
  assert.match(migration, /legacy_permission\."code" = 'users\.manage'/);
});

test('Pass 3.5 boundary exposes only validated Department inputs', () => {
  assert.match(boundary, /'admin\.departments\.manage'/);
  assert.match(boundary, /createDepartmentBodySchema = z\.object\(\{\s*name: departmentNameSchema/);
  assert.match(boundary, /listDepartmentsQuerySchema = z\.object\(\{\s*\.\.\.paginationQueryShape/);
  assert.doesNotMatch(boundary, /createDepartmentBodySchema[\s\S]{0,250}companyId/);
});

test('Pass 3.5 repository derives Department company ownership from request scope', () => {
  const listMethod = repository.match(/async listDepartments\([\s\S]*?\n  \}/)?.[0] ?? '';
  const createMethod = repository.match(/async createDepartment\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(listMethod, /requireCompanyRepositoryScope\(\)/);
  assert.match(listMethod, /scope\.where\(\{\}\)/);
  assert.match(createMethod, /requireCompanyRepositoryScope\(\)/);
  assert.match(createMethod, /scope\.createData\(/);
});

test('Pass 3.5 service requires Department authority and audits creation', () => {
  const listMethod = service.match(/async listDepartments\([\s\S]*?\n  \}/)?.[0] ?? '';
  const createMethod = service.match(/async createDepartment\([\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(listMethod, /requirePermission\('admin\.departments\.manage'\)/);
  assert.match(createMethod, /requirePermission\('admin\.departments\.manage'\)/);
  assert.match(createMethod, /recordAudit\(tx/);
  assert.match(createMethod, /action: 'department\.created'/);
});

test('Pass 3.5 registers only the required bounded Department routes', () => {
  assert.match(routes, /app\.get\('\/api\/v1\/admin\/departments'/);
  assert.match(routes, /app\.post\('\/api\/v1\/admin\/departments'/);
  assert.match(routes, /administrationListDepartments/);
  assert.match(routes, /administrationCreateDepartment/);
  assert.doesNotMatch(routes, /app\.(?:put|patch|delete)\('\/api\/v1\/admin\/departments/);
});

test('Pass 3.5 keeps Finance-owned bank accounts outside Administration', () => {
  assert.doesNotMatch(schema.match(/model Department \{[\s\S]*?@@map\("departments"\)\n\}/)?.[0] ?? '', /bank|cash/i);
  assert.doesNotMatch(routes, /\/api\/v1\/admin\/(?:bank|cash)/);
});
