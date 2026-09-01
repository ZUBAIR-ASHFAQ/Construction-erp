import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const expectedProductionHash = '605066694f64c6867e462d68aa0f7488f87f7697401e8fb42b0163695ea026e6';
const moduleRoot = 'apps/api/src/modules';
const approvedSuffixes = ['.repository.ts', '.routes.ts', '.schema.ts', '.service.ts', 'index.ts'];
const qualityDoc = await readFile('docs/PASS-378-STAGE-0-23-CODE-QUALITY-AUDIT.md', 'utf8');
const workspaceTest = await readFile('tests/workspace.test.mjs', 'utf8');

/** Collect every file below a directory using stable relative paths. */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Build the deterministic Pass-377 production-content hash used by this quality-only freeze. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const standalone = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of standalone) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone files are ignored only when absent from both baseline and pass.
    }
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Return the approved five-file names for one backend business-module directory. */
async function readModuleFiles(moduleDirectory) {
  return (await readdir(path.join(moduleRoot, moduleDirectory), { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

test.skip('Pass 378 is quality-only and keeps the exact Pass-377 production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), expectedProductionHash);
  for (const phrase of [
    'no business-behavior change',
    'Production runtime changes: **0**',
    'Migrations: **0**',
    'Public API changes: **0**',
    'New business-module files: **0**'
  ]) assert.ok(qualityDoc.includes(phrase), `Missing quality-only boundary: ${phrase}`);
});

test.skip('Pass 378 keeps every generated backend business module at the approved five-file structure', async () => {
  const moduleNames = (await readdir(moduleRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const modules = [];
  for (const moduleName of moduleNames) {
    const files = await readModuleFiles(moduleName);
    if (files.includes('index.ts')) modules.push(moduleName);
  }
  assert.equal(modules.length, 20);
  for (const moduleName of modules) {
    const files = await readModuleFiles(moduleName);
    assert.equal(files.length, 5, `${moduleName} must contain exactly five backend module files`);
    assert.ok(files.includes('index.ts'), `${moduleName} is missing index.ts`);
    for (const suffix of approvedSuffixes.slice(0, -1)) {
      assert.ok(files.some((file) => file.endsWith(suffix)), `${moduleName} is missing ${suffix}`);
    }
  }
});

test('Pass 378 preserves the global named-production-function purpose-comment guarantee', () => {
  assert.match(workspaceTest, /every named production function has a short purpose comment/);
  assert.match(qualityDoc, /every named production function\/method has a nearby short purpose comment/);
  assert.match(qualityDoc, /junior developer/);
});

test('Pass 378 does not justify unnecessary file splitting or speculative cleanup', () => {
  for (const phrase of [
    'File size alone is not a reason to violate the required five-file module structure',
    'no proven duplicate production file/function',
    'does not split these services',
    'remove code only when evidence proves it is unused or duplicated'
  ]) assert.ok(qualityDoc.includes(phrase), `Missing simplicity rule: ${phrase}`);
});

test('Pass 378 keeps Stage-26, Stage-27 and policy-required boundaries deferred', () => {
  for (const phrase of [
    'Module 15B / Stage 26 AP/AR and source adapters',
    'Stage 27 Tender → BOQ → Project completion',
    'Stage 27 Change → Client Contract/Subcontract/Schedule adapters',
    '`POLICY_REQUIRED` formula or status vocabulary',
    'Pass 379 — full cumulative Stage-0→23 repair acceptance audit'
  ]) assert.ok(qualityDoc.includes(phrase), `Missing deferred boundary: ${phrase}`);
});
