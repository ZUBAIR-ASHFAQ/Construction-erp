import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_24A_LIVE_GATE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 24A gate mode must be static or live.');
}

if (mode === 'live' && process.env.MODULE_24A_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
  throw new Error(`Set MODULE_24A_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION} before the live Stage-1 gate.`);
}

const evidencePath = process.env.MODULE_24A_EVIDENCE_FILE
  ?? path.resolve('module-24a-evidence', `stage-1-${mode}.json`);

const liveEnvironment = {
  ...process.env,
  RUN_FOUNDATION_DB_TESTS: '1',
  RUN_MODULE_24A_AUDIT_GUARD: '1',
  RUN_MODULE_24A_E2E: '1'
};

const steps = [
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs'], process.env],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs'], process.env],
  ['foundation-static-regression', 'npm', ['run', 'foundation:gate'], process.env],
  ['module-24a-static-tests', 'node', ['--test', 'tests/module-24a-static.test.mjs', 'tests/module-24a-live-acceptance.test.mjs', 'tests/workspace.test.mjs'], process.env]
];

if (mode === 'live') {
  steps.push(
    ['live-prerequisites', 'node', ['scripts/module-24a/check-live-prerequisites.mjs'], liveEnvironment],
    ['reproducible-lockfile', 'node', ['-e', "require('node:fs').accessSync('package-lock.json')"], liveEnvironment],
    ['clean-install', 'npm', ['ci'], liveEnvironment],
    ['typecheck', 'npm', ['run', 'typecheck'], liveEnvironment],
    ['lint', 'npm', ['run', 'lint'], liveEnvironment],
    ['prisma-validate', 'npm', ['run', 'db:validate'], liveEnvironment],
    ['prisma-generate', 'npm', ['run', 'db:generate'], liveEnvironment],
    ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify'], liveEnvironment],
    ['build', 'npm', ['run', 'build'], liveEnvironment],
    ['prepare-integration-database', 'npm', ['run', 'test:db:prepare'], liveEnvironment],
    ['live-integration-and-security', 'npm', ['run', 'test:integration:module-24a'], liveEnvironment],
    ['playwright-main-workflow', 'npm', ['run', 'test:e2e:module-24a'], liveEnvironment]
  );
}

const results = [];
for (const [name, command, args, env] of steps) {
  const result = await runStep(name, command, args, { env });
  results.push(result);
  if (result.status !== 'passed') break;
}

let lockfilePresent = true;
try {
  await access(path.resolve('package-lock.json'));
} catch {
  lockfilePresent = false;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-24a-stage-1-evidence',
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live' ? 'STAGE_1_ACCEPTED_READY_FOR_STAGE_2' : 'STATIC_GATE_PASSED_LIVE_ACCEPTANCE_PENDING')
    : 'BLOCKED',
  module: '24A - Users/RBAC Core',
  nextStage: mode === 'live' && passed ? 'Module 18 - Document Management' : 'Complete the live Stage-1 gate',
  environment: {
    ...safeEnvironmentSummary(mode === 'live' ? liveEnvironment : process.env),
    lockfilePresent,
    auditSecurityGuardsEnabled: mode === 'live',
    playwrightEnabled: mode === 'live'
  },
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 24A Stage-1 evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 24A Stage 1 accepted. The next dependency-aware stage is Module 18 Document Management.'
    : 'Module 24A static acceptance passed. Live dependency-backed acceptance is still required.');
} else {
  process.exitCode = 1;
}
