import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const backendDir = 'apps/api/src/modules/tendering-estimation';
const schema = await readFile(`${backendDir}/tendering-estimation.schema.ts`, 'utf8');
const repository = await readFile(`${backendDir}/tendering-estimation.repository.ts`, 'utf8');
const service = await readFile(`${backendDir}/tendering-estimation.service.ts`, 'utf8');
const httpRoutes = await readFile(`${backendDir}/tendering-estimation.routes.ts`, 'utf8');
const moduleIndex = await readFile(`${backendDir}/index.ts`, 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const main = await readFile('apps/api/src/main.ts', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const integrationTest = await readFile('tests/integration/module-3-api.integration.test.mjs', 'utf8');
const webApiSource = await readFile('apps/web/src/features/tendering-estimation/api/tendering-estimation-api.ts', 'utf8');
const webHooksSource = await readFile('apps/web/src/features/tendering-estimation/hooks/tendering-estimation.ts', 'utf8');
const webDetailsSource = await readFile('apps/web/src/features/tendering-estimation/components/tender-details-panel.tsx', 'utf8');
const webEstimateWorkspaceSource = await readFile('apps/web/src/features/tendering-estimation/components/estimate-workspace.tsx', 'utf8');
const webPageSource = await readFile('apps/web/src/features/tendering-estimation/pages/tenders-page.tsx', 'utf8');
const adminShellSource = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const browserE2eSource = await readFile('tests/e2e/module-3-browser.spec.mjs', 'utf8');
const playwrightConfigSource = await readFile('playwright.config.mjs', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const module3GateSource = await readFile('scripts/module-3/verify-stage-5.mjs', 'utf8');
const module3LiveAcceptanceSource = await readFile('scripts/module-3/run-live-acceptance.mjs', 'utf8');

const permissions = [
  'tenders.read',
  'tenders.create',
  'estimates.edit',
  'tenders.submit',
  'tenders.manage_outcome'
];
const errors = [
  'TENDER_NOT_FOUND',
  'DUPLICATE_TENDER_NUMBER',
  'ESTIMATE_VERSION_LOCKED',
  'TENDER_NOT_READY_FOR_SUBMISSION',
  'INVALID_TENDER_TRANSITION',
  'ESTIMATE_VERSION_NOT_FOUND'
];
const events = [
  'tender.created',
  'estimate.version_created',
  'tender.submitted',
  'tender.won',
  'tender.lost'
];
const routes = [
  '/api/v1/tenders',
  '/api/v1/tenders/:id',
  '/api/v1/tenders/:id/estimates',
  '/api/v1/tenders/:id/estimates/:versionId',
  '/api/v1/tenders/:id/estimates/:versionId/finalize',
  '/api/v1/tenders/:id/submit',
  '/api/v1/tenders/:id/outcome'
];

// Keep Module 3 at exactly the reviewed five-file backend structure after route registration.
test('Module 3 contains exactly the reviewed five backend files', async () => {
  assert.deepEqual((await readdir(backendDir)).sort(), [
    'index.ts',
    'tendering-estimation.repository.ts',
    'tendering-estimation.routes.ts',
    'tendering-estimation.schema.ts',
    'tendering-estimation.service.ts'
  ]);
});

// Keep the source-defined permissions, errors, events and reconciled route set stable for later layers.
test('Module 3 schema exports the frozen Stage-5 stable contracts', () => {
  for (const value of [...permissions, ...errors, ...events, ...routes]) {
    assert.ok(schema.includes(`'${value}'`), value);
  }
  assert.match(schema, /MODULE_3_MAX_PAGE_SIZE = 100/);
});

// Keep Tender, Estimate and Submission lifecycle values aligned with the frozen contract and migration checks.
test('Module 3 schema keeps the approved lifecycle enums', () => {
  assert.match(schema, /tenderStatusSchema = z\.enum\(\['DRAFT', 'SUBMITTED', 'WON', 'LOST', 'CANCELLED'\]\)/);
  assert.match(schema, /'PENDING_APPROVAL',[\s\S]*'FINAL',[\s\S]*'APPROVED',[\s\S]*'REJECTED',[\s\S]*'RETURNED'/);
  assert.match(schema, /tenderSubmissionOutcomeSchema = z\.enum\(\['PENDING', 'WON', 'LOST', 'CANCELLED'\]\)/);
  assert.match(schema, /tenderOutcomeTargetSchema = z\.enum\(\['WON', 'LOST', 'CANCELLED'\]\)/);
});

// Verify every Stage-5 public request boundary has an explicit strict Zod schema.
test('Module 3 provides the required request, query and reconciliation schemas', () => {
  for (const name of [
    'tenderIdParamsSchema',
    'tenderEstimateVersionParamsSchema',
    'listTendersQuerySchema',
    'createTenderBodySchema',
    'estimateItemInputSchema',
    'createEstimateVersionBodySchema',
    'updateDraftEstimateBodySchema',
    'finalizeEstimateBodySchema',
    'submitTenderBodySchema',
    'recordTenderOutcomeBodySchema'
  ]) {
    assert.match(schema, new RegExp(`export const ${name} = z\\.object\\(`), name);
  }
  assert.ok((schema.match(/\}\)\.strict\(\)/g) ?? []).length >= 10);
});

// Keep tenant, actor, permission, calculated totals and lifecycle authority off public request bodies.
test('Module 3 public schemas do not accept server-owned authority or calculated fields', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'directCost',
    'tenderTotal',
    'submittedBy',
    'submittedAt',
    'submittedAmount',
    'versionNo'
  ]) {
    assert.doesNotMatch(schema, new RegExp(`\\b${field}\\s*:`), field);
  }

  const createTender = schema.slice(
    schema.indexOf('export const createTenderBodySchema'),
    schema.indexOf('/** One decimal-safe estimate worksheet row')
  );
  assert.doesNotMatch(createTender, /\bstatus\s*:/);
});

// Keep financial and quantity values decimal strings so JavaScript binary floating point never becomes the API contract.
test('Module 3 validates money and quantity as bounded non-negative decimal strings', () => {
  assert.match(schema, /money must be a non-negative decimal string/);
  assert.match(schema, /quantity must be a non-negative decimal string/);
  assert.match(schema, /laborCost: moneySchema/);
  assert.match(schema, /materialCost: moneySchema/);
  assert.match(schema, /equipmentCost: moneySchema/);
  assert.match(schema, /subcontractCost: moneySchema/);
  assert.match(schema, /otherCost: moneySchema/);
  assert.match(schema, /indirectCost: moneySchema/);
  assert.match(schema, /contingency: moneySchema/);
  assert.match(schema, /markup: moneySchema/);
});

// Keep tender list reads bounded and date windows validated before repository logic runs.
test('Module 3 validates pagination and tender-register filters at the boundary', () => {
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(MODULE_3_MAX_PAGE_SIZE\)/);
  assert.match(schema, /clientId: uuidSchema\.optional\(\)/);
  assert.match(schema, /ownerUserId: uuidSchema\.optional\(\)/);
  assert.match(schema, /dueFrom: dateSchema\.optional\(\)/);
  assert.match(schema, /dueTo: dateSchema\.optional\(\)/);
  assert.match(schema, /dueFrom must be before or equal to dueTo/);
});

// Keep the approved command semantics explicit: finalize is bodyless, submit chooses only the estimate and validity date.
test('Module 3 keeps finalize bodyless and submission server-owned', () => {
  assert.match(schema, /finalizeEstimateBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /submitTenderBodySchema = z\.object\(\{[\s\S]*estimateVersionId: uuidSchema,[\s\S]*validityDate: dateSchema/);
  assert.match(schema, /recordTenderOutcomeBodySchema = z\.object\(\{[\s\S]*outcome: tenderOutcomeTargetSchema/);
});

// Keep currency normalized at the API boundary while the database retains its three-letter uppercase check.
test('Module 3 normalizes tender currency to a three-letter uppercase value', () => {
  assert.match(schema, /\.transform\(\(value\) => value\.toUpperCase\(\)\)/);
  assert.match(schema, /\^\[A-Z\]\{3\}\$/);
});

// Keep stable Tendering business conflicts mapped through shared public error classes.
test('Module 3 exposes one simple stable error factory for later service logic', () => {
  assert.match(schema, /export function createModule3Error\(code: Module3ErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ConflictError/);
});


// Keep the repository surface small and aligned with the complete Stage-5 service workflow.
test('Module 3 repository exposes only the persistence methods needed by Stage-5 service commands', () => {
  for (const name of [
    'listTenders',
    'findTenderById',
    'findTenderByNumber',
    'lockTenderForWrite',
    'findClientById',
    'findOpportunityById',
    'findActiveUserById',
    'createTender',
    'updateTenderStatus',
    'listEstimateVersions',
    'findEstimateVersionById',
    'lockEstimateVersionForWrite',
    'findLatestEstimateVersion',
    'createEstimateVersion',
    'updateEstimateVersion',
    'listEstimateItems',
    'replaceEstimateItems',
    'findTenderSubmission',
    'createTenderSubmission',
    'updateTenderSubmissionOutcome'
  ]) {
    assert.match(repository, new RegExp(`async ${name}\\(`), name);
  }

  assert.doesNotMatch(repository, /async (create|update|delete)EstimateItem\(/);
});

// Keep all company-owned Tender reads/writes scoped from trusted request context, never a caller company id.
test('Module 3 repository derives tenant ownership from the shared company repository scope', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /data: scope\.createData\(\{/);
  assert.match(repository, /where: scope\.where\(\{ id \}\)/);
  assert.doesNotMatch(repository, /companyId:\s*input\./);
});

// Child tables have no company_id, so every child read/write guard must traverse a company-owned Tender.
test('Module 3 repository company-scopes estimate and submission records through Tender ownership', () => {
  assert.ok((repository.match(/tender: \{ companyId: scope\.companyId \}/g) ?? []).length >= 8);
  assert.match(repository, /estimateVersion:\s*\{[\s\S]*tenderId,[\s\S]*tender: \{ companyId: scope\.companyId \}/);
  const submissionMethod = repository.slice(
    repository.indexOf('async createTenderSubmission'),
    repository.indexOf('/** Update the immutable submission')
  );
  assert.match(submissionMethod, /id: input\.estimateVersionId/);
  assert.match(submissionMethod, /tenderId: input\.tenderId/);
  assert.match(submissionMethod, /tender: \{ companyId: scope\.companyId \}/);
});

// Preserve bounded pagination and indexed Tender filters at the repository boundary.
test('Module 3 repository keeps Tender list pagination bounded and uses the reviewed filters', () => {
  assert.match(repository, /input\.take > MODULE_3_MAX_PAGE_SIZE/);
  for (const field of ['status', 'clientId', 'ownerUserId', 'dueFrom', 'dueTo']) {
    assert.ok(repository.includes(`input.${field}`), field);
  }
  assert.match(repository, /tenderNo: \{ contains: search/);
  assert.match(repository, /title: \{ contains: search/);
});

// Keep lifecycle decisions, permission checks, audit/outbox and transaction ownership out of the repository.
test('Module 3 repository remains persistence-only and transaction-compatible', () => {
  assert.match(repository, /type RepositoryClient = DatabaseClient \| TransactionClient/);
  assert.doesNotMatch(repository, /hasPermission|AuthorizationError|audit|outbox|withTransaction|\$transaction/);
  assert.doesNotMatch(repository, /VALID_TENDER|ALLOWED_TRANSITION|calculate|requestApproval/);
});

// Draft replacement is one repository operation so the service can execute it inside its own atomic transaction.
test('Module 3 repository replaces estimate worksheet rows without exposing generic item CRUD', () => {
  assert.match(repository, /async replaceEstimateItems\(/);
  assert.match(repository, /estimateItem\.deleteMany/);
  assert.match(repository, /estimateItem\.createMany/);
  assert.match(repository, /parentId: null/);
});

// Tender and estimate lifecycle commands serialize on the company-owned rows they mutate.
test('Module 3 repository provides simple company-scoped row locks for lifecycle commands', () => {
  assert.match(repository, /async lockTenderForWrite\(tenderId: string\)/);
  assert.match(repository, /FROM tenders[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(repository, /async lockEstimateVersionForWrite\(tenderId: string, versionId: string\)/);
  assert.match(repository, /FROM estimate_versions ev[\s\S]*FOR UPDATE OF ev/);
});

// Pass 114 completes the reviewed Module 3 service commands while routes remain deferred.
test('Module 3 service now implements Tender creation, estimate lifecycle, submission and outcome commands', () => {
  assert.match(service, /export class TenderingEstimationService/);
  assert.match(service, /async createTender\(input: CreateTenderBody\)/);
  assert.match(service, /async createEstimateVersion\(tenderId: string, input: CreateEstimateVersionBody\)/);
  assert.match(service, /async updateDraftEstimate\(tenderId: string, versionId: string, input: UpdateDraftEstimateBody\)/);
  assert.match(service, /async finalizeEstimate\(tenderId: string, versionId: string\)/);
  assert.match(service, /async submitTender\(tenderId: string, input: SubmitTenderBody\)/);
  assert.match(service, /async recordTenderOutcome\(tenderId: string, input: RecordTenderOutcomeBody\)/);
});

// Sensitive Tender creation must be authorized again at service level rather than relying only on future HTTP routes.
test('Module 3 Tender creation requires the stable tenders.create permission', () => {
  assert.match(service, /hasPermission\(permission\)/);
  assert.match(service, /new AuthorizationError\(\)/);
  assert.match(service, /this\.requirePermission\('tenders\.create'\)/);
});

// Related CRM/User records must be usable and company-scoped before the Tender write occurs.
test('Module 3 Tender creation validates client, opportunity and owner business relationships', () => {
  assert.match(service, /findClientById\(input\.clientId\)/);
  assert.match(service, /client\.status !== CLIENT_ACTIVE/);
  assert.match(service, /findOpportunityById\(input\.opportunityId\)/);
  assert.match(service, /opportunity\.clientId !== input\.clientId/);
  assert.match(service, /TENDERABLE_OPPORTUNITY_STAGES/);
  assert.match(service, /'QUALIFIED'/);
  assert.match(service, /'TENDERING'/);
  assert.match(service, /findActiveUserById\(input\.ownerUserId\)/);
  assert.match(service, /new ValidationError/);
});

// New Tender lifecycle state, company and actor authority remain server-owned.
test('Module 3 Tender creation starts DRAFT and does not accept client-owned authority', () => {
  assert.match(service, /status: TENDER_DRAFT/);
  assert.match(service, /const TENDER_DRAFT = 'DRAFT'/);
  assert.doesNotMatch(service, /companyId:\s*input\./);
  assert.doesNotMatch(service, /actorUserId:\s*input\./);
  assert.doesNotMatch(service, /permissions:\s*input\./);
  assert.doesNotMatch(service, /projectScope:\s*input\./);
});

// Business state, audit and event durability must share one database transaction.
test('Module 3 Tender creation commits Tender, audit and tender.created outbox atomically', () => {
  assert.match(service, /withTransaction\(this\.db, async \(tx\) =>/);
  assert.match(service, /new TenderingEstimationRepository\(tx\)/);
  assert.match(service, /recordAudit\(tx, \{/);
  assert.match(service, /action: 'tender\.created'/);
  assert.match(service, /recordOutboxEvent\(tx, \{/);
  assert.match(service, /eventType: 'tender\.created'/);
  assert.match(service, /resourceType: 'tender'/);
});

// Both the friendly pre-check and the database unique race must expose the same stable business code.
test('Module 3 Tender creation maps duplicate tender numbers to one stable conflict', () => {
  assert.match(service, /findTenderByNumber\(input\.tenderNo\)/);
  assert.ok((service.match(/createModule3Error\('DUPLICATE_TENDER_NUMBER'\)/g) ?? []).length >= 2);
  assert.match(service, /error\.code === 'P2002'/);
});

// Keep version numbering deterministic under concurrent creates by serializing on the company-owned Tender row.
test('Module 3 serializes estimate version-number allocation inside the service transaction', () => {
  assert.match(service, /lockTenderForWrite\(tenderId\)/);
  assert.match(service, /const versionNo = \(latest\?\.versionNo \?\? 0\) \+ 1/);
  assert.match(service, /versionNo,[\s\S]*status: ESTIMATE_DRAFT/);
});

// Financial totals must use exact decimal-string arithmetic and remain server-owned.
test('Module 3 calculates direct cost and tender total with exact integer minor-unit arithmetic', () => {
  assert.match(service, /function moneyToMinorUnits\(value: string\): bigint/);
  assert.match(service, /BigInt\(whole\) \* 100n/);
  assert.match(service, /function calculateEstimateTotals\(input: EstimateDraftInput\)/);
  for (const field of ['laborCost', 'materialCost', 'equipmentCost', 'subcontractCost', 'otherCost']) {
    assert.ok(service.includes(`item.${field}`), field);
  }
  assert.match(service, /moneyToMinorUnits\(input\.indirectCost\)/);
  assert.match(service, /moneyToMinorUnits\(input\.contingency\)/);
  assert.match(service, /moneyToMinorUnits\(input\.markup\)/);
  assert.match(service, /MAX_MONEY_MINOR_UNITS/);
  assert.doesNotMatch(service, /parseFloat|parseInt\(|Number\(input\.(indirectCost|contingency|markup)/);
});

// Estimate creation must derive actor/version/status/totals server-side and persist worksheet, audit and source event atomically.
test('Module 3 creates one audited DRAFT estimate version with the approved source event', () => {
  assert.match(service, /this\.requirePermission\('estimates\.edit'\)/);
  assert.match(service, /const actorUserId = requireActorUserId\(\)/);
  assert.match(service, /createEstimateVersion\(\{[\s\S]*createdBy: actorUserId/);
  assert.match(service, /replaceEstimateItems\(tenderId, estimate\.id, input\.items\)/);
  assert.match(service, /action: 'estimate\.version_created'/);
  assert.match(service, /eventType: 'estimate\.version_created'/);
  assert.match(service, /resourceType: 'estimate_version'/);
});

// Draft edits must lock the estimate, reject immutable states, replace items and audit commercial changes without inventing an event.
test('Module 3 updates only locked DRAFT estimates and emits no estimate-update outbox event', () => {
  assert.match(service, /lockEstimateVersionForWrite\(tenderId, versionId\)/);
  assert.match(service, /lockedVersion\.status !== ESTIMATE_DRAFT/);
  assert.match(service, /createModule3Error\('ESTIMATE_VERSION_LOCKED'\)/);
  assert.match(service, /updateEstimateVersion\(tenderId, versionId, ESTIMATE_DRAFT/);
  assert.match(service, /action: 'estimate\.commercial_updated'/);
  assert.doesNotMatch(service, /eventType: 'estimate\.(updated|commercial_updated|finalized)'/);
});

// Finalization is service-authorized and locks the Tender and estimate before choosing the server-owned target state.
test('Module 3 finalizes only a locked DRAFT estimate while its Tender is still DRAFT', () => {
  const method = service.slice(service.indexOf('async finalizeEstimate'), service.indexOf('/** Submit one immutable'));
  assert.match(method, /this\.requirePermission\('estimates\.edit'\)/);
  assert.match(method, /lockTenderForWrite\(tenderId\)/);
  assert.match(method, /lockedTender\.status !== TENDER_DRAFT/);
  assert.match(method, /lockEstimateVersionForWrite\(tenderId, versionId\)/);
  assert.match(method, /lockedVersion\.status !== ESTIMATE_DRAFT/);
  assert.match(method, /targetStatus = this\.approvalDefinitionCode \? ESTIMATE_PENDING_APPROVAL : ESTIMATE_FINAL/);
  assert.match(method, /action: 'estimate\.finalized'/);
});

// Approval routing is optional, server-configured, transaction-aware and idempotently keyed by the immutable estimate identity.
test('Module 3 reuses Module 22 transaction-aware approval requests without browser-selected workflow authority', () => {
  assert.match(service, /type TenderingEstimationServiceOptions = Readonly<\{[\s\S]*approvalDefinitionCode\?: string \| null/);
  assert.match(service, /ApprovalsService, type RequestApprovalInput/);
  assert.match(service, /requestApprovalInTransaction\(/);
  assert.match(service, /resourceType: 'estimate_version'/);
  assert.match(service, /sourceModule: 'tendering-estimation'/);
  assert.match(service, /sourceType: 'estimate-finalization'/);
  assert.match(service, /sourceId: estimate\.id/);
  assert.doesNotMatch(schema, /approvalDefinitionCode\s*:/);
});

// Approval snapshots keep money as strings so cross-module workflow data does not introduce binary-float precision loss.
test('Module 3 sends an immutable decimal-string estimate summary to Module 22', () => {
  const helper = service.slice(service.indexOf('function buildEstimateApprovalInput'), service.indexOf('/** Map a terminal Module 22'));
  for (const field of ['directCost', 'indirectCost', 'contingency', 'markup', 'tenderTotal']) {
    assert.match(helper, new RegExp(`${field}: estimate\\.${field}\\.toString\\(\\)`), field);
  }
  assert.match(helper, /versionNo: estimate\.versionNo/);
  assert.match(helper, /currency: tender\.currency/);
});

// Submission must be authorized, require an active client/actor and use only FINAL/APPROVED estimates.
test('Module 3 submission enforces stable permission and reviewed readiness rules', () => {
  const method = service.slice(service.indexOf('async submitTender'), service.indexOf('/** Record one reviewed'));
  assert.match(method, /this\.requirePermission\('tenders\.submit'\)/);
  assert.match(method, /requireActorUserId\(\)/);
  assert.match(method, /lockTenderForWrite\(tenderId\)/);
  assert.match(method, /lockedTender\.status !== TENDER_DRAFT/);
  assert.match(method, /findClientById\(tender\.clientId\)/);
  assert.match(method, /client\.status !== CLIENT_ACTIVE/);
  assert.match(method, /findActiveUserById\(actorUserId\)/);
  assert.match(method, /isSubmittableEstimateStatus\(estimate\.status\)/);
  assert.match(service, /SUBMITTABLE_ESTIMATE_STATUSES = Object\.freeze\(\[ESTIMATE_FINAL, ESTIMATE_APPROVED\]/);
});

// Terminal approval results are applied to the owning estimate before submission readiness is decided.
test('Module 3 consumes APPROVED/REJECTED/RETURNED Module 22 results without inventing estimate events', () => {
  assert.match(service, /function estimateStatusFromApproval\(status: string\)/);
  for (const value of ['APPROVED', 'REJECTED', 'RETURNED']) assert.ok(service.includes(`'${value}'`), value);
  assert.match(service, /estimate\.status !== ESTIMATE_PENDING_APPROVAL \|\| !this\.approvalDefinitionCode/);
  assert.match(service, /updateEstimateVersion\([\s\S]*ESTIMATE_PENDING_APPROVAL,[\s\S]*status: approvalEstimateStatus/);
  assert.match(service, /action: 'estimate\.approval_result_applied'/);
  assert.doesNotMatch(service, /eventType: 'estimate\.(approved|rejected|returned|finalized)'/);
});

// A rejected/returned/pending approval must persist any terminal synchronization, then fail submission outside the transaction.
test('Module 3 preserves approval-result synchronization when a submission is not ready', () => {
  const method = service.slice(service.indexOf('async submitTender'), service.indexOf('/** Record one reviewed'));
  assert.match(method, /const result = await withTransaction\(\s*this\.db/);
  assert.match(method, /return \{ blocked: true as const, tender: null, submission: null \}/);
  assert.match(method, /if \(result\.blocked\) throw createModule3Error\('TENDER_NOT_READY_FOR_SUBMISSION'\)/);
});

// Submission snapshot amount, actor and time remain server-owned and the matching Tender transition/audit/event is atomic.
test('Module 3 creates one immutable server-owned submission snapshot and tender.submitted event', () => {
  const method = service.slice(service.indexOf('private async persistTenderSubmission'), service.indexOf('/** Record one reviewed'));
  assert.match(method, /submittedBy: actorUserId/);
  assert.match(method, /submittedAmount: estimate\.tenderTotal\.toString\(\)/);
  assert.match(method, /outcome: SUBMISSION_PENDING/);
  assert.match(method, /updateTenderStatus\(tenderId, TENDER_DRAFT, TENDER_SUBMITTED\)/);
  assert.match(method, /action: 'tender\.submitted'/);
  assert.match(method, /eventType: 'tender\.submitted'/);
  assert.doesNotMatch(method, /submittedAt:\s*input\./);
});

// The one Stage-5 submission snapshot supports safe retry of the exact same command without duplicate side effects.
test('Module 3 treats the same existing submission command as an idempotent replay', () => {
  const method = service.slice(service.indexOf('async submitTender'), service.indexOf('/** Record one reviewed'));
  assert.match(method, /findTenderSubmission\(tenderId\)/);
  assert.match(method, /existingSubmission\.estimateVersionId === input\.estimateVersionId/);
  assert.match(method, /dateOnly\(existingSubmission\.validityDate\) === input\.validityDate/);
  assert.match(method, /if \(sameCommand\) return \{ blocked: false as const, tender, submission: existingSubmission \}/);
});

// Outcome transitions are explicit and service-authorized: DRAFT may only cancel; SUBMITTED may resolve to any reviewed terminal result.
test('Module 3 records only the frozen Tender outcome transitions', () => {
  const method = service.slice(service.indexOf('async recordTenderOutcome'));
  assert.match(method, /this\.requirePermission\('tenders\.manage_outcome'\)/);
  assert.match(service, /if \(currentStatus === TENDER_DRAFT\) return targetStatus === 'CANCELLED'/);
  assert.match(service, /if \(currentStatus === TENDER_SUBMITTED\) return true/);
  assert.match(method, /canRecordTenderOutcome\(tender\.status, input\.outcome\)/);
  assert.match(method, /createModule3Error\('INVALID_TENDER_TRANSITION'\)/);
});

// Submission outcome and Tender status move together; exact replay returns current state without a duplicate event.
test('Module 3 updates Tender and submission outcome atomically and keeps terminal replays idempotent', () => {
  const method = service.slice(service.indexOf('async recordTenderOutcome'));
  assert.match(method, /if \(tender\.status === input\.outcome\)[\s\S]*return \{ tender, submission: currentSubmission \}/);
  assert.match(method, /updateTenderSubmissionOutcome\(tenderId, input\.outcome\)/);
  assert.match(method, /updateTenderStatus\(tenderId, tender\.status, input\.outcome\)/);
  assert.match(method, /action: 'tender\.outcome_recorded'/);
  assert.match(method, /reason: input\.reason \?\? null/);
});

// Stage 5 emits only the source-defined events: cancellation and estimate lifecycle changes remain audit-only.
test('Module 3 emits tender.won/tender.lost but no invented cancellation or estimate lifecycle events', () => {
  assert.match(service, /eventType: input\.outcome === 'WON' \? 'tender\.won' : 'tender\.lost'/);
  assert.doesNotMatch(service, /eventType: 'tender\.cancelled'/);
  assert.doesNotMatch(service, /eventType: 'estimate\.(finalized|approved|rejected|returned)'/);
});

// Keep future-module Project/BOQ/Budget/Finance behavior out of Stage 5 service completion.
test('Module 3 service completion does not create downstream Project, BOQ, Budget or Finance records', () => {
  assert.doesNotMatch(service, /project\.(create|update)|boq|budget|journal|finance/i);
});


// Read services must use the same scoped repository and bounded pagination as the reviewed list contract.
test('Module 3 service exposes bounded Tender reads and estimate version comparison reads', () => {
  const list = service.slice(service.indexOf('async listTenders'), service.indexOf('/** Get one company tender'));
  assert.match(list, /this\.requirePermission\('tenders\.read'\)/);
  assert.match(list, /const page = input\.page \?\? 1/);
  assert.match(list, /const pageSize = input\.pageSize \?\? 25/);
  assert.match(list, /skip: \(page - 1\) \* pageSize/);
  assert.match(list, /take: pageSize/);

  const detail = service.slice(service.indexOf('async getTender'), service.indexOf('/** Get one company-scoped estimate'));
  assert.match(detail, /findTenderById\(tenderId\)/);
  assert.match(detail, /findTenderSubmission\(tenderId\)/);
  assert.match(detail, /listEstimateVersions\(tenderId\)/);
  assert.match(detail, /findLatestEstimateVersion\(tenderId, \[ESTIMATE_FINAL, ESTIMATE_APPROVED\]\)/);

  const estimate = service.slice(service.indexOf('async getEstimateVersion'), service.indexOf('/** Create one DRAFT tender'));
  assert.match(estimate, /this\.requirePermission\('tenders\.read'\)/);
  assert.match(estimate, /findEstimateVersionById\(tenderId, versionId\)/);
  assert.match(estimate, /ESTIMATE_VERSION_NOT_FOUND/);
});

// Keep the HTTP surface to the seven source routes plus the two approved Pass-108 reconciliation routes.
test('Module 3 Fastify registers exactly the nine reviewed HTTP operations', () => {
  const registrations = [...httpRoutes.matchAll(/app\.(get|post|patch)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.deepEqual(registrations, [
    'GET /api/v1/tenders',
    'POST /api/v1/tenders',
    'GET /api/v1/tenders/:id',
    'POST /api/v1/tenders/:id/estimates',
    'PATCH /api/v1/tenders/:id/estimates/:versionId',
    'POST /api/v1/tenders/:id/estimates/:versionId/finalize',
    'GET /api/v1/tenders/:id/estimates/:versionId',
    'POST /api/v1/tenders/:id/submit',
    'POST /api/v1/tenders/:id/outcome'
  ]);
  assert.doesNotMatch(httpRoutes, /app\.delete\(/);
});

// Every route authenticates, performs route-level RBAC, validates with Zod and then calls service logic.
test('Module 3 routes enforce authentication, stable RBAC and Zod boundaries before service calls', () => {
  assert.equal((httpRoutes.match(/authenticateRequest\(request, options\.database\)/g) ?? []).length, 9);
  for (const permission of permissions) assert.ok(httpRoutes.includes(`requireRoutePermission('${permission}')`), permission);
  for (const schemaName of [
    'listTendersQuerySchema', 'createTenderBodySchema', 'tenderIdParamsSchema',
    'createEstimateVersionBodySchema', 'updateDraftEstimateBodySchema',
    'tenderEstimateVersionParamsSchema', 'finalizeEstimateBodySchema',
    'submitTenderBodySchema', 'recordTenderOutcomeBodySchema'
  ]) {
    assert.ok(httpRoutes.includes(schemaName), schemaName);
  }
  assert.doesNotMatch(httpRoutes, /new TenderingEstimationRepository|recordAudit|recordOutboxEvent/);
});

// OpenAPI must expose bounded filters and decimal-string commercial fields without browser-owned authority fields.
test('Module 3 OpenAPI keeps pagination and commercial request fields safe', () => {
  assert.match(httpRoutes, /pageSize: \{ type: 'integer', minimum: 1, maximum: 100 \}/);
  assert.match(httpRoutes, /DECIMAL_MONEY_SCHEMA/);
  assert.match(httpRoutes, /DECIMAL_QUANTITY_SCHEMA/);
  assert.match(httpRoutes, /additionalProperties: false/);
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'directCost', 'tenderTotal', 'submittedAmount']) {
    assert.doesNotMatch(httpRoutes, new RegExp(`\\b${field}\\s*:`), field);
  }
  assert.equal((httpRoutes.match(/security: BEARER_SECURITY/g) ?? []).length, 9);
});

// Finalization remains bodyless while still rejecting unexpected browser fields through the strict Zod contract.
test('Module 3 finalize route keeps approval selection server-owned and bodyless', () => {
  const route = httpRoutes.slice(
    httpRoutes.indexOf("app.post('/api/v1/tenders/:id/estimates/:versionId/finalize'"),
    httpRoutes.indexOf("app.get('/api/v1/tenders/:id/estimates/:versionId'")
  );
  assert.doesNotMatch(route, /body:\s*\{/);
  assert.match(route, /parseRequest\(finalizeEstimateBodySchema, request\.body \?\? \{\}, 'body'\)/);
  assert.doesNotMatch(route, /approvalDefinitionCode/);
});

// Optional estimate approval routing is a validated server-only configuration wired through main -> app -> Module 3.
test('Module 3 approval definition configuration is server-owned and wired to the service', () => {
  assert.match(serverConfig, /tenderEstimateApprovalDefinitionCode: string \| null/);
  assert.match(serverConfig, /TENDER_ESTIMATE_APPROVAL_DEFINITION_CODE/);
  assert.match(serverConfig, /\^\[A-Za-z0-9_\.-\]\{1,100\}\$/);
  assert.match(main, /tenderEstimateApprovalDefinitionCode: config\.tenderEstimateApprovalDefinitionCode/);
  assert.match(app, /registerTenderingEstimationRoutes/);
  assert.match(app, /approvalDefinitionCode: options\.tenderEstimateApprovalDefinitionCode \?\? null/);
  assert.doesNotMatch(schema, /approvalDefinitionCode\s*:/);
});

// Public exports and app registration finish the reviewed five-file Module 3 backend sequence.
test('Module 3 index exports the reviewed backend contract and app registers it with database scope', () => {
  assert.match(moduleIndex, /export \{ TenderingEstimationRepository \}/);
  assert.match(moduleIndex, /export \{ TenderingEstimationService \}/);
  assert.match(moduleIndex, /export \{ registerTenderingEstimationRoutes \}/);
  assert.match(app, /import \{ registerTenderingEstimationRoutes \} from '\.\/modules\/tendering-estimation\/index\.js'/);
  assert.match(app, /if \(options\.database\)[\s\S]*app\.register\(registerTenderingEstimationRoutes/);
});


// Keep Pass 116 on one maintained real-PostgreSQL integration suite rather than adding pass-specific test files.
test('Module 3 registers one dedicated backend integration command and maintained suite', () => {
  assert.equal(
    rootPackage.scripts['test:integration:module-3'],
    'npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 tests/integration/module-3-api.integration.test.mjs'
  );
  assert.match(integrationTest, /RUN_FOUNDATION_DB_TESTS/);
  assert.match(integrationTest, /resetFoundationTestData/);
  assert.match(integrationTest, /buildApp/);
});

// Verify the live suite exercises the reviewed tender, estimate, submission and outcome workflow plus atomic side effects.
test('Module 3 integration suite covers the complete Stage-5 backend workflow', () => {
  for (const value of [
    'DUPLICATE_TENDER_NUMBER',
    'TENDER_NOT_READY_FOR_SUBMISSION',
    'ESTIMATE_VERSION_LOCKED',
    'INVALID_TENDER_TRANSITION',
    "action === 'tender.created'",
    "action === 'estimate.version_created'",
    "action === 'tender.submitted'",
    "eventType === 'tender.won'"
  ]) {
    assert.ok(integrationTest.includes(value), value);
  }
  assert.match(integrationTest, /directCost, '530\.30'/);
  assert.match(integrationTest, /tenderTotal, '680\.90'/);
  assert.match(integrationTest, /submittedAmount, '168\.00'/);
});

// Keep basic negative RBAC/company scope and the optional Module 22 transaction boundary covered before the dedicated security pass.
test('Module 3 integration suite covers basic isolation, rollback and optional approval integration', () => {
  assert.match(integrationTest, /FOREIGN_TENDER_B_ID/);
  assert.match(integrationTest, /permissions: \['tenders\.read'\]/);
  assert.match(integrationTest, /APPROVAL_DEFINITION_INVALID/);
  assert.match(integrationTest, /storedEstimate\.status, 'DRAFT'/);
  assert.match(integrationTest, /PENDING_APPROVAL/);
  assert.match(integrationTest, /module-3-estimate-approval-1/);
  assert.match(integrationTest, /storedEstimate\.status, 'APPROVED'/);
});

// Pass 117 keeps every reviewed HTTP operation behind the same authenticated-session boundary.
test('Module 3 security suite verifies authentication on all nine reviewed routes', () => {
  assert.match(integrationTest, /Module 3 requires authentication on all nine reviewed routes/);
  assert.match(integrationTest, /const cases = \[/);
  assert.match(integrationTest, /AUTHENTICATION_REQUIRED/);
  assert.match(integrationTest, /assertSafePublicError\(response, 401, 'AUTHENTICATION_REQUIRED'\)/);
});

// Dedicated tenant/RBAC coverage must protect reads and writes without trusting browser-owned authority.
test('Module 3 security suite verifies RBAC, authority rejection and company isolation', () => {
  assert.match(integrationTest, /Module 3 enforces RBAC, trusted authority fields and cross-company isolation/);
  assert.match(integrationTest, /FOREIGN_TENDER_B_ID/);
  assert.match(integrationTest, /CLIENT_B_ID/);
  assert.match(integrationTest, /OPPORTUNITY_B_ID/);
  assert.match(integrationTest, /ownerUserId: ADMIN_B_ID/);
  assert.match(integrationTest, /ARCHIVED_CLIENT_A_ID/);
  for (const field of ['companyId', 'status', 'directCost', 'tenderTotal', 'approvalDefinitionCode', 'submittedAmount', 'submittedBy']) {
    assert.ok(integrationTest.includes(field), field);
  }
  assert.match(integrationTest, /pageSize=101/);
  assert.match(integrationTest, /dueFrom=2026-12-31&dueTo=2026-01-01/);
});

// Public API errors must remain stable and secret-safe even when validation or persistence rejects a request.
test('Module 3 security suite verifies safe public error envelopes', () => {
  assert.match(integrationTest, /function assertSafePublicError\(/);
  for (const forbidden of ['prisma', 'p2002', 'postgresql', 'stack', 'select ', 'insert into ', 'update ']) {
    assert.ok(integrationTest.includes(`'${forbidden}'`), forbidden);
  }
  for (const code of ['AUTHENTICATION_REQUIRED', 'FORBIDDEN', 'DUPLICATE_TENDER_NUMBER', 'TENDER_NOT_FOUND', 'ESTIMATE_VERSION_LOCKED', 'INVALID_REQUEST']) {
    assert.ok(integrationTest.includes(`'${code}'`), code);
  }
});

// Direct PostgreSQL writes are tested against the critical Stage-5 FK, unique and CHECK constraints.
test('Module 3 security suite verifies database integrity below the service layer', () => {
  assert.match(integrationTest, /Module 3 database constraints reject invalid values and cross-company relationships/);
  assert.match(integrationTest, /DB-FOREIGN-CLIENT/);
  assert.match(integrationTest, /DB-FOREIGN-OPPORTUNITY/);
  assert.match(integrationTest, /DB-FOREIGN-OWNER/);
  assert.match(integrationTest, /status: 'BROKEN'/);
  assert.match(integrationTest, /currency: 'usd'/);
  assert.match(integrationTest, /directCost: '-1\.00'/);
  assert.match(integrationTest, /laborCost: '-1\.00'/);
  assert.match(integrationTest, /parentId: parent\.id/);
  assert.match(integrationTest, /estimateVersionId: versionB\.id/);
});

// Pass 117 verifies the reviewed physical indexes exist; Pass 121 adds measured query-plan coverage below.
test('Module 3 security suite verifies reviewed database indexes without adding new performance architecture', () => {
  assert.match(integrationTest, /Module 3 database exposes the reviewed tenant, lifecycle and worksheet indexes/);
  for (const indexName of [
    'tenders_company_tender_no_uq',
    'tenders_company_status_due_idx',
    'tenders_company_client_created_idx',
    'tenders_company_owner_status_idx',
    'tenders_company_opportunity_idx',
    'estimate_versions_tender_version_uq',
    'estimate_versions_tender_status_version_idx',
    'estimate_items_version_parent_idx',
    'tender_submissions_tender_uq',
    'tender_submissions_estimate_version_idx'
  ]) {
    assert.ok(integrationTest.includes(`'${indexName}'`), indexName);
  }
});


// Pass 121 reuses the maintained PostgreSQL suite for operational/concurrency proof instead of adding another framework.
test('Module 3 registers one focused operational command with clean and previous-schema migration verification', () => {
  assert.equal(
    rootPackage.scripts['test:operations:module-3'],
    `node -e "if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 for Module 3 operational verification.')" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 --test-name-pattern="Module 3 operational|transaction rollback" tests/integration/module-3-api.integration.test.mjs`
  );
  assert.equal(
    rootPackage.scripts['module-3:operations:live'],
    'npm run db:migrations:verify && npm run test:operations:module-3'
  );
});

test('Module 3 operational suite verifies concurrent lifecycle retries and approval-request uniqueness', () => {
  assert.match(integrationTest, /Module 3 operational concurrency serializes version, finalization, submission and outcome retries/);
  assert.match(integrationTest, /Promise\.all\(\[\s*createEstimate/);
  assert.match(integrationTest, /\[200, 409\]/);
  assert.match(integrationTest, /tenderSubmission\.count/);
  assert.match(integrationTest, /eventType: 'tender\.submitted'/);
  assert.match(integrationTest, /eventType: 'tender\.won'/);
  assert.match(integrationTest, /Module 3 operational approval concurrency creates one durable approval request/);
  assert.match(integrationTest, /approvalRequest\.count\(\{ where: \{ resourceId: estimate\.id \} \}\)/);
});

test('Module 3 operational suite measures PostgreSQL plans for the reviewed bounded indexes', () => {
  assert.match(integrationTest, /Module 3 operational query plans use reviewed indexes for bounded Tender and estimate reads/);
  assert.match(integrationTest, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.match(integrationTest, /tenders_company_status_due_idx/);
  assert.match(integrationTest, /estimate_versions_tender_status_version_idx/);
  assert.match(integrationTest, /ANALYZE tenders/);
  assert.match(integrationTest, /ANALYZE estimate_versions/);
  assert.doesNotMatch(integrationTest, /executionTime\s*[<>]=?\s*\d+/i);
});

// Keep the first Module 3 React pass inside the reviewed api/hooks/components/pages shape without extra frontend architecture.
test('Module 3 Tender register frontend uses the minimal reviewed feature structure', async () => {
  assert.deepEqual((await readdir('apps/web/src/features/tendering-estimation/api')).sort(), ['tendering-estimation-api.ts']);
  assert.deepEqual((await readdir('apps/web/src/features/tendering-estimation/hooks')).sort(), ['tendering-estimation.ts']);
  assert.deepEqual((await readdir('apps/web/src/features/tendering-estimation/components')).sort(), ['estimate-workspace.tsx', 'tender-details-panel.tsx']);
  assert.deepEqual((await readdir('apps/web/src/features/tendering-estimation/pages')).sort(), ['tenders-page.tsx']);
});

// Keep the browser API on the reviewed nine-route contract without adding generic CRUD endpoints.
test('Module 3 browser API covers Tender, estimate, submission and outcome commands only', () => {
  for (const name of ['listTenders', 'getTender', 'createTender', 'getEstimateVersion', 'createEstimateVersion', 'updateDraftEstimate', 'finalizeEstimate', 'submitTender', 'recordTenderOutcome']) {
    assert.match(webApiSource, new RegExp(`export function ${name}\\(`), name);
  }
  for (const filter of ['search', 'status', 'clientId', 'ownerUserId', 'dueFrom', 'dueTo', 'page', 'pageSize']) {
    assert.match(webApiSource, new RegExp(`query\\.set\\('${filter}'`), filter);
  }
  const createTenderType = webApiSource.slice(
    webApiSource.indexOf('export type CreateTenderInput'),
    webApiSource.indexOf('/** Load one server-paginated Tender register')
  );
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'status', 'directCost', 'tenderTotal']) {
    assert.doesNotMatch(createTenderType, new RegExp(`\\b${field}\\b\\s*:`), field);
  }
});

// Keep TanStack Query as the owner of all Module 3 server state and invalidate one maintained query family after writes.
test('Module 3 Tender hooks cover the complete reviewed frontend workflow', () => {
  for (const name of [
    'useTenders',
    'useTender',
    'useEstimateVersion',
    'useCreateTender',
    'useCreateEstimateVersion',
    'useUpdateDraftEstimate',
    'useFinalizeEstimate',
    'useSubmitTender',
    'useRecordTenderOutcome'
  ]) {
    assert.match(webHooksSource, new RegExp(`export function ${name}\\(`), name);
  }
  assert.match(webHooksSource, /TENDERS_QUERY_KEY/);
  assert.ok((webHooksSource.match(/invalidateQueries\(\{ queryKey: TENDERS_QUERY_KEY \}\)/g) ?? []).length >= 6);
});

// Keep the Tender register permission-aware, server-paginated and limited to reviewed search/status/due-date filters.
test('Module 3 Tender register UI provides reviewed filters, pagination and permission-aware creation', () => {
  assert.match(webPageSource, /usePermission\('tenders\.read'\)/);
  assert.match(webPageSource, /usePermission\('tenders\.create'\)/);
  assert.match(webPageSource, /useTenders\([\s\S]*canRead\)/);
  assert.match(webPageSource, /Search Tenders/);
  assert.match(webPageSource, /All statuses/);
  assert.match(webPageSource, /Due from/);
  assert.match(webPageSource, /Due to/);
  assert.match(webPageSource, /Page \{page\} of \{pageCount\}/);
  assert.match(webPageSource, /Create Tender/);
  assert.match(webPageSource, /useClients\(\{ status: 'ACTIVE', page: 1, pageSize: 100 \}, canCreate && canReadClients\)/);
});

// Keep Tender creation on reviewed business references while the server owns lifecycle and calculated values.
test('Module 3 Tender create form validates client, optional opportunity, owner, due date and currency only', () => {
  for (const field of ['clientId', 'opportunityId', 'tenderNo', 'title', 'dueDate', 'ownerUserId', 'currency']) {
    assert.match(webPageSource, new RegExp(`${field}:`), field);
  }
  assert.match(webPageSource, /currency: values\.currency\.toUpperCase\(\)/);
  assert.doesNotMatch(webPageSource, /companyId|actorUserId|projectScope|directCost|tenderTotal/);
});

// Keep Tender summary separate from the commercial workspace while rendering both from one server-owned detail query.
test('Module 3 Tender detail composes the complete estimate workspace after the Tender summary', () => {
  assert.match(webDetailsSource, /Tender status:/);
  assert.match(webDetailsSource, /<dt>Client<\/dt>/);
  assert.match(webDetailsSource, /<dt>Opportunity<\/dt>/);
  assert.match(webDetailsSource, /<dt>Owner<\/dt>/);
  assert.match(webDetailsSource, /Latest final\/approved estimate/);
  assert.match(webDetailsSource, /<EstimateWorkspace details=\{tenderQuery\.data\} \/>/);
});

// Pass 119 must expose the PDF-required estimate worksheet, cost summary, version comparison and approval status.
test('Module 3 estimate workspace provides worksheet, commercial summary, version comparison and approval status', () => {
  assert.match(webEstimateWorkspaceSource, /Estimate worksheet/);
  assert.match(webEstimateWorkspaceSource, /Version comparison/);
  assert.match(webEstimateWorkspaceSource, /Direct cost/);
  assert.match(webEstimateWorkspaceSource, /Indirect cost/);
  assert.match(webEstimateWorkspaceSource, /Contingency/);
  assert.match(webEstimateWorkspaceSource, /Markup/);
  assert.match(webEstimateWorkspaceSource, /Tender total/);
  assert.match(webEstimateWorkspaceSource, /Approval status/);
  assert.match(webEstimateWorkspaceSource, /useFieldArray/);
  for (const field of ['description', 'quantity', 'unit', 'laborCost', 'materialCost', 'equipmentCost', 'subcontractCost', 'otherCost']) {
    assert.ok(webEstimateWorkspaceSource.includes(field), field);
  }
});

// Commercial writes must send only reviewed business inputs and never browser-owned totals, actor, tenant or approval configuration.
test('Module 3 estimate browser writes preserve server-owned authority and totals', () => {
  const apiWriteSection = webApiSource.slice(webApiSource.indexOf('export type EstimateItemInput'));
  assert.match(apiWriteSection, /createEstimateVersion/);
  assert.match(apiWriteSection, /updateDraftEstimate/);
  assert.match(apiWriteSection, /finalizeEstimate/);
  assert.match(apiWriteSection, /submitTender/);
  assert.match(apiWriteSection, /recordTenderOutcome/);
  assert.doesNotMatch(apiWriteSection, /companyId\s*:|actorUserId\s*:|permissions\s*:|projectScope\s*:|submittedAmount\s*:|submittedBy\s*:|approvalDefinitionCode\s*:/);
  const draftInput = webApiSource.slice(webApiSource.indexOf('export type EstimateDraftInput'), webApiSource.indexOf('export type SubmitTenderInput'));
  assert.doesNotMatch(draftInput, /\bdirectCost\s*:|\btenderTotal\s*:|\bversionNo\s*:|\bstatus\s*:/);
  assert.match(webApiSource, /finalizeEstimate[\s\S]*method: 'POST'[\s\S]*\}\);/);
});

// Permission-aware frontend controls must mirror the backend permission split without replacing API authorization.
test('Module 3 estimate workspace gates edit, submit and outcome actions by reviewed permissions', () => {
  assert.match(webEstimateWorkspaceSource, /usePermission\('estimates\.edit'\)/);
  assert.match(webEstimateWorkspaceSource, /usePermission\('tenders\.submit'\)/);
  assert.match(webEstimateWorkspaceSource, /usePermission\('tenders\.manage_outcome'\)/);
  assert.match(webEstimateWorkspaceSource, /Create estimate version/);
  assert.match(webEstimateWorkspaceSource, /Finalize estimate/);
  assert.match(webEstimateWorkspaceSource, /Submit Tender/);
  assert.match(webEstimateWorkspaceSource, /Record outcome/);
});

// Submission and outcome UI must use explicit command contracts instead of generic Tender status mutation.
test('Module 3 commercial actions use explicit submission and terminal outcome commands', () => {
  assert.match(webEstimateWorkspaceSource, /estimateVersionId/);
  assert.match(webEstimateWorkspaceSource, /validityDate/);
  assert.match(webEstimateWorkspaceSource, /PENDING_APPROVAL/);
  assert.match(webEstimateWorkspaceSource, /outcomeOptions/);
  assert.match(webEstimateWorkspaceSource, /\['WON', 'LOST', 'CANCELLED'\]/);
  assert.doesNotMatch(webApiSource, /updateTenderStatus|patchTender|deleteTender/);
});

// Keep Tender workspace navigation hidden unless the authenticated role can read Module 3 Tenders.
test('workspace shell exposes Tendering and Estimation through tenders.read only', () => {
  assert.match(adminShellSource, /const canReadTenders = usePermission\('tenders\.read'\)/);
  assert.match(adminShellSource, /canReadTenders && \([\s\S]*>Tendering & Estimation<\/button>/);
  assert.match(adminShellSource, /activeView === 'tenders' && <TendersPage[\s\S]*initialClientId=\{linkedClientId\}/);
});

// Keep one focused browser suite for the complete Stage-5 commercial workflow after the React passes.
test('Module 3 Playwright covers the reviewed Tender and estimate commercial workflow', () => {
  assert.equal(
    rootPackage.scripts['test:e2e:module-3'],
    'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs'
  );

  for (const value of [
    'Create Tender',
    'Create estimate version',
    'Create version',
    'Edit selected draft',
    'Save draft',
    'Finalize estimate',
    'Compare with',
    'Submit Tender',
    "selectOption('WON')",
    "selectOption('LOST')",
    "selectOption('CANCELLED')"
  ]) {
    assert.ok(browserE2eSource.includes(value), value);
  }
});

// Browser acceptance must prove every reviewed mutation permission independently of hidden controls.
test('Module 3 Playwright verifies permission-aware UI and API-side denials', () => {
  for (const value of [
    'READER_EMAIL',
    'ESTIMATE_EDITOR_EMAIL',
    'SUBMITTER_EMAIL',
    'OUTCOME_MANAGER_EMAIL',
    'NO_ACCESS_EMAIL',
    'forbiddenEstimateCreate.status()).toBe(403)',
    'forbiddenSubmit.status()).toBe(403)',
    'forbiddenOutcome.status()).toBe(403)',
    "getByRole('heading', { name: 'No module access' })"
  ]) {
    assert.ok(browserE2eSource.includes(value), value);
  }
  assert.match(browserE2eSource, /expect\(noAccessRequests\)\.toHaveLength\(0\)/);
});

// Browser writes must remain limited to reviewed business input while the server owns lifecycle and totals.
test('Module 3 Playwright checks server-owned authority on outgoing browser requests', () => {
  assert.match(browserE2eSource, /function assertServerOwnedAuthority\(requests\)/);
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'directCost',
    'tenderTotal',
    'versionNo',
    'status',
    'approvalDefinitionCode',
    'submittedAmount',
    'submittedBy',
    'submittedAt'
  ]) {
    assert.ok(browserE2eSource.includes(`'${field}'`), field);
  }
  assert.match(browserE2eSource, /finalizeRequests\)\.toHaveLength\(2\)/);
  assert.match(browserE2eSource, /request\.body\)\.toBeNull\(\)/);
});

// Keep Playwright able to select only Module 3 without running another stage browser suite.
test('Playwright config supports isolated Module 3 browser execution', () => {
  assert.match(playwrightConfigSource, /RUN_MODULE_3_E2E/);
  assert.match(playwrightConfigSource, /module-3-browser\.spec\.mjs/);
  assert.match(playwrightConfigSource, /enabledModuleCount !== 1/);
});

// Pass 122 consolidates the complete Module 3 implementation into one maintained Stage-5 acceptance surface.
test('Module 3 registers final static, live gate and live acceptance commands', () => {
  assert.equal(rootPackage.scripts['module-3:gate'], 'node scripts/module-3/verify-stage-5.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-3:gate:live'], 'node scripts/module-3/verify-stage-5.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-3:acceptance:live'], 'node scripts/module-3/run-live-acceptance.mjs');
});

// The final Stage-5 gate must prove the maintained backend, security, operational, browser, migration and workspace contracts.
test('Module 3 final gate covers the complete reviewed Stage-5 acceptance surface', () => {
  for (const value of [
    'module-2-static-regression',
    'module-3-static-suite',
    'workspace-contract',
    'migration-policy',
    'module-3-integration-test-syntax',
    'module-3-playwright-test-syntax',
    'clean-and-previous-migrations',
    'module-3-backend-security-operational-integration',
    'module-3-browser-workflow'
  ]) {
    assert.ok(module3GateSource.includes(value), value);
  }
  assert.match(module3GateSource, /STAGE_5_ACCEPTED_READY_FOR_STAGE_6/);
  assert.match(module3GateSource, /Module 4A - BOQ Commercial Core/);
});

// Stage 5 cannot be live-accepted from static evidence or a blocked/stale Module 2 result.
test('Module 3 live acceptance requires genuine Module 2 Stage-4 live acceptance', () => {
  assert.match(module3GateSource, /STAGE_4_ACCEPTED_READY_FOR_STAGE_5/);
  assert.match(module3GateSource, /STAGE_4_LIVE_ACCEPTANCE_REQUIRED/);
  assert.match(module3GateSource, /DO_NOT_DEPLOY_STAGE_5_UNTIL_STAGE_4_LIVE_ACCEPTED/);
  assert.match(module3LiveAcceptanceSource, /stage4IsAccepted/);
  assert.match(module3LiveAcceptanceSource, /module-2-evidence\/stage-4-live\.json/);
});

// The live gate must retain destructive-test safety and isolate the Module 3 Playwright suite.
test('Module 3 live gate keeps disposable database and browser isolation guards', () => {
  for (const value of [
    'RUN_CONSTRUCTION_ERP_MODULE_3_LIVE_GATE',
    'RESET_CONSTRUCTION_ERP_TEST_DATABASE',
    'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE',
    'RUN_FOUNDATION_DB_TESTS',
    'RUN_MODULE_3_E2E'
  ]) {
    assert.ok(module3GateSource.includes(value) || module3LiveAcceptanceSource.includes(value), value);
  }
  assert.match(module3GateSource, /RUN_MODULE_2_E2E must not be enabled/);
  assert.match(module3GateSource, /package-lock\.json/);
});

// Stage-6 handoff must remain BOQ Commercial Core only; Project/WBS mapping is still deferred by the controlling contract.
test('Module 3 final acceptance hands off to BOQ Commercial Core without premature project scope', () => {
  assert.match(module3GateSource, /projectScope: 'deferred-until-project-management-and-module-24b'/);
  assert.match(module3GateSource, /'boq-project-mapping'/);
  assert.match(module3GateSource, /'project-award-conversion'/);
  assert.doesNotMatch(module3GateSource, /STAGE_6_ACCEPTED/);
});



// Keep Tender submission readable by separating approval synchronization, persistence, and transaction orchestration.
test('Pass 172 keeps Tender submission in small purpose-specific service helpers', () => {
  assert.match(service, /private async synchronizeEstimateApproval\(/);
  assert.match(service, /private async persistTenderSubmission\(/);
  assert.match(service, /private async submitTenderInTransaction\(/);
  const publicMethod = service.slice(service.indexOf('async submitTender(tenderId'));
  assert.match(publicMethod, /submitTenderInTransaction\(tx, tenderId, input, actorUserId\)/);
});
