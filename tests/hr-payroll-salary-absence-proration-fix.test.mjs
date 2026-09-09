import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.service.ts', 'utf8');

test('salary payroll reads ABSENT attendance while DAILY and HOURLY use only present rows', () => {
  assert.doesNotMatch(repository, /listPayrollAttendance[\s\S]{0,400}status: 'PRESENT'/);
  assert.doesNotMatch(repository, /listEmployeeAttendanceForPeriod/);
  assert.match(service, /const presentRows = rows\.filter\(\(item\) => item\.status === 'PRESENT'\)/);
  assert.match(service, /for \(const row of presentRows\)/);
});

test('monthly SALARY is prorated from unique PRESENT dates against the full calendar month', () => {
  assert.match(service, /function prorateCents\(totalCents: bigint, earnedDays: bigint, periodDays: bigint\)/);
  assert.match(service, /const presentDates = new Set\(rows\.filter\(\(item\) => item\.status === 'PRESENT'\)/);
  assert.match(service, /const periodDays = BigInt\(periodEnd\.getUTCDate\(\)\)/);
  assert.match(service, /grossCents = prorateCents\(moneyCents\(salaryCompensation\.baseSalary\), BigInt\(presentDates\.size\), periodDays\)/);
  assert.doesNotMatch(service, /recordedDates|BigInt\(recordedDates\.size\)/);
  assert.doesNotMatch(service, /grossCents = moneyCents\(salaryCompensation\.baseSalary\);/);
});

test('mid-month joiners use compensation effective on attendance dates instead of requiring coverage before joining', () => {
  assert.match(service, /const salaryCompensations = rows\.map\(\(row\) => compensationForDate\(compensations, row\.workDate\)\)/);
  assert.match(service, /salaryCompensations\.some\(\(compensation\) => compensation\?\.id !== salaryCompensation\.id\)/);
  assert.doesNotMatch(service, /compensationForDate\(compensations, periodStart\)/);
  assert.doesNotMatch(service, /compensationForDate\(compensations, periodEnd\)/);
});


test('one PRESENT day cannot produce a full monthly salary', () => {
  const helper = service.match(/function prorateCents[\s\S]*?\n}/)?.[0] ?? '';
  const expression = helper.match(/return ([^;]+);/)?.[1];
  assert.ok(expression, 'Expected prorateCents return expression');
  const calculate = Function('totalCents', 'earnedDays', 'periodDays', `return ${expression};`);
  assert.equal(calculate(300000n, 1n, 30n), 10000n);
  assert.equal(calculate(300000n, 15n, 30n), 150000n);
  assert.equal(calculate(300000n, 30n, 30n), 300000n);
});

test('salary proration remains exact-decimal and does not introduce floating-point money arithmetic', () => {
  const helper = service.match(/function prorateCents[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(helper, /bigint/);
  assert.match(helper, /periodDays \/ 2n/);
  assert.doesNotMatch(helper, /Number\(|parseFloat|Math\.|toFixed/);
});
