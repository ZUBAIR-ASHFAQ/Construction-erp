import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { rootDir, run } from './lib.mjs';

const foundationStaticTests = [
  'api-error-plugin.test.mjs',
  'foundation-acceptance.test.mjs',
  'foundation-stage-0.test.mjs',
  'idempotency.test.mjs',
  'migration-system.test.mjs',
  'numbering.test.mjs',
  'operations-observability.test.mjs',
  'outbox.test.mjs',
  'queue.test.mjs',
  'recovery.test.mjs',
  'storage.test.mjs',
  'testing-infrastructure.test.mjs',
  'workspace.test.mjs'
];

/** Return the current Final-21 static tests and ignore superseded 24-module/pass-era evidence. */
async function listFinal21Tests() {
  const testsDir = path.join(rootDir, 'tests');
  return (await readdir(testsDir))
    .filter((name) => name.startsWith('final-21-') && name.endsWith('.test.mjs'))
    .sort();
}

const foundationOnly = process.argv.includes('--foundation-only');
const selectedTests = foundationOnly
  ? foundationStaticTests
  : [...foundationStaticTests, ...await listFinal21Tests()];
const files = selectedTests.map((name) => path.join('tests', name));

if (files.length === 0) throw new Error('No current Foundation or Final-21 static tests were found.');
console.log(`Running ${files.length} current static test file(s). Legacy 24-module/pass-era tests are historical only.`);
await run('node', ['--test', ...files], { cwd: rootDir });
