import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-schema.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-17-persistence', 'npm', ['run', 'module-17:persistence:gate']],
  ['module-17-schema-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-schema-typescript-syntax',
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
      'apps/api/src/modules/change-orders/change-orders.schema.ts'
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
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_SCHEMA_READY_FOR_PASS_337'
      : 'STAGE_22_MODULE_17_SCHEMA_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 336,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  schemaFile: 'apps/api/src/modules/change-orders/change-orders.schema.ts',
  reviewedRouteCount: 7,
  reviewedPermissions: [
    'changes.read',
    'changes.create',
    'changes.estimate',
    'changes.submit',
    'changes.approve',
    'changes.apply'
  ],
  reviewedErrors: [
    'CHANGE_REQUEST_NOT_FOUND',
    'CHANGE_REQUEST_LOCKED',
    'CHANGE_APPROVAL_REQUIRED',
    'CHANGE_IMPACT_ALREADY_APPLIED',
    'CHANGE_TARGET_CLOSED'
  ],
  reviewedEvents: [
    'change_request.created',
    'change_request.submitted',
    'change_order.approved',
    'change_order.impact_applied',
    'change_request.rejected'
  ],
  listFiltersInvented: false,
  boundedPaginationOnly: true,
  maxPageSize: 100,
  createRequestBrowserFields: ['projectId', 'changeType', 'title', 'description', 'reason'],
  changeNumberBrowserOwned: false,
  requestStatusBrowserOwned: false,
  draftLinePutSemantics: 'complete-replacement',
  lineBrowserFields: [
    'wbsNodeId',
    'costCodeId',
    'costTypeId',
    'description',
    'costAmount',
    'revenueAmount',
    'boqItemId'
  ],
  lineIdsBrowserOwned: false,
  submitBodyless: true,
  approveBrowserFields: ['effectiveDate', 'approvedDays'],
  approvedTotalsBrowserOwned: false,
  rejectBodyless: true,
  rejectionReasonInvented: false,
  impactWriteBodyInvented: false,
  impactTargetsBrowserOwned: false,
  exactDecimalStringsUsed: true,
  approvedDaysWholeNumberRestrictionInvented: false,
  changeTypeEnumInvented: false,
  lifecycleStatusEnumsInvented: false,
  impactTargetEnumInvented: false,
  separateDetailRouteInvented: false,
  aggregateListReadbackUsed: true,
  extraRoutesInvented: false,
  extraPermissionsInvented: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage21LiveAccepted,
  remainingSourceAmbiguities: [
    'change_requests.change_no numbering authority and uniqueness scope remain undefined for the service pass.',
    'change_type and lifecycle status vocabularies remain undefined and string-backed.',
    'The source does not define named list filters, so Pass 336 accepts bounded pagination only.',
    'The source does not define a separate request/order detail GET, so the reviewed list readback carries request lines and optional formal order state.',
    'The source does not define a Module-17 rejection payload; rejection remains bodyless and Module-22 owns approval action evidence.',
    'Exact Module-22 terminal approval linkage and latest-revision representation remain service concerns.',
    'changes.apply still has no standalone public apply route.',
    'approved_days Schedule mapping and impact target/status vocabularies remain service/Stage-27 concerns.',
    'Reversal/adjustment policy remains required at Stage 27 but no public reversal command is defined.'
  ],
  nextPass: passed
    ? 'Pass 337 - Module 17 Company/Project-scoped repository primitives using only the Pass-336 schemas and Pass-335 persistence.'
    : 'Repair the failed Pass-336 schema check before generating the Module-17 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
