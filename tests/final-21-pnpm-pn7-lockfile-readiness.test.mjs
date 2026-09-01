import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_MANAGER = 'pnpm@10.34.5';
const WORKSPACE_PATTERNS = ['apps/*', 'packages/*'];

/** Read and parse one package.json file. */
function readPackage(relativePath = 'package.json') {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/** List package.json files from the declared one-level workspace directories. */
function listWorkspacePackageFiles() {
  const files = [];
  for (const directory of ['apps', 'packages']) {
    const root = path.join(ROOT, directory);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativePath = path.join(directory, entry.name, 'package.json');
      if (existsSync(path.join(ROOT, relativePath))) files.push(relativePath);
    }
  }
  return files.sort();
}

/** Return all internal dependency specifications from one package manifest. */
function internalDependencySpecs(pkg) {
  const sections = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies];
  return sections.flatMap((section) =>
    Object.entries(section ?? {})
      .filter(([name]) => name.startsWith('@construction-erp/'))
      .map(([name, version]) => ({ name, version }))
  );
}

test('PN7 readiness keeps the exact pnpm workspace foundation required for lockfile generation', () => {
  const rootPackage = readPackage();
  assert.equal(rootPackage.packageManager, PACKAGE_MANAGER);
  assert.deepEqual(rootPackage.workspaces, WORKSPACE_PATTERNS);
  assert.equal(
    readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8'),
    "packages:\n  - 'apps/*'\n  - 'packages/*'\n"
  );
});

test('PN7 readiness keeps every internal workspace dependency explicit before resolution', () => {
  const manifests = listWorkspacePackageFiles();
  assert.ok(manifests.length > 0);

  const internalDependencies = manifests.flatMap((relativePath) => internalDependencySpecs(readPackage(relativePath)));
  assert.ok(internalDependencies.length > 0);
  assert.deepEqual(
    [...new Set(internalDependencies.map(({ version }) => version))],
    ['workspace:*']
  );
});

test('PN7 readiness keeps npm lockfiles removed and accepts only a pnpm-shaped lockfile when one exists', () => {
  const pnpmLockPath = path.join(ROOT, 'pnpm-lock.yaml');
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
  if (!existsSync(pnpmLockPath)) return;

  const lockfile = readFileSync(pnpmLockPath, 'utf8');
  assert.match(lockfile, /^lockfileVersion:/m);
  assert.match(lockfile, /^importers:/m);
});
