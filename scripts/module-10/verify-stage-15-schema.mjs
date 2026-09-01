import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-schema.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-10-persistence', 'npm', ['run', 'module-10:persistence:gate']],
  ['module-10-schema-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
  [
    'module-10-schema-typescript-syntax',
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
      'apps/api/src/modules/inventory/inventory.schema.ts'
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
  ? (stage14LiveAccepted
      ? 'STAGE_15_MODULE_10_SCHEMA_READY_FOR_PASS_248'
      : 'STAGE_15_MODULE_10_SCHEMA_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 247,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  stage14LiveAccepted,
  schemaFile: 'apps/api/src/modules/inventory/inventory.schema.ts',
  reviewedRouteCount: 8,
  reviewedPermissionCount: 6,
  reviewedErrorCount: 6,
  reviewedEventCount: 5,
  maxPageSize: 100,
  listFiltersInvented: false,
  listQueryDecision: 'The source names Item and balance reads but supplies no business filter vocabulary, so Pass 247 accepts bounded pagination only.',
  createItemBrowserFields: ['itemCode', 'name', 'category', 'baseUnit', 'valuationMethod'],
  itemStatusAcceptedFromBrowser: false,
  valuationMethodEnumInvented: false,
  receiptBrowserFields: ['purchaseOrderId', 'warehouseId', 'items'],
  receiptLineBrowserFields: ['poItemId', 'itemId', 'quantity', 'acceptedQty', 'rejectedQty'],
  receiptNumberAcceptedFromBrowser: false,
  receiptTimestampAcceptedFromBrowser: false,
  receiptActorAcceptedFromBrowser: false,
  receiptStatusAcceptedFromBrowser: false,
  receiptUnitCostAcceptedFromBrowser: false,
  receiptAcceptedRejectedEquationInvented: false,
  receiptToleranceFieldInvented: false,
  transferBrowserFields: ['sourceWarehouseId', 'destinationWarehouseId', 'itemId', 'quantity'],
  transferHeaderInvented: false,
  transferDirectionEnumInvented: false,
  transferProjectOwnershipAcceptedFromBrowser: false,
  issueBrowserFields: ['warehouseId', 'projectId', 'itemId', 'quantity', 'wbsNodeId', 'costCodeId', 'costTypeId'],
  issueCostAcceptedFromBrowser: false,
  module7ActualSourceTokenExposed: false,
  returnBrowserFields: ['sourceTransactionId', 'quantity', 'reason'],
  returnReferenceConvention: 'existing stock transaction',
  returnDirectionEnumInvented: false,
  returnPermissionInvented: false,
  adjustmentBrowserFields: ['warehouseId', 'itemId', 'quantityDelta', 'reason'],
  adjustmentDirectionEnumInvented: false,
  stockCountSessionInvented: false,
  exactDecimalStringsUsed: true,
  decimalScale: 4,
  calculatedBalancesAcceptedFromBrowser: false,
  calculatedCostsAcceptedFromBrowser: false,
  poConsumptionAcceptedFromBrowser: false,
  stockSourceTokensExposedInResponse: false,
  unitConversionFactorAcceptedFromBrowser: false,
  unitConversionMasterInvented: false,
  stockPeriodFieldAcceptedFromBrowser: false,
  warehouseCrudInvented: false,
  stockLedgerReadRouteInvented: false,
  lowStockReadRouteInvented: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage14LiveAccepted,
  nextPass: passed
    ? 'Pass 248 - Module 10 Company/Project-scoped repository for Inventory items, balances, PO receipts and append-only stock movements, with transaction-client support for later atomic service workflows.'
    : 'Repair the failed Pass-247 schema check before generating the Module-10 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
