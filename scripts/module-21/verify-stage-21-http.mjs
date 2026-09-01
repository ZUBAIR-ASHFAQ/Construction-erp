import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-http.json');

/** Read one JSON evidence file and return null when the file is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage20 = await readJson('module-14b-evidence/stage-20-live.json');
const stage20LiveAccepted = stage20?.status === STAGE_20_ACCEPTED
  && stage20?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-21-service', 'npm', ['run', 'module-21:service:gate']],
  ['module-21-http-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  [
    'module-21-http-typescript-syntax',
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
      'apps/api/src/modules/scheduling/scheduling.schema.ts',
      'apps/api/src/modules/scheduling/scheduling.repository.ts',
      'apps/api/src/modules/scheduling/scheduling.service.ts',
      'apps/api/src/modules/scheduling/scheduling.routes.ts',
      'apps/api/src/modules/scheduling/index.ts'
    ]
  ],
  [
    'runtime-composition-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--noResolve',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/api/src/app.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-14b-regression', 'node', ['--test', 'tests/module-14b-static.test.mjs']],
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
  ? (stage20LiveAccepted
      ? 'STAGE_21_MODULE_21_HTTP_READY_FOR_PASS_328'
      : 'STAGE_21_MODULE_21_HTTP_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 327,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  routeFile: 'apps/api/src/modules/scheduling/scheduling.routes.ts',
  indexFile: 'apps/api/src/modules/scheduling/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  exactReviewedRouteCount: 8,
  routes: [
    'GET /api/v1/projects/:projectId/schedule',
    'POST /api/v1/projects/:projectId/schedule',
    'POST /api/v1/projects/:projectId/schedule/activities',
    'PATCH /api/v1/projects/:projectId/schedule/activities/:id',
    'PUT /api/v1/projects/:projectId/schedule/dependencies',
    'POST /api/v1/projects/:projectId/schedule/baseline',
    'POST /api/v1/projects/:projectId/schedule/progress',
    'GET /api/v1/projects/:projectId/schedule/lookahead'
  ],
  authenticationRequiredForAllRoutes: true,
  serviceProjectResourcePolicyRemainsAuthoritative: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  idempotentCommandRouteCount: 6,
  bodylessCommandCount: 1,
  emptyLookaheadQueryContractRetained: true,
  reviewedPermissionCount: 4,
  reviewedErrorCount: 5,
  reviewedEventCount: 4,
  onlyGuaranteedDependencyTypeExposed: 'FS',
  serverOwnedRequestAuthorityExposed: false,
  appRegistrationPrepared: true,
  openApiOperationsPrepared: true,
  genericCrudRoutesAdded: 0,
  baselineReopenRoutesAdded: 0,
  advancedCpmRoutesAdded: 0,
  externalSchedulerRoutesAdded: 0,
  changeOrderIntegrationRoutesAdded: 0,
  dailyReportIntegrationRoutesAdded: 0,
  newDatabaseMigrationAdded: false,
  integrationTestsGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage20LiveAccepted,
  nextPass: passed
    ? 'Pass 328 - Module 21 PostgreSQL/Fastify integration, generated OpenAPI, Company/Project isolation, RBAC, Schedule, Activity, dependency, baseline and progress security verification.'
    : 'Repair the failed Pass-327 HTTP/OpenAPI check before generating Module-21 integration/security verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
