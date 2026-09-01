import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-repository.json');

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
  ['module-4b-schema', 'npm', ['run', 'module-4b:schema:gate']],
  ['module-4b-repository-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-4b-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.repository.ts']],
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
      ? 'STAGE_10_MODULE_4B_REPOSITORY_READY_FOR_PASS_194'
      : 'STAGE_10_MODULE_4B_REPOSITORY_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 193,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  stage9LiveAccepted,
  repositoryFile: 'apps/api/src/modules/boq/boq.repository.ts',
  repositoryBoundary: {
    companyOwnershipFromTrustedRequestContext: true,
    tenderOnlyAndProjectLinkedVisibilityPrepared: true,
    sameCompanyTenderAndProjectCreateValidation: true,
    sameProjectWbsValidationBeforeItemReplacement: true,
    sameCompanyCostCodeValidationBeforeItemReplacement: true,
    mappingIdsPersistedByExistingReplaceAllCommand: true,
    exactProjectAuthorizationDeferredToServiceResourcePolicy: true,
    transactionClientSupported: true
  },
  intentionallyAbsent: [
    'New BOQ mapping routes.',
    'Cost Type relationship on BOQ items.',
    'Dedicated command for attaching a Project to an existing tender-only BOQ.',
    'Service/resource-policy activation, which belongs to Pass 194.'
  ],
  serviceRelationshipLogicGenerated: false,
  routesChanged: false,
  reactRelationshipUiGenerated: false,
  runtimeDeploymentAllowed: passed && stage9LiveAccepted,
  nextPass: passed
    ? 'Pass 194 - Module 4B service/resource-policy activation for Project-scoped BOQ reads, writes and item mapping validation.'
    : 'Repair the failed Pass-193 repository check before generating Module-4B service/resource-policy logic.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
