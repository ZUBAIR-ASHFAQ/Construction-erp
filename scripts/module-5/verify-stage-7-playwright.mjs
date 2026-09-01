import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve('module-5-evidence', mode === 'live' ? 'stage-7-playwright-live.json' : 'stage-7-playwright.json');

/** Read genuine Module 4A live acceptance before allowing a Stage-7 browser run. */
async function readStage6LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-4a-evidence/stage-6-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write a blocked live evidence record without starting browsers or resetting a database. */
async function writeBlockedEvidence(reason, stage6LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-playwright-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '5 - Project Management',
    pass: 148,
    mode,
    stage6LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    membershipDeferredToModule24B: true,
    nextPass: 'Resolve the live prerequisite and rerun module-5:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 5 Playwright gate mode must be static or live.');
}

const stage6 = await readStage6LiveAcceptance();
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;

if (mode === 'live' && !stage6LiveAccepted) {
  await writeBlockedEvidence('STAGE_6_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_5_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_5_E2E_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-5-react-workflow', 'npm', ['run', 'module-5:react-workflow:gate']],
    ['module-5-playwright-contract', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-5-playwright-syntax', 'node', ['--check', 'tests/e2e/module-5-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-5-browser-workflow', 'npm', ['run', 'test:e2e:module-5']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_149'
        : (stage6LiveAccepted
            ? 'STAGE_7_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_7_PLAYWRIGHT_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-playwright-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '5 - Project Management',
    pass: 148,
    mode,
    stage6LiveAccepted,
    browserFile: 'tests/e2e/module-5-browser.spec.mjs',
    browserCoverage: [
      'create Tender-linked DRAFT Project',
      'read Client and Tender source summary only with existing permissions',
      'update only editable Project master fields',
      'activate DRAFT Project through bodyless command',
      'complete ACTIVE Project through bodyless command',
      'close COMPLETED Project with optional reason',
      'verify durable lifecycle history, audit and outbox records',
      'permission-aware read, create, update, activate and close controls',
      'direct API denial proves hidden controls are not the security boundary',
      'no projects.read means no Project navigation and no Project API request',
      'browser never sends company, actor, Project-scope or lifecycle authority',
      'Project membership UI and /members API remain absent before Module 24B'
    ],
    productionRuntimeChanges: 0,
    membershipDeferredToModule24B: true,
    runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 149 - Module 5 performance, concurrency, migration/recovery and operational verification.'
      : 'Run the live Playwright gate after genuine Stage-6 acceptance; Pass 149 may be prepared but cannot claim live Stage-7 verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
