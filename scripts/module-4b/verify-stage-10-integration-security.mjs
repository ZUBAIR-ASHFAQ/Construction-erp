import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-4b-evidence',
  mode === 'live' ? 'stage-10-integration-security-live.json' : 'stage-10-integration-security.json'
);

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked live record before any destructive PostgreSQL command can run. */
async function writeBlockedEvidence(reason, stage9LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-10-module-4b-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 196,
    stage: 10,
    module: '4B - BOQ Project Mapping',
    businessModule: '4 - BOQ Management',
    mode,
    status: 'BLOCKED',
    stage9LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-4b:integration-security:gate:live before claiming Stage-10 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4B Stage-10 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4B integration/security gate mode must be static or live.');
}

const stage9 = await readJson('module-6-evidence/stage-9-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage9LiveAccepted) {
  await writeBlockedEvidence('STAGE_9_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-4b-evidence/stage-10-http.json');
  const httpPrepared = httpEvidence?.pass === 195
    && [
      'STAGE_10_MODULE_4B_HTTP_READY_FOR_PASS_196',
      'STAGE_10_MODULE_4B_HTTP_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-4b-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: httpPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-4b-http-regression', 'npm', ['run', 'module-4b:http:gate']],
    ['module-4b-integration-security-contract', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-4a-static-regression', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4b-integration-test-syntax', 'node', ['--check', 'tests/integration/module-4b-api.integration.test.mjs']],
    ['module-4a-integration-regression-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
    ['boq-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.repository.ts']],
    ['boq-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.service.ts']],
    ['boq-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.routes.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['module-4b-postgresql-fastify-security', 'npm', ['run', 'test:integration:module-4b']],
      ['module-4a-postgresql-regression', 'npm', ['run', 'test:integration:module-4a']]
    );
  }

  if (httpPrepared) {
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args);
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = httpPrepared
    && results.length === steps.length + 1
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_10_MODULE_4B_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_197'
        : (stage9LiveAccepted
            ? 'STAGE_10_MODULE_4B_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_10_MODULE_4B_INTEGRATION_SECURITY_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-10-module-4b-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 196,
    stage: 10,
    module: '4B - BOQ Project Mapping',
    businessModule: '4 - BOQ Management',
    mode,
    status,
    stage9LiveAccepted,
    integrationFile: 'tests/integration/module-4b-api.integration.test.mjs',
    coverage: [
      'tender-only, Project-only and combined BOQ creation',
      'WBS and Cost Code mapping persistence and public readback',
      'Project-scoped BOQ register visibility',
      'Project membership without boq permission is rejected',
      'cross-Project and cross-Company BOQ access is rejected',
      'cross-Project WBS and foreign-Company Cost Code mappings are rejected atomically',
      'database foreign keys and BOQ-item mapping trigger reject direct scope attacks',
      'Stage-10 OpenAPI still exposes exactly the six reviewed Module-4 routes',
      'Stage-6 Module-4A PostgreSQL workflow remains a live regression dependency'
    ],
    intentionallyAbsent: [
      'No new BOQ mapping route.',
      'No Cost Type relationship on BOQ items.',
      'No dedicated command for attaching a Project to an existing tender-only BOQ.',
      'No React mapping workflow; that remains Pass 197.'
    ],
    runtimeVerificationComplete: passed && mode === 'live' && stage9LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage9LiveAccepted,
    nextPass: passed
      ? 'Pass 197 - Module 4B React Project/WBS/Cost Code mapping activation on the existing BOQ feature.'
      : 'Repair the failed Pass-196 integration/security check before generating the Stage-10 React mapping workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4B Stage-10 integration/security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
