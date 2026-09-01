import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-repository.json');

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
  ['module-10-schema', 'npm', ['run', 'module-10:schema:gate']],
  ['module-10-repository-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
  [
    'module-10-repository-typescript-syntax',
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
      'apps/api/src/modules/inventory/inventory.repository.ts'
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
      ? 'STAGE_15_MODULE_10_REPOSITORY_READY_FOR_PASS_249'
      : 'STAGE_15_MODULE_10_REPOSITORY_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 248,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  stage14LiveAccepted,
  repositoryFile: 'apps/api/src/modules/inventory/inventory.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityRequiredForWarehouseScopedReads: true,
  companyWideWarehouseVisibilityExplicit: true,
  transactionClientSupported: true,
  paginationBounded: true,
  businessListFiltersInvented: false,
  itemCreatePrimitivePrepared: true,
  itemUpdateDeleteMethodsGenerated: false,
  itemCodeUniquenessInvented: false,
  warehouseReadPrimitivePrepared: true,
  warehouseWriteMethodsGenerated: false,
  balanceReadPrimitivePrepared: true,
  balanceWriteLockPrepared: true,
  balanceServiceCalculatedUpdatePrimitivePrepared: true,
  valuationPolicyDecidedInRepository: false,
  negativeStockPolicyDecidedInRepository: false,
  purchaseOrderReceiptReadPrepared: true,
  purchaseOrderReceiptLockPrepared: true,
  purchaseOrderLineReceiptLocksPrepared: true,
  poReceivedQuantityUpdatePrimitivePrepared: true,
  goodsReceiptCreatePrimitivePrepared: true,
  receiptToleranceDecidedInRepository: false,
  receiptQualityEquationInvented: false,
  receiptValuationDecidedInRepository: false,
  receiptLifecycleDecidedInRepository: false,
  stockLedgerAppendOnlyRepository: true,
  stockMovementCreatePrimitivePrepared: true,
  stockSourceIdempotencyReadPrepared: true,
  stockTransactionTypeVocabularyInvented: false,
  stockSourceTokenVocabularyInvented: false,
  module6CostStructureReadPrepared: true,
  module7ActualReadPrimitivePrepared: true,
  module7ActualCreatePrimitivePrepared: true,
  actualSourceTypeInvented: false,
  actualCorrectionPolicyInvented: false,
  transferHeaderPersistenceInvented: false,
  stockCountPersistenceInvented: false,
  unitConversionPersistenceInvented: false,
  lowStockPersistenceInvented: false,
  financeWriteMethodsGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage14LiveAccepted,
  nextPass: passed
    ? 'Pass 249 - Module 10 Inventory service/business transactions: Project resource policy, fail-closed receipt/stock validation, transactionally synchronized PO receipt and balances, transfer/issue/return/adjustment workflows, Module-7 actual cost, audit and outbox without inventing unresolved valuation/UOM/return-permission policy.'
    : 'Repair the failed Pass-248 repository check before generating the Module-10 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
