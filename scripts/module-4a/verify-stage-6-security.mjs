import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-4a-evidence',
  mode === 'live' ? 'stage-6-security-live.json' : 'stage-6-security.json'
);

/** Read genuine Module 3 live acceptance before any Stage-6 live security verification is allowed. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked security evidence record without running destructive live database work. */
async function writeBlockedEvidence(reason, stage5LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-security-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '4A - BOQ Commercial Core',
    pass: 130,
    mode,
    stage5LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-4a:security:gate:live before Pass 131.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4A security gate mode must be static or live.');
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
    ['module-4a-integration', 'npm', ['run', 'module-4a:integration:gate']],
    ['module-4a-security-contract', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4a-security-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-4a-rbac-isolation-database-attacks', 'npm', ['run', 'test:security:module-4a']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_6_SECURITY_VERIFIED_READY_FOR_PASS_131'
        : (stage5LiveAccepted
            ? 'STAGE_6_SECURITY_TESTS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_6_SECURITY_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-security-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '4A - BOQ Commercial Core',
    pass: 130,
    mode,
    stage5LiveAccepted,
    securityFile: 'tests/integration/module-4a-api.integration.test.mjs',
    coverage: [
      'authentication on all six BOQ routes',
      'exact five-permission RBAC matrix',
      'cross-company list/create/revision/item/freeze/export isolation',
      'direct repository company filtering',
      'direct service permission and company-scope revalidation',
      'strict rejection of client-owned company/actor/lifecycle/amount authority',
      'same-company Tender foreign-key enforcement',
      'revision uniqueness/status/positive-number constraints',
      'same-revision item hierarchy and non-negative decimal constraints',
      'current-revision ownership constraint',
      'reviewed Stage-6 index presence',
      'safe public errors without SQL/Prisma leakage'
    ],
    deferredToPass131: [
      'exact OpenAPI operation inventory',
      'request/response schema and stable error-code documentation proof',
      'Swagger contract regression'
    ],
    productionRuntimeChanges: 0,
    deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
    runtimeVerificationComplete: passed && mode === 'live' && stage5LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 131 - Module 4A OpenAPI and API-contract verification'
      : 'Run the live security gate after genuine Stage-5 acceptance; Pass 131 may be prepared but cannot claim live Stage-6 security verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
