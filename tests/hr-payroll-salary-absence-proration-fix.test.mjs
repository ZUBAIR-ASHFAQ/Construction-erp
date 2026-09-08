import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.service.ts', 'utf8');

test('salary payroll reads ABSENT attendance while DAILY and HOURLY use only present rows', () => {
  assert.doesNotMatch(repository, /listPayrollAttendance[\s\S]{0,400}status: 'PRESENT'/);
  assert.match(repository, /listEmployeeAttendanceForPeriod[\s\S]*employeeId, workDate: \{ gte: periodStart, lte: periodEnd \}/);
  assert.doesNotMatch(repository, /listEmployeeAttendanceForPeriod[\s\S]{0,300}status: 'PRESENT'/);
  assert.match(service, /const presentRows = rows\.filter\(\(item\) => item\.status === 'PRESENT'\)/);
  assert.match(service, /for \(const row of presentRows\)/);
});

test('monthly SALARY is prorated from unique recorded attendance dates', () => {
  assert.match(service, /function prorateCents\(totalCents: bigint, earnedDays: bigint, recordedDays: bigint\)/);
  assert.match(service, /const recordedDates = new Set\(salaryAttendance\.map\(\(item\) => dateOnly\(item\.workDate\)\)\)/);
  assert.match(service, /const presentDates = new Set\(salaryAttendance\.filter\(\(item\) => item\.status === 'PRESENT'\)/);
  assert.match(service, /grossCents = prorateCents\(moneyCents\(startComp\.baseSalary\), BigInt\(presentDates\.size\), BigInt\(recordedDates\.size\)\)/);
  assert.doesNotMatch(service, /grossCents = moneyCents\(startComp\.baseSalary\);/);
});

test('salary proration remains exact-decimal and does not introduce floating-point money arithmetic', () => {
  const helper = service.match(/function prorateCents[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(helper, /bigint/);
  assert.match(helper, /recordedDays \/ 2n/);
  assert.doesNotMatch(helper, /Number\(|parseFloat|Math\.|toFixed/);
});
