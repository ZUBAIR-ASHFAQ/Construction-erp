import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.routes.ts', 'utf8');
const api = await readFile('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx', 'utf8');

test('attendance accepts overtime only under effective HOURLY compensation authority', () => {
  assert.match(schema, /'OVERTIME_REQUIRES_HOURLY_COMPENSATION'/);
  assert.match(schema, /OVERTIME_REQUIRES_HOURLY_COMPENSATION: 'Overtime hours can only be recorded when the Employee has effective HOURLY compensation for the work date\.'/);
  assert.match(repository, /findEffectiveEmployeeCompensation\(employeeId: string, workDate: Date\)/);
  assert.match(repository, /effectiveFrom: \{ lte: workDate \}/);
  assert.match(repository, /OR: \[\{ effectiveTo: null \}, \{ effectiveTo: \{ gte: workDate \} \}\]/);
  assert.match(service, /requireAttendanceEmployeeIntegrity[\s\S]*decimal4Units\(overtimeHours\) > 0n[\s\S]*compensation\.payType !== 'HOURLY'[\s\S]*OVERTIME_REQUIRES_HOURLY_COMPENSATION/);
  assert.match(service, /requireAttendanceEmployeeIntegrity\(repository, input\.employeeId, workDate, input\.hours, input\.overtimeHours\);/);
  assert.match(service, /requireAttendanceEmployeeIntegrity\(repository, before\.employeeId, before\.workDate, hours, overtimeHours, attendanceId\);/);
});

test('payroll fails closed for legacy SALARY or DAILY overtime instead of silently ignoring it', () => {
  assert.match(service, /payType !== 'HOURLY' && rows\.some\(\(row\) => decimal4Units\(row\.overtimeHours\) > 0n\)/);
  assert.match(service, /throw createLabourPayrollError\('OVERTIME_REQUIRES_HOURLY_COMPENSATION'\)/);
  assert.match(service, /payType === 'HOURLY'[\s\S]*multiplyWithMultiplierToCents\(overtimeHours, rate, decimal4Units\(overtimeMultiplier\)\)/);
});

test('Patch 5 keeps the attendance and payroll HTTP payload contracts unchanged', () => {
  assert.match(routes, /overtimeHours: NULLABLE_HOURS_JSON_SCHEMA/);
  assert.match(api, /overtimeHours\?: string \| null/);
  assert.match(api, /CalculatePayrollRunInput = Readonly<\{ overtimeMultiplier\?: string \}>/);
  assert.doesNotMatch(routes, /payType.*ATTENDANCE_BODY_PROPERTIES/);
});

test('workspace makes the hourly-only overtime rule visible without exposing compensation data', () => {
  const labels = workspace.match(/Overtime hours \(hourly-paid only\)/g) ?? [];
  assert.equal(labels.length, 2);
  assert.match(workspace, /Hourly overtime multiplier/);
});
