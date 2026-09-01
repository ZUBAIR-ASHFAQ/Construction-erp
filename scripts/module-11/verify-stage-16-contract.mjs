import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-contract.json');

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
  ['module-5-static-prerequisite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-prerequisite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-static-prerequisite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-static-prerequisite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-22-static-prerequisite', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-static-scope-prerequisite', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-11-contract-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
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
  ? (stage15LiveAccepted
      ? 'STAGE_16_MODULE_11_CONTRACT_FROZEN_READY_FOR_PASS_257'
      : 'STAGE_16_MODULE_11_CONTRACT_FROZEN_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 256,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  contractOnly: true,
  stage15LiveAccepted,
  ownedTables: [
    'subcontractors',
    'subcontracts',
    'subcontract_items',
    'subcontract_payment_applications',
    'subcontract_payment_lines',
  ],
  reviewedRouteCount: 8,
  reviewedRoutes: [
    'GET /api/v1/subcontractors',
    'POST /api/v1/subcontractors',
    'POST /api/v1/subcontracts',
    'PATCH /api/v1/subcontracts/:id',
    'POST /api/v1/subcontracts/:id/execute',
    'POST /api/v1/subcontracts/:id/payment-applications',
    'POST /api/v1/subcontracts/:id/payment-applications/:appId/certify',
    'POST /api/v1/subcontracts/:id/close',
  ],
  reviewedPermissions: [
    'subcontractors.read',
    'subcontractors.manage',
    'subcontracts.read',
    'subcontracts.create',
    'subcontracts.execute',
    'subcontracts.certify',
    'subcontracts.close',
  ],
  reviewedErrors: [
    'SUBCONTRACT_NOT_FOUND',
    'SUBCONTRACT_NOT_APPROVED',
    'PAYMENT_APPLICATION_INVALID',
    'CERTIFIED_VALUE_EXCEEDS_CONTRACT',
    'SUBCONTRACT_NOT_READY_TO_CLOSE',
  ],
  reviewedEvents: [
    'subcontract.executed',
    'subcontract.revised',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'subcontract.closed',
  ],
  hardPrerequisites: [
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
    '8 - Procurement & RFQ supplier/vendor master',
    '22 - Approval Workflows',
  ],
  optionalPrerequisite: '4 - BOQ Management when BOQ linkage is used',
  projectScopeOwner: '24B - Project Scope Activation',
  vendorMasterOwner: '8 - Procurement & RFQ',
  subcontractorMasterOwner: '11 - Subcontractor Management',
  vendorLinkConvention: 'nullable subcontractors.vendor_id -> vendors.id, same Company',
  commitmentOwner: '7 - Budgeting & Job Costing',
  approvalOwner: '22 - Approval Workflows',
  financeAdapterOwner: '15B - Finance Source Adapters',
  formalVariationOwner: '17 - Change Orders / Variations with Stage-27 integration completion',
  executionCreatesCommitmentAtomically: true,
  commitmentIdempotencyRequired: true,
  certificationSnapshotImmutable: true,
  certificationCorrectionByReversalRecertification: true,
  cumulativeCertificationBoundedByApprovedValue: true,
  certificationOverrideDefaultFailClosed: true,
  retentionServerOwned: true,
  apAdapterDeferredToStage26: true,
  genericApprovalRoutesInvented: false,
  duplicateVendorMasterInvented: false,
  subcontractReadbackApiGapRecorded: true,
  paymentApplicationReadbackApiGapRecorded: true,
  revisionApiGapRecorded: true,
  retentionReleaseGapRecorded: true,
  draftEditPermissionGapRecorded: true,
  closeoutProofGapRecorded: true,
  unresolvedSourceAmbiguities: [
    'Part I requires an optional Vendor link but Appendix A omits the relationship column; Stage 16 freezes nullable vendor_id as the minimal explicit implementation convention.',
    'The workflow requires submit/approval while the eight-route Module-11 API has no submit/approve/reject/return command.',
    'The reviewed API has no subcontract list/detail GET despite required detail, commitment, application and retention UI.',
    'The reviewed API has no payment-application read/update operation despite required application/certification UI.',
    'subcontract.revised and approved variation/revision behavior are defined, but no revision route/table/permission is defined.',
    'Module 17 owns later formal Change Orders; exact subcontract variation linkage remains deferred.',
    'Retention is server-calculated, but exact formula, cap, rounding, release trigger and retention-release command are not defined.',
    'Certification mentions deductions but no deduction field/table/route exists.',
    'Subcontract/application numbering requires a concurrency-safe scope, but the exact scope is not stated.',
    'Subcontractor/compliance/subcontract/application status token vocabularies are not enumerated.',
    'PATCH draft edit exists while the permission list contains no explicit subcontracts.edit permission.',
    'Certified cumulative value may exceed the contract only when authorized, but no override permission/configuration is defined; the default is fail closed.',
    'The exact Module-7 commitment source_type, source-line identity and status tokens are not defined.',
    'Certified payable flows to AP in Appendix A, but Part I defers the actual source adapter to Module 15B / Stage 26.',
    'Closeout requires final-account/retention conditions, but exact persistence/readback fields for proving them are not defined.',
    'contact_json has no exact object schema.',
    'The source does not define amount formula/rounding or whether manual amount overrides are allowed.',
    'No currency conversion/FX contract is defined.',
  ],
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  productionRuntimeActivationAllowed: passed && stage15LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 257 - Module 11 reviewed Prisma models, constraints, indexes and Stage-16 migration. Deployment remains blocked until the Stage-15 live handoff is genuine; vendor/approval/readback/revision/retention/AP gaps must remain explicit.'
    : 'Repair the failed Pass-256 contract check before preparing Module-11 persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
