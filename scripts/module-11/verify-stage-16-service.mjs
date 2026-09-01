import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-service.json');

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
  ['module-11-repository', 'npm', ['run', 'module-11:repository:gate']],
  ['module-11-service-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
  [
    'module-11-service-typescript-syntax',
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
      'apps/api/src/modules/subcontracts/subcontracts.service.ts'
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
      ? 'STAGE_16_MODULE_11_SERVICE_READY_FOR_PASS_261'
      : 'STAGE_16_MODULE_11_SERVICE_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 260,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  stage15LiveAccepted,
  serviceFile: 'apps/api/src/modules/subcontracts/subcontracts.service.ts',
  companyAndProjectPolicyRevalidated: true,
  closedProjectWritesFailClosed: true,
  subcontractorStatusConvention: 'ACTIVE',
  subcontractLifecycleConvention: ['DRAFT', 'EXECUTED', 'CLOSED'],
  applicationLifecycleConvention: ['SUBMITTED', 'CERTIFIED'],
  draftEditPermissionConvention: 'subcontracts.create',
  paymentApplicationCreatePermissionConvention: 'subcontracts.create',
  writeCommandsIdempotent: true,
  idempotentWriteCommandCount: 7,
  serverNumberingUsed: true,
  subcontractSequenceKey: 'subcontract',
  applicationSequenceKey: 'subcontract-payment-application',
  headerValueDerivedFromItemAmounts: true,
  quantityTimesRateFormulaInvented: false,
  approvalDefinitionServerOwned: true,
  approvalRequestSnapshotVersioned: true,
  approvalRequestTriggeredByExecute: true,
  executionRequiresApprovedDecision: true,
  executionAndCommitmentAtomic: true,
  commitmentSourceType: 'subcontract',
  commitmentStatus: 'ACTIVE',
  commitmentSourceLineIdentity: 'subcontract item id',
  paymentApplicationPriorProgressFromCertifiedHistory: true,
  claimedAmountServerCalculated: true,
  cumulativeQuantityProtected: true,
  cumulativeCertifiedValueProtected: true,
  certificationSnapshotImmutableByLifecycle: true,
  retentionServerCalculated: true,
  retentionConvention: 'certified value multiplied by subcontract retention percent, exact integer half-up to cents, capped by the same percentage of revised contract value',
  retentionReleaseImplemented: false,
  closeoutFailClosed: true,
  closeoutConvention: 'all applications certified, cumulative certified amount equals revised value, and outstanding retained amount equals zero',
  certificationStableSourceKeyPrepared: true,
  certificationSourceType: 'subcontract-payment-certification',
  financeAdapterDeferredToStage26: true,
  financeWritesGenerated: false,
  costActualWritesGenerated: false,
  formalVariationAdapterGenerated: false,
  revisedEventEmittedWithoutReviewedRevisionCommand: false,
  reviewedRuntimeEventsEmitted: [
    'subcontract.executed',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'subcontract.closed'
  ],
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage15LiveAccepted,
  nextPass: passed
    ? 'Pass 261 - Module 11 Fastify routes, authentication/RBAC, OpenAPI and module registration for exactly the eight reviewed operations while preserving the frozen service conventions and deferred Finance/variation boundaries.'
    : 'Repair the failed Pass-260 service check before generating Module-11 HTTP routes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
