import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Employee Management exposes focused task pages in the workspace navigation', async () => {
  const shell = await read('apps/web/src/features/administration/components/admin-shell.tsx');
  for (const label of ['Employee List', 'Add Employee', 'Attendance', 'Salary Advances', 'Daily Settlements', 'Monthly Payroll', 'Salary Payments', 'Employee Ledger']) {
    assert.match(shell, new RegExp(label));
  }
  assert.match(shell, /<EmployeesPage view="list"/);
  assert.match(shell, /<EmployeesPage view="create"/);
  assert.match(shell, /<LabourPayrollPage view="attendance"/);
  assert.match(shell, /<LabourPayrollPage view="daily-payroll"/);
  assert.match(shell, /<LabourPayrollPage view="monthly-payroll"/);
});

test('Employee and Payroll pages hide unrelated workflows instead of stacking every form', async () => {
  const [employees, payroll, landing] = await Promise.all([
    read('apps/web/src/features/employees/pages/employees-page.tsx'),
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx'),
    read('apps/web/src/features/employees/pages/employee-module-page.tsx')
  ]);
  assert.match(employees, /view === 'list'/);
  assert.match(employees, /view === 'create'/);
  assert.match(employees, /employee-detail-modal/);
  assert.match(payroll, /showAttendance/);
  assert.match(payroll, /showAdvances/);
  assert.match(payroll, /showPayrollCreation/);
  assert.match(payroll, /showPayments/);
  assert.match(payroll, /showLedger/);
  assert.match(landing, /From Employee setup to salary payment/);
  assert.match(landing, /Attendance drives earnings/);
});
