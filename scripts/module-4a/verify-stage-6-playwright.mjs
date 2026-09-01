import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve('module-4a-evidence', mode === 'live' ? 'stage-6-playwright-live.json' : 'stage-6-playwright.json');

/** Read genuine Module 3 live acceptance before allowing a Stage-6 browser run. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write a blocked live evidence record without starting browsers or resetting a database. */
async function writeBlockedEvidence(reason, stage5LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-playwright-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '4A - BOQ Commercial Core',
    pass: 134,
    mode,
    stage5LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite and rerun module-4a:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4A Playwright gate mode must be static or live.');
}

const stage5 = await readStage5LiveAcceptance();
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;

if (mode === 'live' && !stage5LiveAccepted) {
  await writeBlockedEvidence('STAGE_5_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_4A_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_4A_E2E_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-4a-react-workflow', 'npm', ['run', 'module-4a:react-workflow:gate']],
    ['module-4a-playwright-contract', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4a-playwright-syntax', 'node', ['--check', 'tests/e2e/module-4a-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-4a-browser-workflow', 'npm', ['run', 'test:e2e:module-4a']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_6_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_135'
        : (stage5LiveAccepted
            ? 'STAGE_6_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_6_PLAYWRIGHT_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-playwright-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '4A - BOQ Commercial Core',
    pass: 134,
    mode,
    stage5LiveAccepted,
    browserFile: 'tests/e2e/module-4a-browser.spec.mjs',
    browserCoverage: [
      'create tender-linked BOQ',
      'create two server-numbered revisions',
      'save parent/child BOQ item hierarchy',
      'verify server-calculated line amounts and revision total',
      'freeze immutable revision',
      'download authorized CSV export',
      'compare two server revision snapshots',
      'permission-aware create/edit/freeze/export controls',
      'direct API denial proves hidden controls are not the security boundary',
      'no boq.read means no BOQ navigation and no BOQ API request',
      'browser never sends company, actor, lifecycle, calculated amount or Module 4B mapping authority'
    ],
    productionRuntimeChanges: 0,
    deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
    runtimeVerificationComplete: passed && mode === 'live' && stage5LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 135 - Module 4A performance, concurrency and operational verification.'
      : 'Run the live Playwright gate after genuine Stage-5 acceptance; Pass 135 may be prepared but cannot claim live Stage-6 verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
