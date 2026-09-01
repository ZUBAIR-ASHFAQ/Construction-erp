import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-service.json');

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
  ['module-9-repository', 'npm', ['run', 'module-9:repository:gate']],
  ['module-9-service-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  [
    'module-9-service-typescript-syntax',
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
      'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts',
      'apps/api/src/modules/purchase-orders/purchase-orders.service.ts'
    ]
  ],
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
  ? (stage13LiveAccepted
      ? 'STAGE_14_MODULE_9_SERVICE_READY_FOR_PASS_239'
      : 'STAGE_14_MODULE_9_SERVICE_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 238,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  stage13LiveAccepted,
  serviceFile: 'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
  repositoryExtendedOnlyForServiceNeeds: ['updatePurchaseOrderCommercialHeader'],
  projectResourcePolicyRevalidated: true,
  purchaseOrderSequenceKey: 'purchase-order',
  lifecycleTokensInternalOnly: true,
  publicLifecycleEnumsAdded: false,
  normalCreatePathQuotationBackedOnly: true,
  directPurchasePathStillBlocked: true,
  directPurchasePermissionInvented: false,
  selectedQuotationProof: 'Module-8 quotation SELECTED + RFQ SELECTED + same Vendor/Project/Company repository chain',
  vendorEligibilityInternalTokens: ['ACTIVE', 'QUALIFIED'],
  selectedQuotationTotalMustMatchDraftPoTotal: true,
  quotationCurrencyComparisonAvailable: false,
  approvedCurrencyProtectedByImmutableSubmittedSnapshot: true,
  purchaseOrderApprovalUsesModule22: true,
  purchaseOrderApprovalConfigurationRequired: true,
  freshRevisionApprovalWorkflowInvented: false,
  revisionAuthorizationConvention: 'purchase_orders.revise authorizes the controlled revision because the source defines no separate revision-approval command',
  revisionApprovedAtUsesAuthorizedCommandTime: true,
  cancelPermissionInvented: false,
  cancelPermissionMapping: 'purchase_orders.revise',
  cancellationReasonStoredInAuditOutboxOnly: true,
  taxCalculationInferenceExplicit: true,
  taxRateMeaning: 'percentage',
  taxArithmetic: 'quantity(4dp) * unitRate(4dp) and taxRate(4dp percentage), half-up to 2dp per line using exact bigint arithmetic',
  lineTotalIncludesTax: true,
  budgetBoundaryReadOnly: true,
  budgetGate: 'requires a current FROZEN Module-7 budget; no amount threshold/tolerance invented',
  commitmentSourceTypeInternal: 'purchase_order',
  commitmentSourceLineKey: 'purchase_order_items.id',
  commitmentStatusTokensInternal: ['ACTIVE', 'CANCELLED'],
  commitmentAmountConvention: 'server-calculated line_total including tax',
  issueCommitmentsAtomicWithPoIssue: true,
  revisionCommitmentsAtomicWithRevision: true,
  cancelCommitmentsAtomicWithCancellation: true,
  consumedLineReplacementPolicy: 'line replacement is blocked once received_qty or invoiced_amount is non-zero because Stage 14 has no stable browser line identity for consumed revisions',
  issuedCurrencyRevisionBlockedUntilApprovedFxContract: true,
  financeWritesGenerated: false,
  inventoryReceiptWritesGenerated: false,
  reviewedOutboxEventsPrepared: [
    'purchase_order.created',
    'purchase_order.submitted',
    'purchase_order.issued',
    'purchase_order.revised',
    'purchase_order.cancelled'
  ],
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage13LiveAccepted,
  nextPass: passed
    ? 'Pass 239 - Module 9 Fastify routes, module registration and OpenAPI metadata for exactly the eight reviewed Purchase Order operations.'
    : 'Repair the failed Pass-238 service check before generating the Module-9 HTTP layer.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
