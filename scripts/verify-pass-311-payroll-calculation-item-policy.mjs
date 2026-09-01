import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-311-payroll-calculation-item-policy.json');
const results = [];
const steps = [
  ['pass-311-focused-static', 'node', ['--test', 'tests/pass-311-payroll-calculation-item-policy.test.mjs']],
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
  kind: 'construction-erp-pass-311-payroll-calculation-item-policy',
  generatedAt: new Date().toISOString(),
  pass: 311,
  stage: 20,
  module: '14B - Payroll Completion',
  status: passed
    ? 'PASS_311_PAYROLL_CALCULATION_ITEM_POLICY_FROZEN_STAGE_20_SCHEMA_PENDING'
    : 'PASS_311_PAYROLL_CALCULATION_ITEM_POLICY_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiRuntimeChanges: 0,
  newPermissions: 0,
  firstExecutableCalculationProfile: {
    activeGeneratedItemCodes: ['REGULAR_HOURS'],
    payType: 'HOURLY',
    regularHoursFormula: 'approved regular hours multiplied by effective-dated hourly rate',
    itemMoneyRounding: 'HALF_UP to 2 decimals',
    automaticDeductions: false,
    salaryCalculationEnabled: false,
    overtimeCalculationEnabled: false,
    timesheetAdjustmentsConsumed: false,
  },
  blockingReasonKeys: [
    'MISSING_COMPENSATION_PERIOD',
    'SALARY_PERIOD_POLICY_REQUIRED',
    'OVERTIME_RATE_POLICY_REQUIRED',
    'SOURCE_ALREADY_CONSUMED',
    'SOURCE_INTEGRITY_CONFLICT',
  ],
  publicBlockingError: 'PAYROLL_HAS_BLOCKING_ERRORS',
  partialEmployeePayslipWithBlockingExceptionAllowed: false,
  browserMoneyOverrideAllowed: false,
  remainingStage20Gaps: [
    'salary amount basis/frequency and proration policy',
    'overtime multiplier or alternate rate policy',
    'statutory/tax/benefit/manual deduction generation',
    'late-approved time and Timesheet Adjustment Payroll allocation policy',
    'Stage-20 versus Stage-26 Finance posting boundary',
    'Payslip file_id Document versus Document-Version target',
    'Stage-20 public request and response schemas',
  ],
  nextReviewedPass: 'Pass 312 - Stage-20 HR/Payroll strict Zod/API schema contract for compensation maintenance and Payroll commands',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_311_PAYROLL_CALCULATION_ITEM_POLICY_FROZEN_STAGE_20_SCHEMA_PENDING');
