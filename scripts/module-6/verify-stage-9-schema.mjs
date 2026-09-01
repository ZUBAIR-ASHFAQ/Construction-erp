import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-schema.json');

/** Read one JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const pass175 = await readJson('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;

const results = [];
const steps = [
  ['module-6-persistence', 'npm', ['run', 'module-6:persistence:gate']],
  ['module-6-schema-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-6-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts']],
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
  ? (module6LiveHandoffAccepted
      ? 'STAGE_9_SCHEMA_READY_FOR_PASS_179'
      : 'STAGE_9_SCHEMA_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-6-stage-9-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 178,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  module6LiveHandoffAccepted,
  schemaFile: 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts',
  reviewedRoutes: 7,
  serverOwnedRequestFields: [
    'companyId', 'actorUserId', 'permissions', 'projectScope', 'effectivePermissions',
    'createdBy', 'updatedBy', 'projectId', 'level'
  ],
  schemaDecisions: [
    'WBS level is response-only and server-derived from hierarchy.',
    'Status/category fields remain bounded strings because the source does not enumerate public values.',
    'GET WBS readback includes the current assignment set so replace-all mapping is safe.',
    'Freeze response does not invent durable freeze-state fields.'
  ],
  unresolvedSourceAmbiguities: [
    'Cost Type master has no reviewed list/create HTTP operation.',
    'Unused-code/node archive has no reviewed command.',
    'Frozen baseline reopen/revision and durable freeze-state contract are absent.',
    'Public status/category vocabularies remain unenumerated.'
  ],
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactRuntimeGenerated: false,
  runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted,
  nextPass: passed
    ? 'Pass 179 - Module 6 company/project-scoped repository. Reuse trusted Module-24B request scope and do not invent Cost Type/reopen APIs.'
    : 'Repair the failed Pass-178 schema check before generating the Module-6 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
