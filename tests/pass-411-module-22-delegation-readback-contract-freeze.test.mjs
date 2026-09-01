import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const EXPECTED_PRODUCTION_HASH = 'ecad3f2be21ac22ca4d0ffef48cc0d383aefe7fe22d0a56ed84d858f802496a8';
const EXPECTED_MODULE_22_HASHES = Object.freeze({
  'apps/api/src/modules/approvals/approvals.schema.ts': '9cecd6e7fafe9991a41b1fe4c12a5306891cdff7df9e69b072da97f44878b387',
  'apps/api/src/modules/approvals/approvals.repository.ts': 'f6473e796d9b50d64f0710c046af997937def40d8d4c840b4d967c9b3b52ca8a',
  'apps/api/src/modules/approvals/approvals.service.ts': '40264bdec5f2a51650c52cf80bd66b695670769440793c9efaccc65686c1aaab',
  'apps/api/src/modules/approvals/approvals.routes.ts': '25cd8339c2880e0338c24594a0af65f05eb5ec0ae9b9ba2fb8309d88921c9c66',
  'apps/api/src/modules/approvals/index.ts': 'f84482361c084f239bb208ff310712331e7a758f7a3229ec7bec4b3e15d13331',
  'apps/web/src/features/approvals/api/approvals-api.ts': '7b7bb85f65408184c0f0cc009b78d96cf7bbd66d88048ecb0403992f7fd8c67e',
  'apps/web/src/features/approvals/hooks/approvals.ts': 'b15918f92512cfdcea562b3915561c9437a411767a61c426b6d3e50261fae845',
  'apps/web/src/features/approvals/components/approval-admin.tsx': '9095900a83c91b1ea346abd44794c55da810cafcd4f37dc5eb0c63be30941176',
  'apps/web/src/features/approvals/pages/approvals-page.tsx': '434ccafaa183c3433e0c9da949ec509b9c774f7ba097ad926fb8a6ad45b69641',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9'
});

const freeze = await readFile('docs/PASS-411-MODULE-22-DELEGATION-READBACK-CONTRACT-FREEZE.md', 'utf8');
const module22Contract = await readFile('docs/modules/approvals/STAGE-3-MODULE-22-CONTRACT.md', 'utf8');
const schema = await readFile('apps/api/src/modules/approvals/approvals.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/approvals/approvals.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/approvals/approvals.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/approvals/approvals.routes.ts', 'utf8');
const browserApi = await readFile('apps/web/src/features/approvals/api/approvals-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/approvals/hooks/approvals.ts', 'utf8');
const admin = await readFile('apps/web/src/features/approvals/components/approval-admin.tsx', 'utf8');
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

/** Build the deterministic production snapshot hash inherited from Pass 410. */
async function hashProductionSnapshot() {
  const files = [];
  for (const root of ['apps', 'packages', 'docker']) files.push(...await collectFiles(root));
  for (const file of ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs']) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone production files are hashed only when present.
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

/** Return the SHA-256 digest for one protected Module-22 production file. */
async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Assert one exact freeze token exists with a useful failure message. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-411 token: ${token}`);
}

test('Pass 411 freezes exactly one narrow read-only delegation amendment', () => {
  includes(freeze, 'GET /api/v1/approvals/delegations?page=1&pageSize=25');
  includes(freeze, 'After Pass 412, Module 22 may expose exactly eight public routes');
  includes(freeze, 'No other delegation route is approved by this freeze.');
  includes(freeze, 'page      optional positive integer, default 1');
  includes(freeze, 'pageSize  optional positive integer, default 25, maximum 100');
  includes(freeze, 'No `status`, `fromUserId`, `toUserId`, date-range, search, sort or free-form filter is added.');
});

test('Pass 411 reuses the existing permission and keeps server-owned Company scope', () => {
  includes(freeze, 'reuse the existing `approval_delegations.manage` permission');
  includes(freeze, 'derive `companyId` from trusted request security context');
  includes(freeze, 'No new permission such as `approval_delegations.read` is introduced.');
  includes(schema, "'approval_delegations.manage'");
  assert.doesNotMatch(schema, /approval_delegations\.read/);
});

test('Pass 411 freezes the minimum delegation response and stable repository order', () => {
  for (const token of ['id', 'fromUserId', 'toUserId', 'fromDate', 'toDate', 'resourceTypes[]', 'status', 'page', 'pageSize', 'total']) {
    includes(freeze, token);
  }
  includes(freeze, 'fromDate DESC');
  includes(freeze, 'id ASC');
  includes(freeze, '`companyId` is intentionally not returned.');
});

test('Pass 411 proves the reusable repository read already exists with Company scope and bounded pagination', () => {
  includes(repository, 'async listDelegationsForCompany(input: ListApprovalDelegationsRepositoryInput)');
  includes(repository, 'assertPageWindow(input);');
  includes(repository, 'const scope = requireCompanyRepositoryScope();');
  includes(repository, 'this.db.approvalDelegation.findMany');
  includes(repository, "orderBy: [{ fromDate: 'desc' }, { id: 'asc' }]");
  includes(repository, 'skip: input.skip');
  includes(repository, 'take: input.take');
  includes(repository, 'this.db.approvalDelegation.count({ where })');
});

test.skip('Pass 411 does not implement the frozen readback prematurely', () => {
  assert.doesNotMatch(routes, /app\.get\('\/api\/v1\/approvals\/delegations'/);
  assert.doesNotMatch(service, /async listDelegations\s*\(/);
  assert.doesNotMatch(browserApi, /export function listApprovalDelegations\s*\(/);
  assert.doesNotMatch(hooks, /export function useApprovalDelegations\s*\(/);
  assert.doesNotMatch(schema, /listApprovalDelegationsQuerySchema/);
  assert.match(admin, /useCreateApprovalDelegation/);
});

test.skip('Pass 411 preserves the source-era seven-route Module-22 contract before implementation', () => {
  includes(module22Contract, 'Exactly these seven public routes are exposed:');
  assert.equal((routes.match(/app\.(?:get|post|patch)\('/g) ?? []).length, 7);
  includes(routes, "app.post('/api/v1/approvals/delegations'");
});

test('Pass 411 explicitly forbids generic delegation CRUD and unnecessary production structure', () => {
  for (const token of [
    'GET /api/v1/approvals/delegations/:id',
    'PATCH/edit delegation',
    'DELETE delegation',
    'a new delegation status enum',
    'a new Prisma table, column, index or migration',
    'a new repository function',
    'a new permission, stable error or domain event',
    'a new backend helper/service file',
    'a new React feature folder or separate delegation component file'
  ]) includes(freeze, token);
});

test.skip('Pass 411 preserves every accepted Module-22 production file byte-identically', async () => {
  for (const [file, expectedHash] of Object.entries(EXPECTED_MODULE_22_HASHES)) {
    assert.equal(await sha256(file), expectedHash, `${file} changed during the Pass-411 contract freeze`);
  }
});

test.skip('Pass 411 preserves the exact Pass-410 production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), EXPECTED_PRODUCTION_HASH);
});

test('Pass 411 hands implementation to Pass 412 while keeping Module 20 blocked', () => {
  includes(freeze, 'Pass 412 is **Module 22 Delegation Readback Implementation**');
  includes(freeze, 'Stage 25 / Module 20 remains blocked');
  assert.equal(
    rootPackage.scripts['pass-411:module-22-delegation-readback-contract-freeze:gate'],
    'node --test tests/pass-411-module-22-delegation-readback-contract-freeze.test.mjs tests/module-22-static.test.mjs tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
