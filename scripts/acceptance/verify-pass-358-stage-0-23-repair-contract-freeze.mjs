import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_357_PRODUCTION_SNAPSHOT = '52b0538092af159bb687586a83e59f61e70311abb9d5eed40c1d9d1713010f16';
const evidencePath = path.resolve('acceptance-evidence/pass-358-stage-0-23-repair-contract-freeze.json');
const productionRoots = ['apps', 'packages', 'docker'];
const productionFiles = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];

/** Collect file paths recursively in stable lexical order for the production-snapshot hash. */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Hash the exact production/config paths that Pass 358 is forbidden to modify. */
async function productionSnapshot() {
  const hash = createHash('sha256');
  const files = [];
  for (const root of productionRoots) files.push(...await collectFiles(root));
  files.push(...productionFiles);

  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const relative = file.replaceAll('\\\\', '/');
    const relativeBytes = Buffer.from(relative);
    const content = await readFile(file);
    const pathLength = Buffer.alloc(8);
    const contentLength = Buffer.alloc(8);
    pathLength.writeBigUInt64BE(BigInt(relativeBytes.length));
    contentLength.writeBigUInt64BE(BigInt(content.length));
    hash.update(pathLength);
    hash.update(relativeBytes);
    hash.update(contentLength);
    hash.update(content);
  }

  return { sha256: hash.digest('hex'), fileCount: files.length };
}

const production = await productionSnapshot();
const results = [];
const steps = [
  ['pass-358-focused-static', 'node', ['--test', 'tests/pass-358-stage-0-23-repair-contract-freeze.test.mjs']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']]
];

if (production.sha256 === PASS_357_PRODUCTION_SNAPSHOT) {
  results.push({
    name: 'pass-357-production-snapshot',
    status: 'passed',
    details: `Production snapshot unchanged across ${production.fileCount} files.`
  });
} else {
  results.push({
    name: 'pass-357-production-snapshot',
    status: 'failed',
    details: `Expected ${PASS_357_PRODUCTION_SNAPSHOT} but found ${production.sha256}.`
  });
}

if (results[0].status === 'passed') {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = results.length === steps.length + 1 && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-358-stage-0-23-repair-contract-freeze',
  generatedAt: new Date().toISOString(),
  pass: 358,
  baselinePass: 357,
  status: passed ? 'PASS_358_STAGE_0_23_REPAIR_CONTRACT_FROZEN' : 'PASS_358_STAGE_0_23_REPAIR_CONTRACT_FAILED',
  documentationAndVerificationOnly: true,
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  productionSnapshotExpected: PASS_357_PRODUCTION_SNAPSHOT,
  productionSnapshotActual: production.sha256,
  productionSnapshotFileCount: production.fileCount,
  stage26FinanceDeferralsRemainFrozen: true,
  stage27IntegrationDeferralsRemainFrozen: true,
  policyRequiredItemsRemainFailClosed: true,
  nextReviewedPass: 'Pass 359 - Module 6 durable WBS freeze/reopen state',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

if (!passed) process.exitCode = 1;
else console.log('PASS_358_STAGE_0_23_REPAIR_CONTRACT_FROZEN');
