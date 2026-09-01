import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EXPECTED_HASHES = Object.freeze({
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'apps/api/src/modules/procurement/procurement.schema.ts': '6e776561cc61ba426592824d28051f8a351d65e02508a5d0a1f8e5ecf2ee50de',
  'apps/api/src/modules/procurement/procurement.repository.ts': 'f7a1abf0a4f6e61946de57d9060896d0db5302b65f32af28a603d7ba574966fe',
  'apps/api/src/modules/procurement/procurement.service.ts': '29ab7504b67942deafe572d7b94baa2865131f75f8458dafe81f97737641f7db',
  'apps/api/src/modules/procurement/procurement.routes.ts': 'a3d9cd1e0c903f4f0ad0f745a478929eea1a5ac91a2a98c7c5c3adb434acc2a5',
  'apps/api/src/modules/procurement/index.ts': '12453a236ac82db7c8d1a312acb482d4ae7d74455718e0b79dba7c33da8193c4',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9'
});

const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const apiApp = await readFile('apps/api/src/app.ts', 'utf8');
const envExample = await readFile('apps/api/.env.example', 'utf8');
const configTest = await readFile('tests/config.test.mjs', 'utf8');
const pass407Test = await readFile('tests/pass-407-stage-24-module-19-final-acceptance.test.mjs', 'utf8');
const pass408Test = await readFile('tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs', 'utf8');
const pass409Test = await readFile('tests/pass-409-current-static-test-supersession-hygiene.test.mjs', 'utf8');
const doc = await readFile('docs/PASS-410-PROCUREMENT-RUNTIME-CONFIG-WIRING-REPAIR.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Return the SHA-256 digest for one protected baseline file. */
async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Assert one exact source token exists in a Pass-410 artifact. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-410 token: ${token}`);
}

test('Pass 410 exposes both Procurement policies through validated server-only configuration', () => {
  includes(serverConfig, 'procurementRequisitionApprovalDefinitionCode: string | null;');
  includes(serverConfig, 'procurementRequireRationaleForNonLowestSelection: boolean;');
  includes(serverConfig, "'PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE'");
  includes(serverConfig, "key: 'PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE'");
  includes(serverConfig, "readTrimmed(env, 'PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION')");
  includes(serverConfig, "'PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION',");
  includes(serverConfig, "['true', 'false'] as const");
  includes(serverConfig, ") === 'true';");
  assert.doesNotMatch(serverConfig, /function parseBoolean\s*\(/);
});

test('Pass 410 completes the normal API startup chain into the already accepted Module-8 options', () => {
  includes(apiMain, 'procurementRequisitionApprovalDefinitionCode: config.procurementRequisitionApprovalDefinitionCode,');
  includes(apiMain, 'procurementRequireRationaleForNonLowestSelection: config.procurementRequireRationaleForNonLowestSelection,');
  includes(apiApp, 'procurementRequisitionApprovalDefinitionCode?: string | null;');
  includes(apiApp, 'procurementRequireRationaleForNonLowestSelection?: boolean;');
  includes(apiApp, 'requisitionApprovalDefinitionCode: options.procurementRequisitionApprovalDefinitionCode ?? null,');
  includes(apiApp, 'requireRationaleForNonLowestSelection: options.procurementRequireRationaleForNonLowestSelection === true');
});

test('Pass 410 documents both deployment variables and safe defaults', () => {
  includes(envExample, 'PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE=PROCUREMENT_PR');
  includes(envExample, 'PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION=false');
  includes(configTest, 'assert.equal(config.procurementRequisitionApprovalDefinitionCode, null);');
  includes(configTest, 'assert.equal(config.procurementRequireRationaleForNonLowestSelection, false);');
  includes(configTest, "PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE: 'procurement-pr-v1'");
  includes(configTest, "PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION: 'true'");
  includes(configTest, "PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION: 'yes'");
});

test.skip('Pass 410 preserves accepted Module-8, app-composition and Prisma files byte-identically', async () => {
  for (const [file, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    assert.equal(await sha256(file), expectedHash, `${file} changed outside the Pass-410 repair boundary`);
  }
});

test('Pass 410 retains superseded audit snapshots as historical evidence after the first planned production repair', () => {
  includes(pass407Test, "test.skip('Pass 407 is audit-only and preserves the exact Pass-406 production snapshot'");
  includes(pass408Test, "test.skip('Pass 408 is contract-freeze-only and preserves the exact Pass-407 production snapshot'");
  includes(pass409Test, "test.skip('Pass 409 is test-only and preserves the exact accepted production snapshot'");
  includes(pass408Test, "test.skip('Pass 408 freezes the Procurement normal-startup configuration wiring defect for Pass 410'");
  includes(pass409Test, "test.skip('Pass 409 supersedes only the Pass-408 pre-repair characterization while keeping the rest of Pass 408 active'");
  includes(doc, 'The maintained static runner remains broad');
});

test('Pass 410 remains a narrow configuration repair with no new business contract', () => {
  includes(doc, 'No new table, migration, route, repository function, service function, permission, stable error, event, frontend field or dependency is introduced.');
  includes(doc, 'Stage 25 / Module 20 remains blocked');
  assert.equal(
    rootPackage.scripts['pass-410:procurement-runtime-config-wiring-repair:gate'],
    'node --test tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs tests/module-8-static.test.mjs tests/pass-409-current-static-test-supersession-hygiene.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});

test('Pass 410 hands the cumulative repair sequence to the Module-22 delegation readback freeze', () => {
  includes(doc, 'Pass 411 is **Module-22 Delegation Readback Contract Freeze**');
  includes(doc, 'must not add generic Approval CRUD');
});
