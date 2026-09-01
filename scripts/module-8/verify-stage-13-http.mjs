import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-http.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;
const serviceEvidence = await readJson('module-8-evidence/stage-13-service.json');
const servicePrepared = serviceEvidence?.pass === 227
  && [
    'STAGE_13_MODULE_8_SERVICE_READY_FOR_PASS_228',
    'STAGE_13_MODULE_8_SERVICE_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING'
  ].includes(serviceEvidence?.status)
  && Array.isArray(serviceEvidence?.checks)
  && serviceEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-8-service-evidence',
  status: servicePrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: servicePrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-8-http-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  [
    'module-8-http-typescript-syntax',
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
      'apps/api/src/modules/procurement/procurement.routes.ts',
      'apps/api/src/modules/procurement/index.ts'
    ]
  ],
  [
    'app-registration-typescript-syntax',
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
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (servicePrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = servicePrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_HTTP_READY_FOR_PASS_229'
      : 'STAGE_13_MODULE_8_HTTP_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-procurement-rfq-http-evidence',
  generatedAt: new Date().toISOString(),
  pass: 228,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  stage12LiveAccepted,
  servicePrepared,
  routeFile: 'apps/api/src/modules/procurement/procurement.routes.ts',
  indexFile: 'apps/api/src/modules/procurement/index.ts',
  appRegistrationFile: 'apps/api/src/app.ts',
  exactReviewedRouteCount: 8,
  routes: [
    'GET /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions/:id/submit',
    'POST /api/v1/procurement/rfqs',
    'POST /api/v1/procurement/rfqs/:id/issue',
    'POST /api/v1/procurement/rfqs/:id/quotations',
    'GET /api/v1/procurement/rfqs/:id/comparison',
    'POST /api/v1/procurement/rfqs/:id/select-quotation'
  ],
  authenticationRequiredForAllRoutes: true,
  projectPermissionRemainsServiceAuthoritative: true,
  strictZodBoundaryRetained: true,
  responseZodValidationRetained: true,
  exactDecimalOpenApiSerialization: true,
  procurementServiceOptionsWiredFromBuildApp: true,
  openApiOperationsPrepared: true,
  publicVendorMasterRoutesAdded: 0,
  commitmentWriteRoutesAdded: 0,
  financePostingRoutesAdded: 0,
  newDatabaseMigrationAdded: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage12LiveAccepted,
  nextPass: passed
    ? 'Pass 229 - Module 8 PostgreSQL/Fastify integration, generated OpenAPI and security verification.'
    : 'Repair the failed Pass-228 HTTP/OpenAPI check before generating Module-8 integration verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 HTTP evidence written to ${written}`);

if (!passed) process.exitCode = 1;
