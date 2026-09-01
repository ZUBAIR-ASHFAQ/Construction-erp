import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE_RUNTIME_PATHS = [
  'scripts/bootstrap',
  'scripts/final-21',
  'scripts/foundation',
  'scripts/migrations',
  'scripts/recovery',
  'scripts/testing'
];
const PROGRAMMATIC_NPM = /(?:run|spawn)\(\s*['"]npm['"]|['"]npm['"]\s*,\s*\[\s*['"](?:run|exec)['"]/;

/** Read one repository file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Recursively list executable support files under one active runtime directory. */
function listFiles(relativeDirectory) {
  const files = [];
  const directory = path.join(ROOT, relativeDirectory);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

/** Return active runtime files that still spawn npm programmatically. */
function programmaticNpmReferences() {
  return ACTIVE_RUNTIME_PATHS
    .flatMap((directory) => listFiles(directory))
    .filter((relativePath) => PROGRAMMATIC_NPM.test(read(relativePath)));
}

test('PN9 converts both Playwright web servers to pnpm workspace filters', () => {
  const playwright = read('playwright.config.mjs');
  assert.match(playwright, /command: 'pnpm --filter @construction-erp\/api start'/);
  assert.match(playwright, /command: 'pnpm --filter @construction-erp\/web dev -- --host 127\.0\.0\.1 --port 5173 --strictPort'/);
  assert.doesNotMatch(playwright, /npm run|--workspace\b/);
});

test('PN9 runs active Prisma preparation and migration verification through pnpm exec', () => {
  const prepareDatabase = read('scripts/testing/prepare-database.mjs');
  const migrationGates = read('scripts/migrations/verify-gates.mjs');
  assert.equal((prepareDatabase.match(/run\('pnpm', \['exec', 'prisma'/g) ?? []).length, 3);
  assert.match(migrationGates, /run\('pnpm', \['exec', 'prisma', \.\.\.args/);
  assert.doesNotMatch(prepareDatabase, /run\('npm'/);
  assert.doesNotMatch(migrationGates, /run\('npm'/);
});

test('PN9 runs the active Foundation live chain through pnpm', () => {
  const liveRunner = read('scripts/foundation/run-live-acceptance.mjs');
  const stageGate = read('scripts/foundation/verify-stage-0.mjs');
  for (const script of ['baseline:full', 'recovery:backup:postgres', 'recovery:backup:storage', 'foundation:gate:live']) {
    assert.match(liveRunner, new RegExp(`run\\('pnpm', \\['${script.replaceAll(':', '\\:')}'\\]`));
  }
  for (const script of ['build', 'db:migrations:verify', 'test:integration', 'recovery:drill']) {
    assert.match(stageGate, new RegExp(`'pnpm', \\['${script.replaceAll(':', '\\:')}'\\]`));
  }
  assert.doesNotMatch(liveRunner, /run\('npm'/);
  assert.doesNotMatch(stageGate, /'npm', \['run'/);
});

test('PN9 leaves no programmatic npm child process in current Final-21 runtime tooling', () => {
  assert.deepEqual(programmaticNpmReferences(), []);
});

test('PN9 resolves current Final-21 browser tests explicitly through pnpm exec Playwright', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const e2eScripts = Object.entries(scripts).filter(([name]) => name.startsWith('test:e2e:final-21'));
  assert.equal(e2eScripts.length, 4);
  for (const [name, command] of e2eScripts) {
    assert.match(command, /pnpm exec playwright test --config playwright\.config\.mjs/, name);
    assert.doesNotMatch(command, /\bnpx\b|npm run/, name);
  }
});
