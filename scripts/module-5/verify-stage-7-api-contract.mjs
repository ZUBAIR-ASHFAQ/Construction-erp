import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-5-evidence',
  mode === 'live' ? 'stage-7-api-contract-live.json' : 'stage-7-api-contract.json'
);

/** Read genuine Module 4A live acceptance before any Stage-7 live API-contract verification is allowed. */
async function readStage6LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-4a-evidence/stage-6-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked API-contract evidence record without running live database-backed verification. */
async function writeBlockedEvidence(reason, stage6LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-api-contract-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '5 - Project Management',
    pass: 145,
    mode,
    stage6LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-5:api-contract:gate:live before Pass 146.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 API-contract evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 5 API-contract gate mode must be static or live.');
}

const stage6 = await readStage6LiveAcceptance();
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;

if (mode === 'live' && !stage6LiveAccepted) {
  await writeBlockedEvidence('STAGE_6_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-5-security', 'npm', ['run', 'module-5:security:gate']],
    ['module-5-api-contract-suite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-5-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/projects/projects.routes.ts']],
    ['module-5-api-test-syntax', 'node', ['--check', 'tests/integration/module-5-api.integration.test.mjs']],
    ['api-registration-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-5-generated-openapi-contract', 'npm', ['run', 'test:api-contract:module-5']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_7_API_CONTRACT_VERIFIED_READY_FOR_PASS_146'
        : (stage6LiveAccepted
            ? 'STAGE_7_API_CONTRACT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_7_API_CONTRACT_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-api-contract-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '5 - Project Management',
    pass: 145,
    mode,
    stage6LiveAccepted,
    contractCoverage: [
      'exact seven-operation Stage-7 OpenAPI inventory',
      'bearer security on every Project operation',
      'strict create/update/lifecycle request schemas with server authority absent',
      'bodyless activate and complete commands',
      'exact Project, Project-detail and paginated-register success DTO schemas',
      'shared error envelope with requestId nested under error',
      'route-specific stable validation, auth, not-found and conflict error-code enums',
      'no membership, generic CRUD, suspend, resume or reopen route before Module 24B'
    ],
    openApiRoute: '/openapi.json',
    productionBusinessBehaviorChanges: 0,
    openApiMetadataCorrections: [
      'narrow each 409 schema to the business conflicts that route can actually emit',
      'keep PROJECT_SCOPE_FORBIDDEN reserved until Module 24B project-scope activation'
    ],
    membershipDeferredToModule24B: true,
    runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 146 - Module 5 React Project register, create and detail UI'
      : 'Run the live API-contract gate after genuine Stage-6 acceptance; Pass 146 may be prepared but cannot claim live Stage-7 API-contract verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 API-contract evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
