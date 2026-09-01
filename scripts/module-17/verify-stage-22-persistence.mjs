import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-persistence.json');

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
  ['module-17-contract', 'npm', ['run', 'module-17:contract:gate']],
  ['module-17-persistence-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
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
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_PERSISTENCE_PREPARED_SCHEMA_PENDING'
      : 'STAGE_22_MODULE_17_PERSISTENCE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 335,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  migration: '20260826000200_module_17_change_orders_core',
  ownedTables: [
    'change_requests',
    'change_request_lines',
    'change_orders',
    'change_order_impacts',
  ],
  projectCompanyForeignKeyEnforced: true,
  requesterCompanyForeignKeyEnforced: true,
  changeNumberUniquenessInvented: false,
  statusEnumsInvented: false,
  changeTypeEnumInvented: false,
  estimatedAmountsPrecision: 'DECIMAL(18,2)',
  approvedAmountsPrecision: 'DECIMAL(18,2)',
  approvedDaysPrecision: 'DECIMAL(10,2)',
  impactAmountPrecision: 'DECIMAL(18,2)',
  impactQuantityPrecision: 'DECIMAL(18,4)',
  optionalCostReferencesScoped: true,
  postingEnabledCostCombinationEnforcedWhenComplete: true,
  optionalBoqProjectScopeEnforced: true,
  oneFormalChangeOrderPerRequest: true,
  approvedChangeOrderSnapshotImmutableAtDatabase: true,
  genericImpactTargetForeignKeyInvented: false,
  impactIdentityAndValuesImmutableAtDatabase: true,
  appliedImpactImmutableAtDatabase: true,
  stage27TargetAdaptersGeneratedEarly: false,
  clientBillingGeneratedEarly: false,
  scheduleAdapterGeneratedEarly: false,
  apiSchemaGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  publicRoutesGenerated: false,
  reactGenerated: false,
  productionRuntimeActivationAllowed: false,
  unresolvedSourceAmbiguities: [
    'change_requests.change_no numbering authority and uniqueness scope remain undefined.',
    'change_type and lifecycle status vocabularies remain undefined.',
    'PUT draft-line replacement semantics remain undefined until the API schema/service pass.',
    'No Change Request or Change Order detail GET route is defined.',
    'Exact Module-22 terminal approval linkage remains undefined.',
    'changes.apply still has no standalone public apply route.',
    'approved_days business semantics and Schedule target mapping remain undefined.',
    'Impact target_type/status vocabularies and target adapter identities remain Stage-27 gated.',
    'Reversal/adjustment policy remains required at Stage 27 but no public reversal command is defined.',
  ],
  nextPass: passed
    ? 'Pass 336 - Module 17 strict Zod/API schema boundary for the seven reviewed Change Order operations.'
    : 'Repair the failed Pass-335 persistence check before continuing Stage 22.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
