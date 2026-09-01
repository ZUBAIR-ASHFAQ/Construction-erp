import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION = 'packages/database/prisma/migrations/20260830000100_final21_remove_excluded_legacy_scope/migration.sql';

/** Read one repository file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return one Prisma model block without parsing unrelated models. */
function prismaModel(schema, modelName) {
  return schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

test('R3 removes excluded BOQ, WBS, Cost Code and Leave models from active Prisma', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['Boq', 'BoqRevision', 'BoqItem', 'ProjectCostStructureState', 'WbsNode', 'CostCode', 'CostType', 'ProjectCostCode', 'LeaveRequest']) {
    assert.doesNotMatch(prisma, new RegExp(`model ${model} \\{`), `${model} must not remain active`);
  }
  assert.doesNotMatch(prisma, /\b(?:Boq|BoqRevision|BoqItem|ProjectCostStructureState|WbsNode|CostCode|CostType|ProjectCostCode|LeaveRequest)\[?\]?/);
});

test('R3 leaves Employee Compensation as the only salary and rate persistence authority', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const employee = prismaModel(prisma, 'Employee');
  const compensation = prismaModel(prisma, 'EmployeeCompensation');
  assert.ok(employee);
  assert.ok(compensation);
  assert.doesNotMatch(employee, /\bbaseSalary\b|\bhourlyRate\b|base_salary|hourly_rate/);
  assert.match(compensation, /baseSalary\s+Decimal\?/);
  assert.match(compensation, /hourlyRate\s+Decimal\?/);
  assert.match(compensation, /@@map\("employee_compensation"\)/);
});

test('R3 forward migration fails closed before deleting legacy business history', () => {
  const migration = read(MIGRATION);
  for (const table of ['boqs', 'boq_revisions', 'boq_items', 'wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes', 'leave_requests', 'subcontracts', 'subcontract_items']) {
    assert.match(migration, new RegExp(`EXISTS \\(SELECT 1 FROM "${table}"`), `missing preflight for ${table}`);
  }
  assert.match(migration, /Employee has legacy salary\/rate data without Employee Compensation history/);
  assert.match(migration, /employee_compensation/);
});

test('R3 removes excluded legacy tables and duplicate Employee salary columns only in a new migration', () => {
  const migration = read(MIGRATION);
  for (const table of ['boq_items', 'boq_revisions', 'boqs', 'project_cost_codes', 'wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_structure_states', 'leave_requests']) {
    assert.match(migration, new RegExp(`DROP TABLE "${table}"`), `missing drop for ${table}`);
  }
  assert.match(migration, /ALTER TABLE "employees"[\s\S]*DROP COLUMN "base_salary"[\s\S]*DROP COLUMN "hourly_rate"/);
  assert.match(migration, /DROP FUNCTION IF EXISTS "module_6_validate_project_cost_code"/);
  assert.match(migration, /DROP FUNCTION IF EXISTS "module_14a_validate_leave_approver_company"/);
});

test('R3 aligns the shared Finance posting source contract to Project and optional Stage dimensions', () => {
  const source = read('packages/contracts/src/financial-posting.ts');
  assert.match(source, /stageId/);
  assert.doesNotMatch(source, /wbsNodeId|costCodeId|costTypeId/);
});

test('R3 remains a checksum-locked forward migration gate', () => {
  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
  const gate = gates.gates.find((entry) => entry.stage === 49);
  assert.equal(gate?.gate, 'final-21-repair-r3-remove-excluded-legacy-scope');
  assert.deepEqual(gate?.migrations, ['20260830000100_final21_remove_excluded_legacy_scope']);
  assert.match(checksums.migrations[gate.migrations[0]], /^[a-f0-9]{64}$/);
});
