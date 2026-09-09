import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';

/** Ensure same-day limits are calculated across every Project and serialized per Employee. */
test('attendance enforces one concurrency-safe 24-hour ceiling across all Projects for the Employee/date', () => {
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);

  assert.match(repository, /lockEmployeeForAttendance/);
  assert.match(repository, /SELECT id, status, joining_date AS "joinDate"[\s\S]*FOR UPDATE/);
  assert.match(repository, /sumAttendanceHoursForEmployeeDate/);
  assert.match(repository, /attendanceEntry\.aggregate/);
  assert.match(repository, /employeeId,[\s\S]*workDate,[\s\S]*excludeAttendanceId/);
  assert.match(service, /existing\.hours/);
  assert.match(service, /existing\.overtimeHours/);
  assert.match(service, /totalUnits > 24n \* SCALE_4/);
  assert.match(service, /requireAttendanceEmployeeIntegrity\(repository, input\.employeeId, workDate, input\.hours, input\.overtimeHours\)/);
  assert.match(service, /requireAttendanceEmployeeIntegrity\(repository, before\.employeeId, before\.workDate, hours, overtimeHours, attendanceId\)/);
});

/** Ensure attendance respects Employee lifecycle instead of trusting an old active Project assignment. */
test('attendance rejects inactive Employees and dates before joining without changing the HTTP payload contract', () => {
  const schema = read(`${backend}/labour-payroll.schema.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);
  const routes = read(`${backend}/labour-payroll.routes.ts`);
  const webApi = read('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts');
  const workspace = read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx');

  for (const code of ['ATTENDANCE_DAILY_HOURS_EXCEEDED', 'ATTENDANCE_BEFORE_JOINING_DATE', 'EMPLOYEE_INACTIVE']) {
    assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  }
  assert.match(service, /employee\.status !== ACTIVE/);
  assert.match(service, /workDate < employee\.joinDate/);
  assert.match(routes, /POST'?,?\s*route: '\/api\/v1\/attendance'|app\.post\('\/api\/v1\/attendance'/);
  assert.match(webApi, /authenticatedRequest<AttendanceEntry>\('attendance'/);
  assert.match(workspace, /useEmployees\(\{ status: 'ACTIVE'/);
});
