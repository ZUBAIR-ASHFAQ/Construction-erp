import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-308-stage-20-payroll-persistence-amendment.json');
const results = [];
const steps = [
  ['pass-308-focused-static', 'node', ['--test', 'tests/pass-308-stage-20-payroll-persistence-amendment.test.mjs']],
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
  kind: 'construction-erp-pass-308-stage-20-payroll-persistence-amendment',
  generatedAt: new Date().toISOString(),
  pass: 308,
  status: passed
    ? 'PASS_308_STAGE_20_PAYROLL_PERSISTENCE_AMENDMENT_FROZEN_RUNTIME_BLOCKED'
    : 'PASS_308_STAGE_20_PAYROLL_PERSISTENCE_AMENDMENT_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiRuntimeChanges: 0,
  newPermissions: 0,
  frozenPersistenceBoundary: [
    'employee_compensation_periods provides explicit effective-dated SALARY/HOURLY authority',
    'payroll_runs keeps source fields and adds calculated_at as the DRAFT calculation marker',
    'payslips and payslip_items persist exact-decimal Employee calculation snapshots',
    'payroll_calculation_exceptions persists blocking server-owned calculation evidence',
    'payroll_source_consumptions persists exact calculated Timesheet Entry membership',
    'consumed_at plus partial Company/source uniqueness enforces at-most-once finalized consumption',
    'Module-22 resource identity remains the approval link without duplicate approval_request_id',
  ],
  stillBlockingStage20Runtime: [
    'compensation maintenance/write and sensitive-read authorization contract',
    'salary proration and earning/deduction item-generation policy',
    'overtime-rate policy',
    'calculation-exception reason vocabulary and service/error mapping',
    'late-approved time and Timesheet Adjustment correction policy',
    'Stage-20 versus Stage-26 Finance posting boundary',
    'Payslip file_id Document versus Document-Version target before publication',
  ],
  stage20RuntimeAllowed: false,
  nextReviewedPass: 'Pass 309 - Stage-20 Payroll persistence implementation',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_308_STAGE_20_PAYROLL_PERSISTENCE_AMENDMENT_FROZEN_RUNTIME_BLOCKED');
