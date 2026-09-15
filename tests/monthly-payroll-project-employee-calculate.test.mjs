import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';
const web = 'apps/web/src/features/labour-payroll';

test('monthly Payroll exposes Project-scoped salary Employee selection without changing persistence', async () => {
  const [schema, routes, repository] = await Promise.all([
    read(`${backend}/labour-payroll.schema.ts`),
    read(`${backend}/labour-payroll.routes.ts`),
    read(`${backend}/labour-payroll.repository.ts`)
  ]);
  assert.match(schema, /projectId: uuidSchema\.optional\(\)/);
  assert.match(schema, /employeeId: uuidSchema\.optional\(\)/);
  assert.match(schema, /projectId and employeeId must be supplied together/);
  assert.match(schema, /payrollEligibleEmployeesQuerySchema/);
  assert.match(routes, /\/api\/v1\/payroll\/runs\/:id\/eligible-employees/);
  assert.match(repository, /listMonthlyPayrollEligibleEmployees/);
  assert.match(repository, /projectTeamAssignments:[\s\S]*projectId[\s\S]*compensations:[\s\S]*payType: 'SALARY'/);
  assert.match(repository, /clearPayrollCalculationForEmployee/);
});

test('targeted monthly calculation replaces only the selected Employee while finalization still revalidates the complete Payroll period', async () => {
  const service = await read(`${backend}/labour-payroll.service.ts`);
  assert.match(service, /requireProjectPermission\(administration, input\.projectId, 'payroll\.calculate'/);
  assert.match(service, /eligible\.some\(\(employee\) => employee\.id === input\.employeeId\)/);
  assert.match(service, /selectedEmployeeIds = input\.employeeId \? \[input\.employeeId\] : undefined/);
  assert.match(service, /clearPayrollCalculationForEmployee\(payrollRunId, input\.employeeId\)/);
  assert.match(service, /const recalculated = await this\.calculateDraftLines\(repository, locked\.periodStart, locked\.periodEnd, locked\.overtimeMultiplier, locked\.payCycle\);/);
});

test('monthly Payroll workspace provides Project and monthly-salary Employee selectors and a professional calculation view', async () => {
  const [api, hooks, workspace, styles] = await Promise.all([
    read(`${web}/api/labour-payroll-api.ts`),
    read(`${web}/hooks/labour-payroll.ts`),
    read(`${web}/components/labour-payroll-workspace.tsx`),
    read('apps/web/src/styles.css')
  ]);
  assert.match(api, /listPayrollEligibleEmployees/);
  assert.match(api, /eligible-employees\?\$\{query\}/);
  assert.match(hooks, /usePayrollEligibleEmployees/);
  assert.match(workspace, /Select the Project and monthly-salary Employee/);
  assert.match(workspace, /Calculate employee salary/);
  assert.match(workspace, /calculateMutation\.mutate\(\{ projectId: selectedPayrollProjectId, employeeId: selectedPayrollEmployeeId \}\)/);
  assert.match(workspace, /payroll-summary-grid/);
  assert.match(workspace, /Calculated Employees/);
  assert.match(styles, /\.payroll-summary-grid/);
  assert.match(styles, /\.payroll-calculation-panel/);
  assert.match(styles, /\.payroll-results-table/);
});
