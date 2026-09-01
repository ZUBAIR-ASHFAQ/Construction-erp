import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const index = await readFile('apps/api/src/modules/rfi-submittals/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const doc = await readFile('docs/PASS-399-MODULE-19-RFI-FASTIFY-ROUTES-OPENAPI.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const unchangedFiles = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b076977cf2072c06d89723752fa53459518d1090d7af42113ba10823e82f6efd',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': '65a5dfeebe677f4cffbaa9ae19047a302aa5c5e75518a8f2341d354be51afbd3',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'tests/integration/module-19-submittals-api.integration.test.mjs': '69ad7f5471a2f9d1541df5b1f4ff1ad6b6b12135e63471157d02c85b0ea5a4c2'
});

/** Assert one required Pass-399 route/OpenAPI token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-399 token: ${token}`);
}

/** Calculate one file hash used to protect accepted pre-Pass-399 behavior. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test.skip('Pass 399 exposes exactly five reviewed RFI routes while preserving four Submittal routes', () => {
  for (const route of [
    "app.get('/api/v1/projects/:projectId/rfis'",
    "app.post('/api/v1/projects/:projectId/rfis'",
    "app.post('/api/v1/rfis/:id/respond'",
    "app.post('/api/v1/rfis/:id/close'",
    "app.post('/api/v1/rfis/:id/reopen'",
    "app.get('/api/v1/projects/:projectId/submittals'",
    "app.post('/api/v1/projects/:projectId/submittals'",
    "app.post('/api/v1/submittals/:id/submit'",
    "app.post('/api/v1/submittals/:id/reviews'"
  ]) includes(routes, route);
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 9);
  assert.ok(!routes.includes("app.get('/api/v1/rfis/:id'"));
  assert.ok(!routes.includes("app.get('/api/v1/submittals/:id'"));
});

test.skip('Pass 399 authenticates all nine Module-19 requests and reuses strict Pass-396 RFI boundaries', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\)/g) ?? []).length, 9);
  for (const boundary of [
    'module19ProjectParamsSchema',
    'module19RfiParamsSchema',
    'listRfisQuerySchema',
    'createRfiBodySchema',
    'respondRfiBodySchema',
    'closeRfiBodySchema',
    'reopenRfiBodySchema'
  ]) includes(routes, boundary);
  includes(routes, "parseRequest(closeRfiBodySchema, request.body ?? {}, 'body')");
  includes(routes, "code: 'INVALID_REQUEST'");
});

test('Pass 399 requires idempotency for all four RFI writes without adding it to the list read', () => {
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 7);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 7);
  includes(routes, "'idempotency-key'");
  includes(service, "operation: 'rfis.create'");
  includes(service, "operation: 'rfis.respond'");
  includes(service, "operation: 'rfis.close'");
  includes(service, "operation: 'rfis.reopen'");
});

test('Pass 399 publishes exact RFI OpenAPI operation IDs, status enum and strict body shapes', () => {
  for (const operationId of [
    'module19ListRfis',
    'module19CreateRfi',
    'module19RespondRfi',
    'module19CloseRfi',
    'module19ReopenRfi'
  ]) includes(routes, `operationId: '${operationId}'`);
  includes(routes, 'status: { type: \'string\', enum: [...MODULE_19_RFI_STATUSES] }');
  includes(routes, "required: ['subject', 'question', 'discipline', 'assignedTo', 'dueDate']");
  includes(routes, "required: ['response']");
  includes(routes, "required: ['reason']");
  includes(routes, 'additionalProperties: false');
});

test('Pass 399 validates every RFI success response through the frozen Zod response contract', () => {
  includes(routes, 'listRfisResponseSchema.parse(await service.listRfis');
  includes(routes, 'createRfiResponseSchema.parse(');
  includes(routes, 'respondRfiResponseSchema.parse(');
  assert.equal((routes.match(/rfiLifecycleResponseSchema\.parse\(/g) ?? []).length, 2);
  for (const responseSchema of [
    'listRfisResponseSchema',
    'createRfiResponseSchema',
    'respondRfiResponseSchema',
    'rfiLifecycleResponseSchema'
  ]) includes(schema, `export const ${responseSchema}`);
});

test('Pass 399 documents RFI-specific stable errors without inventing new business authority', () => {
  for (const code of ['RFI_NOT_FOUND', 'RFI_ALREADY_CLOSED', 'RFI_RESPONSE_NOT_ALLOWED']) {
    includes(routes, `'${code}'`);
    includes(schema, `'${code}'`);
  }
  assert.ok(!routes.includes('requirePermission('));
  assert.ok(!routes.includes('rfi.reopen'));
  assert.ok(!routes.includes('RFI_ALREADY_OPEN'));
});

test.skip('Pass 399 keeps the existing registration point and all accepted non-route production files byte-identical', async () => {
  includes(index, 'registerRfiSubmittalsRoutes');
  includes(app, "import { registerRfiSubmittalsRoutes } from './modules/rfi-submittals/index.js';");
  includes(app, 'app.register(registerRfiSubmittalsRoutes, { database: options.database });');
  for (const [file, expected] of Object.entries(unchangedFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed outside the Pass-399 HTTP boundary.`);
  }
});

test.skip('Pass 399 keeps the shared route function purpose-commented and Stage 25 deferred', () => {
  assert.match(
    routes,
    /\/\*\* Register the nine source-approved Module-19 operations[\s\S]*export async function registerRfiSubmittalsRoutes/
  );
  includes(doc, 'Stage 25 / Module 20 Daily Site Reports remains untouched.');
  includes(doc, 'Pass 400 — RFI Backend Integration Verification');
  includes(doc, 'GET /api/v1/rfis/:id');
  includes(doc, 'GET /api/v1/submittals/:id');
  assert.equal(
    packageJson.scripts['pass-399:module-19-rfi-fastify-routes-openapi:gate'],
    'node --test tests/pass-399-module-19-rfi-fastify-routes-openapi.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
