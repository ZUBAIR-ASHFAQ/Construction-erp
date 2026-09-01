import path from 'node:path';
import process from 'node:process';
import { LIVE_GATE_CONFIRMATION, runStep, safeEnvironmentSummary, writeEvidence } from './gate-lib.mjs';

const modeArg = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';
if (!['static', 'live'].includes(modeArg)) throw new Error('Foundation gate mode must be static or live.');
const evidencePath = process.env.FOUNDATION_EVIDENCE_FILE ?? path.resolve('foundation-evidence', `stage-0-${modeArg}.json`);

if (modeArg === 'live' && process.env.FOUNDATION_LIVE_GATE_CONFIRM !== LIVE_GATE_CONFIRMATION) {
  throw new Error(`Set FOUNDATION_LIVE_GATE_CONFIRM=${LIVE_GATE_CONFIRMATION} before the live Stage-0 gate.`);
}

const steps = [
  ['workspace', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
  ['static-foundation-tests', 'node', ['scripts/testing/run-static.mjs']],
  ['stage-0-contract-tests', 'node', ['--test', 'tests/foundation-stage-0.test.mjs']]
];

if (modeArg === 'live') {
  steps.push(
    ['package-build', 'pnpm', ['build']],
    ['migration-clean-and-previous-gates', 'pnpm', ['db:migrations:verify']],
    ['live-foundation-integration', 'pnpm', ['test:integration']],
    ['postgres-and-storage-recovery-drill', 'pnpm', ['recovery:drill']]
  );
}

const results = [];
for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}
const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-foundation-stage-0-evidence',
  mode: modeArg,
  generatedAt: new Date().toISOString(),
  status: passed ? (modeArg === 'live' ? 'READY_FOR_STAGE_1_LIVE' : 'READY_FOR_STAGE_1_STATIC') : 'BLOCKED',
  nextStage: 'Module 24A - Users/RBAC Core',
  identityHandoff: {
    status: 'MODULE_24A_REQUIRED',
    note: 'Foundation owns the initial provisioning orchestration; Module 24A supplies the identity adapter that creates the system administrator and system roles without moving Users/RBAC table ownership into Foundation.'
  },
  environment: safeEnvironmentSummary(),
  checks: results
};
const written = await writeEvidence(evidencePath, evidence);
console.log(`Foundation Stage-0 evidence written to ${written}`);
if (!passed) process.exitCode = 1;
