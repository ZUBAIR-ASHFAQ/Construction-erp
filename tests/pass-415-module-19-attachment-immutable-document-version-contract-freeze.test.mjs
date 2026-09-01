import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const EXPECTED_PRODUCTION_HASH = 'c5f30d17b5b171f5e6e84a997fc68295283fb68009c13c956e82a1cd0cf733c1';
const EXPECTED_PRODUCTION_FILE_COUNT = 451;
const EXPECTED_LOCKED_HASHES = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'apps/api/src/modules/documents/documents.repository.ts': '2ab66a2488366781bae54f6c7483137777fccbb06efbae850eb381c981048470',
  'apps/api/src/modules/documents/documents.service.ts': '682b7af4289fb4670bf6a172fd1b76451a09c323c9b04fe50abc4f0f176837f2',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b416e8fb63f462a18d63818f712d25b28e2a971ac84bcb4cfc76f96c433b61da',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'c9117d730a79fbe0c5f2077fd236e39c2db741b5bc648c934e8594e33dd4e71f',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': '555e62cc397ab16ea36980fdcc55ce200a2bd7368b67c36b6393b16d94c88e28',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts': '7759fe6c585315ef4f77a1bc62b9f0082b0bb378a9d1e437ca748e6bc1352c91',
  'apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts': '3ae26df774b8c87a6014f0723e99ce5ece591d6236e42588324cc5b9087c7e27',
  'apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx': 'b68f65226968ed7811b4d43d3a24a2d8dabe2c0e0b3a3bf0ae92f6eeaebce92c',
  'apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx': '808a457940fc069625b35d3df9e612d3402257c31e4c129fcfda1f846823edb9'
});

const freeze = await readFile('docs/PASS-415-MODULE-19-ATTACHMENT-IMMUTABLE-DOCUMENT-VERSION-CONTRACT-FREEZE.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const documentsRepository = await readFile('apps/api/src/modules/documents/documents.repository.ts', 'utf8');
const module19Schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const module19Repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const module19Service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const module19Routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const browserApi = await readFile('apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Collect every file below one production root using stable relative paths. */
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

/** Build the deterministic production snapshot hash inherited from Pass 414. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs']) files.push(file);
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.replaceAll(path.sep, '/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return { files, digest: hash.digest('hex') };
}

/** Hash one locked source file exactly as stored in the Pass-414 baseline. */
async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test.skip('Pass 415 keeps the complete Pass-414 production snapshot byte-identical', async () => {
  const snapshot = await hashProductionSnapshot();
  assert.equal(snapshot.files.length, EXPECTED_PRODUCTION_FILE_COUNT);
  assert.equal(snapshot.digest, EXPECTED_PRODUCTION_HASH);
});

test.skip('Pass 415 keeps every directly reviewed Module-18/19 production file byte-identical', async () => {
  for (const [file, expected] of Object.entries(EXPECTED_LOCKED_HASHES)) {
    assert.equal(await sha256File(file), expected, file);
  }
});

test('the current pre-Pass-416 RFI create contract still has no initial attachment field', () => {
  const createBlock = module19Schema.match(/export const createRfiBodySchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\);/)?.[1] ?? '';
  assert.doesNotMatch(createBlock, /attachmentDocumentIds/);
  assert.doesNotMatch(browserApi, /attachmentDocumentIds/);
});

test('the current response and revision persistence still records only Document header IDs', () => {
  assert.match(prisma, /model RfiResponse \{[\s\S]*?documentId\s+String\?/);
  assert.match(prisma, /model SubmittalRevision \{[\s\S]*?documentId\s+String\?/);
  assert.doesNotMatch(prisma, /documentVersionId/);
  assert.doesNotMatch(module19Repository, /documentVersionId/);
  assert.doesNotMatch(module19Service, /documentVersionId/);
});

test('Module 18 already owns immutable versions and the reviewed generic DocumentLink shape', () => {
  assert.match(prisma, /model DocumentVersion \{/);
  assert.match(prisma, /storageKey\s+String\s+@unique/);
  assert.match(prisma, /model DocumentLink \{/);
  assert.match(prisma, /linkedResourceType\s+String/);
  assert.match(prisma, /linkedResourceId\s+String/);
  assert.match(prisma, /relationType\s+String/);
  const linkBlock = prisma.match(/model DocumentLink \{([\s\S]*?)@@map\("document_links"\)/)?.[1] ?? '';
  assert.doesNotMatch(linkBlock, /documentVersionId|document_version_id/);
});

test('the existing retry-safe Company-scoped Document-link creator is available for Pass 416 reuse', () => {
  assert.match(documentsRepository, /async createDocumentLink\(input: CreateDocumentLinkRepositoryInput\)/);
  assert.match(documentsRepository, /const scope = requireCompanyRepositoryScope\(\)/);
  assert.match(documentsRepository, /if \(!error[\s\S]*?error\.code !== 'P2002'\) throw error/);
  assert.match(documentsRepository, /document: \{ companyId: scope\.companyId \}/);
});

test('the freeze authorizes only the existing Module-19 routes and no new public attachment route', () => {
  assert.match(freeze, /accepted Module-19 public route count remains \*\*11\*\*/);
  assert.match(freeze, /No new route is required/);
  assert.doesNotMatch(module19Routes, /\/attachments/);
});

test('the frozen initial RFI attachment shape uses DocumentLink rather than a new table', () => {
  assert.match(freeze, /attachmentDocumentIds\?: UUID\[\]/);
  assert.match(freeze, /linkedResourceType\s+= "rfi"/);
  assert.match(freeze, /linkedResourceId\s+= newly created RFI ID/);
  assert.match(freeze, /relationType\s+= "attachment"/);
  assert.match(freeze, /must reuse the existing Module-18 `DocumentLink` persistence/);
  assert.match(freeze, /No new table is authorized/);
});

test('the frozen immutable evidence is server-resolved for responses and submitted revisions', () => {
  assert.match(freeze, /browser must \*\*not\*\* supply `documentVersionId`/i);
  assert.match(freeze, /rfi_responses\.document_version_id\s+nullable UUID FK -> document_versions\.id/);
  assert.match(freeze, /submittal_revisions\.document_version_id\s+nullable UUID FK -> document_versions\.id/);
  assert.match(freeze, /resolve `currentVersion\.id` server-side/);
});

test('the freeze explicitly prohibits unsafe legacy version backfill', () => {
  assert.match(freeze, /must \*\*not\*\* backfill historical rows/i);
  assert.match(freeze, /legacy evidence whose exact historical version was not captured/);
  assert.match(freeze, /must not guess one/);
});

test('the freeze adds no permission, error, event, attachment subsystem or Module-20 work', () => {
  assert.match(freeze, /No new permission is introduced/);
  assert.match(freeze, /No new stable Module-19 error code is required/);
  assert.match(freeze, /No new domain event is introduced/);
  assert.match(freeze, /a new RFI attachment table/);
  assert.match(freeze, /Stage-25 \/ Module-20 production work/);
});

test('Pass 415 package gate is registered with current cumulative checks', () => {
  assert.equal(
    rootPackage.scripts['pass-415:module-19-attachment-immutable-document-version-contract-freeze:gate'],
    'node --test tests/pass-415-module-19-attachment-immutable-document-version-contract-freeze.test.mjs tests/pass-414-module-8-active-rfq-durable-readback.test.mjs tests/pass-413-module-10-durable-inventory-count-ui-readback.test.mjs tests/pass-412-module-22-delegation-readback-implementation.test.mjs tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
