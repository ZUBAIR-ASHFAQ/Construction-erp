import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-4a-evidence',
  mode === 'live' ? 'stage-6-api-contract-live.json' : 'stage-6-api-contract.json'
);

/** Read genuine Module 3 live acceptance before any Stage-6 live API-contract verification is allowed. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked API-contract evidence record without running live database-backed verification. */
async function writeBlockedEvidence(reason, stage5LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-api-contract-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '4A - BOQ Commercial Core',
    pass: 131,
    mode,
    stage5LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-4a:api-contract:gate:live before Pass 132.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 API-contract evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4A API-contract gate mode must be static or live.');
}

const stage5 = await readStage5LiveAcceptance();
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;

if (mode === 'live' && !stage5LiveAccepted) {
  await writeBlockedEvidence('STAGE_5_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-4a-security', 'npm', ['run', 'module-4a:security:gate']],
    ['module-4a-api-contract-suite', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4a-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.routes.ts']],
    ['module-4a-api-test-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
    ['api-registration-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-4a-generated-openapi-contract', 'npm', ['run', 'test:api-contract:module-4a']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_6_API_CONTRACT_VERIFIED_READY_FOR_PASS_132'
        : (stage5LiveAccepted
            ? 'STAGE_6_API_CONTRACT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_6_API_CONTRACT_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-api-contract-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '4A - BOQ Commercial Core',
    pass: 131,
    mode,
    stage5LiveAccepted,
    contractCoverage: [
      'exact six-operation OpenAPI inventory',
      'bearer security on every BOQ operation',
      'strict request schemas with server-owned authority absent',
      'bodyless freeze command',
      'exact success DTO schemas with decimal strings',
      'actual shared error envelope shape with requestId nested under error',
      'stable shared and Module 4A error-code enums',
      'no import, generic CRUD or Module 4B project-mapping routes'
    ],
    openApiRoute: '/openapi.json',
    productionRuntimeBehaviorChanges: 0,
    openApiMetadataCorrections: [
      'replace generic success schemas with exact BOQ DTO schemas',
      'correct requestId location in the documented error envelope',
      'document stable per-status error code enums'
    ],
    deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
    runtimeVerificationComplete: passed && mode === 'live' && stage5LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 132 - Module 4A React BOQ register and create/revision UI'
      : 'Run the live API-contract gate after genuine Stage-5 acceptance; Pass 132 may be prepared but cannot claim live Stage-6 contract verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 API-contract evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
