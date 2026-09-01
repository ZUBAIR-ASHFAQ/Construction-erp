import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from './foundation/gate-lib.mjs';

const evidencePath = path.resolve('acceptance-evidence/pass-303-source-gap-freeze.json');
const results = [];
const steps = [
  ['pass-303-focused-static', 'node', ['--test', 'tests/pass-303-source-gap-freeze.test.mjs']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-303-cross-module-source-gap-freeze',
  generatedAt: new Date().toISOString(),
  pass: 303,
  status: passed
    ? 'PASS_303_SOURCE_GAP_FREEZE_VERIFIED_STAGE_20_RUNTIME_BLOCKED'
    : 'PASS_303_SOURCE_GAP_FREEZE_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  categoryAStage20BlockersFrozen: 10,
  categoryBStage26Stage27DeferralsFrozen: 8,
  categoryCExistingModuleGapGroupsFrozen: 9,
  stage20RuntimeAllowed: false,
  nextReviewedPass: 'Pass 304 - Compensation and labor-rate authority contract',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_303_SOURCE_GAP_FREEZE_VERIFIED_STAGE_20_RUNTIME_BLOCKED');
