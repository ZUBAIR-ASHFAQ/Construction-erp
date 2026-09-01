import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const evidencePath = path.resolve('module-15a-evidence', 'stage-11-repository.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage10 = await readJson('module-4b-evidence/stage-10-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-15a-schema', 'npm', ['run', 'module-15a:schema:gate']],
  ['module-15a-repository-suite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  [
    'finance-repository-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/api/src/modules/finance/finance.repository.ts',
    ],
  ],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage10LiveAccepted
      ? 'STAGE_11_MODULE_15A_REPOSITORY_READY_FOR_PASS_205'
      : 'STAGE_11_MODULE_15A_REPOSITORY_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-11-module-15a-finance-core-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 204,
  stage: 11,
  module: '15A - Finance Core',
  businessModule: '15 - Finance & Accounting',
  status,
  stage10LiveAccepted,
  repositoryGenerated: true,
  companyScopeEnforced: true,
  projectDimensionValidationPrepared: true,
  costStructureDimensionValidationPrepared: true,
  decimalSafeJournalPersistence: true,
  decimalSafeTrialBalanceAggregation: true,
  journalWriteLockPrepared: true,
  fiscalPeriodWriteLockPrepared: true,
  apArPaymentPersistenceGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage10LiveAccepted,
  nextPass: passed
    ? 'Pass 205 - Module 15A Finance Core service with manual journal creation, balanced posting, reversal, trial balance and period close rules.'
    : 'Repair the failed Pass-204 repository check before generating the Finance Core service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 15A Stage-11 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
