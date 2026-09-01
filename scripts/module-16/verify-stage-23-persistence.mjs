import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-persistence.json');

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
  ['module-16-contract', 'npm', ['run', 'module-16:contract:gate']],
  ['module-16-persistence-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  ['migration-system-suite', 'node', ['--test', 'tests/migration-system.test.mjs']],
  ['database-schema-suite', 'node', ['--test', 'tests/database.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
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
      ? 'STAGE_23_MODULE_16_PERSISTENCE_PREPARED_SCHEMA_PENDING'
      : 'STAGE_23_MODULE_16_PERSISTENCE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 347,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  migration: '20260826000300_module_16_client_billing_core',
  ownedTables: [
    'client_contracts',
    'progress_claims',
    'progress_claim_lines',
    'client_invoices',
    'retention_ledger',
  ],
  projectCompanyForeignKeysEnforced: true,
  clientCompanyForeignKeyEnforced: true,
  optionalBoqProjectScopeEnforced: true,
  contractAmountPrecision: 'DECIMAL(18,2)',
  retentionPercentPrecision: 'DECIMAL(7,4)',
  claimAmountPrecision: 'DECIMAL(18,2)',
  claimQuantityPrecision: 'DECIMAL(18,4)',
  invoiceAmountPrecision: 'DECIMAL(18,2)',
  retentionAmountPrecision: 'DECIMAL(18,2)',
  numberUniquenessScopeInvented: false,
  statusEnumsInvented: false,
  billingMethodEnumInvented: false,
  oneInvoicePerClaimEnforced: true,
  invoiceClaimContractScopeEnforced: true,
  invoiceIdentityAndFinancialValuesImmutableAtDatabase: true,
  invoicedClaimHistoryImmutableAtDatabase: true,
  certifiedClaimLifecycleImmutabilityDeferredToService: true,
  retentionReleaseCannotExceedAmountAtDatabase: true,
  retentionReleasedAmountCannotMoveBackward: true,
  approvedChangeAdapterGeneratedEarly: false,
  financeArAdapterGeneratedEarly: false,
  paymentPersistenceInvented: false,
  apiSchemaGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  publicRoutesGenerated: false,
  reactGenerated: false,
  productionRuntimeActivationAllowed: false,
  unresolvedSourceAmbiguities: [
    'Contract, Claim and Invoice number scope/format remain undefined; persistence adds lookup indexes but no invented number uniqueness scope.',
    'billing_method and lifecycle status vocabularies remain undefined and string-backed.',
    'Certified-Claim immutability before Invoice creation remains a service lifecycle rule because the source does not define the certified status token.',
    'Cumulative value regression checks depend on prior certified business state and remain for the repository/service transaction passes.',
    'PUT Claim-line replace-versus-merge semantics remain for the strict API schema pass.',
    'Approved Change Order revised-value application/source keys remain deferred to the reviewed integration pass.',
    'Tax, due-date, deduction and valuation policies remain undefined.',
    'Retention source/direction/status tokens and partial/full release semantics remain undefined.',
    'Payment persistence remains outside Module 16 because no payment table or command is defined.',
    'Client Invoice to AR posting remains Stage-26 Module 15B work.',
  ],
  nextPass: passed
    ? 'Pass 348 - Module 16 strict Zod/API schema boundary for the seven reviewed Client Billing operations.'
    : 'Repair the failed Pass-347 persistence check before continuing Stage 23.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
