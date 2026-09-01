import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-schema.json');

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
  ['module-9-persistence', 'npm', ['run', 'module-9:persistence:gate']],
  ['module-9-schema-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  [
    'module-9-schema-typescript-syntax',
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
      'apps/api/src/modules/purchase-orders/purchase-orders.schema.ts'
    ]
  ],
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
      ? 'STAGE_14_MODULE_9_SCHEMA_READY_FOR_PASS_237'
      : 'STAGE_14_MODULE_9_SCHEMA_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 236,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  stage13LiveAccepted,
  schemaFile: 'apps/api/src/modules/purchase-orders/purchase-orders.schema.ts',
  reviewedRouteCount: 8,
  reviewedPermissionCount: 6,
  reviewedErrorCount: 5,
  reviewedEventCount: 5,
  listFilters: ['search', 'projectId', 'page', 'pageSize'],
  listFilterDecision: 'search is retained because the reviewed GET route explicitly says list/search POs; projectId is the narrow Project-owned filter and is never an authorization source.',
  createBrowserFields: [
    'projectId',
    'vendorId',
    'quotationId',
    'orderDate',
    'currency',
    'deliveryAddress',
    'terms',
    'items'
  ],
  itemBrowserFields: [
    'itemId',
    'description',
    'quantity',
    'unit',
    'unitRate',
    'taxRate',
    'wbsNodeId',
    'costCodeId',
    'costTypeId'
  ],
  quotationBackedCreateOnlyUntilDirectPurchaseContractResolved: true,
  nullableQuotationBypassAcceptedFromBrowser: false,
  directPurchasePermissionInvented: false,
  directPurchaseReasonFieldInvented: false,
  cancelPermissionInvented: false,
  cancelReasonAccepted: true,
  cancelReasonDecision: 'The reviewed cancel route explicitly says cancel remaining commitment with reason; the reason is command input and later audit/outbox evidence, not a new Purchase Order persistence column.',
  draftPatchCanReplaceReviewedBusinessFields: true,
  revisionCanChangeProjectVendorOrQuotationIdentity: false,
  revisionCommercialFields: ['orderDate', 'currency', 'deliveryAddress', 'terms', 'items'],
  revisionReasonRequired: true,
  submitBodyFields: [],
  issueBodyFields: [],
  serverOwnedTotalsAcceptedFromBrowser: false,
  serverOwnedConsumptionAcceptedFromBrowser: false,
  statusEnumInvented: false,
  taxPercentageRangeInvented: false,
  taxCalculationFormulaInvented: false,
  currencyMasterInvented: false,
  exactDecimalStringsUsed: true,
  inventoryItemForeignKeyAssumedBySchema: false,
  responseIncludesConsumptionProgress: true,
  responseIncludesRevisionHistory: true,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage13LiveAccepted,
  nextPass: passed
    ? 'Pass 237 - Module 9 Company/Project-scoped repository for Purchase Orders, items and controlled revisions, including Module-8 quotation/vendor reads and Module-7 commitment adapter primitives.'
    : 'Repair the failed Pass-236 schema check before generating the Module-9 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
