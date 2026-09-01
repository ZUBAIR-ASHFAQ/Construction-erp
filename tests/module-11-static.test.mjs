import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/subcontracts/STAGE-16-MODULE-11-CONTRACT.md', 'utf8');
const gate = await readFile('scripts/module-11/verify-stage-16-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-11/verify-stage-16-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-11/verify-stage-16-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-11/verify-stage-16-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-11/verify-stage-16-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-11/verify-stage-16-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-11/verify-stage-16-integration-security.mjs', 'utf8');
const reactGate = await readFile('scripts/module-11/verify-stage-16-react.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-11/verify-stage-16-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-11/verify-stage-16-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-11/verify-stage-16.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-11-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const integrationTest = await readFile('tests/integration/module-11-api.integration.test.mjs', 'utf8');
const browserApi = await readFile('apps/web/src/features/subcontracts/api/subcontracts-api.ts', 'utf8');
const browserHooks = await readFile('apps/web/src/features/subcontracts/hooks/subcontracts.ts', 'utf8');
const browserWorkspace = await readFile('apps/web/src/features/subcontracts/components/subcontracts-workspace.tsx', 'utf8');
const browserPage = await readFile('apps/web/src/features/subcontracts/pages/subcontracts-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const service = await readFile('apps/api/src/modules/subcontracts/subcontracts.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/subcontracts/subcontracts.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/subcontracts/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/subcontracts/subcontracts.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/subcontracts/subcontracts.repository.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260825000100_module_11_subcontractor_management_core/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Return true when a path exists in the current cumulative archive. */
async function exists(relativePath) {
  try {
    await access(relativePath);
    return true;
  } catch {
    return false;
  }
}

// Freeze the corrected Stage-16 location.
test('Pass 256 freezes Module 11 at Stage 16 between Inventory and Equipment', () => {
  assert.match(contract, /Stage 15  Module 10 - Inventory & Materials/);
  assert.match(contract, /Stage 16  Module 11 - Subcontractor Management/);
  assert.match(contract, /Stage 17  Module 12 - Equipment Management/);
  assert.match(gate, /pass: 256/);
  assert.match(gate, /stage: 16/);
});

// Freeze the corrected hard-prerequisite set and optional BOQ relationship.
test('Pass 256 freezes the corrected Module 11 dependencies', () => {
  for (const prerequisite of [
    'Module 5   Project Management',
    'Module 6   WBS & Cost Codes',
    'Module 7   Budgeting & Job Costing',
    'Module 8   Procurement & RFQ supplier/vendor master',
    'Module 22  Approval Workflows',
  ]) assert.ok(contract.includes(prerequisite), `Missing prerequisite: ${prerequisite}`);
  assert.match(contract, /Module 4 BOQ Management is optional/);
  assert.match(contract, /Project-scope authorization already exists through Module 24B/);
});

// Freeze exactly the five Appendix-A persistence resources.
test('Pass 256 freezes exactly five source-owned Module 11 tables', () => {
  for (const table of [
    'subcontractors',
    'subcontracts',
    'subcontract_items',
    'subcontract_payment_applications',
    'subcontract_payment_lines',
  ]) assert.match(contract, new RegExp(`\\b${table}\\b`));
  assert.match(contract, /owns exactly these five source-defined persistence resources/);
  assert.match(contract, /No sixth Module-11 business table/);
});

// Preserve Module-8 Vendor ownership while satisfying the Part-I link correction.
test('Pass 256 keeps Module 8 as Vendor master and freezes only a nullable vendor link', () => {
  assert.match(contract, /Module 8 the supplier\/vendor master owner/);
  assert.match(contract, /must not duplicate or replace the Module-8 vendor master/);
  assert.match(contract, /subcontractors\.vendor_id nullable -> vendors\.id/);
  assert.match(contract, /must enforce same-Company ownership/);
  assert.match(gate, /duplicateVendorMasterInvented: false/);
});

// Freeze all and only the eight reviewed public operations.
test('Pass 256 freezes exactly eight reviewed Module 11 public operations', () => {
  for (const route of [
    'GET   /api/v1/subcontractors',
    'POST  /api/v1/subcontractors',
    'POST  /api/v1/subcontracts',
    'PATCH /api/v1/subcontracts/:id',
    'POST  /api/v1/subcontracts/:id/execute',
    'POST  /api/v1/subcontracts/:id/payment-applications',
    'POST  /api/v1/subcontracts/:id/payment-applications/:appId/certify',
    'POST  /api/v1/subcontracts/:id/close',
  ]) assert.ok(contract.includes(route), `Missing route: ${route}`);
  assert.match(gate, /reviewedRouteCount: 8/);
});

// Do not hide source gaps behind generic CRUD/readback APIs.
test('Pass 256 explicitly rejects source-unsupported Module 11 routes', () => {
  for (const unsupported of [
    'GET /api/v1/subcontracts/:id',
    'GET /api/v1/subcontracts',
    'DELETE /api/v1/subcontracts/:id',
    'POST /api/v1/subcontracts/:id/submit',
    'POST /api/v1/subcontracts/:id/approve',
    'POST /api/v1/subcontracts/:id/revisions',
    'GET /api/v1/subcontracts/:id/payment-applications',
    'GET /api/v1/subcontracts/:id/retention',
    'POST /api/v1/subcontracts/:id/retention/release',
    'PATCH /api/v1/subcontractors/:id',
  ]) assert.ok(contract.includes(unsupported), `Missing explicit unsupported route: ${unsupported}`);
  assert.match(contract, /Do not add generic CRUD routes automatically/);
});

// Preserve the UI/readback mismatch rather than inventing GET endpoints.
test('Pass 256 records subcontract and application readback API gaps', () => {
  assert.match(contract, /reviewed public route table contains only one GET route: the subcontractor list/);
  assert.match(contract, /must not silently invent GET\/detail\/ledger routes/);
  assert.match(gate, /subcontractReadbackApiGapRecorded: true/);
  assert.match(gate, /paymentApplicationReadbackApiGapRecorded: true/);
});

// Freeze Module-22 ownership and the missing submit/approve route mismatch.
test('Pass 256 keeps approval authority in Module 22', () => {
  assert.match(contract, /Module 22 owns approval definitions, requests, actions and terminal decision state/);
  assert.match(contract, /no duplicate Module-11 approval table or generic approve\/reject route/);
  assert.match(contract, /execution requires approval/);
  assert.match(gate, /genericApprovalRoutesInvented: false/);
});

// Freeze the Module-7 commitment transaction boundary.
test('Pass 256 freezes atomic idempotent Module 7 commitment creation on execution', () => {
  assert.match(contract, /execution creates the subcontract commitment exactly once/);
  assert.match(contract, /keyed idempotently by stable subcontract\/source-line identity/);
  assert.match(contract, /failed commitment write must roll back execution, audit and outbox changes/);
  assert.match(contract, /browser never writes `cost_commitments` directly/);
  assert.match(gate, /executionCreatesCommitmentAtomically: true/);
  assert.match(gate, /commitmentIdempotencyRequired: true/);
});

// Keep Finance/AP source posting out of Stage 16.
test('Pass 256 defers formal subcontract AP adapters to Module 15B', () => {
  assert.match(contract, /Module 15B \/ Stage 26/);
  for (const forbidden of ['AP invoice', 'payment allocation', 'Finance journal', 'subcontract AP subledger adapter']) {
    assert.match(contract, new RegExp(forbidden, 'i'));
  }
  assert.match(contract, /must preserve an immutable, stable certification source snapshot\/source key/);
  assert.match(gate, /apAdapterDeferredToStage26: true/);
});

// Freeze certification bounds and fail-closed override behavior.
test('Pass 256 freezes cumulative certification controls', () => {
  assert.match(contract, /certified cumulative quantity\/value cannot exceed the approved subcontract plus variations unless authorized/);
  assert.match(contract, /default behavior must fail closed/);
  assert.match(gate, /cumulativeCertificationBoundedByApprovedValue: true/);
  assert.match(gate, /certificationOverrideDefaultFailClosed: true/);
});

// Freeze immutable certification history and reversal/re-certification corrections.
test('Pass 256 freezes immutable certification snapshots', () => {
  assert.match(contract, /certified snapshots are immutable after posting/);
  assert.match(contract, /corrections use reversal\/re-certification instead of destructive edit/);
  assert.match(gate, /certificationSnapshotImmutable: true/);
  assert.match(gate, /certificationCorrectionByReversalRecertification: true/);
});

// Retention remains server-owned while its exact formula/release contract stays explicit.
test('Pass 256 freezes server-owned retention and records retention-release gaps', () => {
  assert.match(contract, /retention is calculated server-side with cap\/release rules/);
  assert.match(contract, /does not define exact retention rounding, cap formula, release trigger/);
  assert.match(contract, /retention-release API/);
  assert.match(gate, /retentionServerOwned: true/);
  assert.match(gate, /retentionReleaseGapRecorded: true/);
});

// Preserve the future formal variation integration instead of inventing it early.
test('Pass 256 records revision and Change Order integration gaps', () => {
  assert.match(contract, /`subcontract\.revised` is a source event/);
  assert.match(contract, /must not invent the future formal variation adapter/);
  assert.match(contract, /completed through the corrected Stage-27 integration gate/);
  assert.match(gate, /revisionApiGapRecorded: true/);
});

// Freeze the exact permission vocabulary and the PATCH/edit mismatch.
test('Pass 256 freezes seven permissions and records the missing edit permission', () => {
  for (const permission of [
    'subcontractors.read',
    'subcontractors.manage',
    'subcontracts.read',
    'subcontracts.create',
    'subcontracts.execute',
    'subcontracts.certify',
    'subcontracts.close',
  ]) assert.match(contract, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(contract, /no explicit `subcontracts\.edit` permission/);
  assert.match(gate, /draftEditPermissionGapRecorded: true/);
});

// Freeze the exact five stable Module-11 business errors.
test('Pass 256 freezes five Module 11 business error codes', () => {
  for (const code of [
    'SUBCONTRACT_NOT_FOUND',
    'SUBCONTRACT_NOT_APPROVED',
    'PAYMENT_APPLICATION_INVALID',
    'CERTIFIED_VALUE_EXCEEDS_CONTRACT',
    'SUBCONTRACT_NOT_READY_TO_CLOSE',
  ]) assert.match(contract, new RegExp(`\\b${code}\\b`));
});

// Freeze the exact five domain events without inventing a revision route.
test('Pass 256 freezes five Module 11 events', () => {
  for (const event of [
    'subcontract.executed',
    'subcontract.revised',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'subcontract.closed',
  ]) assert.match(contract, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(contract, /defines `subcontract\.revised` even though the eight-route Module-11 API defines no explicit revision command/);
});

// Preserve server authority over identity, totals, approval and posting state.
test('Pass 256 freezes server-owned request authority', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'approvalDefinitionCode',
    'approvalStatus',
    'certifiedAmount',
    'retentionAmount',
    'commitmentAmount',
    'commitmentSourceKey',
    'financePostingState',
  ]) assert.match(contract, new RegExp(`\\b${field}\\b`));
});

// Preserve closeout as fail-closed until final-account/retention conditions are authoritative.
test('Pass 256 freezes fail-closed subcontract closeout', () => {
  assert.match(contract, /SUBCONTRACT_NOT_READY_TO_CLOSE/);
  assert.match(contract, /fail-closed business conflict until the service can prove the reviewed close conditions/);
  assert.match(gate, /closeoutProofGapRecorded: true/);
});

// Freeze the source-required React boundary without generating it early.
test('Pass 256 freezes the Module 11 React boundary', () => {
  assert.match(contract, /apps\/web\/src\/features\/subcontracts\//);
  for (const view of [
    'Subcontractor register',
    'Subcontract detail',
    'Scope / BOQ lines',
    'Commitment summary',
    'Progress application / certification',
    'Retention ledger',
  ]) assert.ok(contract.includes(view), `Missing UI requirement: ${view}`);
  assert.match(contract, /No React code is generated in Pass 256/);
});

// Preserve the historical Pass-257 persistence boundary while later passes append higher layers.
test('Pass 257 persistence remains intact after schema repository service and HTTP generation', async () => {
  for (const path of [
    'apps/api/src/modules/subcontracts/subcontracts.schema.ts',
    'apps/api/src/modules/subcontracts/subcontracts.repository.ts',
    'apps/api/src/modules/subcontracts/subcontracts.service.ts',
    'apps/api/src/modules/subcontracts/subcontracts.routes.ts',
    'apps/api/src/modules/subcontracts/index.ts',
  ]) await access(path);
  assert.equal(await exists('apps/web/src/features/subcontracts'), true);
  assert.equal(await exists('packages/database/prisma/migrations/20260825000100_module_11_subcontractor_management_core/migration.sql'), true);
  assert.match(contract, /Pass 257 appends the reviewed Stage-16 Prisma persistence layer/);
  assert.match(persistenceGate, /repositoryGenerated: false/);
  assert.match(persistenceGate, /serviceGenerated: false/);
});

// Gate must remain fail-honest about the missing Stage-15 live handoff.
test('Pass 256 requires genuine Stage-15 live acceptance for runtime activation', () => {
  assert.match(gate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(gate, /STAGE_16_MODULE_11_CONTRACT_FROZEN_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(gate, /productionRuntimeActivationAllowed: passed && stage15LiveAccepted/);
});

// Preserve the historical Pass-256 handoff and advance only to the reviewed Pass-258 schema step.
test('Pass 257 advances Module 11 only to strict API schemas', () => {
  assert.match(contract, /Pass 257 - Module 11 reviewed Prisma models, constraints, indexes and Stage-16 migration/);
  assert.match(gate, /Pass 257 - Module 11 reviewed Prisma models, constraints, indexes and Stage-16 migration/);
  assert.match(contract, /Pass 258 - Module 11 strict Zod request\/query\/response schemas/);
  assert.match(persistenceGate, /Pass 258 - Module 11 strict Zod request\/query\/response schemas/);
});

// Pass 257 creates only the five reviewed Module-11 persistence models.
test('Pass 257 creates exactly the five reviewed Module 11 Prisma models', () => {
  for (const model of [
    'Subcontractor',
    'Subcontract',
    'SubcontractItem',
    'SubcontractPaymentApplication',
    'SubcontractPaymentLine',
  ]) assert.match(prisma, new RegExp(`model ${model} \\{`));
  for (const forbidden of ['SubcontractDeduction', 'SubcontractRetentionLedger', 'SubcontractApproval']) {
    assert.doesNotMatch(prisma, new RegExp(`model ${forbidden} \\{`));
  }
  assert.match(persistenceGate, /sourceOwnedTables:/);
  assert.match(persistenceGate, /inferredTablesAdded: \[\]/);
});

// The SQL migration must create exactly the five reviewed Stage-16 tables.
test('Pass 257 creates exactly five Module 11 database tables', () => {
  const createdTables = [...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(createdTables, [
    'subcontractors',
    'subcontracts',
    'subcontract_items',
    'subcontract_payment_applications',
    'subcontract_payment_lines',
  ]);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:subcontract_revisions|subcontract_deductions|retention_ledger|ap_invoices|approval_requests)"/);
});

// Part I requires the optional Vendor link while preserving Module-8 ownership and Company isolation.
test('Pass 257 persists the corrected nullable same-Company Vendor link', () => {
  assert.match(prisma, /vendorId\s+String\?\s+@map\("vendor_id"\)/);
  assert.match(prisma, /vendor\s+Vendor\?\s+@relation\(fields: \[vendorId, companyId\], references: \[id, companyId\]/);
  assert.match(migration, /subcontractors_vendor_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("vendor_id", "company_id"\) REFERENCES "vendors"\("id", "company_id"\)/);
  assert.match(persistenceGate, /vendorSameCompanyEnforced: true/);
  assert.match(persistenceGate, /vendorMasterDuplicated: false/);
});

// Numbering is concurrency-safe at the persistence boundary without inventing a new number table or subcontractor-code uniqueness.
test('Pass 257 records narrow subcontract and application numbering uniqueness', () => {
  assert.match(migration, /subcontracts_company_project_no_uq/);
  assert.match(migration, /UNIQUE INDEX "subcontracts_company_project_no_uq" ON "subcontracts"\("company_id", "project_id", "subcontract_no"\)/);
  assert.match(migration, /subcontract_payment_applications_subcontract_no_uq/);
  assert.match(migration, /"subcontract_id", "application_no"/);
  assert.match(migration, /CREATE INDEX "subcontractors_company_code_idx"/);
  assert.doesNotMatch(migration, /UNIQUE INDEX "subcontractors_company_code/);
  assert.match(persistenceGate, /subcontractorCodeUniquenessInvented: false/);
});

// Commercial values stay decimal-safe and unresolved lifecycle vocabularies remain string-backed.
test('Pass 257 uses reviewed decimal persistence without inventing lifecycle enums', () => {
  assert.match(prisma, /quantity\s+Decimal\s+@db\.Decimal\(18, 4\)/);
  assert.match(prisma, /rate\s+Decimal\s+@db\.Decimal\(18, 4\)/);
  assert.match(prisma, /originalValue\s+Decimal[\s\S]*?@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /certifiedAmount\s+Decimal[\s\S]*?@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /retentionPercent\s+Decimal[\s\S]*?@db\.Decimal\(7, 4\)/);
  assert.match(migration, /subcontracts_retention_percent_range/);
  assert.doesNotMatch(prisma, /enum\s+(?:SubcontractStatus|SubcontractorStatus|SubcontractPaymentApplicationStatus|ComplianceStatus)/);
  assert.match(persistenceGate, /statusEnumsInvented: false/);
});

// Header relationships enforce Company/Project/Subcontractor scope and basic contract invariants.
test('Pass 257 enforces subcontract Company Project and subcontractor integrity', () => {
  assert.match(migration, /subcontracts_project_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /subcontracts_subcontractor_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("subcontractor_id", "company_id"\) REFERENCES "subcontractors"\("id", "company_id"\)/);
  assert.match(migration, /subcontracts_date_order/);
  assert.match(migration, /subcontracts_original_value_nonnegative/);
  assert.match(migration, /subcontracts_revised_value_nonnegative/);
  assert.match(persistenceGate, /companyProjectSubcontractorScopeEnforced: true/);
});

// Scope lines use direct reviewed FKs and a posting-enabled Module-6 Project combination.
test('Pass 257 enforces subcontract item Project cost-structure integrity', () => {
  for (const fk of [
    'subcontract_items_wbs_node_fkey',
    'subcontract_items_cost_code_fkey',
    'subcontract_items_cost_type_fkey',
  ]) assert.match(migration, new RegExp(fk));
  assert.match(migration, /module_11_validate_subcontract_item_scope/);
  assert.match(migration, /project_cost_codes/);
  assert.match(migration, /mapping\."is_posting_allowed" = TRUE/);
  assert.match(migration, /Subcontract item must use a posting-enabled Project cost-code combination/);
  assert.match(persistenceGate, /postingEnabledCostStructureEnforced: true/);
});

// Optional BOQ links cannot cross Company/Project scope or attach an unmapped tender-only BOQ to a Project subcontract.
test('Pass 257 enforces optional BOQ Company and Project scope', () => {
  assert.match(migration, /subcontract_items_boq_item_fkey/);
  assert.match(migration, /JOIN "boq_revisions" revision/);
  assert.match(migration, /JOIN "boqs" boq/);
  assert.match(migration, /boq_project_id IS DISTINCT FROM subcontract_project_id/);
  assert.match(migration, /Subcontract BOQ item must belong to the subcontract Company and Project/);
  assert.match(persistenceGate, /boqCompanyProjectScopeEnforced: true/);
});

// Application persistence protects valuation period ordering and scoped numbering without guessing status values.
test('Pass 257 persists scoped payment applications without inventing status tokens', () => {
  assert.match(migration, /subcontract_payment_applications_period_order/);
  assert.match(migration, /CHECK \("period_to" >= "period_from"\)/);
  assert.match(prisma, /applicationNo\s+String\s+@map\("application_no"\)/);
  assert.match(prisma, /status\s+String\s+@db\.VarChar\(32\)/);
  assert.doesNotMatch(migration, /CHECK \("status" IN \(/);
});

// A payment line must belong to the same subcontract as its application; no unsupported one-line-per-item uniqueness is added.
test('Pass 257 enforces payment-line same-subcontract integrity', () => {
  assert.match(migration, /module_11_validate_payment_line_scope/);
  assert.match(migration, /Payment application line item must belong to the application subcontract/);
  assert.match(migration, /subcontract_payment_lines_scope_integrity/);
  assert.match(migration, /CREATE INDEX "subcontract_payment_lines_application_item_idx"/);
  assert.doesNotMatch(migration, /UNIQUE INDEX "subcontract_payment_lines_application_item/);
  assert.match(persistenceGate, /paymentLineSameSubcontractEnforced: true/);
  assert.match(persistenceGate, /paymentLinePerItemUniquenessInvented: false/);
});

// Preserve unresolved business behavior rather than forcing it into the database prematurely.
test('Pass 257 does not invent approval commitment Finance revision or retention persistence', () => {
  assert.doesNotMatch(migration, /approval_request_id|approval_definition_id/);
  assert.doesNotMatch(migration, /FOREIGN KEY[^;]*cost_commitments/);
  assert.doesNotMatch(migration, /FOREIGN KEY[^;]*(?:journals|ap_invoices)/);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:subcontract_revisions|subcontract_deductions|subcontract_retention_ledger)"/);
  assert.doesNotMatch(migration, /"(?:retention_release_id|deduction_id|revision_id)"/);
  assert.match(persistenceGate, /approvalPersistenceInvented: false/);
  assert.match(persistenceGate, /commitmentPersistenceChanged: false/);
  assert.match(persistenceGate, /financePersistenceChanged: false/);
  assert.match(persistenceGate, /revisionTableInvented: false/);
  assert.match(persistenceGate, /retentionLedgerTableInvented: false/);
});

// JSON contacts and amount/certification lifecycle formulas remain deliberately unresolved for later boundary/service passes.
test('Pass 257 preserves contact amount and certification-token source gaps', () => {
  assert.match(prisma, /contactJson\s+Json\s+@map\("contact_json"\) @db\.JsonB/);
  assert.doesNotMatch(migration, /jsonb_typeof\("contact_json"\)/);
  assert.doesNotMatch(migration, /"amount"\s*=\s*"quantity"\s*\*\s*"rate"/);
  assert.doesNotMatch(migration, /CERTIFIED|POSTED/);
  assert.match(persistenceGate, /contactJsonSchemaInvented: false/);
  assert.match(persistenceGate, /amountFormulaInvented: false/);
  assert.match(persistenceGate, /certificationStatusTokenInvented: false/);
});

// Preserve the Stage-16 migration gate after later stages append their own migrations.
test('Pass 257 registers the Stage-16 migration gate and persistence command', () => {
  const stage16Gate = migrationGates.gates.find((entry) => entry.gate === 'module-11-subcontractor-management-core-persistence');
  assert.equal(stage16Gate?.stage, 16);
  assert.equal(stage16Gate?.gate, 'module-11-subcontractor-management-core-persistence');
  assert.deepEqual(stage16Gate?.migrations, ['20260825000100_module_11_subcontractor_management_core']);
  assert.equal(rootPackage.scripts['module-11:persistence:gate'], 'node scripts/module-11/verify-stage-16-persistence.mjs');
  assert.match(persistenceGate, /STAGE_16_MODULE_11_PERSISTENCE_READY_FOR_PASS_258/);
  assert.match(persistenceGate, /STAGE_16_MODULE_11_PERSISTENCE_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
});



// Pass 258 remains the reviewed Zod/API checkpoint after later repository/service generation.
test('Pass 258 schema boundary remains intact after repository and service generation', async () => {
  await access('apps/api/src/modules/subcontracts/subcontracts.schema.ts');
  await access('apps/api/src/modules/subcontracts/subcontracts.repository.ts');
  await access('apps/api/src/modules/subcontracts/subcontracts.service.ts');
  await access('apps/api/src/modules/subcontracts/subcontracts.routes.ts');
  await access('apps/api/src/modules/subcontracts/index.ts');
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
});

// Keep all and only the eight reviewed public operations visible at the boundary.
test('Pass 258 schema freezes exactly eight reviewed Module 11 HTTP operations', () => {
  for (const route of [
    '/api/v1/subcontractors',
    '/api/v1/subcontracts',
    '/api/v1/subcontracts/:id',
    '/api/v1/subcontracts/:id/execute',
    '/api/v1/subcontracts/:id/payment-applications',
    '/api/v1/subcontracts/:id/payment-applications/:appId/certify',
    '/api/v1/subcontracts/:id/close',
  ]) assert.match(schema, new RegExp(route.replace(/[/:]/g, (value) => `\\${value}`)));
  const routes = schema.match(/export const MODULE_11_HTTP_ROUTES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.equal((routes.match(/Object\.freeze\(\{ method:/g) ?? []).length, 8);
  assert.doesNotMatch(routes, /\/subcontracts\/:id\/submit|\/subcontracts\/:id\/approve/);
  assert.match(schemaGate, /reviewedRouteCount: 8/);
});

// Preserve the reviewed seven permission tokens without resolving the draft-edit mismatch by invention.
test('Pass 258 schema keeps exactly seven reviewed permissions', () => {
  for (const permission of [
    'subcontractors.read',
    'subcontractors.manage',
    'subcontracts.read',
    'subcontracts.create',
    'subcontracts.execute',
    'subcontracts.certify',
    'subcontracts.close',
  ]) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  const permissions = schema.match(/export const MODULE_11_PERMISSION_CODES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.equal((permissions.match(/'[^']+'/g) ?? []).length, 7);
  assert.doesNotMatch(permissions, /subcontracts\.edit|subcontracts\.update|subcontracts\.apply|retention\.release/);
  assert.match(schemaGate, /draftEditPermissionInvented: false/);
});

// The only reviewed GET route documents no business filters, so bounded pagination remains the full query surface.
test('Pass 258 subcontractor list accepts bounded pagination only', () => {
  const query = schema.match(/export const listSubcontractorsQuerySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(query, /paginationQueryShape/);
  assert.doesNotMatch(query, /search|status|complianceStatus|vendorId|projectId/);
  assert.match(schema, /MODULE_11_MAX_PAGE_SIZE = 100/);
  assert.match(schemaGate, /listFiltersInvented: false/);
});

// Subcontractor creation can link Module-8 Vendor data but cannot set Company or lifecycle status.
test('Pass 258 subcontractor create keeps ownership and lifecycle authority server-side', () => {
  const body = schema.match(/export const createSubcontractorBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['vendorId', 'code', 'legalName', 'taxNo', 'contactJson', 'complianceStatus']) {
    assert.match(body, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(body, /companyId|actorUserId|status:/);
  assert.match(schema, /opaqueContactObjectSchema = z\.record\(z\.unknown\(\)\)/);
  assert.doesNotMatch(schema, /contactName|contactEmail|contactPhone/);
  assert.match(schemaGate, /vendorLinkAcceptedFromBrowser: true/);
  assert.match(schemaGate, /subcontractorStatusAcceptedFromBrowser: false/);
  assert.match(schemaGate, /contactJsonKeysInvented: false/);
});

// Draft creation sends source business values only; header numbering and totals stay server-owned.
test('Pass 258 subcontract create excludes numbering status and server-calculated header totals', () => {
  const body = schema.match(/export const createSubcontractBodySchema =[\s\S]*?\}\);/)?.[0] ?? '';
  for (const field of ['projectId', 'subcontractorId', 'startDate', 'endDate', 'retentionPercent', 'currency', 'items']) {
    assert.match(body, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(body, /subcontractNo|status:|originalValue|revisedValue|companyId|approval/);
  assert.match(schemaGate, /subcontractNumberAcceptedFromBrowser: false/);
  assert.match(schemaGate, /originalValueAcceptedFromBrowser: false/);
  assert.match(schemaGate, /revisedValueAcceptedFromBrowser: false/);
});

// Scope lines carry reviewed commercial and cost-coding inputs while keeping the amount-formula gap explicit.
test('Pass 258 subcontract item schema uses exact decimals without inventing an amount formula', () => {
  const item = schema.match(/export const subcontractItemInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['boqItemId', 'description', 'quantity', 'unit', 'rate', 'amount', 'wbsNodeId', 'costCodeId', 'costTypeId']) {
    assert.match(item, new RegExp(`${field}:`));
  }
  assert.match(schema, /quantity must be a positive exact decimal string with at most 14 whole digits and 4 decimal places/);
  assert.match(schema, /rate must be a non-negative exact decimal string with at most 14 whole digits and 4 decimal places/);
  assert.match(schema, /money must be a non-negative exact decimal string with at most 16 whole digits and 2 decimal places/);
  assert.doesNotMatch(schema, /quantity\s*\*\s*rate|rate\s*\*\s*quantity/);
  assert.match(schemaGate, /itemAmountAcceptedFromBrowser: true/);
  assert.match(schemaGate, /itemAmountFormulaInvented: false/);
});

// Draft PATCH stays narrow and does not introduce Project reassignment or a new permission token.
test('Pass 258 draft-edit schema keeps Project identity fixed and requires a real change', () => {
  const body = schema.match(/export const updateDraftSubcontractBodySchema =[\s\S]*?;\n\n\/\*\* Execution/)?.[0] ?? '';
  for (const field of ['subcontractorId', 'startDate', 'endDate', 'retentionPercent', 'currency', 'items']) {
    assert.match(body, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(body, /projectId:|subcontractNo|originalValue|revisedValue|status:/);
  assert.match(body, /At least one editable draft subcontract field must be provided/);
  assert.match(schemaGate, /draftProjectChangeAcceptedFromBrowser: false/);
});

// Execute and close do not accept invented approval, closeout or retention-release payloads.
test('Pass 258 execute and close commands remain bodyless', () => {
  assert.match(schema, /executeSubcontractBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /closeSubcontractBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.doesNotMatch(schema, /finalAccountAmount|retentionReleaseAmount|approvalDecision|approvalDefinitionCode:/);
  assert.match(schemaGate, /executeBodyless: true/);
  assert.match(schemaGate, /closeBodyless: true/);
});

// Application creation sends valuation-period detail while numbering and calculated history/totals stay server-side.
test('Pass 258 payment application schema excludes server-owned numbering previous progress and totals', () => {
  const body = schema.match(/export const createPaymentApplicationBodySchema =[\s\S]*?\}\);/)?.[0] ?? '';
  const line = schema.match(/export const paymentApplicationLineInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['periodFrom', 'periodTo', 'lines']) assert.match(body, new RegExp(`${field}:`));
  for (const field of ['subcontractItemId', 'currentQty', 'currentValue']) assert.match(line, new RegExp(`${field}:`));
  assert.doesNotMatch(body + line, /applicationNo|previousQty|claimedAmount|certifiedAmount|retentionAmount|status:/);
  assert.match(body, /Payment application period end must be on or after the period start/);
  assert.match(schemaGate, /applicationNumberAcceptedFromBrowser: false/);
  assert.match(schemaGate, /previousQtyAcceptedFromBrowser: false/);
  assert.match(schemaGate, /claimedAmountAcceptedFromBrowser: false/);
});

// Certification accepts the QS line decision but not header totals, deductions, overrides or retention authority.
test('Pass 258 certification schema keeps retention and cumulative override authority server-side', () => {
  const body = schema.match(/export const certifyPaymentApplicationBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const line = schema.match(/export const certificationLineInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(body, /lines:/);
  assert.match(line, /subcontractItemId:/);
  assert.match(line, /certifiedValue:/);
  assert.doesNotMatch(body + line, /certifiedAmount|retentionAmount|deduction|override|allowExceed|retentionRelease/);
  assert.match(schemaGate, /certifiedAmountAcceptedFromBrowser: false/);
  assert.match(schemaGate, /retentionAmountAcceptedFromBrowser: false/);
  assert.match(schemaGate, /deductionFieldInvented: false/);
  assert.match(schemaGate, /certificationOverrideFieldInvented: false/);
});

// Safe responses may expose server results but not Company, approval-source, commitment-source or Finance internals.
test('Pass 258 response schemas expose safe subcontract and certification snapshots', () => {
  const subcontract = schema.match(/export const subcontractResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const application = schema.match(/export const paymentApplicationResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['subcontractNo', 'status', 'originalValue', 'revisedValue', 'retentionPercent', 'items']) {
    assert.match(subcontract, new RegExp(`${field}:`));
  }
  for (const field of ['applicationNo', 'claimedAmount', 'certifiedAmount', 'retentionAmount', 'status', 'lines']) {
    assert.match(application, new RegExp(`${field}:`));
  }
  assert.doesNotMatch(subcontract + application, /companyId|approvalDefinitionCode|approvalStatus|commitmentSourceKey|financePostingState/);
  assert.match(schemaGate, /commitmentSourceTokensExposedInResponse: false/);
  assert.match(schemaGate, /financePostingStateExposedInResponse: false/);
});

// Preserve the source-defined stable errors/events without adding source-unsupported codes.
test('Pass 258 schema freezes five business errors and five events', () => {
  for (const code of [
    'SUBCONTRACT_NOT_FOUND',
    'SUBCONTRACT_NOT_APPROVED',
    'PAYMENT_APPLICATION_INVALID',
    'CERTIFIED_VALUE_EXCEEDS_CONTRACT',
    'SUBCONTRACT_NOT_READY_TO_CLOSE',
  ]) assert.match(schema, new RegExp(`'${code}'`));
  for (const event of [
    'subcontract.executed',
    'subcontract.revised',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'subcontract.closed',
  ]) assert.match(schema, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(schema, /export function createModule11Error\(code: Module11ErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ValidationError/);
  assert.match(schema, /new ConflictError/);
  assert.doesNotMatch(schema, /PAYMENT_APPLICATION_NOT_FOUND|SUBCONTRACT_EDIT_FORBIDDEN|RETENTION_RELEASE_NOT_ALLOWED/);
  assert.match(schemaGate, /reviewedErrorCount: 5/);
  assert.match(schemaGate, /reviewedEventCount: 5/);
});

// Keep the server-owned authority list explicit and preserve the missing readback/approval/revision contracts.
test('Pass 258 keeps ownership and unresolved source gaps explicit at the Zod boundary', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'approvalDefinitionCode',
    'approvalStatus',
    'subcontractNo',
    'applicationNo',
    'originalValue',
    'revisedValue',
    'claimedAmount',
    'certifiedAmount',
    'retentionAmount',
    'previousQty',
    'commitmentAmount',
    'commitmentSourceKey',
    'financePostingState',
  ]) assert.match(schema, new RegExp(`'${field}'`));
  assert.match(schemaGate, /approvalFieldsAcceptedFromBrowser: false/);
  assert.match(schemaGate, /commitmentFieldsAcceptedFromBrowser: false/);
  assert.match(schemaGate, /financeFieldsAcceptedFromBrowser: false/);
  assert.match(schemaGate, /extraReadRoutesInvented: false/);
  assert.match(schemaGate, /statusEnumsInvented: false/);
});

// Pass 258 becomes the schema checkpoint only after persistence and remains blocked from runtime activation without Stage 15 live acceptance.
test('Pass 258 registers the schema gate and truthful Stage-16 handoff status', () => {
  assert.equal(rootPackage.scripts['module-11:schema:gate'], 'node scripts/module-11/verify-stage-16-schema.mjs');
  assert.match(schemaGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(schemaGate, /STAGE_16_MODULE_11_SCHEMA_READY_FOR_PASS_259/);
  assert.match(schemaGate, /STAGE_16_MODULE_11_SCHEMA_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && stage15LiveAccepted/);
  assert.match(schemaGate, /Pass 259 - Module 11 Company\/Project-scoped repository/);
});


// Preserve the historical Pass-259 repository boundary while Pass 260 appends the service layer only.
test('Pass 259 repository remains intact after service generation', async () => {
  assert.match(repository, /export class SubcontractsRepository/);
  assert.match(repository, /DatabaseClient \| TransactionClient/);
  assert.match(repository, /constructor\(private readonly db: RepositoryClient\)/);
  await access('apps/api/src/modules/subcontracts/subcontracts.repository.ts');
  await access('apps/api/src/modules/subcontracts/subcontracts.service.ts');
  await access('apps/api/src/modules/subcontracts/subcontracts.routes.ts');
  await access('apps/api/src/modules/subcontracts/index.ts');
  assert.match(repositoryGate, /serviceGenerated: false/);
  assert.match(repositoryGate, /routesGenerated: false/);
  assert.match(repositoryGate, /reactGenerated: false/);
});

// Company ownership and Project visibility remain mandatory repository predicates.
test('Pass 259 scopes subcontract persistence by trusted Company and explicit Project visibility', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /SubcontractProjectVisibilityRepositoryInput/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /buildProjectVisibilityWhere/);
  for (const method of ['findProjectById', 'findSubcontractById', 'listPaymentApplicationsBySubcontract', 'findPaymentApplicationById']) {
    assert.match(repository, new RegExp(`async ${method}`));
  }
  assert.match(repositoryGate, /companyOwnershipFromTrustedRequestContext: true/);
  assert.match(repositoryGate, /projectVisibilityRequiredForSubcontractReadsAndWrites: true/);
});

// The subcontractor register stays bounded and does not acquire source-unsupported filters in the repository.
test('Pass 259 keeps subcontractor repository pagination bounded without invented filters', () => {
  assert.match(repository, /MODULE_11_MAX_PAGE_SIZE/);
  assert.match(repository, /assertPageWindow/);
  assert.match(repository, /async listSubcontractors/);
  assert.doesNotMatch(repository, /contains:|mode: 'insensitive'|search:/);
  assert.match(repositoryGate, /paginationBounded: true/);
  assert.match(repositoryGate, /businessListFiltersInvented: false/);
});

// Module 8 remains Vendor owner: Stage 16 reads a Vendor only to validate the nullable link.
test('Pass 259 prepares same-Company Vendor lookup without duplicating Vendor writes', () => {
  assert.match(repository, /async findVendorById/);
  assert.match(repository, /this\.db\.vendor\.findFirst/);
  assert.match(repository, /async createSubcontractor/);
  assert.match(repository, /if \(input\.vendorId && !\(await this\.findVendorById\(input\.vendorId\)\)\) return null/);
  assert.doesNotMatch(repository, /vendor\.(create|update|updateMany|delete|deleteMany|upsert)/);
  assert.match(repositoryGate, /vendorReadPrimitivePrepared: true/);
  assert.match(repositoryGate, /vendorWriteMethodsGenerated: false/);
});

// BOQ and Module-6 cost data are dependency lookups only, never mutated by Module 11.
test('Pass 259 prepares Project-mapped BOQ and posting-enabled cost-structure lookups', () => {
  assert.match(repository, /async findPostingCostStructures/);
  assert.match(repository, /this\.db\.projectCostCode\.findMany/);
  assert.match(repository, /isPostingAllowed: true/);
  assert.match(repository, /async findBoqItemsForProject/);
  assert.match(repository, /this\.db\.boqItem\.findMany/);
  assert.match(repository, /companyId: scope\.companyId/);
  assert.match(repository, /projectId/);
  assert.doesNotMatch(repository, /projectCostCode\.(create|update|delete|upsert)/);
  assert.doesNotMatch(repository, /boq(Item)?\.(create|update|delete|upsert)/);
  assert.match(repositoryGate, /module6CostStructureReadPrepared: true/);
  assert.match(repositoryGate, /module4BoqItemReadPrepared: true/);
});

// Subcontract create/edit persistence validates scope but leaves lifecycle and commercial formulas to the service.
test('Pass 259 prepares subcontract create and draft replacement primitives without deciding business transitions', () => {
  assert.match(repository, /async createSubcontract/);
  assert.match(repository, /this\.db\.subcontract\.create/);
  assert.match(repository, /items: \{[\s\S]*create: input\.items\.map/);
  assert.match(repository, /async replaceDraftSubcontract/);
  assert.match(repository, /subcontractItem\.deleteMany/);
  assert.match(repository, /subcontractItem\.createMany/);
  assert.match(repository, /async updateSubcontractStatus/);
  assert.match(repository, /status: expectedStatus/);
  assert.doesNotMatch(repository, /const\s+(DRAFT|APPROVED|EXECUTED|CLOSED)_|SUBCONTRACT_NOT_APPROVED|SUBCONTRACT_NOT_READY_TO_CLOSE/);
  assert.doesNotMatch(repository, /quantity\s*\*\s*rate|retentionPercent\s*\/|CERTIFIED_VALUE_EXCEEDS_CONTRACT/);
  assert.match(repositoryGate, /retentionFormulaDecidedInRepository: false/);
  assert.match(repositoryGate, /certificationLimitDecidedInRepository: false/);
});

// Row locks prepare concurrency-safe execution and certification without owning the service invariants.
test('Pass 259 prepares subcontract and payment-application row locks', () => {
  assert.match(repository, /async lockSubcontractForWrite/);
  assert.match(repository, /FROM subcontracts/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /async lockPaymentApplicationForWrite/);
  assert.match(repository, /FROM subcontract_payment_applications application/);
  assert.match(repository, /FOR UPDATE OF application/);
  assert.match(repositoryGate, /subcontractRowLockPrepared: true/);
  assert.match(repositoryGate, /paymentApplicationRowLockPrepared: true/);
});

// Payment-application persistence provides internal cumulative readback and service-calculated certification updates only.
test('Pass 259 prepares progress-application and certification persistence without public read APIs', () => {
  assert.match(repository, /async listPaymentApplicationsBySubcontract/);
  assert.match(repository, /async findPaymentApplicationById/);
  assert.match(repository, /async createPaymentApplication/);
  assert.match(repository, /this\.db\.subcontractPaymentApplication\.create/);
  assert.match(repository, /previousQty: line\.previousQty/);
  assert.match(repository, /claimedAmount: input\.claimedAmount/);
  assert.match(repository, /async updatePaymentApplicationCertification/);
  assert.match(repository, /certifiedAmount: input\.certifiedAmount/);
  assert.match(repository, /retentionAmount: input\.retentionAmount/);
  assert.match(repository, /certifiedValue: line\.certifiedValue/);
  assert.doesNotMatch(repository, /app\.(get|post|patch)|registerSubcontractsRoutes/);
  assert.match(repositoryGate, /paymentApplicationCreatePrepared: true/);
  assert.match(repositoryGate, /certificationUpdatePrimitivePrepared: true/);
});

// Module-7 commitment integration is source-keyed, with exact source/status vocabulary deliberately left to Pass 260.
test('Pass 259 prepares idempotent Module 7 commitment primitives without inventing source tokens', () => {
  assert.match(repository, /async listCostCommitmentsBySource/);
  assert.match(repository, /async upsertCostCommitment/);
  assert.match(repository, /companyId_projectId_sourceType_sourceId_sourceLineId/);
  assert.match(repository, /this\.db\.costCommitment\.upsert/);
  assert.match(repository, /costStructureId: input\.costStructureId/);
  assert.doesNotMatch(repository, /const\s+SUBCONTRACT_COMMITMENT_SOURCE_TYPE|sourceType\s*=\s*['"]SUBCONTRACT/);
  assert.match(repositoryGate, /module7CommitmentReadPrepared: true/);
  assert.match(repositoryGate, /module7CommitmentUpsertPrepared: true/);
  assert.match(repositoryGate, /commitmentSourceTokenVocabularyInvented: false/);
});

// Stage 16 repository access must not pull forward approval, Finance/AP, retention-ledger or formal variation persistence.
test('Pass 259 preserves deferred approval Finance Change Order and retention boundaries', () => {
  assert.doesNotMatch(repository, /approval(Request|Definition|Action)\.(create|update|upsert)/);
  assert.doesNotMatch(repository, /apInvoice\.(create|update|upsert)|journal\.(create|update|upsert)|paymentAllocation\.(create|update|upsert)/);
  assert.doesNotMatch(repository, /changeOrder|retentionLedger/);
  assert.match(repositoryGate, /approvalPersistenceInvented: false/);
  assert.match(repositoryGate, /financeWriteMethodsGenerated: false/);
  assert.match(repositoryGate, /variationPersistenceInvented: false/);
  assert.match(repositoryGate, /retentionLedgerPersistenceInvented: false/);
});

// Register the fail-honest repository gate while the previous Stage-15 live handoff remains authoritative.
test('Pass 259 registers the Stage-16 repository gate and Pass-260 handoff', () => {
  assert.equal(rootPackage.scripts['module-11:repository:gate'], 'node scripts/module-11/verify-stage-16-repository.mjs');
  assert.match(repositoryGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(repositoryGate, /STAGE_16_MODULE_11_REPOSITORY_READY_FOR_PASS_260/);
  assert.match(repositoryGate, /STAGE_16_MODULE_11_REPOSITORY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage15LiveAccepted/);
  assert.match(repositoryGate, /Pass 260 - Module 11 service\/business transactions/);
});


// Pass 260 adds the service layer only; HTTP registration and React remain deferred.
test('Pass 260 adds Module 11 business service without generating HTTP or UI early', async () => {
  assert.match(service, /export class SubcontractsService/);
  assert.match(service, /constructor\(private readonly db: DatabaseClient, options: SubcontractsServiceOptions = \{\}\)/);
  await access('apps/api/src/modules/subcontracts/subcontracts.service.ts');
  await access('apps/api/src/modules/subcontracts/subcontracts.routes.ts');
  await access('apps/api/src/modules/subcontracts/index.ts');
  assert.equal(await exists('apps/web/src/features/subcontracts'), true);
  assert.match(serviceGate, /routesGenerated: false/);
  assert.match(serviceGate, /reactGenerated: false/);
});

// Every reviewed write is idempotent at the service boundary and server numbering remains Foundation-owned.
test('Pass 260 makes all seven Module 11 writes idempotent and server-numbered', () => {
  for (const operation of [
    'subcontracts.subcontractor-create',
    'subcontracts.create',
    'subcontracts.draft-update',
    'subcontracts.execute',
    'subcontracts.payment-application-create',
    'subcontracts.payment-application-certify',
    'subcontracts.close',
  ]) assert.match(service, new RegExp(`operation: '${operation.replaceAll('.', '\\.')}'`));
  assert.equal((service.match(/executeIdempotentCommand\(/g) ?? []).length, 9);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: SUBCONTRACT_SEQUENCE_KEY \}\)/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: APPLICATION_SEQUENCE_KEY \}\)/);
  assert.match(serviceGate, /idempotentWriteCommandCount: 7/);
  assert.match(serviceGate, /serverNumberingUsed: true/);
});

// Project and permission authority stays server-side, including the documented draft/application permission convention.
test('Pass 260 revalidates Company Project and reviewed permission authority', () => {
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(service, /'subcontractors\.read'/);
  assert.match(service, /'subcontractors\.manage'/);
  assert.match(service, /'subcontracts\.create'/);
  assert.match(service, /'subcontracts\.execute'/);
  assert.match(service, /'subcontracts\.certify'/);
  assert.match(service, /'subcontracts\.close'/);
  assert.match(service, /Only a DRAFT subcontract can be edited directly/);
  assert.match(serviceGate, /draftEditPermissionConvention: 'subcontracts\.create'/);
  assert.match(serviceGate, /paymentApplicationCreatePermissionConvention: 'subcontracts\.create'/);
});

// Browser line amounts remain authoritative business inputs while only the header aggregation is server-derived.
test('Pass 260 calculates subcontract headers from exact item amounts without inventing quantity-times-rate pricing', () => {
  assert.match(service, /function subcontractValue/);
  assert.match(service, /items\.map\(\(item\) => moneyToMinorUnits\(item\.amount\)\)/);
  assert.doesNotMatch(service, /decimalToScale4\(item\.quantity\).*moneyToMinorUnits\(item\.rate\)|moneyToMinorUnits\(item\.rate\).*decimalToScale4\(item\.quantity\)/s);
  assert.match(service, /DECIMAL_SCALE_4 = 10_000n/);
  assert.match(service, /moneyToMinorUnits/);
  assert.match(serviceGate, /headerValueDerivedFromItemAmounts: true/);
  assert.match(serviceGate, /quantityTimesRateFormulaInvented: false/);
});

// Execute owns the Module-22 handshake and uses a versioned commercial snapshot so draft edits require fresh approval.
test('Pass 260 requires snapshot-versioned Module 22 approval before execution', () => {
  assert.match(service, /subcontractApprovalSnapshot/);
  assert.match(service, /sourceType: APPROVAL_SOURCE_TYPE/);
  assert.match(service, /sourceLineId: fingerprintRequest\(payloadSnapshot\)/);
  assert.match(service, /requestApproval\(/);
  assert.match(service, /requestApprovalInTransaction\(/);
  assert.match(service, /approval\.status !== 'APPROVED'/);
  assert.match(service, /SUBCONTRACT_NOT_APPROVED/);
  assert.match(serviceGate, /approvalDefinitionServerOwned: true/);
  assert.match(serviceGate, /approvalRequestSnapshotVersioned: true/);
});

// Execution locks the Project/subcontract and creates only Module-7 source-keyed commitments in the same transaction.
test('Pass 260 executes subcontract and writes idempotent Module 7 commitments atomically', () => {
  assert.match(service, /lockProjectForWrite\(current\.projectId\)/);
  assert.match(service, /lockSubcontractForWrite\(current\.projectId, current\.id\)/);
  assert.match(service, /const COMMITMENT_SOURCE_TYPE = 'subcontract'/);
  assert.match(service, /const COMMITMENT_ACTIVE = 'ACTIVE'/);
  assert.match(service, /sourceLineId: item\.id/);
  assert.match(service, /await this\.writeActiveCommitments\(repository, executed\)/);
  assert.match(service, /eventType: 'subcontract\.executed'/);
  assert.doesNotMatch(service, /costActual\.(create|update|upsert)|apInvoice\.(create|update|upsert)|journal\.(create|update|upsert)/);
  assert.match(serviceGate, /executionAndCommitmentAtomic: true/);
  assert.match(serviceGate, /financeWritesGenerated: false/);
});

// Progress applications derive prior progress and header claim totals from certified history rather than browser-owned snapshots.
test('Pass 260 derives progress application history and totals server-side', () => {
  assert.match(service, /previousApplications = await repository\.listPaymentApplicationsBySubcontract/);
  assert.match(service, /APPLICATION_CERTIFIED/);
  assert.match(service, /previousQtyByItem/);
  assert.match(service, /previousCertifiedByItem/);
  assert.match(service, /previousQty \+ currentQty > decimalToScale4\(item\.quantity\)/);
  assert.match(service, /previousCertified \+ currentValue > moneyToMinorUnits\(item\.amount\)/);
  assert.match(service, /claimedAmount = minorUnitsToMoney\(addMoney/);
  assert.match(service, /status: APPLICATION_SUBMITTED/);
  assert.match(service, /eventType: 'subcontract\.payment_application_submitted'/);
  assert.match(serviceGate, /paymentApplicationPriorProgressFromCertifiedHistory: true/);
});

// Certification is serialized, cumulatively bounded and stores server-calculated retention as an immutable lifecycle snapshot.
test('Pass 260 certifies submitted applications with cumulative contract and retention controls', () => {
  assert.match(service, /lockPaymentApplicationForWrite/);
  assert.match(service, /APPLICATION_SUBMITTED/);
  assert.match(service, /priorCertifiedTotal \+ certifiedAmount > revisedValue/);
  assert.match(service, /priorValue \+ value > moneyToMinorUnits\(item\.amount\)/);
  assert.match(service, /calculateRetention\(revisedValue, current\.retentionPercent\)/);
  assert.match(service, /calculateRetention\(certifiedAmount, current\.retentionPercent\)/);
  assert.match(service, /status: APPLICATION_CERTIFIED/);
  assert.match(service, /CERTIFIED_VALUE_EXCEEDS_CONTRACT/);
  assert.match(service, /eventType: 'subcontract\.payment_certified'/);
  assert.match(serviceGate, /retentionServerCalculated: true/);
  assert.match(serviceGate, /certificationSnapshotImmutableByLifecycle: true/);
});

// Certification publishes only a stable future Finance source identity; Stage-26 AP remains deferred.
test('Pass 260 prepares stable certification source identity without posting Finance AP early', () => {
  assert.match(service, /const CERTIFICATION_SOURCE_TYPE = 'subcontract-payment-certification'/);
  assert.match(service, /createStableSourceKey/);
  assert.match(service, /serializeStableSourceKey/);
  assert.match(service, /financeAdapterDeferredToStage26: true/);
  assert.doesNotMatch(service, /new Finance|FinanceService|ApInvoice|apInvoice\.|journal\.|paymentAllocation\./);
  assert.match(serviceGate, /certificationStableSourceKeyPrepared: true/);
  assert.match(serviceGate, /financeAdapterDeferredToStage26: true/);
});

// Closeout stays fail-closed because this stage owns no retention-release command.
test('Pass 260 closes only when final certification is complete and retained value is proven zero', () => {
  assert.match(service, /applications\.some\(\(application\) => !hasStatus\(application\.status, APPLICATION_CERTIFIED\)\)/);
  assert.match(service, /certifiedTotal !== moneyToMinorUnits\(current\.revisedValue\)/);
  assert.match(service, /retentionTotal - releasedRetention !== 0n/);
  assert.match(service, /SUBCONTRACT_NOT_READY_TO_CLOSE/);
  assert.match(service, /eventType: 'subcontract\.closed'/);
  assert.match(serviceGate, /retentionReleaseImplemented: false/);
  assert.match(serviceGate, /closeoutFailClosed: true/);
});

// Only source-backed events with implemented commands are emitted; the future revision event is not fabricated.
test('Pass 260 emits reviewed implemented events but not subcontract.revised without a revision command', () => {
  for (const event of [
    'subcontract.executed',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'subcontract.closed',
  ]) assert.match(service, new RegExp(`eventType: '${event.replaceAll('.', '\\.')}'`));
  assert.match(service, /eventType: 'subcontract\.revised'/);
  assert.match(serviceGate, /revisedEventEmittedWithoutReviewedRevisionCommand: false/);
  assert.match(serviceGate, /formalVariationAdapterGenerated: false/);
});

// Audit and outbox effects are inside idempotency transactions for source-defined state changes.
test('Pass 260 records audit and outbox with the business transactions', () => {
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /action: 'subcontract\.executed'/);
  assert.match(service, /action: 'subcontract\.payment_certified'/);
  assert.match(service, /action: 'subcontract\.closed'/);
});

// Every named helper and top-level service method remains purpose-commented for the project readability guard.
test('Pass 260 keeps named service functions purpose-commented', () => {
  const lines = service.split(/\r?\n/);
  let braceDepth = 0;
  let classBodyDepth = null;
  const missing = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*export\s+class\s+SubcontractsService/.test(line) && line.includes('{')) classBodyDepth = braceDepth + 1;
    const functionMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[<(]/);
    const methodMatch = classBodyDepth !== null && braceDepth === classBodyDepth
      ? line.match(/^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\(/)
      : null;
    const name = functionMatch?.[1] ?? methodMatch?.[1];
    if (name) {
      let previous = index - 1;
      while (previous >= 0 && lines[previous].trim() === '') previous -= 1;
      if (previous < 0 || !(lines[previous].trim().startsWith('//') || lines[previous].trim().endsWith('*/'))) {
        missing.push(`${index + 1}:${name}`);
      }
    }
    braceDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (classBodyDepth !== null && braceDepth < classBodyDepth) classBodyDepth = null;
  }

  assert.deepEqual(missing, []);
});

// Register the fail-honest service gate and advance only to reviewed HTTP composition.
test('Pass 260 registers the Stage-16 service gate and Pass-261 handoff', () => {
  assert.equal(rootPackage.scripts['module-11:service:gate'], 'node scripts/module-11/verify-stage-16-service.mjs');
  assert.match(serviceGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(serviceGate, /STAGE_16_MODULE_11_SERVICE_READY_FOR_PASS_261/);
  assert.match(serviceGate, /STAGE_16_MODULE_11_SERVICE_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && stage15LiveAccepted/);
  assert.match(serviceGate, /Pass 261 - Module 11 Fastify routes/);
});

// Pass 261 adds only the reviewed HTTP composition and keeps React/integration work for later passes.
test('Pass 261 adds the five-file Module 11 backend composition without generating UI early', async () => {
  assert.match(routes, /export async function registerSubcontractsRoutes/);
  assert.match(moduleIndex, /registerSubcontractsRoutes/);
  await access('apps/api/src/modules/subcontracts/subcontracts.routes.ts');
  await access('apps/api/src/modules/subcontracts/index.ts');
  assert.equal(await exists('apps/web/src/features/subcontracts'), true);
  assert.match(httpGate, /reactGenerated: false/);
  assert.match(httpGate, /integrationTestsGenerated: false/);
});

// The route layer must expose exactly the eight source-reviewed operations and no readback/approval/revision inventions.
test('Pass 261 registers exactly eight reviewed Module 11 HTTP operations', () => {
  const registrations = [...routes.matchAll(/app\.(get|post|patch)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  for (const operation of [
    'GET /api/v1/subcontractors',
    'POST /api/v1/subcontractors',
    'POST /api/v1/subcontracts',
    'PATCH /api/v1/subcontracts/:id',
    'POST /api/v1/subcontracts/:id/execute',
    'POST /api/v1/subcontracts/:id/payment-applications',
    'POST /api/v1/subcontracts/:id/payment-applications/:appId/certify',
    'POST /api/v1/subcontracts/:id/close',
  ]) assert.ok(registrations.includes(operation), `Missing historical reviewed operation: ${operation}`);
  assert.equal(registrations.length, 14);
  for (const forbidden of [
    '/api/v1/subcontracts/:id/submit',
    '/api/v1/subcontracts/:id/approve',
  ]) assert.equal(routes.includes(forbidden), false);
  assert.match(httpGate, /exactReviewedRouteCount: 8/);
});

// Every normal Module-11 operation authenticates before entering the service; persisted service policy remains authoritative.
test('Pass 261 requires authentication and preserves service-side RBAC resource policy', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 14);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 14);
  assert.match(service, /requireCompanyPermission/);
  assert.match(service, /requireProjectPermission/);
  assert.match(service, /resolveProjectVisibility/);
  assert.match(httpGate, /authenticationRequiredForAllRoutes: true/);
  assert.match(httpGate, /serviceResourcePolicyRemainsAuthoritative: true/);
});

// All seven reviewed writes use the Foundation idempotency header because the service makes each write idempotent.
test('Pass 261 requires Idempotency-Key on all seven Module 11 write operations', () => {
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 9);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 9);
  assert.match(routes, /required: \['idempotency-key'\]/);
  assert.match(routes, /Expected 1-200 characters/);
  assert.match(httpGate, /idempotentCommandRouteCount: 7/);
});

// Route bodies stay within the strict Pass-258 business-input contract and do not accept server-owned commercial authority.
test('Pass 261 OpenAPI bodies exclude server-owned Module 11 authority', () => {
  for (const forbidden of [
    'companyId',
    'actorUserId',
    'permissions',
    'approvalDefinitionCode',
    'subcontractNo',
    'applicationNo',
    'originalValue',
    'revisedValue',
    'claimedAmount',
    'certifiedAmount',
    'retentionAmount',
    'commitmentAmount',
    'financePostingState',
  ]) {
    const bodyArea = routes.slice(routes.indexOf("app.post('/api/v1/subcontractors'"));
    assert.equal(new RegExp(`\\b${forbidden}\\s*:`).test(bodyArea), false, `Unexpected request authority: ${forbidden}`);
  }
  assert.match(routes, /createSubcontractBodySchema/);
  assert.match(routes, /certifyPaymentApplicationBodySchema/);
  assert.match(routes, /closeSubcontractBodySchema/);
  assert.match(httpGate, /serverOwnedRequestAuthorityExposed: false/);
});

// Bodyless execution/close commands remain bodyless at the frozen Zod boundary.
test('Pass 261 keeps execute and close as bodyless commands', () => {
  assert.match(routes, /executeSubcontractBodySchema, request\.body \?\? \{\}/);
  assert.match(routes, /closeSubcontractBodySchema, request\.body \?\? \{\}/);
  assert.equal((routes.match(/body: \{ type: 'object', additionalProperties: false \}/g) ?? []).length, 3);
  assert.match(httpGate, /bodylessCommandCount: 2/);
});

// OpenAPI response contracts preserve exact decimal strings rather than floating-point numbers.
test('Pass 261 documents exact decimal strings and the five reviewed business errors', () => {
  assert.match(routes, /MONEY_JSON_SCHEMA/);
  assert.match(routes, /POSITIVE_QUANTITY_JSON_SCHEMA/);
  assert.match(routes, /RETENTION_PERCENT_JSON_SCHEMA/);
  for (const code of [
    'SUBCONTRACT_NOT_FOUND',
    'SUBCONTRACT_NOT_APPROVED',
    'PAYMENT_APPLICATION_INVALID',
    'CERTIFIED_VALUE_EXCEEDS_CONTRACT',
    'SUBCONTRACT_NOT_READY_TO_CLOSE',
  ]) assert.match(routes, new RegExp(code));
  assert.match(httpGate, /exactDecimalOpenApiSerialization: true/);
  assert.match(httpGate, /reviewedErrorCount: 5/);
});

// Server configuration owns the Module-22 definition code and passes it through startup/app/routes only.
test('Pass 261 wires the server-owned subcontract approval definition code into runtime composition', () => {
  assert.match(serverConfig, /subcontractApprovalDefinitionCode: string \| null/);
  assert.match(serverConfig, /SUBCONTRACT_APPROVAL_DEFINITION_CODE/);
  assert.match(serverConfig, /key: 'SUBCONTRACT_APPROVAL_DEFINITION_CODE'/);
  assert.match(apiMain, /subcontractApprovalDefinitionCode: config\.subcontractApprovalDefinitionCode/);
  assert.match(app, /subcontractApprovalDefinitionCode\?: string \| null/);
  assert.match(app, /registerSubcontractsRoutes/);
  assert.match(app, /subcontractApprovalDefinitionCode: options\.subcontractApprovalDefinitionCode \?\? null/);
  assert.match(routes, /subcontractApprovalDefinitionCode: options\.subcontractApprovalDefinitionCode \?\? null/);
  assert.match(httpGate, /approvalDefinitionServerOwned: true/);
});

// The module index publishes the standard five-file backend surface without leaking future Finance/Change Order code.
test('Pass 261 exports the reviewed Module 11 backend through its module index', () => {
  for (const token of [
    'SubcontractsRepository',
    'SubcontractsService',
    'registerSubcontractsRoutes',
    'MODULE_11_HTTP_ROUTES',
    'MODULE_11_PERMISSION_CODES',
    'MODULE_11_ERROR_CODES',
  ]) assert.match(moduleIndex, new RegExp(token));
  assert.doesNotMatch(moduleIndex, /Finance|ApInvoice|ChangeOrder|RetentionLedger/);
});

// Keep future source adapters and unsupported read APIs out of the HTTP pass.
test('Pass 261 does not pull Finance Change Order retention-release or readback APIs forward', () => {
  assert.doesNotMatch(routes, /ap_invoices|journal|payment_allocation|change_order/i);
  assert.match(routes, /app\.get\('\/api\/v1\/subcontracts\/:id'/);
  assert.match(httpGate, /financeRoutesAdded: 0/);
  assert.match(httpGate, /changeOrderRoutesAdded: 0/);
  assert.match(httpGate, /subcontractReadbackRoutesAdded: 0/);
  assert.match(httpGate, /retentionReleaseRoutesAdded: 0/);
});

// Register the fail-honest HTTP gate and advance only to integration/security verification.
test('Pass 261 registers the Stage-16 HTTP gate and Pass-262 handoff', () => {
  assert.equal(rootPackage.scripts['module-11:http:gate'], 'node scripts/module-11/verify-stage-16-http.mjs');
  assert.match(httpGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(httpGate, /STAGE_16_MODULE_11_HTTP_READY_FOR_PASS_262/);
  assert.match(httpGate, /STAGE_16_MODULE_11_HTTP_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage15LiveAccepted/);
  assert.match(httpGate, /Pass 262 - Module 11 PostgreSQL\/Fastify integration/);
});



// Pass 262 adds only live-capable integration/security verification after the reviewed HTTP composition.
test('Pass 262 prepares PostgreSQL/Fastify integration verification without changing production runtime', async () => {
  assert.equal(await exists('scripts/module-11/verify-stage-16-integration-security.mjs'), true);
  assert.equal(await exists('tests/integration/module-11-api.integration.test.mjs'), true);
  assert.match(integrationSecurityGate, /productionRuntimeChanges: 0/);
  assert.match(integrationSecurityGate, /databaseChanges: 0/);
  assert.match(integrationSecurityGate, /newMigrations: 0/);
  assert.match(integrationSecurityGate, /publicRoutesAdded: 0/);
  assert.match(integrationSecurityGate, /reactGenerated: false/);
});

// The live suite covers the complete reviewed command surface and its authoritative downstream contracts.
test('Pass 262 covers Module 11 approval execution commitment application certification and closeout paths', () => {
  for (const phrase of [
    'workflow covers vendor linkage, approval, execution commitment, application and certification',
    'SUBCONTRACT_NOT_APPROVED',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'SUBCONTRACT_NOT_READY_TO_CLOSE',
  ]) assert.match(integrationTest, new RegExp(phrase.replaceAll('.', '\\.')));
  assert.match(integrationSecurityGate, /module22ApprovalVerified/);
  assert.match(integrationSecurityGate, /module7CommitmentAtomicityVerified/);
  assert.match(integrationSecurityGate, /paymentApplicationCertificationVerified/);
});

// Cumulative certification, server-owned retention and immutable certification remain security invariants.
test('Pass 262 verifies cumulative certification limits server retention and immutable snapshots', () => {
  assert.match(integrationTest, /CERTIFIED_VALUE_EXCEEDS_CONTRACT/);
  assert.match(integrationTest, /retentionAmount, '60\.00'/);
  assert.match(integrationTest, /retention-attack/);
  assert.match(integrationTest, /recertification-direct-edit/);
  assert.match(integrationSecurityGate, /cumulativeCertificationLimitVerified/);
  assert.match(integrationSecurityGate, /serverOwnedRetentionVerified/);
});

// Company, Project, RBAC and Vendor ownership are challenged through real HTTP and direct database boundaries.
test('Pass 262 prepares negative authorization Project-scope cross-Company and Vendor-isolation verification', () => {
  assert.match(integrationTest, /security rejects unauthenticated access, missing authority, restricted Project scope, cross-Company resources and browser-owned fields/);
  assert.match(integrationTest, /database constraints reject cross-Company Vendor and Project ownership writes/);
  assert.match(integrationSecurityGate, /negativeAuthorizationVerified/);
  assert.match(integrationSecurityGate, /projectScopeIsolationVerified/);
  assert.match(integrationSecurityGate, /crossCompanyIsolationVerified/);
  assert.match(integrationSecurityGate, /vendorLinkAndIsolationVerified/);
});

// Late outbox failures must leave no partial subcontract, commitment, audit or certification state.
test('Pass 262 prepares transaction rollback verification for execution and certification', () => {
  assert.match(integrationTest, /late outbox failures roll back execution commitments and certification snapshots without partial state/);
  assert.match(integrationSecurityGate, /transactionRollbackVerified/);
  assert.match(integrationSecurityGate, /late outbox failures roll back execution status, commitments, audit and certification state/);
});

// Generated OpenAPI must expose only the eight reviewed operations with bearer security and seven idempotent writes.
test('Pass 262 verifies the generated OpenAPI Module 11 boundary', () => {
  for (const operationId of [
    'module11ListSubcontractors',
    'module11CreateSubcontractor',
    'module11CreateSubcontract',
    'module11UpdateDraftSubcontract',
    'module11ExecuteSubcontract',
    'module11CreatePaymentApplication',
    'module11CertifyPaymentApplication',
    'module11CloseSubcontract',
  ]) assert.match(integrationTest, new RegExp(operationId));
  assert.match(integrationTest, /must require Idempotency-Key/);
  assert.match(integrationSecurityGate, /reviewedRouteCount: 8/);
  assert.match(integrationSecurityGate, /reviewedPermissionCount: 7/);
  assert.match(integrationSecurityGate, /reviewedErrorCount: 5/);
  assert.match(integrationSecurityGate, /reviewedEventCount: 5/);
  assert.match(integrationSecurityGate, /generatedOpenApiVerified/);
});

// Stage 16 must not pull the deferred Finance/Change Order/readback gaps forward during verification.
test('Pass 262 keeps Finance AP Change Order retention-release and readback work deferred', () => {
  assert.match(integrationTest, /client\.costActual\.count/);
  assert.match(integrationTest, /client\.journal\.count/);
  assert.match(integrationTest, /subcontract\.revised/);
  assert.match(integrationSecurityGate, /financeApWritesAdded: 0/);
  assert.match(integrationSecurityGate, /changeOrderWritesAdded: 0/);
  assert.match(integrationSecurityGate, /retentionReleaseRoutesAdded: 0/);
  assert.match(integrationSecurityGate, /subcontractReadbackRoutesAdded: 0/);
});

// The live gate is fail-honest: it cannot touch PostgreSQL until genuine Stage-15 acceptance exists.
test('Pass 262 registers guarded static/live integration-security commands and the Pass-263 handoff', () => {
  assert.equal(
    rootPackage.scripts['test:integration:module-11'],
    "node -e \"if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 for Module 11 live integration/security verification.')\" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 tests/integration/module-11-api.integration.test.mjs"
  );
  assert.equal(rootPackage.scripts['module-11:integration-security:gate'], 'node scripts/module-11/verify-stage-16-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-11:integration-security:gate:live'], 'node scripts/module-11/verify-stage-16-integration-security.mjs --mode=live');
  assert.match(integrationSecurityGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(integrationSecurityGate, /STAGE_15_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_16_MODULE_11_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_263/);
  assert.match(integrationSecurityGate, /STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /runtimeDeploymentAllowed: passed && mode === 'live' && stage15LiveAccepted/);
  assert.match(integrationSecurityGate, /Pass 263 - Module 11 React/);
});

// Pass 263 generates the reviewed React feature only after integration/security preparation.
test('Pass 263 adds the four-file Module 11 React feature and Stage-16 React gate', async () => {
  for (const relativePath of [
    'apps/web/src/features/subcontracts/api/subcontracts-api.ts',
    'apps/web/src/features/subcontracts/hooks/subcontracts.ts',
    'apps/web/src/features/subcontracts/components/subcontracts-workspace.tsx',
    'apps/web/src/features/subcontracts/pages/subcontracts-page.tsx',
    'scripts/module-11/verify-stage-16-react.mjs',
  ]) await access(relativePath);
  assert.match(reactGate, /pass: 263/);
  assert.match(reactGate, /module-11-integration-security-regression/);
  assert.match(reactGate, /STAGE_16_MODULE_11_REACT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
});

// Pass 370 extends the historical browser boundary only with the frozen repair read/revision/retention surface.
test('Pass 370 browser API preserves the original operations and adds only six repair operations', () => {
  assert.equal((browserApi.match(/authenticatedRequest</g) ?? []).length, 14);
  for (const token of [
    'listSubcontractors', 'createSubcontractor', 'createSubcontract', 'updateDraftSubcontract',
    'executeSubcontract', 'createPaymentApplication', 'certifyPaymentApplication', 'closeSubcontract',
    'getSubcontract', 'listSubcontractPaymentApplications', 'listSubcontractRevisions',
    'getSubcontractRetention', 'createSubcontractRevision', 'releaseSubcontractRetention'
  ]) assert.match(browserApi, new RegExp(`function ${token}\\b`));
  assert.doesNotMatch(browserApi, /subcontracts\/\$\{subcontractId\}\/submit|subcontracts\/\$\{subcontractId\}\/approve/);
});

// All seven writes are retry-sensitive and must carry a browser-generated idempotency key.
test('Pass 370 sends Idempotency-Key on all nine Module 11 browser writes', () => {
  assert.match(browserApi, /function commandHeaders\(idempotencyKey: string\): HeadersInit/);
  assert.match(browserApi, /'Idempotency-Key': idempotencyKey/);
  assert.equal((browserApi.match(/headers: commandHeaders\(idempotencyKey\)/g) ?? []).length, 9);
  assert.match(browserHooks, /function newIdempotencyKey\(\): string/);
  assert.ok((browserHooks.match(/newIdempotencyKey\(\)/g) ?? []).length >= 8);
});

// Pass 370 keeps Module-22/Module-7 composition and adds the frozen durable Module-11 readback surface.
test('Pass 370 React layer loads durable detail, application, revision and retention history', () => {
  assert.match(browserHooks, /listApprovalInbox\(\{ resourceType: 'subcontract'/);
  assert.match(browserHooks, /getJobCostLedger/);
  assert.match(browserHooks, /item\.sourceType === 'subcontract'/);
  for (const hook of ['useSubcontract', 'useSubcontractPaymentApplications', 'useSubcontractRevisions', 'useSubcontractRetention']) {
    assert.match(browserHooks, new RegExp(`function ${hook}\\b`));
  }
  assert.match(browserWorkspace, /Durable application & certification history/);
  assert.match(browserWorkspace, /Approved Subcontract revisions/);
  assert.match(browserWorkspace, /Retention ledger/);
});

// Client inputs must preserve server ownership of numbering, status, totals, retention, approval and Finance state.
test('Pass 263 does not send server-owned Module 11 authority from React', () => {
  const inputRegion = browserApi.slice(
    browserApi.indexOf('export type ListSubcontractorsInput'),
    browserApi.indexOf('export type SubcontractRevision =')
  );
  for (const forbidden of [
    'companyId', 'actorUserId', 'permissions', 'allowedProjectIds', 'approvalDefinitionCode', 'approvalStatus',
    'subcontractNo', 'applicationNo', 'status', 'originalValue', 'revisedValue', 'claimedAmount',
    'certifiedAmount', 'retentionAmount', 'previousQty', 'commitmentAmount', 'commitmentSourceKey', 'financePostingState'
  ]) assert.doesNotMatch(inputRegion, new RegExp(`\\b${forbidden}\\b`));
  assert.match(browserWorkspace, /header values are server-owned/i);
  assert.match(browserWorkspace, /header certified total, retention cap and retention amount are enforced\/calculated by the server/i);
});

// Vendor ownership remains Module 8 and the UI uses only an optional existing Vendor UUID.
test('Pass 263 preserves Module 8 Vendor ownership in the subcontractor UI', () => {
  assert.match(browserApi, /vendorId\?: string \| null/);
  assert.match(browserWorkspace, /Existing Vendor UUID \(optional\)/);
  assert.match(browserWorkspace, /Module-8 supplier\/vendor master/);
  assert.doesNotMatch(browserApi, /vendors\?/);
  assert.doesNotMatch(browserApi, /createVendor|updateVendor|deleteVendor/);
});

// The Stage-16 UI must expose the reviewed workflow without taking later Finance or Change Order authority.
test('Pass 263 renders subcontract scope approval commitment application certification retention and closeout', () => {
  for (const phrase of [
    'Draft subcontract & scope',
    'Approval & execution',
    'Commitment summary',
    'Progress application',
    'QS certification',
    'Progress certification & retention snapshot',
    'Final closeout'
  ]) assert.match(browserWorkspace, new RegExp(phrase.replaceAll('&', '\\&')));
  assert.match(browserPage, /Finance\/AP or Change Order adapters forward/);
  assert.match(browserPage, /Formal subcontract AP posting stays deferred to Module 15B \/ Stage 26/);
});

// Permission-aware controls must use the exact seven Module-11 permissions plus existing dependent read permissions.
test('Pass 263 uses the reviewed Module 11 permission vocabulary in the page', () => {
  for (const permission of [
    'subcontractors.read',
    'subcontractors.manage',
    'subcontracts.read',
    'subcontracts.create',
    'subcontracts.execute',
    'subcontracts.certify',
    'subcontracts.close',
  ]) assert.match(browserPage, new RegExp(permission.replace('.', '\\.')));
  assert.match(browserPage, /job_cost\.read/);
  assert.match(browserPage, /approvals\.inbox\.read/);
  assert.doesNotMatch(browserPage, /subcontracts\.edit/);
});

// Existing shell navigation exposes Module 11 without adding another router abstraction.
test('Pass 263 registers Subcontractor Management in the permission-aware admin shell', () => {
  assert.match(adminShell, /import \{ SubcontractsPage \}/);
  for (const permission of [
    'subcontractors.read', 'subcontractors.manage', 'subcontracts.read', 'subcontracts.create',
    'subcontracts.execute', 'subcontracts.certify', 'subcontracts.close'
  ]) assert.match(adminShell, new RegExp(permission.replace('.', '\\.')));
  assert.match(adminShell, /canUseModule11/);
  assert.match(adminShell, /setView\('subcontracts'\)/);
  assert.match(adminShell, /<SubcontractsPage \/>/);
});

// The React gate must stay fail-honest about the absent Stage-15 live handoff and dependency-backed browser build.
test('Pass 263 registers the Stage-16 React gate without claiming live runtime completion', () => {
  assert.equal(rootPackage.scripts['module-11:react:gate'], 'node scripts/module-11/verify-stage-16-react.mjs');
  assert.match(reactGate, /dependencyBackedWebBuildRequired: true/);
  assert.match(reactGate, /runtimeVerificationComplete: false/);
  assert.match(reactGate, /productionBackendChanges: 0/);
  assert.match(reactGate, /databaseChanges: 0/);
  assert.match(reactGate, /publicRoutesAdded: 0/);
  assert.match(reactGate, /Pass 264 - Module 11 Playwright browser workflow verification/);
});


// Pass 264 adds the required browser workflow after the prepared React boundary.
test('Pass 264 adds the Module 11 Playwright workflow and guarded Stage-16 gate', async () => {
  await access('tests/e2e/module-11-browser.spec.mjs');
  await access('scripts/module-11/verify-stage-16-playwright.mjs');
  assert.match(playwrightGate, /pass: 264/);
  assert.match(playwrightGate, /module-11-react-regression/);
  assert.match(playwrightGate, /STAGE_16_MODULE_11_PLAYWRIGHT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /STAGE_16_MODULE_11_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_265/);
});

// The browser workflow must exercise the eight reviewed operations without inventing durable readback or later adapters.
test('Pass 264 browser workflow covers all eight reviewed Module 11 operations and preserves source gaps', () => {
  for (const phrase of [
    "'/api/v1/subcontractors'",
    "'/api/v1/subcontracts'",
    '/execute',
    '/payment-applications',
    '/certify',
    '/close'
  ]) assert.match(browserTest, new RegExp(phrase.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  assert.match(browserTest, /method === 'PATCH'/);
  assert.match(browserTest, /eight reviewed Stage-16 Module-11 operation shapes/);
  assert.match(browserTest, /subcontract\.revised/);
  assert.match(browserTest, /database\.journal\.count/);
  assert.match(browserTest, /database\.costActual\.count/);
});

// Browser writes must retain retry safety and server authority.
test('Pass 264 verifies Idempotency-Key and server-owned lifecycle totals approval and Finance state', () => {
  assert.match(browserTest, /idempotency-key/);
  assert.match(browserTest, /if \(request\.method !== 'GET'\) expect\(request\.idempotencyKey\)\.toBeTruthy\(\)/);
  for (const field of [
    'companyId', 'actorUserId', 'subcontractNo', 'applicationNo', 'status', 'originalValue',
    'revisedValue', 'claimedAmount', 'certifiedAmount', 'retentionAmount', 'previousQty',
    'approvalDefinitionCode', 'commitmentAmount', 'financePostingState'
  ]) assert.match(browserTest, new RegExp(field));
});

// The real browser path must compose Module 8 Vendor, Module 22 Approval and Module 7 commitment behavior.
test('Pass 264 browser workflow proves Vendor linkage approval execution commitment certification and closeout', () => {
  assert.match(browserTest, /Existing Vendor UUID \(optional\)/);
  assert.match(browserTest, /Approved in Pass 264 browser verification/);
  assert.match(browserTest, /Execute \/ recheck approval/);
  assert.match(browserTest, /Commitment summary/);
  assert.match(browserTest, /Submit progress application/);
  assert.match(browserTest, /Certify application/);
  assert.match(browserTest, /Close subcontract/);
  assert.match(browserTest, /persistedSubcontract\.status\)\.toBe\('CLOSED'\)/);
});

// Permission-aware UI hiding is only convenience; direct unauthorized writes must still fail at the API.
test('Pass 264 includes browser permission-negative checks', () => {
  assert.match(browserTest, /Module 11 Browser Reader/);
  assert.match(browserTest, /Create draft subcontract' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Execute \/ recheck approval' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /deniedCreate\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /deniedExecute\.status\(\)\)\.toBe\(403\)/);
});

// The shared Playwright server must select exactly Module 11 and inject only the existing approval definition configuration.
test('Pass 264 registers Module 11 in the shared Playwright configuration', () => {
  assert.match(playwrightConfig, /RUN_MODULE_11_E2E/);
  assert.match(playwrightConfig, /module-11-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /SUBCONTRACT_APPROVAL_DEFINITION_CODE: 'SUBCONTRACT_EXECUTION'/);
});

// Live browser verification is impossible without the upstream Stage-15 acceptance and explicit destructive-test guards.
test('Pass 264 registers fail-honest static and live Playwright commands', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-11'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-11:playwright:gate'], 'node scripts/module-11/verify-stage-16-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-11:playwright:gate:live'], 'node scripts/module-11/verify-stage-16-playwright.mjs --mode=live');
  assert.match(playwrightGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(playwrightGate, /STAGE_15_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /RUN_MODULE_11_E2E_REQUIRED/);
  assert.match(playwrightGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(playwrightGate, /runtimeDeploymentAllowed: passed && mode === 'live' && stage15LiveAccepted/);
  assert.match(playwrightGate, /Pass 265 - Module 11 operational, migration and concurrency verification/);
});

// Pass 265 adds verification-only operational coverage after the prepared browser workflow.
test('Pass 265 adds the Module 11 operational, migration and concurrency gate', async () => {
  await access('scripts/module-11/verify-stage-16-operations.mjs');
  assert.match(operationsGate, /pass: 265/);
  assert.match(operationsGate, /module-11-playwright-regression/);
  assert.match(operationsGate, /clean-and-previous-migrations/);
  assert.match(operationsGate, /test:operations:module-11/);
  assert.match(operationsGate, /STAGE_16_MODULE_11_OPERATIONS_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /STAGE_16_MODULE_11_OPERATIONS_VERIFIED_READY_FOR_PASS_266/);
});

// Operational tests must exercise numbering, row-lock serialization, cumulative certification and commitment reconciliation.
test('Pass 265 prepares real PostgreSQL concurrency and reconciliation checks', () => {
  for (const phrase of [
    'Module 11 operational concurrent numbering and duplicate execution serialize commitments',
    'Module 11 operational application rollback and concurrent certification preserve cumulative contract limits',
    'Module 11 operational reviewed query plans use Stage-16 indexes and commitments reconcile',
    'Promise.all',
    'CERTIFIED_VALUE_EXCEEDS_CONTRACT',
    'costCommitment.findMany',
    'subcontract.payment_application_submitted'
  ]) assert.match(integrationTest, new RegExp(phrase.replaceAll('.', '\\.')));
  assert.match(integrationTest, /subcontractSequence\.nextValue, 3n/);
  assert.match(integrationTest, /rolledBackSequence\.nextValue, 1n/);
  assert.match(integrationTest, /applicationSequence\.nextValue, 3n/);
});

// Query-plan verification must target the reviewed Stage-16 and Module-7 source-key indexes.
test('Pass 265 verifies reviewed subcontract and commitment indexes through EXPLAIN', () => {
  for (const index of [
    'subcontractors_company_vendor_idx',
    'subcontracts_company_project_status_idx',
    'subcontracts_company_project_no_uq',
    'subcontract_payment_applications_subcontract_status_period_idx',
    'subcontract_payment_lines_application_item_idx',
    'cost_commitments_source_key_uq'
  ]) assert.match(integrationTest, new RegExp(index));
  assert.match(integrationTest, /SET LOCAL enable_seqscan = off/);
  assert.match(integrationTest, /EXPLAIN \(FORMAT JSON\)/);
});

// Pass 265 must reuse the earlier rollback/security evidence while adding application-number rollback proof.
test('Pass 265 preserves rollback and deferred integration boundaries', () => {
  assert.match(operationsGate, /Pass 262 already proves late subcontract\.executed outbox failure/);
  assert.match(operationsGate, /Pass 262 already proves late subcontract\.payment_certified outbox failure/);
  assert.match(operationsGate, /failed payment-application submission rolls back/);
  assert.match(operationsGate, /financeApWritesAdded: 0/);
  assert.match(operationsGate, /changeOrderWritesAdded: 0/);
  assert.match(integrationTest, /client\.costActual\.count/);
  assert.match(integrationTest, /client\.journal\.count/);
});

// Live operational execution must remain blocked until the complete upstream live chain exists.
test('Pass 265 registers guarded static/live operational commands and Pass-266 handoff', () => {
  assert.equal(
    rootPackage.scripts['test:operations:module-11'],
    "node -e \"if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 for Module 11 operational verification.')\" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 --test-name-pattern=\"^Module 11 operational\" tests/integration/module-11-api.integration.test.mjs"
  );
  assert.equal(rootPackage.scripts['module-11:operations:gate'], 'node scripts/module-11/verify-stage-16-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-11:operations:gate:live'], 'node scripts/module-11/verify-stage-16-operations.mjs --mode=live');
  assert.match(operationsGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(operationsGate, /STAGE_15_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_16_MODULE_11_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_16_MODULE_11_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(operationsGate, /runtimeDeploymentAllowed: passed/);
  assert.match(operationsGate, /Pass 266 - Module 11 final Stage-16 acceptance gate/);
});


// Pass 266 closes the dependency-free Stage-16 acceptance boundary without changing production behavior.
test('Pass 266 adds the final Module 11 Stage-16 acceptance gate', async () => {
  await access('scripts/module-11/verify-stage-16.mjs');
  assert.equal(rootPackage.scripts['module-11:gate'], 'node scripts/module-11/verify-stage-16.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-11:gate:live'], 'node scripts/module-11/verify-stage-16.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-11:acceptance:live'], 'node scripts/module-11/verify-stage-16.mjs --mode=live');
  assert.match(finalGate, /pass: 266/);
  assert.match(finalGate, /STAGE_16_ACCEPTED_READY_FOR_STAGE_17/);
  assert.match(finalGate, /Stage 17 - Module 12 Equipment Management/);
});

// Final acceptance must remain fail-honest until every live prerequisite in the Stage-16 chain is genuine.
test('Pass 266 requires the complete Stage-15 and Module-11 live verification chain', () => {
  assert.match(finalGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(finalGate, /STAGE_16_MODULE_11_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_263/);
  assert.match(finalGate, /STAGE_16_MODULE_11_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_265/);
  assert.match(finalGate, /STAGE_16_MODULE_11_OPERATIONS_VERIFIED_READY_FOR_PASS_266/);
  assert.match(finalGate, /STAGE_15_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_16_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /runtimeVerificationComplete: passed/);
  assert.match(finalGate, /runtimeDeploymentAllowed: passed/);
});

// Pass 266 is verification-only and must preserve the reviewed Module-11 ownership and later-stage boundaries.
test('Pass 266 changes no Module 11 runtime contract or later Finance integration', () => {
  assert.match(finalGate, /routeCount: 8/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
  assert.match(finalGate, /publicApiChanges: 0/);
  assert.match(finalGate, /financeSourceAdapterDeferredToStage26: true/);
  assert.match(finalGate, /exactApprovedBusinessModuleCount: 24/);
  assert.match(finalGate, /stageSuffixCreatesBusinessModule: false/);
});
