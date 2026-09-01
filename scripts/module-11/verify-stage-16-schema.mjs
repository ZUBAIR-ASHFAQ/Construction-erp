import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-schema.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-11-persistence', 'npm', ['run', 'module-11:persistence:gate']],
  ['module-11-schema-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
  [
    'module-11-schema-typescript-syntax',
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
      'apps/api/src/modules/subcontracts/subcontracts.schema.ts'
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
  ? (stage15LiveAccepted
      ? 'STAGE_16_MODULE_11_SCHEMA_READY_FOR_PASS_259'
      : 'STAGE_16_MODULE_11_SCHEMA_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 258,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  stage15LiveAccepted,
  schemaFile: 'apps/api/src/modules/subcontracts/subcontracts.schema.ts',
  reviewedRouteCount: 8,
  reviewedPermissionCount: 7,
  reviewedErrorCount: 5,
  reviewedEventCount: 5,
  maxPageSize: 100,
  listFiltersInvented: false,
  listQueryDecision: 'The reviewed subcontractor GET route documents no business filter vocabulary, so Pass 258 accepts bounded pagination only.',
  createSubcontractorBrowserFields: ['vendorId', 'code', 'legalName', 'taxNo', 'contactJson', 'complianceStatus'],
  subcontractorStatusAcceptedFromBrowser: false,
  vendorLinkAcceptedFromBrowser: true,
  contactJsonKeysInvented: false,
  createSubcontractBrowserFields: ['projectId', 'subcontractorId', 'startDate', 'endDate', 'retentionPercent', 'currency', 'items'],
  subcontractItemBrowserFields: ['boqItemId', 'description', 'quantity', 'unit', 'rate', 'amount', 'wbsNodeId', 'costCodeId', 'costTypeId'],
  subcontractNumberAcceptedFromBrowser: false,
  originalValueAcceptedFromBrowser: false,
  revisedValueAcceptedFromBrowser: false,
  itemAmountAcceptedFromBrowser: true,
  itemAmountFormulaInvented: false,
  draftProjectChangeAcceptedFromBrowser: false,
  draftEditPermissionInvented: false,
  executeBodyless: true,
  closeBodyless: true,
  paymentApplicationBrowserFields: ['periodFrom', 'periodTo', 'lines'],
  paymentApplicationLineBrowserFields: ['subcontractItemId', 'currentQty', 'currentValue'],
  applicationNumberAcceptedFromBrowser: false,
  previousQtyAcceptedFromBrowser: false,
  claimedAmountAcceptedFromBrowser: false,
  certificationBrowserFields: ['lines'],
  certificationLineBrowserFields: ['subcontractItemId', 'certifiedValue'],
  certifiedAmountAcceptedFromBrowser: false,
  retentionAmountAcceptedFromBrowser: false,
  deductionFieldInvented: false,
  certificationOverrideFieldInvented: false,
  retentionReleaseFieldInvented: false,
  approvalFieldsAcceptedFromBrowser: false,
  commitmentFieldsAcceptedFromBrowser: false,
  financeFieldsAcceptedFromBrowser: false,
  exactDecimalStringsUsed: true,
  quantityRateScale: 4,
  moneyScale: 2,
  retentionPercentScale: 4,
  statusEnumsInvented: false,
  extraReadRoutesInvented: false,
  commitmentSourceTokensExposedInResponse: false,
  financePostingStateExposedInResponse: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage15LiveAccepted,
  nextPass: passed
    ? 'Pass 259 - Module 11 Company/Project-scoped repository with Vendor/BOQ/cost-structure lookups, row locking, payment-application persistence and Module-7 commitment primitives.'
    : 'Repair the failed Pass-258 schema check before generating the Module-11 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
