import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-304-compensation-rate-authority.json');
const results = [];
const steps = [
  ['pass-304-focused-static', 'node', ['--test', 'tests/pass-304-compensation-rate-authority.test.mjs']],
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
  kind: 'construction-erp-pass-304-compensation-labor-rate-authority',
  generatedAt: new Date().toISOString(),
  pass: 304,
  status: passed
    ? 'PASS_304_COMPENSATION_RATE_AUTHORITY_FROZEN_STAGE_20_RUNTIME_BLOCKED'
    : 'PASS_304_COMPENSATION_RATE_AUTHORITY_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  authorityResolved: [
    'HR/Payroll owns compensation and labor-rate authority',
    'Workforce owns approved hour quantities and cost coding, not rates/cost',
    'Payroll calculation authority remains server-side',
    'Job Cost may not independently price raw Timesheets',
    'ordinary Employee readback remains compensation-safe',
  ],
  stillBlockingStage20Runtime: [
    'effective-dated compensation persistence/history',
    'pay-type representation and selection',
    'overtime multiplier/premium policy',
    'earnings/deductions/net formulas and rounding',
    'salary-specific compensation read authorization',
    'exact Job-Cost labor-rate basis',
    'Payroll approval/group/period/source-consumption contracts',
    'leave and Stage-20-vs-Stage-26 Finance boundaries',
  ],
  stage20RuntimeAllowed: false,
  nextReviewedPass: 'Pass 305 - Module 13 Payroll source-consumption and posting-identity contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_304_COMPENSATION_RATE_AUTHORITY_FROZEN_STAGE_20_RUNTIME_BLOCKED');
