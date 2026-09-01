import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-service.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-8-repository', 'npm', ['run', 'module-8:repository:gate']],
  ['module-8-service-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  [
    'module-8-service-typescript-syntax',
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
      'apps/api/src/modules/procurement/procurement.repository.ts',
      'apps/api/src/modules/procurement/procurement.service.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
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
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_SERVICE_READY_FOR_PASS_228'
      : 'STAGE_13_MODULE_8_SERVICE_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-procurement-rfq-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 227,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  stage12LiveAccepted,
  serviceFile: 'apps/api/src/modules/procurement/procurement.service.ts',
  repositoryExtendedOnlyForServiceNeeds: [
    'findCompanyBaseCurrency',
    'updateRfqVendorResponseStatus'
  ],
  projectResourcePolicyRevalidated: true,
  requisitionSequenceKey: 'procurement.pr',
  rfqSequenceKey: 'procurement.rfq',
  lifecycleTokensInternalOnly: true,
  publicLifecycleEnumsAdded: false,
  requisitionApprovalUsesModule22: true,
  requisitionApprovalOptionalServerConfig: true,
  budgetBoundaryReadOnly: true,
  budgetGate: 'requires one current FROZEN Module-7 budget before requisition submission/RFQ progression; no amount threshold or tolerance invented',
  module7CommitmentWritesGenerated: false,
  financeWritesGenerated: false,
  vendorEligibilityInternalTokens: ['ACTIVE', 'QUALIFIED'],
  quotationTotalsCalculatedServerSide: true,
  quotationArithmetic: 'quantity(4dp) * unitRate(4dp) -> half-up money(2dp); subtotal after discount; tax added; exact bigint arithmetic',
  comparisonCurrencyPolicy: 'vendor currency must be null/base currency or equal Company base currency; no FX conversion invented',
  comparisonQuantityPolicy: 'all compared quotations must share exact rfqItemId+quantity signatures; no unit-conversion engine invented',
  comparisonRankingFieldsAdded: false,
  nonLowestRationalePolicyConfigurable: true,
  selectionRationaleStoredInAuditOutboxOnly: true,
  selectionPersistenceColumnInvented: false,
  selectionCreatesFinancialCommitment: false,
  reviewedOutboxEventsPrepared: [
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected'
  ],
  vendorMasterWriteApiGenerated: false,
  rfqItemRelationshipResolvedByPass362: true,
  rfqItemScopeRevalidatedByService: true,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage12LiveAccepted,
  nextPass: passed
    ? 'Pass 228 - Module 8 Fastify routes, module registration and OpenAPI metadata for exactly the eight reviewed procurement operations.'
    : 'Repair the failed Pass-227 service check before generating the Module-8 HTTP layer.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
