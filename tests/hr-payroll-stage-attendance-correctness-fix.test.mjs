import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';
const migrationName = '20260909000200_attendance_stage_split';

/** Same Project/day attendance must be unique per Stage destination, including Project-level null. */
test('attendance persistence permits same-day Stage splits without permitting duplicate Stage destinations', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  const migration = read(`packages/database/prisma/migrations/${migrationName}/migration.sql`);
  const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));

  assert.match(schema, /@@unique\(\[companyId, employeeId, projectId, stageId, workDate\], map: "attendance_entries_company_employee_project_stage_date_uq"\)/);
  assert.doesNotMatch(schema, /@@unique\(\[companyId, employeeId, projectId, workDate\], map: "attendance_entries_company_employee_project_date_uq"\)/);
  assert.match(migration, /DROP INDEX "attendance_entries_company_employee_project_date_uq"/);
  assert.match(migration, /CREATE UNIQUE INDEX "attendance_entries_company_employee_project_stage_date_uq"/);
  assert.match(migration, /\("company_id", "employee_id", "project_id", "stage_id", "work_date"\) NULLS NOT DISTINCT/);
  assert.ok(gates.gates.some((gate) => gate.migrations?.includes(migrationName)));
  assert.match(checksums.migrations[migrationName], /^[a-f0-9]{64}$/);
});

/** Stage-only assignments must not be allowed to lose their Stage when attendance is entered. */
test('attendance assignment validation requires project-level assignment when stageId is null', () => {
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  assert.match(repository, /stageId \? \[\{ OR: \[\{ stageId \}, \{ stageId: null \}\] \}\] : \[\{ stageId: null \}\]/);
});

/** Create/correction duplicate checks must use the full Project/Stage destination under the Employee lock. */
test('attendance duplicate checks are Stage-aware for create and correction', () => {
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);

  assert.match(repository, /findAttendanceByNaturalKey\(employeeId: string, projectId: string, stageId: string \| null, workDate: Date, excludeId\?: string\)/);
  assert.match(repository, /scope\.where\(\{ employeeId, projectId, stageId, workDate,/);
  assert.match(service, /requireAttendanceEmployeeIntegrity\(repository, input\.employeeId, workDate, input\.hours, input\.overtimeHours\);\s*if \(await repository\.findAttendanceByNaturalKey\(input\.employeeId, input\.projectId, stageId, workDate\)\)/);
  assert.match(service, /requireAttendanceEmployeeIntegrity\(repository, before\.employeeId, before\.workDate, hours, overtimeHours, attendanceId\);\s*if \(await repository\.findAttendanceByNaturalKey\(before\.employeeId, before\.projectId, stageId, before\.workDate, attendanceId\)\)/);
});

/** Payroll already consumes each attendance row's Stage, so no allocation/API shape change is needed. */
test('payroll continues allocating labour cost directly to each attendance Stage without an API contract change', () => {
  const service = read(`${backend}/labour-payroll.service.ts`);
  const schema = read(`${backend}/labour-payroll.schema.ts`);
  const webApi = read('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts');

  assert.match(service, /const key = `\$\{attendance\.projectId\}:\$\{attendance\.stageId \?\? ''\}:\$\{category\}`/);
  assert.match(service, /stageId: attendance\.stageId/);
  assert.match(schema, /stageId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(webApi, /stageId\?: string \| null/);
});
