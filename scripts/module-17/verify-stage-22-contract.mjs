import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-contract.json');

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
  ['module-5-project-prerequisite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-cost-structure-prerequisite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-budget-prerequisite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-approval-prerequisite', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-4b-optional-boq-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-21-conditional-schedule-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  ['module-17-contract-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_CONTRACT_FROZEN_READY_FOR_PASS_335'
      : 'STAGE_22_MODULE_17_CONTRACT_FROZEN_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 334,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  contractOnly: true,
  stage21LiveAccepted,
  hardPrerequisites: [
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
    '22 - Approval Workflows',
  ],
  optionalPrerequisites: ['4B - BOQ Project Mapping when boq_item_id is used'],
  schedulePrerequisiteConditional: true,
  schedulePrerequisiteCondition: 'approved_days is present or Schedule impact is enabled',
  projectScopeReusesModule24B: true,
  supportingDocumentsReuseModule18: true,
  approvalWorkflowReusesModule22: true,
  ownedTables: [
    'change_requests',
    'change_request_lines',
    'change_orders',
    'change_order_impacts',
  ],
  reviewedRouteCount: 7,
  reviewedRoutes: [
    'GET /api/v1/change-orders',
    'POST /api/v1/change-orders/requests',
    'PUT /api/v1/change-orders/requests/:id/lines',
    'POST /api/v1/change-orders/requests/:id/submit',
    'POST /api/v1/change-orders/requests/:id/approve',
    'POST /api/v1/change-orders/requests/:id/reject',
    'GET /api/v1/change-orders/:id/impact',
  ],
  reviewedPermissions: [
    'changes.read',
    'changes.create',
    'changes.estimate',
    'changes.submit',
    'changes.approve',
    'changes.apply',
  ],
  reviewedErrors: [
    'CHANGE_REQUEST_NOT_FOUND',
    'CHANGE_REQUEST_LOCKED',
    'CHANGE_APPROVAL_REQUIRED',
    'CHANGE_IMPACT_ALREADY_APPLIED',
    'CHANGE_TARGET_CLOSED',
  ],
  reviewedEvents: [
    'change_request.created',
    'change_request.submitted',
    'change_order.approved',
    'change_order.impact_applied',
    'change_request.rejected',
  ],
  decimalSafeAmountsRequired: true,
  approvedVariationSnapshotImmutable: true,
  oneFormalChangeOrderPerRequest: true,
  impactApplicationIdempotent: true,
  impactApplicationAtomic: true,
  budgetImpactMandatory: true,
  stage27TargetAdapterProofRequired: true,
  module21BaselineMutationAllowed: false,
  extraRoutesInvented: false,
  extraPermissionsInvented: false,
  extraApplyRouteInvented: false,
  clientBillingGeneratedEarly: false,
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  changeNumberAuthorityGapRecorded: true,
  withdrawRouteGapRecorded: true,
  linePutSemanticsGapRecorded: true,
  detailGetRouteGapRecorded: true,
  latestRevisionRepresentationGapRecorded: true,
  unresolvedSourceAmbiguities: [
    'change_requests.change_no numbering authority and uniqueness scope are not defined.',
    'change_type vocabulary is not enumerated.',
    'Change Request status vocabulary is not enumerated.',
    'Change Order status vocabulary is not enumerated.',
    'change_order_impacts target_type vocabulary is not enumerated.',
    'change_order_impacts status vocabulary is not enumerated.',
    'PUT draft-line replace-all versus merge semantics are not explicitly defined.',
    'No Change Request or Change Order detail GET route is defined.',
    'List filters and the combined request/order list response shape are not defined.',
    'Create and approve/reject command bodies are not fully enumerated.',
    'The workflow mentions withdrawn changes but no withdraw route exists.',
    'Approval refers to the latest revision but no Change Request revision table or number exists.',
    'Exact linkage between Module-22 terminal approval and Module-17 approve/reject commands is not defined.',
    'changes.apply exists but there is no standalone apply route.',
    'Mandatory supporting-document rules are not defined.',
    'Exact approved-cost and approved-revenue derivation from estimate lines is not fully defined.',
    'approved_days and Schedule-impact target mapping are not defined.',
    'Impact target identity and idempotency-key structure are not defined.',
    'Stage-27 reversal/adjustment policy is required but no Module-17 reversal command is defined.',
    'Potential/unapproved Change forecast inclusion is optional and not defined.',
    'Locked Contract/Budget reopen policy belongs to owning modules and is not defined here.',
  ],
  productionRuntimeActivationAllowed: passed && stage21LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 335 - Module 17 Change Orders / Variations Prisma models, constraints, indexes and Stage-22 migration. Deployment remains blocked until the Stage-21 live handoff is genuine.'
    : 'Repair the failed Pass-334 contract check before preparing Stage-22 Change Order persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
