import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'tests/final-21-pnpm-pn1-baseline.test.mjs';
const NPM_REFERENCE = /npm run|npm ci|npm install|\bnpx\b|package-lock\.json|--workspaces?\b/i;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const EXPECTED_ACTIVE_TOOLING = new Map();
const EXPECTED_ACTIVE_TESTS = new Map();

/** Read one repository file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Recursively list repository files while skipping generated dependency/build folders. */
function listFiles(directory = ROOT) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

/** Classify one package-manager reference as active tooling, active test, or historical evidence. */
function classify(relativePath) {
  if (
    relativePath.startsWith('docs/') ||
    relativePath.startsWith('acceptance-evidence/') ||
    relativePath === 'stage-0-static-evidence.json' ||
    /^scripts\/module-[^/]+\//.test(relativePath) ||
    relativePath.startsWith('scripts/acceptance/') ||
    relativePath.startsWith('scripts/baseline/') ||
    /^tests\/(?:module-|pass-)/.test(relativePath)
  ) return 'historical';
  if (relativePath.startsWith('tests/')) return 'active_tests';
  return 'active_tooling';
}

/** Collect current npm-specific command and lockfile reference lines without changing repository behavior. */
function collectReferences() {
  const references = [];
  for (const fullPath of listFiles()) {
    const relativePath = path.relative(ROOT, fullPath).split(path.sep).join('/');
    if (relativePath === SELF || relativePath.startsWith('tests/final-21-pnpm-') || relativePath === 'package-lock.json') continue;
    if (statSync(fullPath).size > 2_000_000) continue;
    let text;
    try {
      text = readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, index) => {
      if (NPM_REFERENCE.test(line)) references.push({ category: classify(relativePath), path: relativePath, line: index + 1 });
    });
  }
  return references;
}

/** Count reference lines per file for one inventory category. */
function countFiles(references, category) {
  const counts = new Map();
  for (const reference of references) {
    if (reference.category !== category) continue;
    counts.set(reference.path, (counts.get(reference.path) ?? 0) + 1);
  }
  return new Map([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

test('PN1 preserves the audited workspace baseline while PN2 introduces pnpm metadata', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.packageManager, 'pnpm@10.34.5');
  assert.deepEqual(pkg.workspaces, ['apps/*', 'packages/*']);
  assert.equal(existsSync(path.join(ROOT, 'pnpm-workspace.yaml')), true);
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
});

test('PN1 inventory shows no active npm references after PN9 runtime cleanup', () => {
  const references = collectReferences();
  assert.deepEqual(countFiles(references, 'active_tooling'), EXPECTED_ACTIVE_TOOLING);
  assert.equal([...EXPECTED_ACTIVE_TOOLING.values()].reduce((sum, value) => sum + value, 0), 0);
});

test('PN1 inventories active test references separately from production and tooling commands', () => {
  const references = collectReferences();
  assert.deepEqual(countFiles(references, 'active_tests'), EXPECTED_ACTIVE_TESTS);
});

test('PN1 keeps legacy module scripts, old acceptance evidence and documentation historical', () => {
  const references = collectReferences();
  const historical = references.filter((reference) => reference.category === 'historical');
  assert.equal(historical.length, 258);
  assert.equal(new Set(historical.map((reference) => reference.path)).size, 76);
  assert.equal(references.length, 258);
});

test('PN1 risk inventory now shows package scripts and Playwright runtime commands converted', () => {
  const rootPackage = read('package.json');
  const databasePackage = read('packages/database/package.json');
  const playwright = read('playwright.config.mjs');
  assert.match(rootPackage, /pnpm --filter @construction-erp\/api dev/);
  assert.match(rootPackage, /pnpm --recursive --if-present run typecheck/);
  assert.match(databasePackage, /pnpm prisma:generate/);
  assert.match(playwright, /pnpm --filter @construction-erp\/api start/);
  assert.match(rootPackage, /pnpm test:static/);
});
