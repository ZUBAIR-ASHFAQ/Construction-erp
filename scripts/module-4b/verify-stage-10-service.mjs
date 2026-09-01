import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-service.json');

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
  ['module-4b-repository', 'npm', ['run', 'module-4b:repository:gate']],
  ['module-4b-service-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-4a-regression', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['module-4b-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.service.ts']],
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
      ? 'STAGE_10_MODULE_4B_SERVICE_READY_FOR_PASS_195'
      : 'STAGE_10_MODULE_4B_SERVICE_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 194,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  stage9LiveAccepted,
  serviceFile: 'apps/api/src/modules/boq/boq.service.ts',
  serviceBoundary: {
    tenderOnlyBoqsRemainCompanyScoped: true,
    projectLinkedBoqsUseExactModule24bPermission: true,
    registerFiltersProjectLinkedRowsByAuthorizedProjectIds: true,
    projectOnlyBoqCreationSupported: true,
    sameCompanyTenderAndProjectValidated: true,
    wbsAndCostCodeMappingsPreservedByService: true,
    invalidMappingScopeUsesBoqScopeConflict: true,
    projectAndMappingIdsIncludedInAuditSnapshots: true,
    reviewedEventNamesUnchanged: true
  },
  intentionallyAbsent: [
    'New BOQ mapping routes.',
    'Cost Type relationship on BOQ items.',
    'Dedicated command for attaching a Project to an existing tender-only BOQ.',
    'HTTP/OpenAPI relationship activation, which belongs to Pass 195.'
  ],
  routesChanged: false,
  openApiChanged: false,
  reactRelationshipUiGenerated: false,
  runtimeDeploymentAllowed: passed && stage9LiveAccepted,
  nextPass: passed
    ? 'Pass 195 - Module 4B HTTP/OpenAPI relationship activation on the existing six BOQ routes.'
    : 'Repair the failed Pass-194 service check before changing the Module-4 HTTP/OpenAPI boundary.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
