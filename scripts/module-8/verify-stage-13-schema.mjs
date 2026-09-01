import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-schema.json');

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
  ['module-8-persistence', 'npm', ['run', 'module-8:persistence:gate']],
  ['module-8-schema-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  [
    'module-8-schema-typescript-syntax',
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
      'apps/api/src/modules/procurement/procurement.schema.ts'
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
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_SCHEMA_READY_FOR_PASS_226'
      : 'STAGE_13_MODULE_8_SCHEMA_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-procurement-rfq-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 225,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  stage12LiveAccepted,
  schemaFile: 'apps/api/src/modules/procurement/procurement.schema.ts',
  reviewedRouteCount: 8,
  publicVendorMasterRouteCount: 0,
  requisitionListFilters: ['projectId', 'page', 'pageSize'],
  requisitionListFilterDecision: 'projectId is the only business filter added because the reviewed route is not Project-scoped in its path while the workflow is Project-owned; it is a requested filter only and never an authorization source.',
  createRequisitionBrowserFields: ['projectId', 'requiredDate', 'purpose', 'items'],
  requisitionItemBrowserFields: [
    'itemId',
    'description',
    'quantity',
    'unit',
    'estimatedRate',
    'wbsNodeId',
    'costCodeId',
    'costTypeId'
  ],
  submitRequisitionBodyFields: [],
  createRfqBrowserFields: ['projectId', 'requisitionId', 'issueDate', 'dueDate', 'items'],
  issueRfqBrowserFields: ['vendorIds'],
  recordQuotationBrowserFields: ['vendorId', 'quoteNo', 'quoteDate', 'validUntil', 'leadTimeDays', 'items'],
  quotationItemBrowserFields: ['rfqItemId', 'quantity', 'unitRate', 'discount', 'tax'],
  quotationHeaderTotalsBrowserOwned: false,
  quotationLineTotalBrowserOwned: false,
  comparisonBusinessFilters: 0,
  comparisonRankingFieldsInvented: false,
  comparisonExchangeRateFieldsInvented: false,
  selectQuotationBrowserFields: ['quotationId', 'rationale'],
  selectionRationaleDecision: 'Use one optional rationale field for both general selection rationale and any policy-required non-lowest exception reason. The later service must require it only when the configured source-backed policy requires an exception.',
  selectionCreatesFinancialCommitment: false,
  rfqItemRelationshipGapRecorded: true,
  rfqItemRelationshipResolvedByPass362: true,
  rfqItemIdentityExposedThroughRfqResponse: true,
  directRfqItemsSupported: true,
  vendorMasterPublicApiGapRecorded: true,
  vendorMasterSchemasGenerated: false,
  statusEnumsInvented: false,
  vendorStatusEnumsInvented: false,
  exactDecimalStringsUsed: true,
  rfqDateOrderingRuleInvented: false,
  quotationValidityOrderingRuleInvented: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage12LiveAccepted,
  nextPass: passed
    ? 'Pass 226 - Module 8 Company/Project-scoped repository for requisitions, RFQs, invitations, quotations and comparison reads while preserving the vendor API and rfq_item_id source gaps.'
    : 'Repair the failed Pass-225 schema check before generating the Module-8 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
