import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const expectedProductionHash = '30bf0f7a93f41dfb250cc9c674607f79c4ac9c1b75a093360641ba1a55a49332';
const freeze = await readFile('docs/PASS-394-MODULE-19-REMAINING-CONTRACT-READBACK-FREEZE.md', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

/** Collect every file below one production directory using stable relative paths. */
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

/** Build the deterministic production hash frozen from the exact Pass-393 baseline. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const standalone = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of standalone) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone files are ignored only when absent from this baseline.
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

/** Assert one contract token is present in the Pass-394 freeze. */
function includes(token) {
  assert.ok(freeze.includes(token), `Missing Pass-394 contract token: ${token}`);
}

test.skip('Pass 394 is documentation-only and preserves the exact Pass-393 production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), expectedProductionHash);
  includes('documentation-and-verification-only');
  includes('changes no production runtime');
});

test('Pass 394 freezes exactly the five source RFI operations before implementation', () => {
  for (const route of [
    'GET  /api/v1/projects/:projectId/rfis',
    'POST /api/v1/projects/:projectId/rfis',
    'POST /api/v1/rfis/:id/respond',
    'POST /api/v1/rfis/:id/close',
    'POST /api/v1/rfis/:id/reopen'
  ]) includes(route);
  includes('No assign/reassign command');
  includes('separate acceptance command is not invented');
});

test.skip('Pass 394 freezes only source-owned RFI persistence and server authority', () => {
  for (const token of [
    'rfis',
    'rfi_responses',
    '`company_id` comes only from authenticated Foundation request context',
    '`raised_by` is the authenticated actor',
    '`status` and `closed_at` are server-owned',
    'response history is append-only evidence'
  ]) includes(token);
  assert.doesNotMatch(prisma, /model Rfi\b/);
  assert.doesNotMatch(prisma, /model RfiResponse\b/);
});

test.skip('Pass 394 resolves the durable UI readback gap with exactly two deferred narrow reads', () => {
  includes('GET /api/v1/rfis/:id');
  includes('GET /api/v1/submittals/:id');
  includes('These are not part of the original nine Module-19 source routes.');
  includes('readback repairs required to make the source-mandated React detail/history UI durable after reload');
  assert.ok(!routes.includes("app.get('/api/v1/rfis/:id'"));
  assert.ok(!routes.includes("app.get('/api/v1/submittals/:id'"));
});

test.skip('Pass 394 leaves the registered Module-19 route surface at the four verified Submittal routes', () => {
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 4);
  assert.ok(!routes.includes('/rfis'));
  for (const route of [
    "app.get('/api/v1/projects/:projectId/submittals'",
    "app.post('/api/v1/projects/:projectId/submittals'",
    "app.post('/api/v1/submittals/:id/submit'",
    "app.post('/api/v1/submittals/:id/reviews'"
  ]) assert.ok(routes.includes(route), `Missing accepted Pass-393 route: ${route}`);
});

test('Pass 394 preserves the exact source Module-19 permission, error and event vocabulary', () => {
  for (const permission of [
    'rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close',
    'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
  ]) includes(permission);
  for (const error of [
    'RFI_NOT_FOUND', 'RFI_ALREADY_CLOSED', 'RFI_RESPONSE_NOT_ALLOWED',
    'SUBMITTAL_NOT_FOUND', 'SUBMITTAL_REVISION_NOT_SUBMITTED', 'REVIEWER_NOT_AUTHORIZED'
  ]) includes(error);
  for (const event of [
    'rfi.created', 'rfi.responded', 'rfi.closed', 'submittal.submitted', 'submittal.reviewed'
  ]) includes(event);
  assert.ok(!schema.includes("'rfi.reopen'"));
  assert.ok(!schema.includes("'rfi.reopened'"));
});

test('Pass 394 keeps the initial-RFI attachment storage gap explicit instead of inventing persistence', () => {
  includes('Initial-RFI attachment persistence remains an explicit Module-18 document-link integration gap');
  includes('does **not** invent an RFI attachment column or a second attachment table');
});

test('Pass 394 records the exact Stage-24 continuation and keeps Stage 25 deferred', () => {
  for (const pass of [395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 406, 407]) includes(`Pass ${pass}`);
  includes('No Module-20 production file may be added before Pass 407 accepts Stage 24.');
});

test('Pass 394 registers one focused static gate while retaining Pass 393 verification', () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(
    scripts['pass-394:module-19-remaining-contract-readback-freeze:gate'],
    'node --test tests/pass-394-module-19-remaining-contract-readback-freeze.test.mjs tests/pass-393-module-19-submittal-backend-verification.test.mjs tests/workspace.test.mjs'
  );
  assert.ok(scripts['pass-393:module-19-submittal-backend-verification:gate']);
});
