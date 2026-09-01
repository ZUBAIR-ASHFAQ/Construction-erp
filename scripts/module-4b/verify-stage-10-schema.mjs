import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-schema.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage9 = await readJson('module-6-evidence/stage-9-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;

const results = [];
const steps = [
  ['module-4b-persistence', 'npm', ['run', 'module-4b:persistence:gate']],
  ['module-4b-schema-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-4b-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.schema.ts']],
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
  ? (stage9LiveAccepted
      ? 'STAGE_10_MODULE_4B_SCHEMA_READY_FOR_PASS_193'
      : 'STAGE_10_MODULE_4B_SCHEMA_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 192,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  stage9LiveAccepted,
  schemaFile: 'apps/api/src/modules/boq/boq.schema.ts',
  createBoundary: {
    tenderIdOptional: true,
    projectIdOptional: true,
    atLeastOneRequired: true
  },
  itemMappingBoundary: {
    wbsNodeIdOptional: true,
    costCodeIdOptional: true,
    projectIdRejectedInsideItems: true,
    costTypeIdNotAdded: true
  },
  responseBoundary: {
    tenderIdNullable: true,
    projectIdPreparedAsNullableOptional: true,
    wbsNodeIdPreparedAsNullableOptional: true,
    costCodeIdPreparedAsNullableOptional: true,
    existingStage6SerializersRemainCompatible: true
  },
  routeCountChanged: false,
  newRoutesAdded: 0,
  repositoryRelationshipLogicGenerated: false,
  serviceRelationshipLogicGenerated: false,
  reactRelationshipUiGenerated: false,
  runtimeDeploymentAllowed: passed && stage9LiveAccepted,
  nextPass: passed
    ? 'Pass 193 - Module 4B company/project-aware repository relationship activation.'
    : 'Repair the failed Pass-192 schema check before generating Module-4B repository relationship logic.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
