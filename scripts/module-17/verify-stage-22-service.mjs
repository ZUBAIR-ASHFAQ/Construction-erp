import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-service.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-17-repository', 'npm', ['run', 'module-17:repository:gate']],
  ['module-17-service-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-service-typescript-syntax',
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
      'apps/api/src/modules/change-orders/change-orders.service.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-21-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
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
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_SERVICE_READY_FOR_PASS_339'
      : 'STAGE_22_MODULE_17_SERVICE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 338,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  serviceFile: 'apps/api/src/modules/change-orders/change-orders.service.ts',
  companyAndProjectScopeRevalidated: true,
  serverOwnedChangeNumberingPrepared: true,
  changeNumberSequenceKey: 'change-request',
  implementationPrivateLifecycleTokens: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
  exactMoneySummationPrepared: true,
  draftLineReplacementPolicyEnforced: true,
  lineReferenceRevalidationPrepared: true,
  module22ApprovalSnapshotPrepared: true,
  approvalDecisionRemainsModule22Owned: true,
  submitAuditOutboxAtomic: true,
  immutableFormalApprovalSnapshotPrepared: true,
  rejectionHistoryPreserved: true,
  idempotentWriteCommandsPrepared: true,
  readOnlyImpactReadPrepared: true,
  budgetForecastImpactApplied: false,
  changesApplyPermissionIntegrated: false,
  impactAppliedEventEmitted: false,
  scheduleAdapterGenerated: false,
  subcontractAdapterGenerated: false,
  clientBillingAdapterGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: false,
  runtimeDeploymentReason: 'Pass 339 mandatory Budget/Forecast application and changes.apply authorization must complete before Pass 340 exposes approve.',
  remainingSourceAmbiguities: [
    'No public Change Request/Change Order status enum is defined; Pass 338 uses only small implementation-private lifecycle tokens.',
    'The source does not define a Change-number format; Pass 338 reuses a provisioned Foundation Company sequence without adding a new uniqueness claim.',
    'Exact mandatory supporting-document policy remains undefined.',
    'approved_days Schedule mapping remains undefined and Stage-27-gated.',
    'Client/Subcontract/Schedule target adapters and reversal/adjustment policy remain Stage-27 completion work.'
  ],
  nextPass: passed
    ? 'Pass 339 - Module 17 mandatory Module-7 Budget/Forecast impact application, changes.apply enforcement and conditional target-adapter boundaries.'
    : 'Repair the failed Pass-338 service check before generating mandatory Change impact orchestration.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
