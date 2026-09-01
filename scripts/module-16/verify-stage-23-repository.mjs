import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-repository.json');

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
  ['module-16-schema', 'npm', ['run', 'module-16:schema:gate']],
  ['module-16-repository-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-repository-typescript-syntax',
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
      'apps/api/src/modules/client-billing/client-billing.repository.ts'
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
      ? 'STAGE_23_MODULE_16_REPOSITORY_READY_FOR_PASS_350'
      : 'STAGE_23_MODULE_16_REPOSITORY_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 349,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  repositoryFile: 'apps/api/src/modules/client-billing/client-billing.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityExplicit: true,
  transactionClientSupported: true,
  boundedPaginationOnly: true,
  contractAggregateListPrepared: true,
  projectScopeLookupPrepared: true,
  clientCompanyLookupPrepared: true,
  contractAggregateReadPrepared: true,
  contractWriteLockPrepared: true,
  contractCreatePrimitivePrepared: true,
  claimHistoryReadPreparedForCumulativeChecks: true,
  claimAggregateReadPrepared: true,
  claimWriteLockPrepared: true,
  claimCreatePrimitivePrepared: true,
  claimLineReadPreparedForServerTotals: true,
  projectBoqLookupPrepared: true,
  claimLineCompleteReplacePrepared: true,
  certificationTotalsUpdatePrepared: true,
  existingInvoiceByClaimLookupPrepared: true,
  immutableInvoiceCreatePrepared: true,
  retentionSourceLookupPrepared: true,
  retentionWriteLockPrepared: true,
  retentionCreatePrimitivePrepared: true,
  retentionReleaseUpdatePrepared: true,
  retentionContractOwnershipInvented: false,
  numberAuthorityInvented: false,
  lifecycleEnumsInvented: false,
  claimSubmitPrimitiveInvented: false,
  paymentPersistenceInvented: false,
  financeArAdapterGeneratedEarly: false,
  approvedChangeAdapterGeneratedEarly: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage22LiveAccepted,
  remainingSourceAmbiguities: [
    'Contract, Claim and Invoice number scope/format remain service-owned because the source does not define them.',
    'billing_method and Contract/Claim/Invoice/Retention lifecycle vocabularies remain string-backed.',
    'The source defines progress_claim.submitted without a submit route; the repository does not invent one.',
    'Cumulative certification policy and which historical statuses count as previously certified remain service concerns.',
    'Retention/deduction calculation policy remains service-owned; repository primitives persist only server-calculated values.',
    'Retention source_type/direction/status vocabulary and exact Contract-to-retention aggregation remain undefined, so no fake direct ownership relation is introduced.',
    'Invoice tax and due-date policy remain service concerns.',
    'Approved Change Order revised Contract integration remains for the reviewed later integration pass.',
    'Client Invoice to AR posting remains Stage-26 Module 15B and Stage-27 integration proof.'
  ],
  nextPass: passed
    ? 'Pass 350 - Module 16 Client Billing core service transactions for Contract creation, Claim valuation, cumulative checks, certification, audit/outbox and idempotency.'
    : 'Repair the failed Pass-349 repository check before generating the Module-16 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
