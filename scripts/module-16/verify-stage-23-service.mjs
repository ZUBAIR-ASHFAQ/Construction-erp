import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-service.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-16-repository', 'npm', ['run', 'module-16:repository:gate']],
  ['module-16-service-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-service-typescript-syntax',
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
      'apps/api/src/modules/client-billing/client-billing.repository.ts',
      'apps/api/src/modules/client-billing/client-billing.service.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-2-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-4b-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-17-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_SERVICE_READY_FOR_PASS_351'
      : 'STAGE_23_MODULE_16_SERVICE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 350,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  serviceFile: 'apps/api/src/modules/client-billing/client-billing.service.ts',
  companyAndProjectAuthorityServerOwned: true,
  module24bProjectVisibilityReused: true,
  contractCreateIdempotent: true,
  claimCreateIdempotent: true,
  claimLineReplaceIdempotent: true,
  claimCertificationIdempotent: true,
  contractNumberUsesFoundationSequence: 'client-contract',
  claimNumberUsesFoundationSequence: 'progress-claim',
  numberDisplaySemanticsInvented: false,
  privateLifecycleTokensOnly: true,
  contractInitialRevisedValueEqualsContractValue: true,
  claimStartsDraft: true,
  completeDraftLineReplacement: true,
  sameProjectBoqValidationReusedFromRepository: true,
  certifiedBoqCumulativeQuantityRegressionRejected: true,
  previousCertifiedValueServerCalculated: true,
  currentClaimValueServerCalculatedFromLines: true,
  cumulativeGrossValueServerCalculated: true,
  cumulativeGrossCannotExceedCurrentRevisedContractValue: true,
  retentionServerCalculatedFromContractPercent: true,
  deductionPolicyInvented: false,
  deductionAmountHeldAtZeroUntilSourcePolicyExists: true,
  certifiedValueCannotExceedCurrentClaimedValue: true,
  certifiedClaimImmutableInService: true,
  contractCreatedEventRecorded: true,
  claimSubmittedEventRecordedAtCertificationBoundary: true,
  claimCertifiedEventRecorded: true,
  claimSubmitRouteInvented: false,
  module22ApprovalDependencyInvented: false,
  invoiceGenerationImplemented: false,
  retentionReleaseImplemented: false,
  approvedChangeAdapterImplemented: false,
  financeArAdapterGeneratedEarly: false,
  publicRoutesGenerated: false,
  reactGenerated: false,
  databaseMigrationGenerated: false,
  runtimeDeploymentAllowed: passed && stage22LiveAccepted,
  remainingSourceAmbiguities: [
    'Contract and Claim number scope/format remain Foundation sequence configuration rather than source-defined public semantics.',
    'billing_method and lifecycle vocabularies remain implementation-private string tokens because the source does not enumerate them.',
    'The reviewed API has no Claim submit route; Pass 350 records progress_claim.submitted immediately before certification in the same transaction instead of inventing a new endpoint.',
    'The source does not define deduction or advance-recovery inputs/policy fields, so Pass 350 does not invent them and keeps deduction_amount at zero.',
    'Exact cross-billing-method BOQ/milestone/manual valuation policy remains undefined; Pass 350 uses reviewed Claim-line current_value as the server-summed current Claim amount.',
    'Approved Change Order to revised Contract value integration remains Pass 351/Stage-27-gated.',
    'Client Invoice issue, retention release and Client-Invoice-to-AR posting remain later reviewed work.'
  ],
  nextPass: passed
    ? 'Pass 351 - Module 16 Client Invoice generation, Retention Ledger/release and controlled approved-Change integration while keeping Stage-26 AR posting deferred.'
    : 'Repair the failed Pass-350 service check before generating Invoice/Retention integration.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
