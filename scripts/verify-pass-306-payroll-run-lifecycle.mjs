import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-306-payroll-run-lifecycle.json');
const results = [];
const steps = [
  ['pass-306-focused-static', 'node', ['--test', 'tests/pass-306-payroll-run-lifecycle.test.mjs']],
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
  kind: 'construction-erp-pass-306-payroll-run-lifecycle',
  generatedAt: new Date().toISOString(),
  pass: 306,
  status: passed
    ? 'PASS_306_PAYROLL_RUN_LIFECYCLE_FROZEN_STAGE_20_RUNTIME_BLOCKED'
    : 'PASS_306_PAYROLL_RUN_LIFECYCLE_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiRuntimeChanges: 0,
  newPermissions: 0,
  frozenLifecycleSemantics: [
    'Payroll Run durable identity is payroll_runs.id',
    'first medium-ERP Payroll group identity is authenticated Company',
    'Company Payroll periods are inclusive and non-overlapping',
    'minimal server-owned lifecycle is DRAFT -> PENDING_APPROVAL -> APPROVED -> FINALIZED',
    'explicit bodyless submit command is required as a reviewed API amendment',
    'Payroll submit reuses payroll.calculate while Module-22 decision uses approvals.act',
    'approval definition and approver authority remain server-owned',
    'pending/approved Payroll freezes the calculated snapshot',
    'finalization requires approved Module-22 state and future durable source-consumption uniqueness',
  ],
  stillBlockingStage20Runtime: [
    'effective-dated compensation persistence and explicit pay type',
    'Payroll calculation formulas, rounding and blocking-exception persistence',
    'physical Payroll source-consumption persistence and uniqueness enforcement',
    'Shift/hour-limit contract completion',
    'leave-effect scope and approval/read contract',
    'post-approval adjustment period allocation',
    'Stage-20 versus Stage-26 Finance posting boundary',
  ],
  stage20RuntimeAllowed: false,
  nextReviewedPass: 'Pass 307 - Payroll calculation, exception, leave-effect and Workforce-policy scope contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_306_PAYROLL_RUN_LIFECYCLE_FROZEN_STAGE_20_RUNTIME_BLOCKED');
