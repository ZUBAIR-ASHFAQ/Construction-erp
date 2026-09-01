import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOTS = ['apps', 'packages'];

/** Read and parse one package manifest. */
function readPackage(relativePath = 'package.json') {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/** Return every active workspace package with its path and manifest. */
function listWorkspacePackages() {
  const packages = [];
  for (const rootName of WORKSPACE_ROOTS) {
    for (const entry of readdirSync(path.join(ROOT, rootName), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativePath = path.join(rootName, entry.name, 'package.json');
      const manifest = readPackage(relativePath);
      packages.push({ relativePath, manifest });
    }
  }
  return packages;
}

/** Build the local dependency graph used to validate pnpm topological execution. */
function buildLocalDependencyGraph(workspaces) {
  const names = new Set(workspaces.map(({ manifest }) => manifest.name));
  return new Map(
    workspaces.map(({ manifest }) => {
      const dependencies = new Set();
      for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const name of Object.keys(manifest[section] ?? {})) {
          if (names.has(name)) dependencies.add(name);
        }
      }
      return [manifest.name, [...dependencies]];
    })
  );
}

/** Verify the local workspace dependency graph contains no cycles. */
function assertAcyclic(graph) {
  const visiting = new Set();
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    assert.equal(visiting.has(name), false, `workspace dependency cycle detected at ${name}`);
    visiting.add(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  }

  for (const name of graph.keys()) visit(name);
}

test('PN5 replaces the long manual package build chain with one pnpm recursive command', () => {
  const scripts = readPackage().scripts;
  assert.equal(scripts['build:packages'], 'pnpm --recursive --filter "./packages/**" --if-present run build');
  assert.doesNotMatch(scripts['build:packages'], /&&/);
  assert.doesNotMatch(scripts['build:packages'], /@construction-erp\//);
});

test('PN5 uses pnpm recursive execution for the complete workspace build and typecheck', () => {
  const scripts = readPackage().scripts;
  assert.equal(scripts.build, 'pnpm --recursive --if-present run build');
  assert.equal(scripts.typecheck, 'pnpm --recursive --if-present run typecheck');
  assert.equal(scripts.prepare, 'pnpm build:packages');
});

test('PN5 keeps build and typecheck ownership inside each workspace package', () => {
  for (const { relativePath, manifest } of listWorkspacePackages()) {
    assert.ok(manifest.scripts?.build, `${relativePath} must own its build command`);
    assert.ok(manifest.scripts?.typecheck, `${relativePath} must own its typecheck command`);
  }
});

test('PN5 workspace dependencies are acyclic so pnpm can build them topologically', () => {
  const workspaces = listWorkspacePackages();
  const graph = buildLocalDependencyGraph(workspaces);
  assert.equal(graph.size, workspaces.length);
  assertAcyclic(graph);
});

test('PN5 does not add an unnecessary workspace build orchestrator', () => {
  const rootPackage = readPackage();
  assert.equal(rootPackage.devDependencies?.turbo, undefined);
  assert.equal(rootPackage.devDependencies?.nx, undefined);
  assert.equal(rootPackage.devDependencies?.lerna, undefined);
});
