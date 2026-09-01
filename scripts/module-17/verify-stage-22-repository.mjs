import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-repository.json');

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
  ['module-17-schema', 'npm', ['run', 'module-17:schema:gate']],
  ['module-17-repository-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-repository-typescript-syntax',
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
      'apps/api/src/modules/change-orders/change-orders.repository.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-4b-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-21-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
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
      ? 'STAGE_22_MODULE_17_REPOSITORY_READY_FOR_PASS_338'
      : 'STAGE_22_MODULE_17_REPOSITORY_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 337,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  repositoryFile: 'apps/api/src/modules/change-orders/change-orders.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityExplicit: true,
  transactionClientSupported: true,
  boundedPaginationOnly: true,
  aggregateListReadPrepared: true,
  requestAggregateReadPrepared: true,
  requestWriteLockPrepared: true,
  createRequestPrimitivePrepared: true,
  requesterCompanyLookupPrepared: true,
  lineCompleteReplacePrimitivePrepared: true,
  lineReadPreparedForServerTotals: true,
  optionalWbsSameProjectLookupPrepared: true,
  optionalCostCodeCompanyLookupPrepared: true,
  optionalCostTypeCompanyLookupPrepared: true,
  postingCostStructureLookupPrepared: true,
  optionalProjectBoqLookupPrepared: true,
  narrowRequestStatusUpdatePrepared: true,
  existingFormalOrderLookupPrepared: true,
  immutableFormalOrderCreatePrepared: true,
  formalOrderImpactReadPrepared: true,
  serverOwnedImpactEvidenceCreatePrepared: true,
  impactMutationAfterInsertPrepared: false,
  changeRequestDeletePrimitiveGenerated: false,
  changeOrderUpdateOrDeletePrimitiveGenerated: false,
  extraListFiltersInvented: false,
  changeNumberAuthorityInvented: false,
  lifecycleEnumsInvented: false,
  budgetAdapterDuplicated: false,
  approvalStorageDuplicated: false,
  scheduleAdapterGeneratedEarly: false,
  clientBillingAdapterGeneratedEarly: false,
  stage27TargetAdaptersGeneratedEarly: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage21LiveAccepted,
  remainingSourceAmbiguities: [
    'change_requests.change_no numbering authority and uniqueness scope remain service-owned and undefined.',
    'Change Request and Change Order lifecycle vocabularies remain service-owned and string-backed.',
    'Module-22 terminal approval linkage and latest submitted-state proof remain service concerns.',
    'The source still defines no separate Change Request detail route or rejection payload.',
    'changes.apply still has no standalone public route; service orchestration must enforce it during approved impact application.',
    'Budget impact application belongs to the service transaction and must reuse Module 7 rather than duplicate its persistence.',
    'approved_days Schedule mapping and Client/Subcontract/Schedule target adapters remain Stage-27-gated.',
    'Reversal/adjustment policy remains required later but no public reversal command exists.'
  ],
  nextPass: passed
    ? 'Pass 338 - Module 17 core Change Orders service lifecycle and Module-22 approval transactions; mandatory Budget/Forecast impact remains Pass 339.'
    : 'Repair the failed Pass-337 repository check before generating the Module-17 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
