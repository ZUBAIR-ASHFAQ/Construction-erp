import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-310-compensation-authorization.json');
const results = [];
const steps = [
  ['pass-310-focused-static', 'node', ['--test', 'tests/pass-310-compensation-authorization.test.mjs']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-310-compensation-authorization',
  generatedAt: new Date().toISOString(),
  pass: 310,
  stage: 20,
  module: '14B - Payroll Completion',
  status: passed
    ? 'PASS_310_COMPENSATION_AUTHORIZATION_FROZEN_STAGE_20_CALCULATION_POLICY_PENDING'
    : 'PASS_310_COMPENSATION_AUTHORIZATION_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiRuntimeChanges: 0,
  newPermissions: 0,
  frozenAuthorization: {
    ordinaryEmployeeRead: 'employees.read without compensation values',
    publicCompensationRead: 'employees.manage',
    publicCompensationWrite: 'employees.manage',
    payrollInternalCompensationLookup: 'payroll.calculate',
    payrollReadIsGeneralSalaryRead: false,
    payslipSelfReadIsGeneralSalaryRead: false,
  },
  frozenRouteAmendments: [
    'GET /api/v1/hr/employees/:id/compensation-periods',
    'POST /api/v1/hr/employees/:id/compensation-periods',
  ],
  maintenanceModel: 'append one later effective period and atomically close the previous latest period',
  effectiveToBrowserOwned: false,
  idempotencyRequiredForWrite: true,
  genericAuditContainsRawSalaryAmounts: false,
  compensationOutboxEventInvented: false,
  legacyEmployeeCompensationIsPayrollHistoryAuthority: false,
  remainingStage20RuntimeBlockers: [
    'salary-period proration behavior',
    'earning and deduction item-code vocabulary and generation rules',
    'overtime-rate behavior',
    'calculation-exception reason vocabulary and stable error mapping',
    'late-approved time and Timesheet Adjustment Payroll correction policy',
    'Stage-20 versus Stage-26 Finance posting boundary',
    'Payslip file_id Document versus Document-Version target before publication',
  ],
  stage20RuntimeFullyAllowed: false,
  nextReviewedPass: 'Pass 311 - Stage-20 Payroll calculation item, proration, overtime and blocking-exception vocabulary contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_310_COMPENSATION_AUTHORIZATION_FROZEN_STAGE_20_CALCULATION_POLICY_PENDING');
