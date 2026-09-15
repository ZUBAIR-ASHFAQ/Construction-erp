import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';
const web = 'apps/web/src/features/labour-payroll';

test('daily settlement exposes only present daily/hourly Employees for the selected Project and work date', async () => {
  const [schema, repository, service] = await Promise.all([
    read(`${backend}/labour-payroll.schema.ts`),
    read(`${backend}/labour-payroll.repository.ts`),
    read(`${backend}/labour-payroll.service.ts`)
  ]);
  assert.match(schema, /payType: z\.enum\(\['SALARY', 'DAILY', 'HOURLY'\]\)/);
  assert.match(repository, /listDailyPayrollEligibleEmployees/);
  assert.match(repository, /attendanceEntries: \{ some: \{ projectId, workDate, status: 'PRESENT' \} \}/);
  assert.match(repository, /payType: \{ in: \['DAILY', 'HOURLY'\] \}/);
  assert.match(service, /run\.payCycle === 'MONTHLY'[\s\S]*listDailyPayrollEligibleEmployees\(query\.projectId, run\.periodStart\)/);
});

test('targeted daily calculation preserves other Employee lines and keeps advance recovery in the shared payroll calculation', async () => {
  const [repository, service] = await Promise.all([
    read(`${backend}/labour-payroll.repository.ts`),
    read(`${backend}/labour-payroll.service.ts`)
  ]);
  assert.match(service, /locked\.payCycle === 'MONTHLY'[\s\S]*listDailyPayrollEligibleEmployees\(input\.projectId, locked\.periodStart\)/);
  assert.match(service, /selectedEmployeeIds = input\.employeeId \? \[input\.employeeId\] : undefined/);
  assert.match(service, /clearPayrollCalculationForEmployee\(payrollRunId, input\.employeeId\)/);
  assert.match(repository, /clearPayrollCalculationForEmployee/);
  assert.match(service, /listRecoverableEmployeeAdvances\(employeeId, periodEnd\)/);
  assert.match(service, /advanceDeduction: moneyString\(advanceDeductionCents\)/);
});

test('daily settlement mirrors monthly Project and Employee targeting with a daily-specific professional preview', async () => {
  const [api, workspace] = await Promise.all([
    read(`${web}/api/labour-payroll-api.ts`),
    read(`${web}/components/labour-payroll-workspace.tsx`)
  ]);
  assert.match(api, /payType: 'SALARY' \| 'DAILY' \| 'HOURLY'/);
  assert.match(workspace, /Select the Project and daily-paid Employee/);
  assert.match(workspace, /Daily \/ hourly Employee/);
  assert.match(workspace, /Calculate employee pay/);
  assert.match(workspace, /projectId: selectedPayrollProjectId, employeeId: selectedPayrollEmployeeId, \.\.\.\(overtimeMultiplier/);
  assert.match(workspace, /Gross daily earnings/);
  assert.match(workspace, /Net payable/);
  assert.match(workspace, /Select a Project and present daily\/hourly Employee/);
});
