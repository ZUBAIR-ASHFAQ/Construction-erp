import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-repository.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-8-schema', 'npm', ['run', 'module-8:schema:gate']],
  ['module-8-repository-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  [
    'module-8-repository-typescript-syntax',
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
      'apps/api/src/modules/procurement/procurement.repository.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
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
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_REPOSITORY_READY_FOR_PASS_227'
      : 'STAGE_13_MODULE_8_REPOSITORY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-procurement-rfq-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 226,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  stage12LiveAccepted,
  repositoryFile: 'apps/api/src/modules/procurement/procurement.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityRequiredForProjectScopedReads: true,
  transactionClientSupported: true,
  requisitionPaginationBounded: true,
  projectWriteLockPrepared: true,
  requisitionWriteLockPrepared: true,
  rfqWriteLockPrepared: true,
  postingCombinationValidationPrepared: true,
  vendorMasterReadSupportPrepared: true,
  vendorMasterWriteMethodsGenerated: false,
  rfqInvitationCompanyScopePrepared: true,
  quotationInvitationScopePrepared: true,
  quotationTotalsCalculatedInRepository: false,
  comparisonRankingCalculatedInRepository: false,
  rfqItemRelationshipGapRecorded: true,
  rfqItemRelationshipResolvedByPass362: true,
  rfqItemScopeValidationPrepared: true,
  selectionPersistenceColumnInvented: false,
  financialCommitmentWriteMethodsGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage12LiveAccepted,
  nextPass: passed
    ? 'Pass 227 - Module 8 service/business rules, Project resource policy, Approval/Module-7 boundary checks, server totals, audit/outbox and pre-commitment selection.'
    : 'Repair the failed Pass-226 repository check before generating the Module-8 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
