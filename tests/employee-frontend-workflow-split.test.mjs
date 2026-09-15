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
  assert.match(employees, /useState\(view === 'create'\)/);
  assert.match(employees, /employee-create-modal/);
  assert.match(employees, /employee-detail-modal/);
  assert.match(payroll, /showAttendance/);
  assert.match(payroll, /showAdvances/);
  assert.match(payroll, /showPayrollCreation/);
  assert.match(payroll, /showPayments/);
  assert.match(payroll, /showLedger/);
  assert.match(landing, /From Employee setup to salary payment/);
  assert.match(landing, /Attendance drives earnings/);
});

test('Employee List exposes Add Employee as a centered two-column dialog without horizontal overflow', async () => {
  const [employees, styles] = await Promise.all([
    read('apps/web/src/features/employees/pages/employees-page.tsx'),
    read('apps/web/src/styles.css')
  ]);

  assert.match(employees, /className="section-heading employee-page-heading"/);
  assert.match(employees, /className="employee-primary-action"/);
  assert.match(employees, />\s*Add Employee\s*<\/button>/s);
  assert.match(employees, /createOpen && canCreate/);
  assert.match(employees, /role="dialog" aria-modal="true" aria-labelledby="employee-create-title"/);
  assert.match(employees, /className="employee-create-grid"/);
  assert.match(styles, /\.employee-create-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.employee-create-modal \.finance-modal-body\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(styles, /\.employee-create-grid input\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%/);
});

test('Employee List separates read-only Open from Edit and moves established salary changes to Edit', async () => {
  const [employees, details] = await Promise.all([
    read('apps/web/src/features/employees/pages/employees-page.tsx'),
    read('apps/web/src/features/employees/components/employee-details-panel.tsx')
  ]);

  assert.match(employees, /type EmployeeDialog = Readonly<\{ kind: 'open' \| 'edit'; employeeId: string \}>/);
  assert.match(employees, /setDialog\(\{ kind: 'open', employeeId: employee\.id \}\)[\s\S]*?>Open<\/button>/);
  assert.match(employees, /setDialog\(\{ kind: 'edit', employeeId: employee\.id \}\)[\s\S]*?>Edit<\/button>/);
  assert.match(employees, /mode=\{dialog\.kind === 'edit' \? 'edit' : 'details'\}/);
  assert.match(details, /mode === 'details' && canManageCompensation && compensationHistory\?\.length === 0/);
  assert.doesNotMatch(details, /After it is saved, salary changes are managed from Edit/);
  assert.doesNotMatch(details, /<label>Employee no\.<input/);
  assert.doesNotMatch(details, /<label>Login user ID \(optional\)<input/);
  assert.match(details, /mode === 'edit' && canUpdate/);
  assert.match(details, /mode === 'edit' && canManageCompensation && hasCompensation/);
  assert.match(details, />\s*Edit salary\s*<\/button>/s);
  assert.match(details, /renderCompensationForm\('Save salary change'\)/);
  assert.match(details, /useCreateEmployeeCompensation/);

  const styles = await read('apps/web/src/styles.css');
  assert.match(styles, /\.employee-detail-modal\s*\{[\s\S]*?max-height:\s*min\(90vh, 820px\)/);
  assert.match(styles, /\.employee-detail-modal \.finance-modal-body\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(styles, /\.employee-record-panel\s*\{[\s\S]*?min-width:\s*0/);
});
