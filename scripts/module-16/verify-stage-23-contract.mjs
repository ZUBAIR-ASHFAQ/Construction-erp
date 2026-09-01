import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-contract.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-5-project-prerequisite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-2-client-prerequisite', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-15a-finance-core-prerequisite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-24b-project-scope-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-4b-optional-boq-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-17-configured-change-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  ['module-16-contract-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_CONTRACT_FROZEN_READY_FOR_PASS_347'
      : 'STAGE_23_MODULE_16_CONTRACT_FROZEN_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 346,
  stage: 23,
  module: '16 - Client Billing',
  status,
  contractOnly: true,
  stage22LiveAccepted,
  hardPrerequisites: [
    '5 - Project Management',
    '2 - CRM & Client Management',
    '15A - Finance Core',
  ],
  configuredPrerequisites: [
    '4B - BOQ Project Mapping when BOQ-backed claim lines are used',
    '17 - Change Orders / Variations when approved variation values are consumed',
  ],
  projectScopeReusesModule24B: true,
  clientMasterReusesModule2: true,
  financeCoreReusesModule15A: true,
  financeArAdapterDeferredToStage26: true,
  stage27ClaimInvoiceArProofRequired: true,
  ownedTables: [
    'client_contracts',
    'progress_claims',
    'progress_claim_lines',
    'client_invoices',
    'retention_ledger',
  ],
  reviewedRouteCount: 7,
  reviewedRoutes: [
    'GET /api/v1/client-billing/contracts',
    'POST /api/v1/client-billing/contracts',
    'POST /api/v1/client-billing/contracts/:id/claims',
    'PUT /api/v1/client-billing/claims/:id/lines',
    'POST /api/v1/client-billing/claims/:id/certify',
    'POST /api/v1/client-billing/claims/:id/invoice',
    'POST /api/v1/client-billing/retention/:id/release',
  ],
  reviewedPermissions: [
    'client_billing.read',
    'client_contracts.manage',
    'client_claims.create',
    'client_claims.certify',
    'client_invoices.issue',
    'client_retention.release',
  ],
  reviewedErrors: [
    'CLIENT_CONTRACT_NOT_FOUND',
    'CLAIM_INVALID_CUMULATIVE_VALUE',
    'CLAIM_NOT_CERTIFIED',
    'CLIENT_INVOICE_ALREADY_CREATED',
    'RETENTION_RELEASE_NOT_ALLOWED',
  ],
  reviewedEvents: [
    'client_contract.created',
    'progress_claim.submitted',
    'progress_claim.certified',
    'client_invoice.issued',
    'client_retention.released',
  ],
  decimalSafeAmountsRequired: true,
  certifiedClaimsImmutable: true,
  postedInvoicesImmutable: true,
  cumulativeClaimRegressionForbidden: true,
  concurrencySafeClaimNumberingRequired: true,
  concurrencySafeInvoiceNumberingRequired: true,
  retentionCalculatedByContractPolicy: true,
  approvedChangesUseControlledIntegration: true,
  arPostingIdempotentBySourceKey: true,
  extraRoutesInvented: false,
  extraPermissionsInvented: false,
  paymentApiInvented: false,
  claimSubmitRouteInvented: false,
  contractUpdateRouteInvented: false,
  finance15bGeneratedEarly: false,
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  contractNumberAuthorityGapRecorded: true,
  claimSubmitRouteGapRecorded: true,
  linePutSemanticsGapRecorded: true,
  arAdapterDeferralRecorded: true,
  paymentBoundaryGapRecorded: true,
  unresolvedSourceAmbiguities: [
    'Client Contract number authority, format and uniqueness scope are not defined.',
    'Claim number authority, format and uniqueness scope are not defined beyond concurrency safety.',
    'Invoice number authority, format and uniqueness scope are not defined beyond concurrency safety.',
    'billing_method vocabulary is not enumerated.',
    'Client Contract, Progress Claim, Client Invoice and retention status vocabularies are not enumerated.',
    'The workflow says Claims are submitted and defines progress_claim.submitted, but no submit route exists.',
    'Contract terms are described as maintained, but no Contract update route exists.',
    'PUT draft claim lines replace-all versus merge semantics are not explicitly defined.',
    'No Contract, Claim or Invoice detail GET route is defined.',
    'Contract list filters and response shape beyond validated pagination are not defined.',
    'Create Contract, create Claim, certify, invoice and retention-release command bodies are not fully enumerated.',
    'Exact claim valuation rules across billing methods are not fully defined.',
    'Retention and deduction calculation policy inputs are not fully defined.',
    'Tax calculation policy, tax-rate source and due-date derivation are not defined.',
    'BOQ quantity/rate versus milestone/manual billing behavior is not fully defined.',
    'Approved Change Order to revised Client Contract value adapter/source-key semantics are not fully defined.',
    'The database permits nullable Invoice claim_id, but no standalone Invoice-create API exists.',
    'Retention source_type, direction, status and partial/full release semantics are not enumerated.',
    'Payment tracking is required in workflow/UI, but Module 16 defines no payment table or payment command.',
    'Full AR posting belongs to Stage-26 Module 15B and is not complete at Stage 23.',
    'No Module-16 reversal/cancel/reopen API or correction workflow is defined.',
    'No Module-22 Approval Workflow hard dependency is defined for Client Billing certification.',
    'No dedicated Module-16 stable errors are defined for numbering collisions, invalid Client/BOQ scope, closed Project or deferred AR adapter state.',
  ],
  productionRuntimeActivationAllowed: passed && stage22LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 347 - Module 16 Client Billing Prisma models, constraints, indexes and Stage-23 migration. Deployment remains blocked until the Stage-22 live handoff is genuine.'
    : 'Repair the failed Pass-346 contract check before preparing Stage-23 Client Billing persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
