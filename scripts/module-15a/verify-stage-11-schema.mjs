import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const evidencePath = path.resolve('module-15a-evidence', 'stage-11-schema.json');

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
  ['module-15a-persistence', 'npm', ['run', 'module-15a:persistence:gate']],
  ['module-15a-schema-suite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  [
    'finance-schema-typescript-syntax',
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
      'apps/api/src/modules/finance/finance.schema.ts',
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
      ? 'STAGE_11_MODULE_15A_SCHEMA_READY_FOR_PASS_204'
      : 'STAGE_11_MODULE_15A_SCHEMA_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-11-module-15a-finance-core-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 203,
  stage: 11,
  module: '15A - Finance Core',
  businessModule: '15 - Finance & Accounting',
  status,
  stage10LiveAccepted,
  activeRouteCount: 6,
  deferred15BRouteCount: 4,
  manualJournalPeriodAuthority: 'server-derived-from-postingDate',
  manualJournalSourceIdentityBrowserOwned: false,
  bodylessCommands: ['journal-post', 'journal-reverse', 'period-close'],
  trialBalanceSelector: 'periodId',
  statusEnumsInvented: false,
  sourceTypeEnumInvented: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage10LiveAccepted,
  nextPass: passed
    ? 'Pass 204 - Module 15A Finance Core repository with Company/Project isolation and decimal-safe journal persistence workflows.'
    : 'Repair the failed Pass-203 schema check before generating the Finance Core repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 15A Stage-11 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
