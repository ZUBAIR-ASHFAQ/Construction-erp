import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE_SCRIPT_PATHS = [
  'scripts/bootstrap',
  'scripts/final-21',
  'scripts/foundation',
  'scripts/migrations',
  'scripts/recovery',
  'scripts/testing'
];
const ACTIVE_DOCS = [
  '.env.recovery.example',
  'packages/bootstrap/README.md',
  'packages/database/README.md',
  'packages/database/prisma/migrations/README.md'
];
const NPM_ONLY_REFERENCE = /npm run|npm ci|npm install|\bnpx\b|package-lock\.json|--workspaces?\b/i;

/** Read one repository file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Recursively list files under one repository-relative directory. */
function listFiles(relativeDirectory) {
  const directory = path.join(ROOT, relativeDirectory);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

/** Return npm-only references from current Final-21 tooling files. */
function findActiveToolingReferences() {
  const files = [
    ...ACTIVE_SCRIPT_PATHS.flatMap((directory) => listFiles(directory)),
    'scripts/check-workspace.mjs',
    ...ACTIVE_DOCS
  ];
  return files.filter((relativePath) => NPM_ONLY_REFERENCE.test(read(relativePath)));
}

test('PN6 removes npm-only commands and package-lock checks from active Final-21 tooling', () => {
  assert.deepEqual(findActiveToolingReferences(), []);
});

test('PN6 updates active developer and migration guidance to pnpm commands', () => {
  assert.match(read('.env.recovery.example'), /pnpm foundation:acceptance:live/);
  assert.match(read('packages/bootstrap/README.md'), /pnpm bootstrap:initial/);
  assert.match(read('packages/database/README.md'), /pnpm db:generate/);
  assert.match(read('packages/database/prisma/migrations/README.md'), /pnpm db:migrations:checksums:update/);
  assert.match(read('scripts/final-21/build-legacy-cleanup-manifest.mjs'), /Run pnpm final-21:legacy-inventory/);
});

test('PN6 active tooling remains clean after PN9 converts Playwright runtime commands', () => {
  const playwright = read('playwright.config.mjs');
  assert.match(playwright, /pnpm --filter @construction-erp\/api start/);
  assert.match(playwright, /pnpm --filter @construction-erp\/web dev/);
});

test('PN6 keeps historical 24-module lockfile verifiers as evidence instead of rewriting them', () => {
  assert.match(read('scripts/module-24a/prepare-lockfile.mjs'), /package-lock\.json/);
  assert.match(read('scripts/baseline/verify-reproducible-baseline.mjs'), /package-lock\.json/);
  assert.match(read('scripts/acceptance/verify-pass-174-live-chain.mjs'), /package-lock\.json/);
});

test('PN6 keeps the npm lockfile removed after the pnpm migration advances', () => {
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
});
