import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const freeze = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000500_module_17_withdraw_history_repair/migration.sql', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const schema = await readFile('apps/api/src/modules/change-orders/change-orders.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/change-orders/change-orders.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/change-orders/change-orders.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/change-orders/change-orders.routes.ts', 'utf8');
const reactApi = await readFile('apps/web/src/features/change-orders/api/change-orders-api.ts', 'utf8');
const reactHooks = await readFile('apps/web/src/features/change-orders/hooks/change-orders.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/change-orders/components/change-orders-workspace.tsx', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Extract one frozen repair item by code. */
function repairItem(code) {
  const start = freeze.indexOf(`### ${code}`);
  const next = freeze.indexOf('\n### ', start + 1);
  return freeze.slice(start, next === -1 ? freeze.length : next);
}

/** Extract one Prisma model for focused persistence assertions. */
function model(name) {
  return prisma.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

test('Pass 377 closes only M17-01 and preserves later policy/integration boundaries', () => {
  assert.match(repairItem('M17-01'), /IMPLEMENTED_PASS_377/);
  assert.match(repairItem('M17-02'), /POLICY_REQUIRED/);
  assert.match(repairItem('M17-03'), /DEFER_STAGE_27/);
});

test('Pass 377 stores withdrawal evidence on the existing Change Request instead of adding a business table', () => {
  const changeRequest = model('ChangeRequest');
  assert.match(changeRequest, /withdrawReason\s+String\?/);
  assert.match(changeRequest, /withdrawnBy\s+String\?/);
  assert.match(changeRequest, /withdrawnAt\s+DateTime\?/);
  assert.match(changeRequest, /withdrawer\s+User\?/);
  assert.doesNotMatch(prisma, /model ChangeRequestWithdrawal/);
});

test('Pass 377 migration enforces Company-safe actor linkage and terminal immutable withdrawal history', () => {
  assert.match(migration, /ADD COLUMN "withdraw_reason" TEXT/);
  assert.match(migration, /ADD COLUMN "withdrawn_by" UUID/);
  assert.match(migration, /ADD COLUMN "withdrawn_at" TIMESTAMPTZ/);
  assert.match(migration, /FOREIGN KEY \("withdrawn_by", "company_id"\)/);
  assert.match(migration, /REFERENCES "users"\("id", "company_id"\)/);
  assert.match(migration, /"status" = 'WITHDRAWN'/);
  assert.match(migration, /protect_withdrawn_change_request/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "change_requests"/);
});

test('Pass 377 migration gate remains registered after later Stage-24 work', () => {
  const gate = gates.gates.find((entry) => entry.gate === 'post-stage-23-module-17-withdraw-history-repair');
  assert.equal(gate.stage, 23);
  assert.equal(gate.gate, 'post-stage-23-module-17-withdraw-history-repair');
  assert.deepEqual(gate.migrations, ['20260827000500_module_17_withdraw_history_repair']);
});

test('Pass 377 adds one strict reason-bearing withdraw contract without new permission/error/event vocabulary', () => {
  assert.match(schema, /route: '\/api\/v1\/change-orders\/requests\/:id\/withdraw'/);
  assert.match(schema, /withdrawChangeRequestBodySchema = z\.object\(\{[\s\S]*reason: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2000\)/);
  assert.equal((schema.match(/'changes\./g) ?? []).length, 6);
  assert.doesNotMatch(schema, /changes\.withdraw/);
  assert.doesNotMatch(schema, /change_request\.withdrawn'/);
});

test('Pass 377 repository persists only terminal withdrawal fields after scope checks', () => {
  assert.match(repository, /async withdrawChangeRequest\(/);
  assert.match(repository, /isProjectVisible\(input\.projectId, input\.visibility\)/);
  assert.match(repository, /withdrawReason: input\.withdrawReason/);
  assert.match(repository, /withdrawnBy: input\.withdrawnBy/);
  assert.match(repository, /withdrawnAt: input\.withdrawnAt/);
});

test('Pass 377 service permits only DRAFT or SUBMITTED withdrawal and applies no downstream target work', () => {
  const section = service.slice(service.indexOf('async withdrawChangeRequest('), service.indexOf('/** Read one formal Change Order'));
  assert.match(section, /'changes\.submit'/);
  assert.match(section, /CHANGE_REQUEST_DRAFT/);
  assert.match(section, /CHANGE_REQUEST_SUBMITTED/);
  assert.match(section, /CHANGE_REQUEST_WITHDRAWN/);
  assert.match(section, /operation: 'change-orders\.request-withdraw'/);
  assert.match(section, /action: 'change_request\.withdrawn'/);
  assert.doesNotMatch(section, /recordOutboxEvent|applyApprovedChangeOrder|createChangeOrder|createChangeOrderImpacts/);
});

test('Pass 377 HTTP route remains authenticated idempotent and reason-only', () => {
  const section = routes.slice(routes.indexOf("app.post('/api/v1/change-orders/requests/:id/withdraw'"), routes.indexOf("app.get('/api/v1/change-orders/:id/impact'"));
  assert.match(section, /operationId: 'module17WithdrawChangeRequest'/);
  assert.match(section, /headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/);
  assert.match(section, /body: WITHDRAW_BODY_JSON_SCHEMA/);
  assert.match(section, /await authenticateRequest\(request, options\.database\)/);
  assert.match(section, /readIdempotencyKey\(request\)/);
  assert.doesNotMatch(section, /companyId|actorUserId|withdrawnBy|withdrawnAt/);
});

test('Pass 377 exposes durable withdrawal evidence and action in the existing React feature', () => {
  assert.match(reactApi, /withdrawReason: string \| null/);
  assert.match(reactApi, /withdrawnBy: string \| null/);
  assert.match(reactApi, /withdrawnAt: string \| null/);
  assert.match(reactApi, /export function withdrawChangeRequest\(/);
  assert.match(reactHooks, /export function useWithdrawChangeRequest\(/);
  assert.match(workspace, /Withdraw Change Request/);
  assert.match(workspace, /Withdrawal history/);
  assert.match(workspace, /selectedRequest\.status === 'WITHDRAWN'/);
});

test('Pass 377 keeps the gate focused on Module 17 repair plus historical regression', () => {
  assert.equal(
    rootPackage.scripts['pass-377:module-17-withdraw-history:gate'],
    'node --test tests/pass-377-module-17-withdraw-history.test.mjs tests/module-17-static.test.mjs'
  );
});
