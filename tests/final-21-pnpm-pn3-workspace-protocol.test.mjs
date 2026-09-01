import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOTS = ['apps', 'packages'];
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const EXPECTED_INTERNAL_REFERENCE_COUNT = 44;
const EXPECTED_INTERNAL_CONSUMER_COUNT = 12;

/** Read and parse one package.json file. */
function readPackage(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/** List every app/package manifest in the current monorepo workspace. */
function listWorkspacePackages() {
  const manifests = [];
  for (const rootName of WORKSPACE_ROOTS) {
    const rootPath = path.join(ROOT, rootName);
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativePath = `${rootName}/${entry.name}/package.json`;
      if (existsSync(path.join(ROOT, relativePath))) manifests.push(relativePath);
    }
  }
  return manifests.sort();
}

/** Collect all private Construction ERP dependency references from workspace manifests. */
function collectInternalDependencies(manifests) {
  const references = [];
  for (const manifest of manifests) {
    const pkg = readPackage(manifest);
    for (const section of DEPENDENCY_SECTIONS) {
      for (const [name, version] of Object.entries(pkg[section] ?? {})) {
        if (!name.startsWith('@construction-erp/')) continue;
        references.push({ manifest, section, name, version });
      }
    }
  }
  return references;
}

test('PN3 links every internal Construction ERP dependency through workspace:*', () => {
  const manifests = listWorkspacePackages();
  const references = collectInternalDependencies(manifests);
  assert.equal(references.length, EXPECTED_INTERNAL_REFERENCE_COUNT);
  assert.equal(new Set(references.map((reference) => reference.manifest)).size, EXPECTED_INTERNAL_CONSUMER_COUNT);
  for (const reference of references) {
    assert.equal(reference.version, 'workspace:*', `${reference.manifest} must link ${reference.name} locally`);
  }
});

test('PN3 internal dependency names all resolve to packages that exist in this workspace', () => {
  const manifests = listWorkspacePackages();
  const workspaceNames = new Set(manifests.map((manifest) => readPackage(manifest).name));
  const references = collectInternalDependencies(manifests);
  for (const reference of references) {
    assert.equal(workspaceNames.has(reference.name), true, `${reference.name} must resolve to a local workspace package`);
  }
});

test('PN3 workspace protocol remains intact after PN4 script conversion and before lockfile generation', () => {
  const rootPackage = readPackage('package.json');
  assert.equal(rootPackage.packageManager, 'pnpm@10.34.5');
  assert.equal(rootPackage.scripts['dev:api'], 'pnpm --filter @construction-erp/api dev');
  assert.equal(rootPackage.scripts.typecheck, 'pnpm --recursive --if-present run typecheck');
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
});

test('PN3 leaves third-party dependency ranges unchanged in representative packages', () => {
  const apiPackage = readPackage('apps/api/package.json');
  const webPackage = readPackage('apps/web/package.json');
  const databasePackage = readPackage('packages/database/package.json');
  assert.equal(apiPackage.dependencies.fastify, '^5.0.0');
  assert.equal(webPackage.dependencies.react, '^19.0.0');
  assert.equal(databasePackage.dependencies['@prisma/client'], '^6.0.0');
});
