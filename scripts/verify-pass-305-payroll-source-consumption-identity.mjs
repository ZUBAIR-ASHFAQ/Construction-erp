import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-305-payroll-source-consumption-identity.json');
const results = [];
const steps = [
  ['pass-305-focused-static', 'node', ['--test', 'tests/pass-305-payroll-source-consumption-identity.test.mjs']],
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
  kind: 'construction-erp-pass-305-payroll-source-consumption-identity',
  generatedAt: new Date().toISOString(),
  pass: 305,
  status: passed
    ? 'PASS_305_PAYROLL_SOURCE_IDENTITY_FROZEN_STAGE_20_RUNTIME_BLOCKED'
    : 'PASS_305_PAYROLL_SOURCE_IDENTITY_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  resolvedIdentitySemantics: [
    'Timesheet Entry UUID is the original worked-time source-line identity',
    'Timesheet Adjustment UUID is a distinct correction source-line identity',
    'source kind must distinguish entries from adjustments',
    'original entries require approved Timesheet state and Payroll-period work-date eligibility',
    'finalized consumption requires durable Company + source kind + source-line uniqueness',
    'command idempotency alone is insufficient for cross-run source uniqueness',
  ],
  stillBlockingStage20Runtime: [
    'physical Payroll source-consumption persistence and uniqueness enforcement',
    'Payroll Run group/overlap identity',
    'Payroll approval lifecycle and Module-22 mapping',
    'effective-dated compensation persistence and pay type',
    'earnings/deductions/net calculation and rounding',
    'adjustment approval and late-correction period allocation',
    'Shift/hour-limit completion',
    'leave effect policy',
    'Stage-20 versus Stage-26 Finance boundary',
  ],
  stage20RuntimeAllowed: false,
  nextReviewedPass: 'Pass 306 - Payroll Run identity, period-lock and approval-lifecycle contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_305_PAYROLL_SOURCE_IDENTITY_FROZEN_STAGE_20_RUNTIME_BLOCKED');
