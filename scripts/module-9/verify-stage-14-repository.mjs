import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-repository.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage13 = await readJson('module-8-evidence/stage-13-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-9-schema', 'npm', ['run', 'module-9:schema:gate']],
  ['module-9-repository-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  [
    'module-9-repository-typescript-syntax',
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
      'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts'
    ]
  ],
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
  ? (stage13LiveAccepted
      ? 'STAGE_14_MODULE_9_REPOSITORY_READY_FOR_PASS_238'
      : 'STAGE_14_MODULE_9_REPOSITORY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 237,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  stage13LiveAccepted,
  repositoryFile: 'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityRequiredForProjectScopedReads: true,
  transactionClientSupported: true,
  purchaseOrderPaginationBounded: true,
  registerSearchLimitedToPoNumber: true,
  projectWriteLockPrepared: true,
  purchaseOrderWriteLockPrepared: true,
  postingCombinationValidationPrepared: true,
  module8VendorReadPrepared: true,
  module8VendorWriteMethodsGenerated: false,
  module8QuotationReadPrepared: true,
  quotationSelectionDecisionMadeInRepository: false,
  purchaseOrderTotalsCalculatedInRepository: false,
  purchaseOrderLifecycleDecidedInRepository: false,
  revisionNumberPrimitivePrepared: true,
  revisionBusinessRulesAppliedInRepository: false,
  module7CommitmentReadPrimitivePrepared: true,
  module7CommitmentUpsertPrimitivePrepared: true,
  commitmentSourceTypeInvented: false,
  commitmentStatusVocabularyInvented: false,
  commitmentTransactionOrchestrationDeferredToService: true,
  directPurchasePermissionInvented: false,
  cancelPermissionInvented: false,
  cancellationReasonColumnInvented: false,
  financeWriteMethodsGenerated: false,
  inventoryReceiptWriteMethodsGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage13LiveAccepted,
  nextPass: passed
    ? 'Pass 238 - Module 9 service/business rules: Project resource policy, quotation-backed draft creation, server totals, Approval Workflow submission, approved issue, atomic Module-7 commitment updates, controlled revision/cancel, audit and outbox.'
    : 'Repair the failed Pass-237 repository check before generating the Module-9 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
