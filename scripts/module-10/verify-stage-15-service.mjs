import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-service.json');

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
  ['module-10-repository', 'npm', ['run', 'module-10:repository:gate']],
  ['module-10-service-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
  [
    'module-10-service-typescript-syntax',
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
      'apps/api/src/modules/inventory/inventory.service.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-9-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
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
  ? (stage14LiveAccepted
      ? 'STAGE_15_MODULE_10_SERVICE_READY_FOR_PASS_250'
      : 'STAGE_15_MODULE_10_SERVICE_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 249,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  stage14LiveAccepted,
  serviceFile: 'apps/api/src/modules/inventory/inventory.service.ts',
  reviewedServiceOperations: 8,
  companyAndProjectPolicyRevalidated: true,
  companyWideWarehouseRequiresCompanyAuthority: true,
  closedProjectWritesFailClosed: true,
  idempotentStockCommands: 5,
  receiptPoBalanceLedgerAtomic: true,
  receiptIssuedPoRequired: true,
  receiptOverageDefaultFailClosed: true,
  receiptUnitConversionDefaultFailClosed: true,
  receiptQualityConvention: 'quantity = acceptedQty + rejectedQty; acceptedQty alone enters stock and PO received_qty',
  receiptTolerancePolicyInvented: false,
  valuationPublicEnumInvented: false,
  valuationImplementationConvention: 'inventory_balances.average_cost weighted by accepted server-costed inflows',
  valuationMethodBranchingInvented: false,
  transferQuantityConserved: true,
  transferHeaderPersistenceInvented: false,
  negativeStockDefaultFailClosed: true,
  reservedStockProtectedFromIssueTransferAdjustment: true,
  issueJobCostAtomic: true,
  module7ActualAppendOnly: true,
  module7ActualUpdateDeleteGenerated: false,
  module7IssueSourceConvention: 'inventory_issue keyed by the created ISSUE stock transaction id',
  returnPermissionInvented: false,
  returnImplementationConvention: 'prior Project ISSUE reversal requiring both inventory.issue and inventory.adjust',
  returnOtherDirectionsFailClosed: true,
  returnJobCostReversalAppendOnly: true,
  adjustmentSignedDeltaOnly: true,
  stockCountPersistenceInvented: false,
  inventoryApprovalWorkflowInvented: false,
  reviewedOutboxEventCount: 5,
  auditWrittenWithBusinessTransactions: true,
  stockPeriodPolicyInvented: false,
  stockPeriodLockedEmittedByService: false,
  financeWriteGenerated: false,
  warehouseCrudGenerated: false,
  unitConversionPersistenceInvented: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage14LiveAccepted,
  nextPass: passed
    ? 'Pass 250 - Module 10 Fastify routes, authentication/RBAC, OpenAPI and module registration for exactly the eight reviewed Inventory operations; preserve service conventions and unresolved Warehouse/ledger/low-stock/stock-period gaps without adding APIs.'
    : 'Repair the failed Pass-249 service check before generating Module-10 HTTP routes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
