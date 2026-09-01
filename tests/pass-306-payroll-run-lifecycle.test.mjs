import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-306-PAYROLL-RUN-LIFECYCLE.md', 'utf8');
const sourceGapFreeze = await readFile('docs/PASS-303-STAGE-20-SOURCE-GAP-FREEZE.md', 'utf8');
const sourceIdentity = await readFile('docs/PASS-305-PAYROLL-SOURCE-CONSUMPTION-IDENTITY.md', 'utf8');
const approvalSchema = await readFile('apps/api/src/modules/approvals/approvals.schema.ts', 'utf8');
const approvalService = await readFile('apps/api/src/modules/approvals/approvals.service.ts', 'utf8');

test('Pass 306 freezes Company as the first Payroll-group identity and forbids overlapping inclusive periods', () => {
  assert.match(contract, /Payroll group identity = authenticated Company/);
  assert.match(contract, /\[period_start, period_end\]/);
  assert.match(contract, /period_start <= period_end/);
  assert.match(contract, /reject creation of another Payroll Run for the same Company when the inclusive date range overlaps/);
  assert.match(contract, /no `payroll_group_id`, Payroll-group table, group selector/);
  assert.match(sourceGapFreeze, /Payroll-run identity and overlap rule/);
});

test('Pass 306 freezes the minimal server-owned Payroll lifecycle without browser status authority', () => {
  for (const status of ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'FINALIZED']) {
    assert.ok(contract.includes(status), `Missing Payroll lifecycle state ${status}`);
  }
  assert.match(contract, /not browser-selectable values/);
  assert.match(contract, /does not add `REJECTED` or `RETURNED` as Payroll status tokens/);
  assert.match(contract, /FINALIZED.*immutable/s);
});

test('Pass 306 adds only a contract amendment for an explicit bodyless submit command', () => {
  assert.match(contract, /POST \/api\/v1\/hr\/payroll-runs\/:id\/submit/);
  assert.match(contract, /command is \*\*bodyless\*\*/);
  assert.match(contract, /requires an `Idempotency-Key`/);
  assert.match(contract, /reuses the existing `payroll\.calculate` authority/);
  assert.match(contract, /does not add the Fastify route yet/);
});

test('Pass 306 reuses Module 22 and keeps approval definition and approvers server-owned', () => {
  assert.match(contract, /resource type = payroll_run/);
  assert.match(contract, /resource id\s+= payroll_runs\.id/);
  assert.match(contract, /browser must never send an `approvalDefinitionCode`/);
  assert.match(contract, /Rejected\/returned attempts stay in Module-22 history/);
  assert.match(approvalSchema, /APPROVE/);
  assert.match(approvalSchema, /REJECT/);
  assert.match(approvalSchema, /RETURN/);
  assert.match(approvalService, /approvals\.act/);
});

test('Pass 306 separates submission, approval and finalization instead of overloading one command', () => {
  assert.match(contract, /recalculate\s+-> forbidden/);
  assert.match(contract, /finalize\s+-> forbidden until Module 22 is APPROVED/);
  assert.match(contract, /Finalize is a separate bodyless command after approval/);
  assert.match(contract, /Finalization must not create a new approval request/);
  assert.match(contract, /run is APPROVED/);
  assert.match(contract, /latest applicable Module-22 request is APPROVED/);
});

test('Pass 306 distinguishes draft, approval-snapshot and finalized source-consumption locks', () => {
  assert.match(contract, /Draft calculation/);
  assert.match(contract, /Approval snapshot lock/);
  assert.match(contract, /Final source-consumption lock/);
  assert.match(contract, /FINALIZED.*Company \+ source kind \+ source-line uniqueness/s);
  assert.match(sourceIdentity, /company_id[\s\S]*source_kind[\s\S]*source_line_id/);
  assert.match(contract, /browser must never send a Payroll lock flag/i);
});

test('Pass 306 does not destructively reopen finalized Payroll or pull Finance and Job Cost into the lifecycle pass', () => {
  assert.match(contract, /No destructive reopening of finalized Payroll/);
  assert.match(contract, /reopen finalized Payroll/);
  assert.match(contract, /Post Finance or Job Cost from this contract pass/);
  assert.match(contract, /Stage-20 versus Stage-26 Finance posting boundary/);
});

test('Pass 306 historically records a contract-only lifecycle boundary before Stage-20 persistence', () => {
  for (const phrase of [
    'Prisma models',
    'migrations',
    'database tables/relations',
    'repository functions',
    'service functions',
    'Fastify routes',
    'React runtime',
    'permission codes',
    'Payroll persistence',
    'Job-Cost posting',
    'Finance posting',
  ]) assert.ok(contract.includes(phrase), `Missing Pass-306 no-change boundary: ${phrase}`);
  assert.match(contract, /Pass 307 — Payroll calculation, exception, leave-effect and Workforce-policy scope contract/);
});
