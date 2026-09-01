import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_MANAGER = 'pnpm@10.34.5';
const WORKSPACE_FILE = "packages:\n  - 'apps/*'\n  - 'packages/*'\n";
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const ACTIVE_PATHS = [
  'scripts/bootstrap',
  'scripts/final-21',
  'scripts/foundation',
  'scripts/migrations',
  'scripts/recovery',
  'scripts/testing'
];
const NPM_ONLY_REFERENCE = /npm run|npm ci|npm install|\bnpx\b|package-lock\.json|--workspaces?\b/i;

/** Read one repository file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Read and parse one package manifest. */
function readPackage(relativePath = 'package.json') {
  return JSON.parse(read(relativePath));
}

/** Recursively list files below one repository-relative directory. */
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

/** List package manifests from the active one-level app and package workspaces. */
function workspaceManifests() {
  const manifests = [];
  for (const rootName of ['apps', 'packages']) {
    const root = path.join(ROOT, rootName);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativePath = path.join(rootName, entry.name, 'package.json');
      if (existsSync(path.join(ROOT, relativePath))) manifests.push(relativePath);
    }
  }
  return manifests.sort();
}

/** Return internal Construction ERP dependency specifications from one manifest. */
function internalDependencySpecs(pkg) {
  return DEPENDENCY_SECTIONS.flatMap((section) =>
    Object.entries(pkg[section] ?? {})
      .filter(([name]) => name.startsWith('@construction-erp/'))
      .map(([name, version]) => ({ name, version }))
  );
}

/** Return active current-tooling files that still contain npm-only migration references. */
function activeNpmOnlyReferences() {
  const files = [
    'package.json',
    'playwright.config.mjs',
    'scripts/check-workspace.mjs',
    ...ACTIVE_PATHS.flatMap((directory) => listFiles(directory))
  ];
  return files.filter((relativePath) => NPM_ONLY_REFERENCE.test(read(relativePath)));
}

test('PN10 freezes the final pnpm workspace and package-manager contract', () => {
  const rootPackage = readPackage();
  assert.equal(rootPackage.packageManager, PACKAGE_MANAGER);
  assert.deepEqual(rootPackage.workspaces, ['apps/*', 'packages/*']);
  assert.equal(read('pnpm-workspace.yaml'), WORKSPACE_FILE);
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
});

test('PN10 keeps every internal workspace dependency on the pnpm workspace protocol', () => {
  const manifests = ['package.json', ...workspaceManifests()];
  const internalDependencies = manifests.flatMap((relativePath) => internalDependencySpecs(readPackage(relativePath)));
  assert.ok(internalDependencies.length > 0);
  for (const { name, version } of internalDependencies) {
    assert.equal(version, 'workspace:*', `${name} must resolve through workspace:*`);
  }
});

test('PN10 leaves no npm-only command in current Final-21 package, runtime, or Playwright tooling', () => {
  assert.deepEqual(activeNpmOnlyReferences(), []);
});

test('PN10 keeps pnpm strict dependency isolation without hoisting escape hatches', () => {
  const npmrcPath = path.join(ROOT, '.npmrc');
  if (!existsSync(npmrcPath)) return;
  const npmrc = readFileSync(npmrcPath, 'utf8');
  assert.doesNotMatch(npmrc, /^\s*shamefully-hoist\s*=\s*true\s*$/im);
  assert.doesNotMatch(npmrc, /^\s*node-linker\s*=\s*hoisted\s*$/im);
  assert.doesNotMatch(npmrc, /^\s*public-hoist-pattern\s*=\s*\*\s*$/im);
});

test('PN10 validates pnpm-lock.yaml structure when a registry-enabled environment has generated it', () => {
  const lockfilePath = path.join(ROOT, 'pnpm-lock.yaml');
  if (!existsSync(lockfilePath)) return;

  const lockfile = readFileSync(lockfilePath, 'utf8');
  assert.match(lockfile, /^lockfileVersion:/m);
  assert.match(lockfile, /^settings:/m);
  assert.match(lockfile, /^importers:/m);
  assert.match(lockfile, /^\s{2}\.\s*:/m);
});

test('PN10 keeps the final clean-room acceptance commands pnpm-native', () => {
  const scripts = readPackage().scripts;
  assert.equal(scripts['check:workspace'], 'node scripts/check-workspace.mjs');
  assert.equal(scripts['db:validate'], 'pnpm --filter @construction-erp/database prisma:validate');
  assert.equal(scripts['db:generate'], 'pnpm --filter @construction-erp/database prisma:generate');
  assert.equal(scripts.typecheck, 'pnpm --recursive --if-present run typecheck');
  assert.equal(scripts.build, 'pnpm --recursive --if-present run build');
  assert.equal(scripts['test:static'], 'node scripts/testing/run-static.mjs');
  assert.equal(scripts['test:final-21'], 'node --test tests/final-21*.test.mjs');
});
