import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-repository.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-11-schema', 'npm', ['run', 'module-11:schema:gate']],
  ['module-11-repository-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
  [
    'module-11-repository-typescript-syntax',
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
      'apps/api/src/modules/subcontracts/subcontracts.repository.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage15LiveAccepted
      ? 'STAGE_16_MODULE_11_REPOSITORY_READY_FOR_PASS_260'
      : 'STAGE_16_MODULE_11_REPOSITORY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 259,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  stage15LiveAccepted,
  repositoryFile: 'apps/api/src/modules/subcontracts/subcontracts.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityRequiredForSubcontractReadsAndWrites: true,
  transactionClientSupported: true,
  paginationBounded: true,
  businessListFiltersInvented: false,
  subcontractorReadCreatePrepared: true,
  subcontractorUpdateDeleteGenerated: false,
  vendorReadPrimitivePrepared: true,
  vendorWriteMethodsGenerated: false,
  module6CostStructureReadPrepared: true,
  module4BoqItemReadPrepared: true,
  boqWriteMethodsGenerated: false,
  subcontractCreatePrimitivePrepared: true,
  subcontractDraftReplacePrimitivePrepared: true,
  subcontractStatusCompareAndSetPrepared: true,
  subcontractRowLockPrepared: true,
  paymentApplicationReadPrepared: true,
  paymentApplicationCreatePrepared: true,
  paymentApplicationRowLockPrepared: true,
  certificationUpdatePrimitivePrepared: true,
  module7CommitmentReadPrepared: true,
  module7CommitmentUpsertPrepared: true,
  commitmentSourceTokenVocabularyInvented: false,
  retentionFormulaDecidedInRepository: false,
  certificationLimitDecidedInRepository: false,
  approvalPersistenceInvented: false,
  financeWriteMethodsGenerated: false,
  variationPersistenceInvented: false,
  retentionLedgerPersistenceInvented: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage15LiveAccepted,
  nextPass: passed
    ? 'Pass 260 - Module 11 service/business transactions: Project resource policy, Module-22 approval verification, atomic execute-to-Module-7 commitment, progress applications, certification/retention, closeout, idempotency, audit and outbox while keeping Finance/AP and formal Change Order adapters deferred.'
    : 'Repair the failed Pass-259 repository check before generating the Module-11 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
