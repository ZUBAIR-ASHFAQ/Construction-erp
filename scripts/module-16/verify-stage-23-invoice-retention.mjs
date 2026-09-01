import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-invoice-retention.json');

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
  ['module-16-service', 'npm', ['run', 'module-16:service:gate']],
  ['module-16-invoice-retention-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-invoice-retention-typescript-syntax',
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
      'apps/api/src/modules/client-billing/client-billing.repository.ts',
      'apps/api/src/modules/client-billing/client-billing.service.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-2-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-4b-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-17-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_INVOICE_RETENTION_READY_FOR_PASS_352'
      : 'STAGE_23_MODULE_16_INVOICE_RETENTION_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-invoice-retention-evidence',
  generatedAt: new Date().toISOString(),
  pass: 351,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  serviceFile: 'apps/api/src/modules/client-billing/client-billing.service.ts',
  repositoryFile: 'apps/api/src/modules/client-billing/client-billing.repository.ts',
  invoiceIssueIdempotent: true,
  retentionReleaseIdempotent: true,
  invoiceRequiresCertifiedClaim: true,
  oneInvoicePerClaimProtected: true,
  invoiceNumberUsesFoundationSequence: 'client-invoice',
  invoiceGrossUsesCertifiedValue: true,
  invoiceRetentionUsesCertifiedClaimRetention: true,
  invoiceDeductionUsesCertifiedClaimDeduction: true,
  invoiceTaxPolicyInvented: false,
  invoiceTaxHeldAtZeroUntilSourcePolicyExists: true,
  invoiceTotalReceivableServerCalculated: true,
  invoiceDueDateCannotPrecedeInvoiceDate: true,
  clientInvoiceStableSourceKeyPrepared: true,
  financeArAdapterGeneratedEarly: false,
  retentionLedgerCreatedWithInvoice: true,
  retentionReleaseBodylessFullRelease: true,
  retentionReleaseCannotExceedHeldAmount: true,
  retentionReleaseSafeReplayReturnsCurrentState: true,
  retentionReadbackIncludedInContractRegister: true,
  privateLifecycleTokensOnly: true,
  approvedChangeAdapterImplemented: false,
  approvedChangeAdapterFailClosedUntilTargetMappingExists: true,
  approvedChangeTargetMappingInvented: false,
  stage27ChangeContractProofStillRequired: true,
  publicRoutesGenerated: false,
  reactGenerated: false,
  databaseMigrationGenerated: false,
  runtimeDeploymentAllowed: passed && stage22LiveAccepted,
  remainingSourceAmbiguities: [
    'Invoice number scope/format remains Foundation sequence configuration rather than a source-defined public numbering rule.',
    'The source does not define tax inputs or tax policy, so Pass 351 keeps tax_amount at zero instead of inventing a rate or tax engine.',
    'The bodyless retention release is implemented as full release of the remaining approved amount because no partial-release amount/date payload exists.',
    'Retention source_type, direction and lifecycle values remain implementation-private string tokens because the source does not enumerate public vocabularies.',
    'Approved Change Order to Client Contract revised_value integration cannot be applied safely yet because the source does not define the target Contract mapping/source-key structure; no Project-wide revenue amount is guessed onto every Contract.',
    'Full Client-Invoice-to-AR posting remains Stage-26 Module 15B and Stage-27 must prove Claim -> Invoice -> AR with approved variations and stable source identity.'
  ],
  nextPass: passed
    ? 'Pass 352 - Module 16 Fastify routes, module registration, authentication/RBAC, exact seven-route HTTP surface and OpenAPI verification.'
    : 'Repair the failed Pass-351 Invoice/Retention check before exposing Client Billing HTTP routes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 Invoice/Retention evidence written to ${written}`);

if (!passed) process.exitCode = 1;
