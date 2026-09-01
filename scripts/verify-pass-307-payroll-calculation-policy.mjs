import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-307-payroll-calculation-policy.json');
const results = [];
const steps = [
  ['pass-307-focused-static', 'node', ['--test', 'tests/pass-307-payroll-calculation-policy.test.mjs']],
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
  kind: 'construction-erp-pass-307-payroll-calculation-policy',
  generatedAt: new Date().toISOString(),
  pass: 307,
  status: passed
    ? 'PASS_307_PAYROLL_CALCULATION_SCOPE_FROZEN_STAGE_20_RUNTIME_BLOCKED'
    : 'PASS_307_PAYROLL_CALCULATION_SCOPE_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiRuntimeChanges: 0,
  newPermissions: 0,
  frozenCalculationScope: [
    'Payroll monetary calculation is server-owned and exact-decimal',
    'gross/deduction/net aggregate arithmetic derives from server-generated Payslip items',
    'no statutory/tax engine or browser monetary override is invented',
    'undefined compensation/overtime authority is a blocking calculation condition',
    'leave effect is disabled in the first reviewed Payroll scope',
    'Shift is not a Payroll dimension until reviewed Shift persistence exists',
    'no numeric daily/period hour cap is invented when no policy is configured',
    'first calculable Workforce sources are approved original Timesheet Entries only',
    'post-approval Timesheet Adjustments remain blocked until period/allocation policy exists',
    'blocking exceptions require durable server-owned persistence before submit runtime',
  ],
  stillBlockingStage20Runtime: [
    'explicit pay-type representation and effective-dated compensation persistence',
    'earning/deduction item-generation policy including overtime behavior',
    'durable Payroll calculation/exception/source-consumption persistence and uniqueness',
    'post-approval Timesheet Adjustment period and quantity allocation',
    'Stage-20 versus Stage-26 Finance posting boundary',
  ],
  stage20RuntimeAllowed: false,
  nextReviewedPass: 'Pass 308 - Stage-20 Payroll persistence amendment contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_307_PAYROLL_CALCULATION_SCOPE_FROZEN_STAGE_20_RUNTIME_BLOCKED');
