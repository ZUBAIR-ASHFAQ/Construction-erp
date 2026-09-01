import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-8-evidence',
  mode === 'live' ? 'stage-13-playwright-live.json' : 'stage-13-playwright.json'
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

/** Write a truthful blocked live record before starting browsers or resetting PostgreSQL. */
async function writeBlockedEvidence(reason, stage12LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-13-module-8-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 231,
    stage: 13,
    module: '8 - Procurement & RFQ',
    mode,
    status: 'BLOCKED',
    stage12LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-8:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 8 Stage-13 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 8 Playwright gate mode must be static or live.');
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage12LiveAccepted) {
  await writeBlockedEvidence('STAGE_12_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_8_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_8_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-8-evidence/stage-13-react.json');
  const reactPrepared = reactEvidence?.pass === 230
    && [
      'STAGE_13_MODULE_8_REACT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING',
      'STAGE_13_MODULE_8_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-8-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: reactPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-8-react-regression', 'npm', ['run', 'module-8:react:gate']],
    ['module-8-playwright-contract', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-8-browser-syntax', 'node', ['--check', 'tests/e2e/module-8-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-8-browser-workflow', 'npm', ['run', 'test:e2e:module-8']]);
  }

  if (reactPrepared) {
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args);
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = reactPrepared
    && results.length === steps.length + 1
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_13_MODULE_8_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_232'
        : (stage12LiveAccepted
            ? 'STAGE_13_MODULE_8_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_13_MODULE_8_PLAYWRIGHT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-13-module-8-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 231,
    stage: 13,
    module: '8 - Procurement & RFQ',
    mode,
    status,
    stage12LiveAccepted,
    browserFile: 'tests/e2e/module-8-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module-24A browser flow and open the permission-aware Procurement & RFQ workspace',
      'select one authorized Project through the existing Project register contract',
      'create one server-numbered purchase requisition using an active Module-6 WBS, Cost Code and Cost Type posting combination',
      'submit the requisition through the reviewed bodyless command after the frozen Module-7 budget readiness gate',
      'create one server-numbered RFQ from the submitted requisition and issue it to two ACTIVE + QUALIFIED Module-8 Vendor ids',
      'record two supplier quotations while line and header totals stay server-calculated',
      'exercise the local JSON quotation-line import without inventing a server import endpoint',
      'read the side-by-side comparison, verify stored-total ordering and select the reviewed quotation with rationale',
      'verify selection leaves Module-7 commitments and Finance journals untouched until a later PO/subcontract issue',
      'verify Module-8 browser writes do not send Company, actor, requester, buyer, numbering, lifecycle, totals or financial-commitment authority',
      'verify a read-only Module-8 user does not receive write controls and receives HTTP 403 on direct create/selection attempts'
    ],
    intentionallyAbsent: [
      'No Vendor list/create/update/contact browser workflow because the reviewed API defines no Vendor-master endpoints.',
      'No RFQ register/detail reload workflow because the reviewed API defines no RFQ list/detail route.',
      'No separate RFQ-item CRUD/read route is added; quotation lines use the real line identities returned by the existing RFQ workflow.',
      'No Purchase Order conversion, job-cost commitment write, Finance journal or payable action is added.',
      'Project-scope and cross-Company security remain additionally covered by the Pass-229 API integration/security suite.'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage12LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage12LiveAccepted,
    nextPass: passed
      ? 'Pass 232 - Module 8 operational, migration and concurrency verification.'
      : 'Repair the failed Pass-231 Playwright check before preparing Stage-13 operations verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 8 Stage-13 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
