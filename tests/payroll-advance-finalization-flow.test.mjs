import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('new Employee advances are constrained to effective Project Team assignments', async () => {
  const [service, workspace] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx')
  ]);
  assert.match(service, /payroll\.advances\.create/);
  assert.match(service, /listEffectiveAttendanceAssignments/);
  assert.match(workspace, /const advanceAssignments = useAttendanceAssignments/);
  assert.match(workspace, /advanceEligibleProjectIds/);
  assert.match(workspace, /Select assigned Project/);
  assert.match(workspace, /Assign the Employee in Project Team \/ Assignment before paying an advance/);
  assert.match(workspace, /showAdvances \|\| showPayrollCreation/);
});

test('finalization revalidates only calculated Employees and generates immutable payslips', async () => {
  const service = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
  const finalization = service.slice(service.indexOf('async finalizePayrollRun'), service.indexOf('/** Get one Payroll Run detail'));
  assert.match(finalization, /calculatedEmployeeIds/);
  assert.match(finalization, /calculateDraftLines\([\s\S]*calculatedEmployeeIds/);
  assert.match(finalization, /createPayslip\(line\.id, finalizedAt\)/);
  assert.match(finalization, /PAYROLL_FINALIZED/);
});

test('finalization compares persisted decimals and calculated money using canonical cents', async () => {
  const service = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
  const fingerprint = service.slice(service.indexOf('function payrollDraftFingerprint'), service.indexOf('/** Final Module 13'));
  for (const field of ['salaryBeforeAbsence', 'absenceDeduction', 'grossAmount', 'advanceDeduction', 'deductions', 'netAmount']) {
    assert.match(fingerprint, new RegExp(`${field}: moneyString\\(moneyCents\\(line\\.${field}\\)\\)`));
  }
  assert.match(fingerprint, /amount: moneyString\(moneyCents\(allocation\.amount\)\)/);
  assert.match(fingerprint, /amount: moneyString\(moneyCents\(recovery\.amount\)\)/);
});

test('salary can be paid after finalization and both payslip and payment slip remain in the Employee ledger', async () => {
  const workspace = await read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx');
  assert.match(workspace, /selectedRun\.data\.status === 'FINALIZED'[\s\S]*Pay salary from account/);
  assert.match(workspace, /downloadLedgerPayslip/);
  assert.match(workspace, /Download payslip/);
  assert.match(workspace, /View payment slip/);
});
