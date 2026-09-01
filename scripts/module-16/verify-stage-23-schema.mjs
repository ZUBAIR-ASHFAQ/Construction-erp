import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-schema.json');

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
  ['module-16-persistence', 'npm', ['run', 'module-16:persistence:gate']],
  ['module-16-schema-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-schema-typescript-syntax',
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
      'apps/api/src/modules/client-billing/client-billing.schema.ts'
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_SCHEMA_READY_FOR_PASS_349'
      : 'STAGE_23_MODULE_16_SCHEMA_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 348,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  schemaFile: 'apps/api/src/modules/client-billing/client-billing.schema.ts',
  reviewedRouteCount: 7,
  reviewedPermissions: [
    'client_billing.read',
    'client_contracts.manage',
    'client_claims.create',
    'client_claims.certify',
    'client_invoices.issue',
    'client_retention.release'
  ],
  reviewedErrors: [
    'CLIENT_CONTRACT_NOT_FOUND',
    'CLAIM_INVALID_CUMULATIVE_VALUE',
    'CLAIM_NOT_CERTIFIED',
    'CLIENT_INVOICE_ALREADY_CREATED',
    'RETENTION_RELEASE_NOT_ALLOWED'
  ],
  reviewedEvents: [
    'client_contract.created',
    'progress_claim.submitted',
    'progress_claim.certified',
    'client_invoice.issued',
    'client_retention.released'
  ],
  boundedPaginationOnly: true,
  maxPageSize: 100,
  listFiltersInvented: false,
  aggregateContractReadbackUsed: true,
  separateDetailRoutesInvented: false,
  createContractBrowserFields: [
    'projectId',
    'clientId',
    'contractValue',
    'billingMethod',
    'retentionPercent',
    'currency'
  ],
  contractNumberBrowserOwned: false,
  revisedContractValueBrowserOwned: false,
  createClaimBrowserFields: ['periodEnd'],
  claimNumberBrowserOwned: false,
  claimHeaderTotalsBrowserOwned: false,
  claimLinePutSemantics: 'complete-replacement',
  claimLineBrowserFields: [
    'boqItemId',
    'description',
    'contractQty',
    'cumulativeQty',
    'currentQty',
    'rate',
    'currentValue'
  ],
  claimLineIdsBrowserOwned: false,
  certifyBrowserFields: ['certifiedValue'],
  retentionAndDeductionTotalsBrowserOwned: false,
  invoiceBrowserFields: ['invoiceDate', 'dueDate'],
  invoiceNumberBrowserOwned: false,
  invoiceTaxAndTotalsBrowserOwned: false,
  retentionReleaseBodyless: true,
  partialRetentionReleaseFieldInvented: false,
  retentionReleaseAmountBrowserOwned: false,
  exactDecimalStringsUsed: true,
  billingMethodEnumInvented: false,
  lifecycleStatusEnumsInvented: false,
  retentionVocabulariesInvented: false,
  claimSubmitRouteInvented: false,
  claimSubmittedEventTimingStillUnresolved: true,
  standaloneInvoiceCreateInvented: false,
  paymentApiInvented: false,
  financeArAdapterGeneratedEarly: false,
  extraRoutesInvented: false,
  extraPermissionsInvented: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage22LiveAccepted,
  remainingSourceAmbiguities: [
    'Contract, Claim and Invoice number scope/format remain server-side numbering concerns because the source does not define them.',
    'billing_method and all lifecycle/status vocabularies remain string-backed.',
    'The source defines no named Contract-list filters, so only bounded pagination is accepted.',
    'No Contract, Claim or Invoice detail GET exists, so the reviewed Contract register carries nested Claim/Invoice/Retention readback.',
    'progress_claim.submitted exists without a submit route; Pass 348 does not invent one or freeze event timing.',
    'Exact valuation rules across BOQ, milestone and manual billing remain service-policy concerns.',
    'Retention/deduction calculation inputs remain server-owned and the source does not define their complete policy.',
    'Invoice tax calculation and due-date derivation remain service-policy gaps; the request accepts only reviewed business dates and no tax amount.',
    'The retention release command stays bodyless because no partial amount/date payload is source-defined.',
    'Approved Change Order to revised Contract value adapter semantics remain for the later reviewed integration pass.',
    'Full Client Invoice to AR posting remains Stage-26 Module 15B and Stage-27 integration proof.'
  ],
  nextPass: passed
    ? 'Pass 349 - Module 16 Company/Project-scoped Client Billing repository primitives using only the Pass-348 schemas and Pass-347 persistence.'
    : 'Repair the failed Pass-348 schema check before generating the Module-16 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
