import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const WORKSPACE_ROOTS = ['apps', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const ROOT_DIRECT_IMPORTS = new Map([
  ['@aws-sdk/client-s3', '^3.0.0'],
  ['@construction-erp/audit', 'workspace:*'],
  ['@construction-erp/bootstrap', 'workspace:*'],
  ['@construction-erp/config', 'workspace:*'],
  ['@construction-erp/database', 'workspace:*'],
  ['@construction-erp/numbering', 'workspace:*'],
  ['@construction-erp/outbox', 'workspace:*'],
  ['@construction-erp/queue', 'workspace:*'],
  ['@construction-erp/storage', 'workspace:*'],
  ['@construction-erp/tenant-scope', 'workspace:*'],
  ['@construction-erp/testing', 'workspace:*']
]);

/** Read and parse one package manifest. */
function readPackage(relativePath = 'package.json') {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/** Return all dependency names declared by one package manifest. */
function declaredDependencies(pkg) {
  const names = new Set();
  for (const section of DEPENDENCY_SECTIONS) {
    for (const name of Object.keys(pkg[section] ?? {})) names.add(name);
  }
  return names;
}

/** Convert one bare module specifier into its owning package name. */
function packageName(specifier) {
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

/** Extract bare package imports from executable TypeScript/JavaScript source text. */
function bareImports(text) {
  const imports = new Set();
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"]\s*;/g,
    /(?:^|\n)\s*export\s+[^;]*?\s+from\s+['"]([^'"]+)['"]\s*;/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
      imports.add(packageName(specifier));
    }
  }
  return imports;
}

/** Recursively list executable source files under one workspace package. */
function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

/** List all active app/package workspace manifests. */
function workspaceManifests() {
  const manifests = [];
  for (const rootName of WORKSPACE_ROOTS) {
    const rootPath = path.join(ROOT, rootName);
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(rootName, entry.name, 'package.json');
      if (existsSync(path.join(ROOT, manifestPath))) manifests.push(manifestPath);
    }
  }
  return manifests.sort();
}

/** Collect undeclared bare imports for one workspace package. */
function undeclaredImports(manifestPath) {
  const packageDirectory = path.dirname(path.join(ROOT, manifestPath));
  const declared = declaredDependencies(readPackage(manifestPath));
  const missing = new Set();

  for (const filePath of sourceFiles(packageDirectory)) {
    const text = readFileSync(filePath, 'utf8');
    for (const dependency of bareImports(text)) {
      if (!declared.has(dependency)) missing.add(dependency);
    }
  }
  return [...missing].sort();
}

test('PN8 gives root-owned operational scripts and live tests direct dependency ownership', () => {
  const rootPackage = readPackage();
  for (const [name, version] of ROOT_DIRECT_IMPORTS) {
    assert.equal(rootPackage.devDependencies?.[name], version, `${name} must be declared directly at the root`);
  }
});

test('PN8 workspace source files do not rely on undeclared hoisted packages', () => {
  for (const manifestPath of workspaceManifests()) {
    assert.deepEqual(undeclaredImports(manifestPath), [], `${manifestPath} has undeclared bare imports`);
  }
});

test('PN8 keeps internal root tooling dependencies linked through workspace protocol', () => {
  const rootPackage = readPackage();
  const internal = Object.entries(rootPackage.devDependencies ?? {})
    .filter(([name]) => name.startsWith('@construction-erp/'))
    .map(([name, version]) => ({ name, version }));
  assert.ok(internal.length > 0);
  assert.deepEqual([...new Set(internal.map(({ version }) => version))], ['workspace:*']);
});

test('PN8 keeps pnpm strict isolation instead of hiding dependency mistakes with hoisting flags', () => {
  const npmrcPath = path.join(ROOT, '.npmrc');
  if (!existsSync(npmrcPath)) return;
  const npmrc = readFileSync(npmrcPath, 'utf8');
  assert.doesNotMatch(npmrc, /^\s*shamefully-hoist\s*=\s*true\s*$/im);
  assert.doesNotMatch(npmrc, /^\s*node-linker\s*=\s*hoisted\s*$/im);
  assert.doesNotMatch(npmrc, /^\s*public-hoist-pattern\s*=\s*\*\s*$/im);
});

test('PN8 keeps npm lockfiles removed while strict dependency checks remain valid with or without the pnpm lockfile', () => {
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
});
