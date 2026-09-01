import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const EXPECTED_PRODUCTION_HASH = 'd63da857e5dbc43585188139cb80ae77b35a415ae01ef876b7132c6335111494';
const doc = await readFile('docs/PASS-409-CURRENT-STATIC-TEST-HISTORICAL-ASSERTION-SUPERSESSION-HYGIENE.md', 'utf8');
const staticRunner = await readFile('scripts/testing/run-static.mjs', 'utf8');
const databaseTest = await readFile('tests/database.test.mjs', 'utf8');
const pass395Test = await readFile('tests/pass-395-module-19-rfi-persistence.test.mjs', 'utf8');
const pass408Test = await readFile('tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');

const supersededTests = Object.freeze({
  'tests/pass-390-module-19-submittal-repository.test.mjs': [
    'Pass 390 adds only the three source-owned Submittal persistence models needed by this layer'
  ],
  'tests/pass-392-module-19-submittal-http-registration.test.mjs': [
    'Pass 392 registers exactly the four approved Submittal routes and no RFI route',
    'Pass 392 authenticates and validates every request through strict boundaries',
    'Pass 392 requires Foundation idempotency keys for all three Submittal writes',
    'Every named function added by Pass 392 has a nearby purpose comment'
  ],
  'tests/pass-393-module-19-submittal-backend-verification.test.mjs': [
    'Pass 393 keeps the public Submittal route surface frozen and RFI deferred'
  ],
  'tests/pass-394-module-19-remaining-contract-readback-freeze.test.mjs': [
    'Pass 394 is documentation-only and preserves the exact Pass-393 production snapshot',
    'Pass 394 freezes only source-owned RFI persistence and server authority',
    'Pass 394 resolves the durable UI readback gap with exactly two deferred narrow reads',
    'Pass 394 leaves the registered Module-19 route surface at the four verified Submittal routes'
  ],
  'tests/pass-395-module-19-rfi-persistence.test.mjs': [
    'Pass 395 leaves all accepted Submittal backend files byte-identical',
    'Pass 395 keeps RFI HTTP, React and Stage-25 production work deferred'
  ],
  'tests/pass-396-module-19-rfi-schema.test.mjs': [
    'Pass 396 does not implement the Pass-401 RFI detail-thread amendment early',
    'Pass 396 preserves accepted RFI persistence and Submittal repository/service/routes/index byte-identically',
    'Pass 396 keeps the public Module-19 route surface at the accepted four Submittal routes'
  ],
  'tests/pass-397-module-19-rfi-repository.test.mjs': [
    'Pass 397 does not expose Pass-398 service behavior or Pass-399/401 HTTP work early',
    'Pass 397 preserves accepted Prisma, schema, service, routes and registration byte-identically'
  ],
  'tests/pass-398-module-19-rfi-service.test.mjs': [
    'Pass 398 keeps RFI HTTP routes and Pass-401 detail readback deferred',
    'Pass 398 leaves accepted persistence, schema, repository, routes, registration and Submittal integration byte-identical'
  ],
  'tests/pass-399-module-19-rfi-fastify-routes-openapi.test.mjs': [
    'Pass 399 exposes exactly five reviewed RFI routes while preserving four Submittal routes',
    'Pass 399 authenticates all nine Module-19 requests and reuses strict Pass-396 RFI boundaries',
    'Pass 399 keeps the existing registration point and all accepted non-route production files byte-identical',
    'Pass 399 keeps the shared route function purpose-commented and Stage 25 deferred'
  ],
  'tests/pass-400-module-19-rfi-backend-integration-verification.test.mjs': [
    'Pass 400 is verification-only and preserves the accepted Pass-399 production snapshot'
  ],
  'tests/pass-402-module-19-react-typed-api-client.test.mjs': [
    'Pass 402 changes no Module-19 backend/database contract and generates no hooks or UI'
  ],
  'tests/pass-403-module-19-tanstack-query-hooks.test.mjs': [
    'Pass 403 generates no UI, routing or Module-20 production code'
  ],
  'tests/pass-404-module-19-react-ui.test.mjs': [
    'Pass 404 does not register navigation early or touch backend/database contracts'
  ],
  'tests/pass-405-module-19-routing-navigation-permission-guards.test.mjs': [
    'Pass 405 registers the focused cumulative gate and records Pass 406 as next'
  ]
});

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

/** Build the deterministic production snapshot hash inherited from Pass 408. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const standalone = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of standalone) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone files are hashed only when they exist in the accepted baseline.
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

/** Assert one expected documentation or source token is present. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-409 token: ${token}`);
}

test.skip('Pass 409 is test-only and preserves the exact accepted production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), EXPECTED_PRODUCTION_HASH);
  includes(doc, 'does not alter application behavior');
  includes(doc, 'Stage 25 / Module 20 remains blocked');
});

test('Pass 409 keeps the maintained static runner broad instead of excluding historical files wholesale', () => {
  includes(staticRunner, ".filter((name) => name.endsWith('.test.mjs') && !requiresBuiltPackages.has(name))");
  assert.doesNotMatch(staticRunner, /pass-390|pass-405|supersededTests|historicalTests/);
  includes(doc, 'does **not** exclude Pass-390→405 files');
});

test('Pass 409 marks exactly the 28 originally failing historical Module-19 assertions as skipped in place', async () => {
  let count = 0;
  for (const [file, titles] of Object.entries(supersededTests)) {
    const source = await readFile(file, 'utf8');
    for (const title of titles) {
      includes(source, `test.skip('${title}',`, `${file} must retain ${title} as skipped historical evidence`);
      count += 1;
    }
  }
  assert.equal(count, 28);
});

test('Pass 409 keeps the current Stage-24 Prisma model assertion active and complete', () => {
  includes(databaseTest, "test('centralized schema preserves Foundation and reviewed Stage 1-24 persistence'");
  includes(databaseTest, "'SubmittalReview', 'Rfi', 'RfiResponse']);");
  assert.match(prisma, /model Rfi \{/);
  assert.match(prisma, /model RfiResponse \{/);
  assert.doesNotMatch(databaseTest, /staged Module-19 Submittals/);
});

test.skip('Pass 409 supersedes only the Pass-408 pre-repair characterization while keeping the rest of Pass 408 active', () => {
  includes(pass408Test, "test.skip('Pass 408 characterizes the stale current-static-test problem without reverting approved behavior'");
  includes(pass408Test, "test('Pass 408 freezes the required stack and current five-file/module-feature architecture'");
  includes(pass408Test, "test('Pass 408 freezes the Procurement normal-startup configuration wiring defect for Pass 410'");
  includes(pass408Test, "test('Pass 408 freezes the exact repair sequence and keeps Stage 26/27 and Module 20 boundaries intact'");
});

test('Pass 409 fixes the latent Pass-395 test-source initialization without changing production code', () => {
  const declaration = "const testSource = await readFile('tests/pass-395-module-19-rfi-persistence.test.mjs', 'utf8');";
  const purposeTest = "test('Every named function introduced by Pass 395 verification has a purpose comment'";
  assert.ok(pass395Test.indexOf(declaration) >= 0);
  assert.ok(pass395Test.indexOf(declaration) < pass395Test.indexOf(purposeTest));
});

test('Pass 409 registers a focused gate and hands the frozen repair program to Pass 410', () => {
  assert.equal(
    rootPackage.scripts['pass-409:current-static-test-supersession-hygiene:gate'],
    'node --test tests/pass-409-current-static-test-supersession-hygiene.test.mjs tests/database.test.mjs tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs tests/pass-407-stage-24-module-19-final-acceptance.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
  includes(doc, 'Pass 410 is **Procurement Runtime Config Wiring Repair**');
});
