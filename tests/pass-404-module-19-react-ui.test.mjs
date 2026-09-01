import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const workspace = await readFile('apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx', 'utf8');
const page = await readFile('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx', 'utf8');
const styles = await readFile('apps/web/src/styles.css', 'utf8');
const doc = await readFile('docs/PASS-404-MODULE-19-ACCESSIBLE-PERMISSION-AWARE-REACT-UI.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const unchangedProductionFiles = Object.freeze({
  'apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts': '7759fe6c585315ef4f77a1bc62b9f0082b0bb378a9d1e437ca748e6bc1352c91',
  'apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts': '3ae26df774b8c87a6014f0723e99ce5ece591d6236e42588324cc5b9087c7e27',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b416e8fb63f462a18d63818f712d25b28e2a971ac84bcb4cfc76f96c433b61da',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'c9117d730a79fbe0c5f2077fd236e39c2db741b5bc648c934e8594e33dd4e71f',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': '555e62cc397ab16ea36980fdcc55ce200a2bd7368b67c36b6393b16d94c88e28',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'apps/web/src/main.tsx': 'e77a5500628d3d265707fd1d4ba8f9cedadf0d0e0ca4f0f389dbba5b6bd8ea01',
  'apps/web/src/features/administration/components/admin-shell.tsx': '9567dcebb52e228247c892825a3740ab0139040a669b1e84b137f9d4d3736691'
});

/** Assert one required Pass-404 source token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-404 token: ${token}`);
}

/** Calculate one regression hash for production that Pass 404 must not change. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 404 adds the focused Module-19 workspace and page only', async () => {
  await access('apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx');
  await access('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx');
  includes(workspace, 'export function RfiSubmittalsWorkspace(');
  includes(page, 'export function RfiSubmittalsPage(');
  includes(styles, '/* Module 19 - RFI & Submittals */');
  assert.match(doc, /RFI register\/detail\/thread|RFI register/);
  assert.match(doc, /Submittal register\/revision\/reviewer|Submittal revision package/);
});

test('Pass 404 consumes all eight reviewed Module-19 permissions without inventing permission codes', () => {
  for (const permission of [
    'rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close',
    'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
  ]) includes(page, `usePermission('${permission}')`);
  assert.doesNotMatch(page, /rfi\.reopen|submittals\.edit|submittals\.delete|rfi\.delete/);
});

test('Pass 404 renders the complete accepted RFI workflow and durable thread', () => {
  for (const hook of ['useRfis', 'useRfiDetails', 'useCreateRfi', 'useRespondRfi', 'useCloseRfi', 'useReopenRfi']) {
    includes(workspace, hook);
  }
  includes(workspace, 'RFI register');
  includes(workspace, 'RFI detail & response thread');
  includes(workspace, 'selectedRfi.responses.map');
  includes(workspace, "selectedRfi.status === 'OPEN'");
  includes(workspace, "selectedRfi.status === 'CLOSED'");
  includes(workspace, 'Overdue on this page');
  assert.doesNotMatch(workspace, /overdue:\s*|overdueOnly:/, 'Overdue must not be sent as a made-up server query parameter.');
});

test('Pass 404 keeps the RFI server status filter limited to OPEN and CLOSED', () => {
  includes(workspace, "useState<'' | RfiStatus>('')");
  includes(workspace, '<option value="OPEN">Open</option>');
  includes(workspace, '<option value="CLOSED">Closed</option>');
  assert.doesNotMatch(workspace, /RFI_(?:DRAFT|PENDING|ANSWERED|ARCHIVED)/);
});

test('Pass 404 renders Submittal register, revision package and append-only reviewer history', () => {
  for (const hook of ['useSubmittals', 'useSubmittalDetails', 'useCreateSubmittal', 'useSubmitSubmittal', 'useReviewSubmittal']) {
    includes(workspace, hook);
  }
  includes(workspace, 'Submittal register');
  includes(workspace, 'Submittal revision package & reviewer decision');
  includes(workspace, 'selectedSubmittal.revisions.map');
  includes(workspace, 'revision.reviews.map');
  includes(workspace, "hasStatus(selectedRevision.status, 'DRAFT')");
  includes(workspace, "hasStatus(selectedRevision.status, 'SUBMITTED')");
  assert.doesNotMatch(workspace, /type SubmittalStatus\s*=|z\.enum\(\[[^\]]*DRAFT[^\]]*SUBMITTED[^\]]*\]\)/s, 'Pass 404 must not invent a complete Submittal lifecycle enum.');
});

test('Pass 404 exposes only the four reviewed Submittal review decisions', () => {
  for (const decision of ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISE_RESUBMIT', 'REJECTED']) {
    includes(workspace, `value="${decision}"`);
  }
  assert.equal((workspace.match(/<option value="(?:APPROVED|APPROVED_WITH_COMMENTS|REVISE_RESUBMIT|REJECTED)"/g) ?? []).length, 4);
});

test('Pass 404 uses React Hook Form plus Zod for every Module-19 write payload', () => {
  includes(workspace, "import { useForm } from 'react-hook-form';");
  includes(workspace, "import { zodResolver } from '@hookform/resolvers/zod';");
  includes(workspace, "import { z } from 'zod';");
  for (const schema of [
    'createRfiSchema', 'respondRfiSchema', 'reopenRfiSchema',
    'createSubmittalSchema', 'submitSubmittalSchema', 'reviewSubmittalSchema'
  ]) includes(workspace, `zodResolver(${schema})`);
});

test('Pass 404 reuses Project membership and Module-18 navigation instead of inventing lookup or upload APIs', () => {
  includes(workspace, 'useProjects');
  includes(workspace, 'useProject');
  includes(workspace, 'projectDetailQuery.data?.members');
  includes(workspace, "hasStatus(member.status, 'ACTIVE')");
  includes(workspace, 'Open Document Management');
  includes(workspace, 'DocumentReference');
  assert.doesNotMatch(workspace, /listUsers|useUsers|useDocuments|uploadDocument|fetch\(/);
});

test('Pass 404 keeps durable server histories in TanStack Query detail data rather than local arrays', () => {
  assert.doesNotMatch(workspace, /useState<[^>]*(?:RfiResponse|SubmittalRevision|SubmittalReview)/);
  assert.doesNotMatch(workspace, /setResponses|setRevisions|setReviews/);
  includes(workspace, 'rfiDetailQuery.data');
  includes(workspace, 'submittalDetailQuery.data');
});

test('Pass 404 adds labelled, responsive and error-visible UI affordances', () => {
  includes(workspace, '<caption>RFI register for the selected Project</caption>');
  includes(workspace, '<caption>Submittal register for the selected Project</caption>');
  includes(workspace, 'role="alert"');
  includes(styles, '@media (max-width: 720px)');
  includes(styles, '.module19-form-grid');
  includes(styles, '.module19-summary-grid');
  includes(styles, 'overflow-wrap: anywhere;');
});

test.skip('Pass 404 does not register navigation early or touch backend/database contracts', async () => {
  for (const [file, expectedHash] of Object.entries(unchangedProductionFiles)) {
    assert.equal(await fileHash(file), expectedHash, `${file} changed unexpectedly in Pass 404`);
  }
  assert.doesNotMatch(workspace, /daily-reports|module-20/i);
  assert.doesNotMatch(page, /daily-reports|module-20/i);
  assert.match(doc, /router\/navigation registration/);
});

test('Pass 404 registers its focused cumulative gate', () => {
  assert.equal(
    packageJson.scripts['pass-404:module-19-react-ui:gate'],
    'node --test tests/pass-404-module-19-react-ui.test.mjs tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
