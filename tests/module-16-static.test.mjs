import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/client-billing/STAGE-23-MODULE-16-CONTRACT.md', 'utf8');
const gate = await readFile('scripts/module-16/verify-stage-23-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-16/verify-stage-23-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-16/verify-stage-23-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-16/verify-stage-23-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-16/verify-stage-23-service.mjs', 'utf8');
const invoiceRetentionGate = await readFile('scripts/module-16/verify-stage-23-invoice-retention.mjs', 'utf8');
const httpGate = await readFile('scripts/module-16/verify-stage-23-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-16/verify-stage-23-integration-security.mjs', 'utf8');
const reactDataGate = await readFile('scripts/module-16/verify-stage-23-react-data.mjs', 'utf8');
const reactWorkspaceGate = await readFile('scripts/module-16/verify-stage-23-react-workspace.mjs', 'utf8').catch(() => '');
const playwrightGate = await readFile('scripts/module-16/verify-stage-23-playwright.mjs', 'utf8').catch(() => '');
const operationsGate = await readFile('scripts/module-16/verify-stage-23-operations.mjs', 'utf8').catch(() => '');
const finalGate = await readFile('scripts/module-16/verify-stage-23.mjs', 'utf8').catch(() => '');
const browserTest = await readFile('tests/e2e/module-16-browser.spec.mjs', 'utf8').catch(() => '');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const reactApi = await readFile('apps/web/src/features/client-billing/api/client-billing-api.ts', 'utf8');
const reactHooks = await readFile('apps/web/src/features/client-billing/hooks/client-billing.ts', 'utf8');
const reactWorkspace = await readFile('apps/web/src/features/client-billing/components/client-billing-workspace.tsx', 'utf8').catch(() => '');
const reactPage = await readFile('apps/web/src/features/client-billing/pages/client-billing-page.tsx', 'utf8').catch(() => '');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8');
const integrationTest = await readFile('tests/integration/module-16-api.integration.test.mjs', 'utf8');
const schema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/client-billing/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const persistenceMigration = await readFile('packages/database/prisma/migrations/20260826000300_module_16_client_billing_core/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

const TABLES = [
  'client_contracts',
  'progress_claims',
  'progress_claim_lines',
  'client_invoices',
  'retention_ledger',
];

const ROUTES = [
  'GET  /api/v1/client-billing/contracts',
  'POST /api/v1/client-billing/contracts',
  'POST /api/v1/client-billing/contracts/:id/claims',
  'PUT  /api/v1/client-billing/claims/:id/lines',
  'POST /api/v1/client-billing/claims/:id/certify',
  'POST /api/v1/client-billing/claims/:id/invoice',
  'POST /api/v1/client-billing/retention/:id/release',
];

const PERMISSIONS = [
  'client_billing.read',
  'client_contracts.manage',
  'client_claims.create',
  'client_claims.certify',
  'client_invoices.issue',
  'client_retention.release',
];

const ERRORS = [
  'CLIENT_CONTRACT_NOT_FOUND',
  'CLAIM_INVALID_CUMULATIVE_VALUE',
  'CLAIM_NOT_CERTIFIED',
  'CLIENT_INVOICE_ALREADY_CREATED',
  'RETENTION_RELEASE_NOT_ALLOWED',
];

const EVENTS = [
  'client_contract.created',
  'progress_claim.submitted',
  'progress_claim.certified',
  'client_invoice.issued',
  'client_retention.released',
];

test('Pass 346 freezes Module 16 at corrected Stage 23', () => {
  assert.match(contract, /Stage 22  Module 17  - Change Orders \/ Variations/);
  assert.match(contract, /Stage 23  Module 16  - Client Billing/);
  assert.match(contract, /Stage 24  Module 19  - RFI & Submittals/);
  assert.match(gate, /pass: 346/);
  assert.match(gate, /stage: 23/);
});

test('Pass 346 requires Stage 22 live handoff only for runtime activation', () => {
  assert.match(contract, /STAGE_22_ACCEPTED_READY_FOR_STAGE_23/);
  assert.match(contract, /contract may be reviewed and frozen while that live handoff is pending/);
  assert.match(gate, /STAGE_23_MODULE_16_CONTRACT_FROZEN_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(gate, /persistencePreparationAllowed: passed/);
});

test('Pass 346 preserves corrected hard prerequisites', () => {
  for (const dependency of [
    'Module 5   - Project Management',
    'Module 2   - CRM & Client Management',
    'Module 15A - Finance Core',
  ]) assert.ok(contract.includes(dependency), `Missing dependency ${dependency}`);

  assert.match(gate, /'5 - Project Management'/);
  assert.match(gate, /'2 - CRM & Client Management'/);
  assert.match(gate, /'15A - Finance Core'/);
});

test('Pass 346 keeps BOQ and approved Change values configured rather than new hard masters', () => {
  assert.match(contract, /Module 4B  - BOQ Project Mapping\s+optional when BOQ-backed claim lines are used/);
  assert.match(contract, /Module 17  - Change Orders \/ Variations\s+optional\/as configured for approved variation values/);
  assert.match(gate, /configuredPrerequisites:/);
});

test('Pass 346 reuses Module 24B Project scope and Module 2 Client master', () => {
  assert.match(contract, /Project-scope authorization already exists through Module 24B and must be reused/);
  assert.match(contract, /clients \/ Client lifecycle\s+Module 2/);
  assert.match(gate, /projectScopeReusesModule24B: true/);
  assert.match(gate, /clientMasterReusesModule2: true/);
});

test('Pass 346 freezes exactly five source-owned tables', () => {
  for (const table of TABLES) assert.ok(contract.includes(table), `Missing table ${table}`);
  assert.match(gate, /ownedTables:/);
  assert.match(gate, /'client_contracts'/);
  assert.match(gate, /'retention_ledger'/);
});

test('Pass 346 freezes all source-defined Client Contract fields', () => {
  for (const field of [
    'company_id', 'project_id', 'client_id', 'contract_no', 'contract_value', 'revised_value',
    'billing_method', 'retention_percent', 'currency', 'status',
  ]) assert.ok(contract.includes(field), `Missing client_contracts field ${field}`);
});

test('Pass 346 keeps Contract values decimal-safe and Project/Client scoped', () => {
  assert.match(contract, /`client_id` resolves to the Module-2 Client master in the same Company/);
  assert.match(contract, /`contract_value`, `revised_value` and retention percentage values use DECIMAL\/NUMERIC-safe handling/);
  assert.match(gate, /decimalSafeAmountsRequired: true/);
});

test('Pass 346 records Contract numbering authority instead of inventing uniqueness', () => {
  assert.match(contract, /does not define its numbering authority or uniqueness scope/);
  assert.match(gate, /contractNumberAuthorityGapRecorded: true/);
});

test('Pass 346 does not invent Contract update API despite maintain-terms workflow wording', () => {
  assert.match(contract, /reviewed API exposes only contract list\/create operations and no contract update command/);
  assert.match(gate, /contractUpdateRouteInvented: false/);
});

test('Pass 346 freezes all source-defined Progress Claim fields', () => {
  for (const field of [
    'contract_id', 'claim_no', 'period_end', 'status', 'gross_value', 'previous_value', 'current_value',
    'retention_amount', 'deduction_amount', 'certified_value',
  ]) assert.ok(contract.includes(field), `Missing progress_claims field ${field}`);
});

test('Pass 346 freezes cumulative-value and immutable certification rules', () => {
  assert.match(contract, /cumulative claimed quantity\/value must never fall below previously certified values/);
  assert.match(contract, /certified claims are immutable/i);
  assert.match(gate, /cumulativeClaimRegressionForbidden: true/);
  assert.match(gate, /certifiedClaimsImmutable: true/);
});

test('Pass 346 records concurrency-safe Claim numbering without inventing format', () => {
  assert.match(contract, /requires concurrency-safe claim numbering but does not define the numbering sequence scope or exact token format/);
  assert.match(gate, /concurrencySafeClaimNumberingRequired: true/);
});

test('Pass 346 records source mismatch for progress_claim.submitted without inventing submit route', () => {
  assert.match(contract, /defines the event `progress_claim\.submitted`, but the reviewed API contains no explicit claim-submit route/);
  assert.match(gate, /claimSubmitRouteGapRecorded: true/);
  assert.match(gate, /claimSubmitRouteInvented: false/);
});

test('Pass 346 freezes all source-defined Progress Claim line fields', () => {
  for (const field of [
    'claim_id', 'boq_item_id nullable', 'description', 'contract_qty nullable', 'cumulative_qty nullable',
    'current_qty nullable', 'rate nullable', 'current_value',
  ]) assert.ok(contract.includes(field), `Missing progress_claim_lines field ${field}`);
});

test('Pass 346 keeps optional BOQ Claim lines inside the Project boundary', () => {
  assert.match(contract, /optional `boq_item_id` uses the existing Module-4B Project-mapped BOQ boundary/);
  assert.match(contract, /must not point to another Project/);
});

test('Pass 346 records PUT claim-line semantics as unresolved', () => {
  assert.match(contract, /does not explicitly define replace-all versus merge semantics/);
  assert.match(gate, /linePutSemanticsGapRecorded: true/);
});

test('Pass 346 does not invent cross-billing-method valuation policy', () => {
  assert.match(contract, /does not define how BOQ quantity\/rate, milestone billing or manually described claim lines are combined/);
});

test('Pass 346 freezes all source-defined Client Invoice fields', () => {
  for (const field of [
    'company_id', 'project_id', 'contract_id', 'claim_id nullable', 'invoice_no', 'invoice_date', 'due_date',
    'gross_amount', 'retention_amount', 'tax_amount', 'total_receivable', 'status',
  ]) assert.ok(contract.includes(field), `Missing client_invoices field ${field}`);
});

test('Pass 346 freezes certified-claim Invoice requirement and one-source Invoice behavior', () => {
  assert.match(contract, /Invoice creation requires a certified\/approved Claim/);
  assert.match(contract, /must not create duplicate financial source records/);
  assert.match(gate, /postedInvoicesImmutable: true/);
});

test('Pass 346 freezes concurrency-safe Invoice numbering without inventing format', () => {
  assert.match(contract, /Invoice numbering is concurrency-safe/);
  assert.match(contract, /does not define Invoice status vocabulary, invoice-number scope\/format/);
  assert.match(gate, /concurrencySafeInvoiceNumberingRequired: true/);
});

test('Pass 346 does not invent standalone Invoice create for nullable claim_id', () => {
  assert.match(contract, /database shape allows `claim_id nullable`, but the reviewed API defines no standalone Client Invoice create command/);
  assert.match(contract, /must not invent non-Claim Invoice creation/);
});

test('Pass 346 freezes all source-defined Retention Ledger fields', () => {
  for (const field of [
    'company_id', 'project_id', 'source_type', 'source_id', 'direction', 'amount', 'released_amount', 'status',
  ]) assert.ok(contract.includes(field), `Missing retention_ledger field ${field}`);
});

test('Pass 346 freezes retention release guard without inventing release semantics', () => {
  assert.match(contract, /release must never exceed available approved retention/);
  assert.match(contract, /does not define whether the release command is full or partial/);
  assert.match(gate, /retentionCalculatedByContractPolicy: true/);
});

test('Pass 346 freezes controlled approved Change Order consumption', () => {
  assert.match(contract, /approved Change Orders -> controlled revised Client Contract value/);
  assert.match(contract, /Applying the same approved variation to a Contract\/Claim more than once is forbidden/);
  assert.match(gate, /approvedChangesUseControlledIntegration: true/);
});

test('Pass 346 defers full AR adapter to Stage 26 rather than generating it early', () => {
  assert.match(contract, /Stage 26 Module 15B/);
  assert.match(contract, /posts the Client Invoice into AR/);
  assert.match(gate, /financeArAdapterDeferredToStage26: true/);
  assert.match(gate, /finance15bGeneratedEarly: false/);
});

test('Pass 346 preserves Stage 27 Claim to Invoice to AR completion proof', () => {
  assert.match(contract, /Stage 27 must prove the corrected `Claim -> Invoice -> AR` chain end to end/);
  assert.match(gate, /stage27ClaimInvoiceArProofRequired: true/);
});

test('Pass 346 freezes exactly seven reviewed routes', () => {
  for (const route of ROUTES) assert.ok(contract.includes(route), `Missing route ${route}`);
  assert.match(gate, /reviewedRouteCount: 7/);
});

test('Pass 346 explicitly rejects generic or invented Client Billing routes', () => {
  for (const route of [
    'GET    /api/v1/client-billing/contracts/:id',
    'PATCH  /api/v1/client-billing/contracts/:id',
    'POST   /api/v1/client-billing/claims/:id/submit',
    'POST   /api/v1/client-billing/invoices',
    'POST   /api/v1/client-billing/invoices/:id/post-ar',
    'POST   /api/v1/client-billing/payments',
  ]) assert.ok(contract.includes(route), `Missing explicit non-route ${route}`);
  assert.match(gate, /extraRoutesInvented: false/);
  assert.match(gate, /paymentApiInvented: false/);
});

test('Pass 346 freezes exactly six source permissions', () => {
  for (const permission of PERMISSIONS) assert.ok(contract.includes(permission), `Missing permission ${permission}`);
  assert.match(gate, /reviewedPermissions:/);
  assert.match(gate, /extraPermissionsInvented: false/);
});

test('Pass 346 keeps Company actor Project totals and posting authority server-owned', () => {
  for (const authority of [
    'company identity', 'actor identity', 'allowed Project scope', 'claim/invoice numbering',
    'previous certified values', 'server-owned totals', 'AR source identity/posting state',
  ]) assert.ok(contract.includes(authority), `Missing server authority ${authority}`);
});

test('Pass 346 freezes all five stable Module 16 errors', () => {
  for (const error of ERRORS) assert.ok(contract.includes(error), `Missing error ${error}`);
  assert.match(gate, /reviewedErrors:/);
});

test('Pass 346 does not invent extra public Module 16 error codes', () => {
  assert.match(contract, /does not define a separate stable error for duplicate Contract\/Claim\/Invoice number collisions/);
});

test('Pass 346 freezes all five source events', () => {
  for (const event of EVENTS) assert.ok(contract.includes(event), `Missing event ${event}`);
  assert.match(gate, /reviewedEvents:/);
});

test('Pass 346 requires Foundation audit and outbox evidence', () => {
  assert.match(contract, /Sensitive writes record Foundation audit\/outbox evidence/);
  assert.match(contract, /Core transaction correctness must not depend on a background worker/);
});

test('Pass 346 freezes idempotent financial source behavior', () => {
  assert.match(contract, /AR posting later uses a stable source key and is idempotent/);
  assert.match(gate, /arPostingIdempotentBySourceKey: true/);
});

test('Pass 346 keeps payment writes outside Module 16', () => {
  assert.match(contract, /does not create a Module-16 payment master or payment-write API/);
  assert.match(gate, /paymentBoundaryGapRecorded: true/);
});

test('Pass 346 keeps source ambiguities visible', () => {
  for (const topic of [
    'billing_method', 'progress_claim.submitted', 'Tax calculation policy', 'partial/full release',
    'payment table or payment command', 'Stage-26 Module 15B', 'Module-22 Approval Workflow hard dependency',
  ]) assert.ok(contract.includes(topic), `Missing ambiguity topic ${topic}`);
});

test('Pass 346 historical contract gate remains present while later reviewed layers advance', async () => {
  await access('docs/modules/client-billing/STAGE-23-MODULE-16-CONTRACT.md');
  await access('scripts/module-16/verify-stage-23-contract.mjs');
  await access('module-16-evidence');
  assert.match(gate, /productionFilesGenerated: false/);
});

test('Pass 346 contract evidence still records that its own pass generated no persistence', () => {
  assert.match(gate, /databaseMigrationGenerated: false/);
  assert.match(gate, /productionFilesGenerated: false/);
});

test('Pass 346 registers one simple contract gate and pass alias', () => {
  assert.equal(rootPackage.scripts['module-16:contract:gate'], 'node scripts/module-16/verify-stage-23-contract.mjs');
  assert.equal(rootPackage.scripts['pass-346:client-billing-contract:gate'], 'node scripts/module-16/verify-stage-23-contract.mjs');
});

test('Pass 346 points only to Pass 347 persistence next', () => {
  assert.match(contract, /Pass 347 — Module 16 Client Billing Prisma models, constraints, indexes and Stage-23 migration/);
  assert.match(gate, /Pass 347 - Module 16 Client Billing Prisma models, constraints, indexes and Stage-23 migration/);
});

test('Pass 347 implements exactly the five reviewed Module-16 persistence models', () => {
  for (const model of ['ClientContract', 'ProgressClaim', 'ProgressClaimLine', 'ClientInvoice', 'RetentionLedger']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`));
  }
  const createTables = [...persistenceMigration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(createTables, TABLES);
});

test('Pass 347 preserves exact-decimal Contract Claim Invoice and Retention storage', () => {
  for (const fragment of [
    '@db.Decimal(18, 2)',
    '@db.Decimal(18, 4)',
    '@db.Decimal(7, 4)',
    'DECIMAL(18,2)',
    'DECIMAL(18,4)',
    'DECIMAL(7,4)',
  ]) assert.ok(prisma.includes(fragment) || persistenceMigration.includes(fragment), `Missing decimal fragment ${fragment}`);
});

test('Pass 347 enforces Company Project and Client ownership without duplicating masters', () => {
  assert.match(prisma, /project\s+Project\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
  assert.match(prisma, /client\s+Client\s+@relation\(fields: \[clientId, companyId\], references: \[id, companyId\]/);
  assert.match(persistenceMigration, /client_contracts_project_company_fkey/);
  assert.match(persistenceMigration, /client_contracts_client_company_fkey/);
  assert.doesNotMatch(persistenceMigration, /CREATE TABLE "clients"/);
  assert.doesNotMatch(persistenceMigration, /CREATE TABLE "projects"/);
});

test('Pass 347 keeps optional BOQ Claim lines inside the Client Contract Project', () => {
  assert.match(persistenceMigration, /module_16_validate_progress_claim_line_scope/);
  assert.match(persistenceMigration, /JOIN "boqs" boq/);
  assert.match(persistenceMigration, /boq\."project_id"/);
  assert.match(persistenceMigration, /Progress Claim BOQ item must belong to a Project-mapped BOQ/);
});

test('Pass 347 does not invent Contract Claim or Invoice number uniqueness scope', () => {
  assert.match(persistenceMigration, /Number scope is intentionally not invented/);
  assert.doesNotMatch(persistenceMigration, /CREATE UNIQUE INDEX "client_contracts_[^"]*contract_no/);
  assert.doesNotMatch(persistenceMigration, /CREATE UNIQUE INDEX "progress_claims_[^"]*claim_no/);
  assert.doesNotMatch(persistenceMigration, /CREATE UNIQUE INDEX "client_invoices_[^"]*invoice_no/);
  assert.match(persistenceMigration, /client_contracts_company_contract_no_idx/);
  assert.match(persistenceMigration, /progress_claims_contract_claim_no_idx/);
  assert.match(persistenceMigration, /client_invoices_company_invoice_no_idx/);
});

test('Pass 347 keeps billing method and lifecycle vocabularies string-backed', () => {
  assert.doesNotMatch(prisma, /^enum\s+(ClientBilling|BillingMethod|ClientContractStatus|ProgressClaimStatus|ClientInvoiceStatus|RetentionStatus)\b/m);
  assert.match(prisma, /billingMethod\s+String/);
  assert.match(persistenceGate, /statusEnumsInvented: false/);
  assert.match(persistenceGate, /billingMethodEnumInvented: false/);
});

test('Pass 347 enforces one Client Invoice per Claim and same-Contract Claim scope', () => {
  assert.match(prisma, /claimId\s+String\?\s+@unique\(map: "client_invoices_claim_uq"\)/);
  assert.match(persistenceMigration, /CREATE UNIQUE INDEX "client_invoices_claim_uq"/);
  assert.match(persistenceMigration, /module_16_validate_client_invoice_claim_scope/);
  assert.match(persistenceMigration, /Client Invoice claim must belong to the same Client Contract/);
});

test('Pass 347 preserves Invoice financial identity while allowing later status progression', () => {
  assert.match(persistenceMigration, /module_16_validate_client_invoice_update/);
  assert.match(persistenceMigration, /Client Invoice identity and financial values are immutable/);
  assert.match(persistenceMigration, /RETURN NEW/);
  assert.doesNotMatch(persistenceMigration, /NEW\."status" IS DISTINCT FROM OLD\."status"/);
  assert.match(persistenceGate, /invoiceIdentityAndFinancialValuesImmutableAtDatabase: true/);
});

test('Pass 347 protects invoiced Claim history without inventing a certified status token', () => {
  assert.match(persistenceMigration, /module_16_reject_invoiced_claim_mutation/);
  assert.match(persistenceMigration, /Invoiced Progress Claim history is immutable/);
  assert.doesNotMatch(persistenceMigration, /OLD\."status"\s*=\s*'CERTIFIED'/);
  assert.match(persistenceGate, /certifiedClaimLifecycleImmutabilityDeferredToService: true/);
});

test('Pass 347 prevents retention release overflow and backwards released totals', () => {
  assert.match(persistenceMigration, /retention_ledger_released_amount_range/);
  assert.match(persistenceMigration, /"released_amount" >= 0 AND "released_amount" <= "amount"/);
  assert.match(persistenceMigration, /Retention released amount cannot move backwards/);
  assert.match(persistenceGate, /retentionReleaseCannotExceedAmountAtDatabase: true/);
});

test('Pass 347 leaves Change adapter Finance 15B and payment persistence deferred', () => {
  assert.match(persistenceGate, /approvedChangeAdapterGeneratedEarly: false/);
  assert.match(persistenceGate, /financeArAdapterGeneratedEarly: false/);
  assert.match(persistenceGate, /paymentPersistenceInvented: false/);
  assert.doesNotMatch(persistenceMigration, /CREATE TABLE "payments"/);
  assert.doesNotMatch(persistenceMigration, /CREATE TABLE "ar_/);
});

test('Pass 347 keeps the Stage-23 Client Billing migration intact after later repair gates are appended', () => {
  const gate = migrationGates.gates.find((item) => item.gate === 'module-16-client-billing-core-persistence');
  assert.ok(gate);
  assert.equal(gate.stage, 23);
  assert.deepEqual(gate.migrations, ['20260826000300_module_16_client_billing_core']);
});

test('Pass 347 registers the persistence gate and keeps runtime activation blocked without Stage 22 live acceptance', () => {
  assert.equal(rootPackage.scripts['module-16:persistence:gate'], 'node scripts/module-16/verify-stage-23-persistence.mjs');
  assert.equal(rootPackage.scripts['pass-347:client-billing-persistence:gate'], 'node scripts/module-16/verify-stage-23-persistence.mjs');
  assert.match(persistenceGate, /pass: 347/);
  assert.match(persistenceGate, /STAGE_23_MODULE_16_PERSISTENCE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(persistenceGate, /productionRuntimeActivationAllowed: false/);
});

test('Pass 347 keeps later Client Billing runtime layers deferred', () => {
  assert.match(persistenceGate, /apiSchemaGenerated: false/);
  assert.match(persistenceGate, /repositoryGenerated: false/);
  assert.match(persistenceGate, /serviceGenerated: false/);
  assert.match(persistenceGate, /publicRoutesGenerated: false/);
  assert.match(persistenceGate, /reactGenerated: false/);
});



test('Pass 347 gives every named Module 16 SQL function a clear purpose comment', () => {
  const functionNames = [
    'module_16_validate_progress_claim_line_scope',
    'module_16_validate_client_invoice_claim_scope',
    'module_16_validate_client_invoice_update',
    'module_16_reject_invoiced_claim_mutation',
    'module_16_validate_retention_ledger_update',
  ];

  for (const functionName of functionNames) {
    const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const purposePattern = new RegExp(`-- Purpose:[^\\n]+\\nCREATE FUNCTION "${escapedName}"\\(\\)`);
    assert.match(persistenceMigration, purposePattern);
  }
});


test('Pass 348 adds the one reviewed Client Billing Zod boundary file', async () => {
  await access('apps/api/src/modules/client-billing/client-billing.schema.ts');
  assert.match(schemaGate, /pass: 348/);
  assert.match(schemaGate, /stage: 23/);
  assert.match(schemaGate, /STAGE_23_MODULE_16_SCHEMA_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
});

test('Pass 348 freezes exactly seven reviewed Client Billing routes and six permissions', () => {
  for (const route of ROUTES) {
    const [method, path] = route.trim().split(/\s+/);
    assert.ok(schema.includes(`method: '${method}'`), `Missing route method ${method}`);
    assert.ok(schema.includes(`route: '${path}'`), `Missing route path ${path}`);
  }
  for (const permission of PERMISSIONS) assert.ok(schema.includes(`'${permission}'`), `Missing permission ${permission}`);
  assert.match(schemaGate, /reviewedRouteCount: 7/);
  assert.match(schemaGate, /extraRoutesInvented: false/);
  assert.match(schemaGate, /extraPermissionsInvented: false/);
});

test('Pass 348 freezes all five stable errors and five source events', () => {
  for (const code of ERRORS) assert.ok(schema.includes(`'${code}'`), `Missing error ${code}`);
  for (const event of EVENTS) assert.ok(schema.includes(`'${event}'`), `Missing event ${event}`);
  assert.match(schema, /export function createModule16Error/);
});

test('Pass 348 accepts only bounded pagination for the Contract register', () => {
  assert.match(schema, /MODULE_16_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /listClientContractsQuerySchema = z\.object\(\{\s*\.\.\.paginationQueryShape\s*\}\)\.strict\(\)/s);
  assert.match(schemaGate, /listFiltersInvented: false/);
  assert.match(schemaGate, /aggregateContractReadbackUsed: true/);
  assert.match(schemaGate, /separateDetailRoutesInvented: false/);
});

test('Pass 348 keeps Contract ownership numbering revised value and lifecycle server-owned', () => {
  assert.match(schema, /createClientContractBodySchema = z\.object\(\{[\s\S]*projectId:[\s\S]*clientId:[\s\S]*contractValue:[\s\S]*billingMethod:[\s\S]*retentionPercent:[\s\S]*currency:/);
  for (const forbidden of ['companyId:', 'contractNo:', 'revisedValue:', 'status:']) {
    const createBlock = schema.match(/createClientContractBodySchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/)?.[1] ?? '';
    assert.doesNotMatch(createBlock, new RegExp(forbidden.replace(':', '\\s*:')));
  }
  assert.match(schemaGate, /contractNumberBrowserOwned: false/);
  assert.match(schemaGate, /revisedContractValueBrowserOwned: false/);
});

test('Pass 348 creates a Claim with periodEnd only and keeps header totals server-owned', () => {
  assert.match(schema, /createProgressClaimBodySchema = z\.object\(\{\s*periodEnd: dateSchema\s*\}\)\.strict\(\)/s);
  assert.match(schemaGate, /createClaimBrowserFields: \['periodEnd'\]/);
  assert.match(schemaGate, /claimNumberBrowserOwned: false/);
  assert.match(schemaGate, /claimHeaderTotalsBrowserOwned: false/);
});

test('Pass 348 freezes PUT Claim lines as complete replacement without line IDs', () => {
  assert.match(schema, /replaceProgressClaimLinesBodySchema = z\.object\(\{\s*lines: z\.array\(progressClaimLineInputSchema\)\s*\}\)\.strict\(\)/s);
  for (const field of ['boqItemId', 'description', 'contractQty', 'cumulativeQty', 'currentQty', 'rate', 'currentValue']) {
    assert.ok(schema.includes(`${field}:`), `Missing Claim-line field ${field}`);
  }
  const lineBlock = schema.match(/progressClaimLineInputSchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/)?.[1] ?? '';
  assert.doesNotMatch(lineBlock, /\bid\s*:/);
  assert.match(schemaGate, /claimLinePutSemantics: 'complete-replacement'/);
  assert.match(schemaGate, /claimLineIdsBrowserOwned: false/);
});

test('Pass 348 certification accepts only certifiedValue while retention and deductions stay server-owned', () => {
  assert.match(schema, /certifyProgressClaimBodySchema = z\.object\(\{\s*certifiedValue: moneySchema\s*\}\)\.strict\(\)/s);
  assert.match(schemaGate, /certifyBrowserFields: \['certifiedValue'\]/);
  assert.match(schemaGate, /retentionAndDeductionTotalsBrowserOwned: false/);
});

test('Pass 348 Invoice generation accepts dates but no browser tax or receivable totals', () => {
  const invoiceBlock = schema.match(/createClientInvoiceBodySchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/)?.[1] ?? '';
  assert.match(invoiceBlock, /invoiceDate: dateSchema/);
  assert.match(invoiceBlock, /dueDate: dateSchema/);
  assert.doesNotMatch(invoiceBlock, /taxAmount|grossAmount|retentionAmount|totalReceivable|invoiceNo|status/);
  assert.match(schemaGate, /invoiceTaxAndTotalsBrowserOwned: false/);
});

test('Pass 348 keeps Retention release bodyless instead of inventing partial amount or release date', () => {
  assert.match(schema, /releaseRetentionBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schemaGate, /retentionReleaseBodyless: true/);
  assert.match(schemaGate, /partialRetentionReleaseFieldInvented: false/);
  assert.match(schemaGate, /retentionReleaseAmountBrowserOwned: false/);
});

test('Pass 348 keeps all money quantity and rate values exact decimal strings', () => {
  assert.match(schema, /const moneySchema = z\.string\(\)/);
  assert.match(schema, /const quantitySchema = z\.string\(\)/);
  assert.match(schema, /const rateSchema = z\.string\(\)/);
  assert.match(schemaGate, /exactDecimalStringsUsed: true/);
  assert.doesNotMatch(schema, /z\.number\(\).*contractValue/);
});

test('Pass 348 keeps source vocabularies string-backed instead of inventing enums', () => {
  assert.match(schema, /const billingMethodSchema = z\.string\(\)/);
  assert.match(schema, /const statusSchema = z\.string\(\)/);
  assert.doesNotMatch(schema, /z\.enum\(\[[^\]]*(CERTIFIED|ISSUED|RELEASED)/s);
  assert.match(schemaGate, /billingMethodEnumInvented: false/);
  assert.match(schemaGate, /lifecycleStatusEnumsInvented: false/);
  assert.match(schemaGate, /retentionVocabulariesInvented: false/);
});

test('Pass 348 reviewed route freeze remains intact while later repairs stay in a separate route constant', () => {
  const reviewed = schema.match(/MODULE_16_HTTP_ROUTES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '';
  const repair = schema.match(/MODULE_16_PASS_375_HTTP_ROUTES = Object\.freeze\(\[[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.doesNotMatch(reviewed, /claims\/:id\/submit|contracts\/:id'/);
  assert.match(repair, /contracts\/:id/);
  assert.match(repair, /claims\/:id\/submit/);
  for (const unsupportedRoute of [
    "route: '/api/v1/client-billing/claims/:id'",
    "route: '/api/v1/client-billing/invoices'",
    "route: '/api/v1/client-billing/payments'",
    "route: '/api/v1/client-billing/invoices/:id/post-ar'",
  ]) assert.ok(!schema.includes(unsupportedRoute), `Unexpected route ${unsupportedRoute}`);
  assert.match(schemaGate, /claimSubmitRouteInvented: false/);
  assert.match(schemaGate, /standaloneInvoiceCreateInvented: false/);
  assert.match(schemaGate, /paymentApiInvented: false/);
  assert.match(schemaGate, /financeArAdapterGeneratedEarly: false/);
});

test('Pass 348 keeps aggregate readback because no separate detail route exists', () => {
  assert.match(schema, /clientContractResponseSchema = z\.object\(\{[\s\S]*claims: z\.array\(progressClaimResponseSchema\)[\s\S]*retentionEntries: z\.array\(retentionLedgerResponseSchema\)/);
  assert.match(schema, /progressClaimResponseSchema = z\.object\(\{[\s\S]*lines: z\.array\(progressClaimLineResponseSchema\)[\s\S]*invoice: clientInvoiceResponseSchema\.nullable\(\)/);
});

test('Pass 348 registers one schema gate and points only to Pass 349 repository work next', () => {
  assert.equal(rootPackage.scripts['module-16:schema:gate'], 'node scripts/module-16/verify-stage-23-schema.mjs');
  assert.equal(rootPackage.scripts['pass-348:client-billing-schema:gate'], 'node scripts/module-16/verify-stage-23-schema.mjs');
  assert.match(schemaGate, /Pass 349 - Module 16 Company\/Project-scoped Client Billing repository primitives/);
});

test('Pass 348 historical evidence still records that later layers were not generated in Pass 348', () => {
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
});


test('Pass 349 adds only the reviewed Client Billing repository production layer', async () => {
  await access('apps/api/src/modules/client-billing/client-billing.repository.ts');
  assert.match(repositoryGate, /pass: 349/);
  assert.match(repositoryGate, /stage: 23/);
  assert.match(repositoryGate, /STAGE_23_MODULE_16_REPOSITORY_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
});

test('Pass 349 binds repository access to trusted Company scope and explicit Module-24B Project visibility', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /ClientBillingProjectVisibilityRepositoryInput/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /buildProjectVisibilityWhere/);
  assert.match(repository, /isProjectVisible/);
  assert.match(repositoryGate, /companyOwnershipFromTrustedRequestContext: true/);
  assert.match(repositoryGate, /projectVisibilityExplicit: true/);
});

test('Pass 349 keeps Contract listing bounded and deterministic without adding filters', () => {
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /MODULE_16_MAX_PAGE_SIZE/);
  assert.match(repository, /async listClientContracts/);
  assert.match(repository, /orderBy: \[\{ contractNo: 'asc' \}, \{ id: 'asc' \}\]/);
  assert.match(repositoryGate, /boundedPaginationOnly: true/);
});

test('Pass 349 validates Project and Client masters before Client Contract creation', () => {
  assert.match(repository, /async findProjectById/);
  assert.match(repository, /async findClientById/);
  assert.match(repository, /async createClientContract/);
  assert.match(repository, /this\.db\.project\.findFirst/);
  assert.match(repository, /this\.db\.client\.findFirst/);
  assert.match(repositoryGate, /clientCompanyLookupPrepared: true/);
});

test('Pass 349 prepares Contract and Claim row locks for service-owned numbering and lifecycle transactions', () => {
  assert.match(repository, /async lockClientContractForWrite/);
  assert.match(repository, /FROM client_contracts/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /async lockProgressClaimForWrite/);
  assert.match(repository, /FROM progress_claims pc/);
  assert.match(repository, /FOR UPDATE OF pc/);
  assert.match(repositoryGate, /contractWriteLockPrepared: true/);
  assert.match(repositoryGate, /claimWriteLockPrepared: true/);
});

test('Pass 349 exposes Claim history for later cumulative-value certification checks without inventing status tokens', () => {
  assert.match(repository, /async listProgressClaimsForContract/);
  assert.match(repository, /orderBy: \[\{ periodEnd: 'asc' \}, \{ claimNo: 'asc' \}, \{ id: 'asc' \}\]/);
  assert.doesNotMatch(repository, /status:\s*['"]CERTIFIED['"]/);
  assert.match(repositoryGate, /claimHistoryReadPreparedForCumulativeChecks: true/);
  assert.match(repositoryGate, /lifecycleEnumsInvented: false/);
});

test('Pass 349 keeps optional BOQ Claim references inside the same visible Project', () => {
  assert.match(repository, /async findProjectBoqItemsByIds/);
  assert.match(repository, /revision:\s*\{[\s\S]*boq:\s*\{ projectId, companyId: scope\.companyId \}/);
  assert.match(repository, /async replaceProgressClaimLines/);
  assert.match(repository, /requestedBoqItemIds/);
  assert.match(repository, /validBoqItemIds/);
  assert.match(repositoryGate, /projectBoqLookupPrepared: true/);
});

test('Pass 349 keeps PUT Claim lines as complete replacement inside the service transaction', () => {
  assert.match(repository, /progressClaimLine\.deleteMany\(\{ where: \{ claimId \} \}\)/);
  assert.match(repository, /progressClaimLine\.createMany/);
  assert.match(repository, /return this\.findProgressClaimById/);
  assert.match(repositoryGate, /claimLineCompleteReplacePrepared: true/);
});

test('Pass 349 prepares server-owned certification totals without hard-coding certification policy', () => {
  assert.match(repository, /UpdateProgressClaimCertificationRepositoryInput/);
  for (const field of [
    'grossValue', 'previousValue', 'currentValue', 'retentionAmount', 'deductionAmount', 'certifiedValue'
  ]) assert.ok(repository.includes(`${field}: string`), `Missing certification field ${field}`);
  assert.match(repository, /async updateProgressClaimCertification/);
  assert.match(repositoryGate, /certificationTotalsUpdatePrepared: true/);
});

test('Pass 349 prepares singular Invoice lookup and immutable source creation by Claim', () => {
  assert.match(repository, /async findClientInvoiceByClaimId/);
  assert.match(repository, /async createClientInvoice/);
  assert.match(repository, /contractId: input\.contractId/);
  assert.match(repository, /claimId: input\.claimId/);
  assert.match(repositoryGate, /existingInvoiceByClaimLookupPrepared: true/);
  assert.match(repositoryGate, /immutableInvoiceCreatePrepared: true/);
});

test('Pass 349 prepares retention balance reads locks creation and server-owned release updates', () => {
  for (const method of [
    'listRetentionEntriesForSourceIds',
    'findRetentionLedgerById',
    'findRetentionLedgerBySource',
    'lockRetentionLedgerForWrite',
    'createRetentionLedger',
    'updateRetentionRelease'
  ]) assert.ok(repository.includes(`async ${method}`), `Missing repository method ${method}`);
  assert.match(repositoryGate, /retentionWriteLockPrepared: true/);
  assert.match(repositoryGate, /retentionReleaseUpdatePrepared: true/);
});

test('Pass 349 does not invent direct Contract retention ownership, payment persistence or early AR posting', () => {
  assert.match(repository, /without inventing retention ownership/);
  assert.doesNotMatch(repository, /this\.db\.payment/);
  assert.doesNotMatch(repository, /this\.db\.arInvoice/);
  assert.match(repositoryGate, /retentionContractOwnershipInvented: false/);
  assert.match(repositoryGate, /paymentPersistenceInvented: false/);
  assert.match(repositoryGate, /financeArAdapterGeneratedEarly: false/);
});

test('Pass 349 historical repository evidence still records that later layers were deferred in Pass 349', () => {
  assert.match(repositoryGate, /serviceGenerated: false/);
  assert.match(repositoryGate, /routesGenerated: false/);
  assert.match(repositoryGate, /indexGenerated: false/);
  assert.match(repositoryGate, /reactGenerated: false/);
});

test('Pass 349 registers the repository gate and points only to Pass 350 service work next', () => {
  assert.equal(rootPackage.scripts['module-16:repository:gate'], 'node scripts/module-16/verify-stage-23-repository.mjs');
  assert.equal(rootPackage.scripts['pass-349:client-billing-repository:gate'], 'node scripts/module-16/verify-stage-23-repository.mjs');
  assert.match(repositoryGate, /Pass 350 - Module 16 Client Billing core service transactions/);
});

test('Pass 349 gives every named production function a clear purpose comment', () => {
  const functionNames = [
    'assertPageWindow',
    'uniqueIds',
    'buildProjectVisibilityWhere',
    'isProjectVisible',
    'progressClaimAggregateInclude',
    'clientContractAggregateInclude'
  ];
  for (const name of functionNames) {
    const pattern = new RegExp(`/\\*\\*[^]*?\\*/\\s*function ${name}\\(`);
    assert.match(repository, pattern);
  }
});


test('Pass 350 adds only the reviewed Client Billing core service production layer', async () => {
  await access('apps/api/src/modules/client-billing/client-billing.service.ts');
  assert.match(serviceGate, /pass: 350/);
  assert.match(serviceGate, /stage: 23/);
  assert.match(serviceGate, /STAGE_23_MODULE_16_SERVICE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
});

test('Pass 350 keeps Company and Project authority server-owned through Module 24B permissions', () => {
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /private async hasCompanyPermission/);
  assert.match(service, /private async requireProjectPermission/);
  assert.match(service, /private async resolveProjectVisibility/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(serviceGate, /companyAndProjectAuthorityServerOwned: true/);
  assert.match(serviceGate, /module24bProjectVisibilityReused: true/);
});

test('Pass 350 uses bounded Contract listing without inventing extra filters', () => {
  assert.match(service, /function pageWindow/);
  assert.match(service, /async listClientContracts/);
  assert.match(service, /'client_billing\.read'/);
  assert.match(service, /listClientContracts\(\n\s*\{ skip: window\.skip, take: window\.take \},/);
});

test('Pass 350 creates Client Contracts idempotently with server-owned revised value and numbering', () => {
  assert.match(service, /CLIENT_CONTRACT_SEQUENCE_KEY = 'client-contract'/);
  assert.match(service, /operation: 'client-billing\.contract-create'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: CLIENT_CONTRACT_SEQUENCE_KEY \}\)/);
  assert.match(service, /revisedValue: input\.contractValue/);
  assert.match(service, /status: CLIENT_CONTRACT_ACTIVE/);
  assert.match(service, /eventType: 'client_contract\.created'/);
  assert.match(serviceGate, /contractCreateIdempotent: true/);
});

test('Pass 350 creates concurrency-safe numbered draft Claims without inventing a submit route', () => {
  assert.match(service, /PROGRESS_CLAIM_SEQUENCE_KEY = 'progress-claim'/);
  assert.match(service, /operation: 'client-billing\.claim-create'/);
  assert.match(service, /lockClientContractForWrite/);
  assert.match(service, /status: PROGRESS_CLAIM_DRAFT/);
  assert.match(service, /grossValue: '0\.00'/);
  assert.match(service, /deductionAmount: '0\.00'/);
  assert.doesNotMatch(service, /\/claims\/:id\/submit/);
  assert.match(serviceGate, /claimSubmitRouteInvented: false/);
});

test('Pass 350 resolves Claim route scope through the owning Contract instead of trusting a client Project id', () => {
  assert.match(repository, /async findProgressClaimContextById/);
  assert.match(repository, /contract:\s*\{[\s\S]*companyId: scope\.companyId[\s\S]*buildProjectVisibilityWhere\(visibility\)/);
  assert.match(service, /private async requireVisibleProgressClaim/);
  assert.match(service, /const projectId = claim\.contract\.projectId/);
});

test('Pass 350 keeps Claim lines editable only in DRAFT and rechecks certified cumulative BOQ quantity', () => {
  assert.match(service, /operation: 'client-billing\.claim-lines-replace'/);
  assert.match(service, /!hasStatus\(lockedClaim\.status, PROGRESS_CLAIM_DRAFT\)/);
  assert.match(service, /function previousCertifiedQuantities/);
  assert.match(service, /function requireValidCumulativeQuantities/);
  assert.match(service, /cumulative < previous/);
  assert.match(service, /cumulative > contractQuantity/);
  assert.match(serviceGate, /certifiedBoqCumulativeQuantityRegressionRejected: true/);
});

test('Pass 350 calculates Claim money with bigint exact arithmetic and no binary floating point', () => {
  for (const helper of [
    'moneyToMinorUnits', 'minorUnitsToMoney', 'requireMoneyRange', 'addMoney',
    'decimalToScale4', 'divideRoundHalfUp', 'calculateRetention'
  ]) assert.match(service, new RegExp(`function ${helper}\\(`));
  assert.doesNotMatch(service, /parseFloat\s*\(/);
  assert.doesNotMatch(service, /Number\s*\([^)]*(?:Amount|Value|retention|money)/i);
});

test('Pass 350 serializes certification by Contract and calculates previous current gross and retention server-side', () => {
  assert.match(service, /operation: 'client-billing\.claim-certify'/);
  assert.match(service, /lockClientContractForWrite/);
  assert.match(service, /lockProgressClaimForWrite/);
  assert.match(service, /function previousCertifiedValue/);
  assert.match(service, /const currentValue = currentClaimedValue/);
  assert.match(service, /const previousValue = previousCertifiedValue/);
  assert.match(service, /const grossValue = addMoney\(\[previousValue, currentValue\]\)/);
  assert.match(service, /grossValue > moneyToMinorUnits\(lockedContract\.revisedValue\)/);
  assert.match(service, /certifiedValue > currentValue/);
  assert.match(service, /calculateRetention\(certifiedValue, lockedContract\.retentionPercent\)/);
  assert.match(service, /deductionAmount: '0\.00'/);
});

test('Pass 350 historical implicit-submit boundary is superseded only by the explicit Pass-375 submit command', () => {
  assert.match(serviceGate, /claimSubmittedEventRecordedAtCertificationBoundary: true/);
  assert.match(serviceGate, /claimSubmitRouteInvented: false/);
  assert.match(service, /operation: 'client-billing\.claim-submit'/);
  assert.match(service, /status: PROGRESS_CLAIM_SUBMITTED/);
  assert.match(service, /eventType: 'progress_claim\.submitted'/);
  assert.doesNotMatch(service, /implicitSubmitAtCertification: true/);
  assert.match(service, /eventType: 'progress_claim\.certified'/);
});

test('Pass 350 keeps certified Claims immutable while allowing safe replay of the same certified value', () => {
  assert.match(service, /hasStatus\(lockedClaim\.status, PROGRESS_CLAIM_CERTIFIED\)/);
  assert.match(service, /moneyToMinorUnits\(lockedClaim\.certifiedValue\) !== moneyToMinorUnits\(input\.certifiedValue\)/);
  assert.match(service, /Certified Progress Claims are immutable/);
  assert.match(serviceGate, /certifiedClaimImmutableInService: true/);
});

test('Pass 350 historical evidence correctly records Invoice and Retention work as deferred at that checkpoint', () => {
  assert.match(serviceGate, /invoiceGenerationImplemented: false/);
  assert.match(serviceGate, /retentionReleaseImplemented: false/);
  assert.match(serviceGate, /approvedChangeAdapterImplemented: false/);
  assert.match(serviceGate, /financeArAdapterGeneratedEarly: false/);
});

test('Pass 350 adds no migration and registers only the focused service gate', () => {
  assert.equal(rootPackage.scripts['module-16:service:gate'], 'node scripts/module-16/verify-stage-23-service.mjs');
  assert.equal(rootPackage.scripts['pass-350:client-billing-service:gate'], 'node scripts/module-16/verify-stage-23-service.mjs');
  assert.match(serviceGate, /databaseMigrationGenerated: false/);
  assert.match(serviceGate, /Pass 351 - Module 16 Client Invoice generation/);
});

test('Pass 350 gives every named production helper and repository addition a clear purpose comment', () => {
  const functionNames = [
    'hasStatus', 'inputDate', 'dateOnly', 'pageWindow', 'decimalToScale4', 'moneyToMinorUnits',
    'minorUnitsToMoney', 'requireMoneyRange', 'addMoney', 'divideRoundHalfUp', 'calculateRetention',
    'clientInvoiceResponse', 'progressClaimLineResponse', 'progressClaimResponse', 'clientContractResponse',
    'currentClaimedValue', 'previousCertifiedValue', 'previousCertifiedQuantities',
    'requireValidCumulativeQuantities', 'requireWritableProject'
  ];
  for (const name of functionNames) {
    const pattern = new RegExp(`/\\*\\*[^]*?\\*/\\s*function ${name}\\(`);
    assert.match(service, pattern);
  }
  assert.match(repository, /\/\*\* Resolve one Claim and its owning Contract[\s\S]*async findProgressClaimContextById/);
});

test('Pass 351 implements certified-Claim Client Invoice issue without adding public routes early', () => {
  assert.match(invoiceRetentionGate, /pass: 351/);
  assert.match(invoiceRetentionGate, /STAGE_23_MODULE_16_INVOICE_RETENTION_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(service, /async createClientInvoice\(/);
  assert.match(service, /operation: 'client-billing\.invoice-issue'/);
  assert.match(service, /'client_invoices\.issue'/);
  assert.match(service, /hasStatus\(lockedClaim\.status, PROGRESS_CLAIM_CERTIFIED\)/);
  assert.match(service, /CLAIM_NOT_CERTIFIED/);
  assert.match(service, /CLIENT_INVOICE_ALREADY_CREATED/);
});

test('Pass 351 uses Foundation Invoice numbering and prepares a stable Stage-26 AR source identity', () => {
  assert.match(service, /CLIENT_INVOICE_SEQUENCE_KEY = 'client-invoice'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: CLIENT_INVOICE_SEQUENCE_KEY \}\)/);
  assert.match(service, /function clientInvoiceSourceKey\(/);
  assert.match(service, /return `client-invoice:\$\{invoiceId\}`/);
  assert.match(service, /financeArAdapterDeferredToStage26: true/);
  assert.match(invoiceRetentionGate, /clientInvoiceStableSourceKeyPrepared: true/);
  assert.match(invoiceRetentionGate, /financeArAdapterGeneratedEarly: false/);
});

test('Pass 351 calculates Invoice amounts from certified Claim state without inventing tax policy', () => {
  assert.match(service, /const grossAmount = moneyToMinorUnits\(lockedClaim\.certifiedValue\)/);
  assert.match(service, /const retentionAmount = moneyToMinorUnits\(lockedClaim\.retentionAmount\)/);
  assert.match(service, /const deductionAmount = moneyToMinorUnits\(lockedClaim\.deductionAmount\)/);
  assert.match(service, /const taxAmount = 0n/);
  assert.match(service, /grossAmount - retentionAmount - deductionAmount \+ taxAmount/);
  assert.match(invoiceRetentionGate, /invoiceTaxPolicyInvented: false/);
  assert.match(invoiceRetentionGate, /invoiceTaxHeldAtZeroUntilSourcePolicyExists: true/);
});

test('Pass 351 validates Invoice dates and keeps immutable source creation inside one transaction', () => {
  assert.match(service, /function requireValidInvoiceDates\(/);
  assert.match(service, /dueDate\.getTime\(\) < invoiceDate\.getTime\(\)/);
  assert.match(service, /repository\.createClientInvoice\(/);
  assert.match(service, /status: CLIENT_INVOICE_ISSUED/);
  assert.match(service, /eventType: 'client_invoice\.issued'/);
});

test('Pass 351 creates Retention Ledger evidence from issued Invoice retention only when there is retained value', () => {
  assert.match(service, /if \(retentionAmount > 0n\)/);
  assert.match(service, /sourceType: RETENTION_SOURCE_CLIENT_INVOICE/);
  assert.match(service, /sourceId: invoice\.id/);
  assert.match(service, /direction: RETENTION_DIRECTION_WITHHELD/);
  assert.match(service, /releasedAmount: '0\.00'/);
  assert.match(service, /status: RETENTION_HELD/);
  assert.match(invoiceRetentionGate, /retentionLedgerCreatedWithInvoice: true/);
});

test('Pass 351 implements bodyless full Retention release with safe replay and exact permission scope', () => {
  assert.match(service, /async releaseRetention\(/);
  assert.match(service, /operation: 'client-billing\.retention-release'/);
  assert.match(service, /'client_retention\.release'/);
  assert.match(service, /findRetentionLedgerContextById/);
  assert.match(service, /lockRetentionLedgerForWrite/);
  assert.match(service, /alreadyReleased === amount/);
  assert.match(service, /releasedAmount: minorUnitsToMoney\(amount\)/);
  assert.match(service, /status: RETENTION_RELEASED/);
  assert.match(service, /eventType: 'client_retention\.released'/);
});

test('Pass 351 exposes Retention readback through the existing Contract register instead of inventing a detail route', () => {
  assert.match(repository, /async listVisibleRetentionEntriesForSourceIds/);
  assert.match(service, /listVisibleRetentionEntriesForSourceIds\(invoiceIds, visibility\)/);
  assert.match(service, /retentionBySourceId/);
  assert.match(service, /retentionEntries: retentionEntries\.map\(retentionLedgerResponse\)/);
  assert.match(invoiceRetentionGate, /retentionReadbackIncludedInContractRegister: true/);
});

test('Pass 351 keeps approved Change to Contract mapping fail-closed because the source does not identify the target Contract', () => {
  assert.doesNotMatch(service, /ChangeOrdersRepository|ChangeOrdersService/);
  assert.doesNotMatch(service, /PROJECT_BUDGET_REVENUE|CLIENT_CONTRACT_CHANGE/);
  assert.match(invoiceRetentionGate, /approvedChangeAdapterImplemented: false/);
  assert.match(invoiceRetentionGate, /approvedChangeAdapterFailClosedUntilTargetMappingExists: true/);
  assert.match(invoiceRetentionGate, /approvedChangeTargetMappingInvented: false/);
  assert.match(invoiceRetentionGate, /stage27ChangeContractProofStillRequired: true/);
});

test('Pass 351 historical evidence keeps Stage-26 AR React and migration work deferred at that checkpoint', () => {
  assert.doesNotMatch(service, /this\.db\.arInvoice/);
  assert.match(invoiceRetentionGate, /publicRoutesGenerated: false/);
  assert.match(invoiceRetentionGate, /reactGenerated: false/);
  assert.match(invoiceRetentionGate, /databaseMigrationGenerated: false/);
});

test('Pass 351 registers only the focused Invoice and Retention gate and points to Pass 352 HTTP next', () => {
  assert.equal(rootPackage.scripts['module-16:invoice-retention:gate'], 'node scripts/module-16/verify-stage-23-invoice-retention.mjs');
  assert.equal(rootPackage.scripts['pass-351:client-billing-invoice-retention:gate'], 'node scripts/module-16/verify-stage-23-invoice-retention.mjs');
  assert.match(invoiceRetentionGate, /Pass 352 - Module 16 Fastify routes/);
});

test('Pass 351 gives every new named production helper and repository method a clear purpose comment', () => {
  for (const name of ['clientInvoiceSourceKey', 'requireValidInvoiceDates', 'retentionLedgerResponse']) {
    assert.match(service, new RegExp(`/\\*\\*[^]*?\\*/\\s*function ${name}\\(`));
  }
  assert.match(repository, /\/\*\* List retention rows for source records[\s\S]*async listVisibleRetentionEntriesForSourceIds/);
  assert.match(repository, /\/\*\* Resolve one retention row and its Project[\s\S]*async findRetentionLedgerContextById/);
});



test('Pass 352 exposes exactly the seven reviewed Client Billing HTTP operations', () => {
  assert.match(httpGate, /pass: 352/);
  assert.match(httpGate, /exactReviewedRouteCount: 7/);
  for (const route of [
    "app.get('/api/v1/client-billing/contracts'",
    "app.post('/api/v1/client-billing/contracts'",
    "app.post('/api/v1/client-billing/contracts/:id/claims'",
    "app.put('/api/v1/client-billing/claims/:id/lines'",
    "app.post('/api/v1/client-billing/claims/:id/certify'",
    "app.post('/api/v1/client-billing/claims/:id/invoice'",
    "app.post('/api/v1/client-billing/retention/:id/release'",
  ]) assert.ok(routes.includes(route), `Missing route registration ${route}`);
  assert.doesNotMatch(routes, /app\.delete\(/i);
  assert.match(routes, /app\.patch\('\/api\/v1\/client-billing\/contracts\/:id'/);
});

test('Pass 352 authenticates every route and keeps permission/project policy in the service', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 9);
  assert.match(routes, /new ClientBillingService\(options\.database\)/);
  assert.match(httpGate, /projectResourcePolicyRemainsAuthoritativeInService: true/);
  for (const permission of PERMISSIONS) assert.ok(service.includes(permission), `Service missing permission ${permission}`);
});

test('Pass 352 keeps all six Client Billing write operations idempotency-key protected', () => {
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 8);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 8);
  assert.match(routes, /A valid Idempotency-Key header is required/);
  assert.match(httpGate, /idempotentCommandRouteCount: 6/);
});

test('Pass 352 revalidates request and response values through the frozen Zod schemas', () => {
  assert.match(routes, /function parseRequest/);
  for (const schemaName of [
    'listClientContractsQuerySchema', 'createClientContractBodySchema', 'createProgressClaimBodySchema',
    'replaceProgressClaimLinesBodySchema', 'certifyProgressClaimBodySchema', 'createClientInvoiceBodySchema',
    'releaseRetentionBodySchema', 'listClientContractsResponseSchema', 'createClientContractResponseSchema',
    'createProgressClaimResponseSchema', 'replaceProgressClaimLinesResponseSchema',
    'certifyProgressClaimResponseSchema', 'createClientInvoiceResponseSchema', 'releaseRetentionResponseSchema'
  ]) assert.ok(routes.includes(schemaName), `Route layer missing ${schemaName}`);
  assert.match(httpGate, /strictZodBoundaryRetained: true/);
  assert.match(httpGate, /responseZodValidationRetained: true/);
});

test('Pass 352 documents exact decimals without allowing browser-owned financial totals', () => {
  assert.match(routes, /const MONEY_JSON_SCHEMA/);
  assert.match(routes, /const QUANTITY_JSON_SCHEMA/);
  assert.match(routes, /const RETENTION_PERCENT_JSON_SCHEMA/);
  assert.doesNotMatch(routes, /companyId\s*:/);
  for (const field of [
    'contractNo', 'revisedValue', 'claimNo', 'grossValue', 'previousValue',
    'retentionAmount', 'deductionAmount', 'invoiceNo', 'taxAmount', 'totalReceivable'
  ]) assert.ok(!routes.includes(`${field}: {`), `Request schema should not expose server-owned ${field}`);
});

test('Pass 352 keeps retention release bodyless and does not invent partial release input', () => {
  assert.match(routes, /body: EMPTY_BODY_JSON_SCHEMA/);
  assert.match(routes, /releaseRetentionBodySchema, request\.body \?\? \{\}, 'body'/);
  assert.doesNotMatch(routes, /releaseAmount/);
  assert.doesNotMatch(routes, /const RELEASE_RETENTION_BODY_JSON_SCHEMA/);
  assert.match(httpGate, /retentionReleaseBodyless: true/);
});

test('Pass 352 maps reviewed errors into stable HTTP response envelopes without leaking internals', () => {
  for (const code of ERRORS) assert.ok(routes.includes(code), `HTTP error schema missing ${code}`);
  assert.match(routes, /RESOURCE_NOT_FOUND/);
  assert.match(routes, /BUSINESS_CONFLICT/);
  assert.match(routes, /INTERNAL_SERVER_ERROR/);
  assert.match(routes, /fieldErrors/);
});

test('Pass 352 registers Module 16 after Change Orders in the Fastify application', () => {
  assert.match(app, /import \{ registerClientBillingRoutes \} from '\.\/modules\/client-billing\/index\.js';/);
  assert.match(app, /app\.register\(registerChangeOrdersRoutes,[\s\S]*app\.register\(registerClientBillingRoutes, \{ database: options\.database \}\);/);
  assert.match(httpGate, /appRegistrationPrepared: true/);
});

test('Pass 352 index exports only the existing Module 16 layers and HTTP registration', () => {
  for (const exportName of [
    'ClientBillingRepository', 'ClientBillingService', 'registerClientBillingRoutes',
    'MODULE_16_HTTP_ROUTES', 'MODULE_16_PERMISSION_CODES', 'MODULE_16_ERROR_CODES'
  ]) assert.ok(moduleIndex.includes(exportName), `Module index missing ${exportName}`);
  assert.doesNotMatch(moduleIndex, /ClientBillingController|PaymentService|ArInvoice/);
});

test('Pass 352 historical evidence keeps Stage-26 AR Change adapter and React work deferred at that checkpoint', () => {
  assert.doesNotMatch(routes, /\/payments|\/ar|\/changes/);
  assert.match(httpGate, /financeArAdapterGeneratedEarly: false/);
  assert.match(httpGate, /approvedChangeAdapterImplemented: false/);
  assert.match(httpGate, /reactGenerated: false/);
  assert.match(httpGate, /databaseMigrationGenerated: false/);
});

test('Pass 352 adds the focused HTTP gate and points to Pass 353 integration security next', () => {
  assert.equal(rootPackage.scripts['module-16:http:gate'], 'node scripts/module-16/verify-stage-23-http.mjs');
  assert.equal(rootPackage.scripts['pass-352:client-billing-http:gate'], 'node scripts/module-16/verify-stage-23-http.mjs');
  assert.match(httpGate, /Pass 353 - Module 16 PostgreSQL\/Fastify integration/);
});

test('Pass 352 gives every named HTTP helper a clear purpose comment', () => {
  assert.match(routes, /\/\*\* Build one stable Foundation error response schema[\s\S]*function errorResponseSchema\(/);
  assert.match(routes, /\/\*\* Parse one Module-16 request segment[\s\S]*function parseRequest</);
  assert.match(routes, /\/\*\* Read the required Foundation retry key[\s\S]*function readIdempotencyKey\(/);
  assert.match(routes, /\/\*\* Register the seven reviewed Stage-23 routes plus the focused Pass-375 repair operations\.[\s\S]*export async function registerClientBillingRoutes\(/);
});


test('Pass 353 prepares the real PostgreSQL/Fastify integration suite without changing production runtime code', () => {
  assert.match(integrationSecurityGate, /pass: 353/);
  assert.match(integrationSecurityGate, /integrationFile: 'tests\/integration\/module-16-api\.integration\.test\.mjs'/);
  assert.match(integrationSecurityGate, /productionRuntimeChanges: 0/);
  assert.match(integrationSecurityGate, /databaseChanges: 0/);
  assert.match(integrationSecurityGate, /newMigrations: 0/);
  assert.match(integrationSecurityGate, /publicRoutesAdded: 0/);
});

test('Pass 353 live suite covers the complete reviewed Client Billing source workflow', () => {
  for (const helper of [
    'createContract', 'createClaim', 'replaceClaimLines', 'certifyClaim', 'issueInvoice'
  ]) assert.match(integrationTest, new RegExp(`async function ${helper}\\(`));
  assert.match(integrationTest, /Contract -> Claim -> certification -> Invoice -> retention workflow/);
  assert.match(integrationTest, /retentionAmount, '25\.00'/);
  assert.match(integrationTest, /totalReceivable, '225\.00'/);
  for (const eventType of EVENTS) assert.ok(integrationTest.includes(eventType), `Integration suite missing ${eventType}`);
});

test('Pass 353 verifies certified cumulative BOQ history and Contract value protection', () => {
  assert.match(integrationTest, /Regressed cumulative quantity/);
  assert.match(integrationTest, /cumulativeQty: '2\.0000'/);
  assert.match(integrationTest, /currentValue: '900\.00'/);
  assert.match(integrationTest, /'CLAIM_INVALID_CUMULATIVE_VALUE'/);
  assert.match(integrationSecurityGate, /cumulativeValueProtectionVerified/);
});

test('Pass 353 verifies certified and issued billing history cannot be rewritten', () => {
  assert.match(integrationTest, /Rewrite certified history/);
  assert.match(integrationTest, /CLIENT_INVOICE_ALREADY_CREATED/);
  assert.match(integrationTest, /clientInvoice\.update/);
  assert.match(integrationTest, /progressClaim\.update/);
  assert.match(integrationTest, /retentionLedger\.update/);
  assert.match(integrationSecurityGate, /immutableHistoryVerified/);
});

test('Pass 353 verifies authentication RBAC Project scope and cross-Company isolation', () => {
  assert.match(integrationTest, /statusCode, 401/);
  assert.match(integrationTest, /module16-project@example\.test/);
  assert.match(integrationTest, /module16-reader@example\.test/);
  assert.match(integrationTest, /module16-admin-b@example\.test/);
  assert.match(integrationTest, /module16-security-cross-project/);
  assert.match(integrationTest, /module16-security-cross-company-client/);
  assert.match(integrationSecurityGate, /negativeAuthorizationVerified/);
  assert.match(integrationSecurityGate, /crossProjectIsolationVerified/);
  assert.match(integrationSecurityGate, /crossCompanyIsolationVerified/);
});

test('Pass 353 verifies strict HTTP authority bounded pagination and Foundation idempotency', () => {
  assert.match(integrationTest, /module16-authority-extra-field/);
  assert.match(integrationTest, /pageSize=101/);
  assert.match(integrationTest, /module16-replay-contract/);
  assert.match(integrationTest, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(integrationTest, /operation: 'client-billing\.contract-create'/);
  assert.match(integrationSecurityGate, /idempotencyVerified/);
});

test('Pass 353 forces a late Invoice outbox failure and proves atomic rollback boundaries', () => {
  assert.match(integrationTest, /installModule16OutboxFailure/);
  assert.match(integrationTest, /client_invoice\.issued/);
  assert.match(integrationTest, /clientInvoice\.count/);
  assert.match(integrationTest, /retentionLedger\.count/);
  assert.match(integrationTest, /auditLog\.count/);
  assert.match(integrationTest, /outboxEvent\.count/);
  assert.match(integrationTest, /idempotencyRecord\.count/);
  assert.match(integrationTest, /sequence\.nextValue, 1n/);
  assert.match(integrationSecurityGate, /transactionRollbackVerified/);
});

test('Pass 353 verifies generated OpenAPI exposes exactly seven reviewed operations and six writes', () => {
  assert.match(integrationTest, /Module 16 live OpenAPI exposes exactly seven reviewed operations and six idempotent writes/);
  for (const operationId of [
    'module16ListClientContracts', 'module16CreateClientContract', 'module16CreateProgressClaim',
    'module16ReplaceProgressClaimLines', 'module16CertifyProgressClaim',
    'module16CreateClientInvoice', 'module16ReleaseRetention'
  ]) assert.ok(integrationTest.includes(operationId), `Integration OpenAPI test missing ${operationId}`);
  assert.match(integrationSecurityGate, /reviewedRouteCount: 7/);
  assert.match(integrationSecurityGate, /reviewedWriteCount: 6/);
  assert.match(integrationSecurityGate, /generatedOpenApiVerified/);
});

test('Pass 353 keeps generic billing payment AR and undocumented submit routes absent', () => {
  for (const forbidden of [
    '/api/v1/client-billing/claims/{id}/submit',
    '/api/v1/client-billing/invoices',
    '/api/v1/client-billing/payments',
    '/api/v1/client-billing/ar'
  ]) assert.ok(integrationTest.includes(forbidden), `OpenAPI negative coverage missing ${forbidden}`);
  assert.match(integrationSecurityGate, /financeArAdapterGenerated: false/);
  assert.match(integrationSecurityGate, /approvedChangeContractAdapterGenerated: false/);
  assert.match(integrationSecurityGate, /reactGenerated: false/);
});

test('Pass 353 live gate is fail-honest until Stage 22 runtime acceptance exists', () => {
  assert.match(integrationSecurityGate, /STAGE_22_ACCEPTED_READY_FOR_STAGE_23/);
  assert.match(integrationSecurityGate, /STAGE_22_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationSecurityGate, /runtimeVerificationComplete: passed && mode === 'live' && stage22LiveAccepted/);
  assert.match(integrationSecurityGate, /runtimeDeploymentAllowed: passed && mode === 'live' && stage22LiveAccepted/);
});

test('Pass 353 registers guarded static live and disposable PostgreSQL integration commands', () => {
  assert.equal(rootPackage.scripts['module-16:integration-security:gate'], 'node scripts/module-16/verify-stage-23-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-16:integration-security:gate:live'], 'node scripts/module-16/verify-stage-23-integration-security.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-353:client-billing-integration-security:gate'], 'node scripts/module-16/verify-stage-23-integration-security.mjs --mode=static');
  assert.match(rootPackage.scripts['test:integration:module-16'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:integration:module-16'], /test:db:prepare/);
  assert.match(rootPackage.scripts['test:integration:module-16'], /tests\/integration\/module-16-api\.integration\.test\.mjs/);
});

test('Pass 353 points only to Pass 354 React typed data next', () => {
  assert.match(integrationSecurityGate, /Pass 354 - Module 16 React typed API client and TanStack Query hooks/);
  assert.doesNotMatch(integrationSecurityGate, /Pass 355 -/);
});

test('Pass 353 gives every new named integration and gate helper a clear purpose comment', () => {
  for (const name of [
    'loadRuntime', 'seedScenario', 'withApi', 'signIn', 'errorCode', 'clientBillingWrite',
    'createContract', 'createClaim', 'replaceClaimLines', 'certifyClaim', 'issueInvoice',
    'prepareCertifiedClaim', 'module16OpenApiOperation', 'installModule16OutboxFailure', 'removeModule16OutboxFailure'
  ]) assert.match(integrationTest, new RegExp(`/\\*\\*[^]*?\\*/\\s*async function ${name}\\(|/\\*\\*[^]*?\\*/\\s*function ${name}\\(`));
  for (const name of ['readJson', 'writeBlockedEvidence']) {
    assert.match(integrationSecurityGate, new RegExp(`/\\*\\*[^]*?\\*/\\s*async function ${name}\\(`));
  }
});


// Pass 354 adds only the reviewed browser data layer before any Client Billing UI is generated.
test('Pass 354 adds only the typed Client Billing browser API and TanStack Query hooks', async () => {
  await access('apps/web/src/features/client-billing/api/client-billing-api.ts');
  await access('apps/web/src/features/client-billing/hooks/client-billing.ts');
  assert.match(reactDataGate, /pass: 354/);
  assert.match(reactDataGate, /newReactFiles: 2/);
  assert.match(reactDataGate, /reactComponentsAdded: 0/);
  assert.match(reactDataGate, /reactPagesAdded: 0/);
  assert.match(reactDataGate, /productionBackendChanges: 0/);
  assert.match(reactDataGate, /databaseChanges: 0/);
});

// The browser client preserves the seven reviewed Stage-23 operations and adds only the two Pass-375 repairs.
test('Pass 354 browser API review is superseded only by Pass-375 Contract update and Claim submit operations', () => {
  for (const name of [
    'listClientContracts',
    'createClientContract',
    'createProgressClaim',
    'replaceProgressClaimLines',
    'certifyProgressClaim',
    'createClientInvoice',
    'releaseRetention',
    'updateClientContract',
    'submitProgressClaim',
  ]) assert.match(reactApi, new RegExp(`export function ${name}\\(`));
  assert.equal((reactApi.match(/authenticatedRequest</g) ?? []).length, 9);
  assert.doesNotMatch(reactApi, /deleteClientContract|getClientContractDetail|createBillingPayment|postToAr|applyApprovedChange/);
});

// The Client Contract register accepts only the source-reviewed bounded pagination fields.
test('Pass 354 keeps the Client Contract browser query to page and pageSize only', () => {
  assert.match(reactApi, /export type ListClientContractsInput = Readonly<\{[\s\S]*?page\?: number;[\s\S]*?pageSize\?: number;/);
  const querySection = reactApi.slice(reactApi.indexOf('function clientContractsPageQuery'), reactApi.indexOf('/** Build the Foundation retry header'));
  assert.match(querySection, /query\.set\('page'/);
  assert.match(querySection, /query\.set\('pageSize'/);
  assert.doesNotMatch(querySection, /projectId|clientId|status|billingMethod|search|sort|date/);
});

// Browser mutation inputs contain reviewed business fields only; server-owned authority remains absent.
test('Pass 354 does not expose server-owned Client Billing authority in browser input types', () => {
  const inputSection = reactApi.slice(reactApi.indexOf('export type ListClientContractsInput'), reactApi.indexOf('/** Build the reviewed Client Contract register query'));
  for (const forbidden of [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'contractNo',
    'revisedValue',
    'claimNo',
    'claimStatus',
    'grossValue',
    'previousValue',
    'claimCurrentValue',
    'retentionAmount',
    'deductionAmount',
    'invoiceNo',
    'taxAmount',
    'totalReceivable',
    'invoiceStatus',
    'retentionReleasedAmount',
    'retentionStatus',
    'arPostingState',
  ]) assert.doesNotMatch(inputSection, new RegExp(`\\b${forbidden}\\b`), `Browser input exposes ${forbidden}`);
});

// All financial, quantity, rate and retention values remain decimal strings in the browser boundary.
test('Pass 354 preserves exact decimal strings across Client Billing browser types', () => {
  for (const field of [
    'contractValue', 'revisedValue', 'retentionPercent', 'grossValue', 'previousValue', 'currentValue',
    'retentionAmount', 'deductionAmount', 'certifiedValue', 'contractQty', 'cumulativeQty', 'currentQty',
    'rate', 'grossAmount', 'taxAmount', 'totalReceivable', 'amount', 'releasedAmount'
  ]) assert.match(reactApi, new RegExp(`${field}: string(?: \\| null)?;`), `Expected string decimal field ${field}`);
  assert.doesNotMatch(reactApi, /contractValue: number|currentValue: number|retentionAmount: number|rate: number|totalReceivable: number/);
});

// Every reviewed write uses Foundation idempotency and Retention release stays bodyless.
test('Pass 354 historical idempotency coverage is extended only by the two Pass-375 writes', () => {
  assert.equal((reactApi.match(/headers: clientBillingCommandHeaders\(idempotencyKey\)/g) ?? []).length, 8);
  const releaseSection = reactApi.slice(reactApi.indexOf('export function releaseRetention'));
  assert.doesNotMatch(releaseSection, /body:/);
  assert.match(releaseSection, /method: 'POST'/);
});

// Claim lines remain the one reviewed complete PUT replacement instead of invented line CRUD.
test('Pass 354 keeps Progress Claim editing as one complete line-replacement command', () => {
  assert.match(reactApi, /export type ReplaceProgressClaimLinesInput = Readonly<\{\s*lines: ProgressClaimLineInput\[\];/);
  assert.match(reactApi, /method: 'PUT'/);
  assert.match(reactApi, /client-billing\/claims\/\$\{claimId\}\/lines/);
  assert.doesNotMatch(reactApi, /createProgressClaimLine|updateProgressClaimLine|deleteProgressClaimLine/);
});

// One simple query/mutation hook exists for every reviewed browser operation.
test('Pass 354 exposes one TanStack Query hook per reviewed Client Billing operation', () => {
  for (const name of [
    'useClientContracts',
    'useCreateClientContract',
    'useCreateProgressClaim',
    'useReplaceProgressClaimLines',
    'useCertifyProgressClaim',
    'useCreateClientInvoice',
    'useReleaseRetention',
  ]) assert.match(reactHooks, new RegExp(`export function ${name}\\(`));
  assert.match(reactHooks, /const MODULE_16_QUERY_KEY = \['module-16', 'client-billing'\] as const/);
});

// Nested Contract readback is the only read model, so successful writes invalidate only that aggregate.
test('Pass 354 keeps Client Billing cache invalidation narrow and predictable', () => {
  assert.match(reactHooks, /function invalidateClientContractRegister/);
  assert.match(reactHooks, /'contracts'/);
  assert.equal((reactHooks.match(/invalidateClientContractRegister\(queryClient\)/g) ?? []).length, 8);
  assert.doesNotMatch(reactHooks, /module-17|change-orders|module-15|finance|budgets-job-cost|payments/);
});

// Deferred integrations and unsupported browser routes stay absent from the Stage-23 data layer.
test('Pass 354 keeps payment AR and approved-Change browser integrations deferred', () => {
  assert.doesNotMatch(reactApi, /\/payments|\/ar|\/changes/);
  assert.match(reactApi, /claims\/\$\{claimId\}\/submit/);
  assert.match(reactDataGate, /financeArAdapterGenerated: false/);
  assert.match(reactDataGate, /approvedChangeContractAdapterGenerated: false/);
  assert.match(reactDataGate, /reactComponentsAdded: 0/);
  assert.match(reactDataGate, /reactPagesAdded: 0/);
});

// Named browser functions keep short purpose comments for junior-readable maintenance.
test('Pass 354 keeps a purpose comment on every named Client Billing browser function', () => {
  for (const [source, name] of [
    [reactApi, 'clientContractsPageQuery'],
    [reactApi, 'clientBillingCommandHeaders'],
    [reactApi, 'listClientContracts'],
    [reactApi, 'createClientContract'],
    [reactApi, 'createProgressClaim'],
    [reactApi, 'replaceProgressClaimLines'],
    [reactApi, 'certifyProgressClaim'],
    [reactApi, 'createClientInvoice'],
    [reactApi, 'releaseRetention'],
    [reactHooks, 'newIdempotencyKey'],
    [reactHooks, 'invalidateClientContractRegister'],
    [reactHooks, 'useClientContracts'],
    [reactHooks, 'useCreateClientContract'],
    [reactHooks, 'useCreateProgressClaim'],
    [reactHooks, 'useReplaceProgressClaimLines'],
    [reactHooks, 'useCertifyProgressClaim'],
    [reactHooks, 'useCreateClientInvoice'],
    [reactHooks, 'useReleaseRetention'],
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 300), position), /\/\*\*[\s\S]*?\*\//);
  }
});

// The React data pass remains fail-honest and points directly to the workspace pass.
test('Pass 354 registers its gate and preserves fail-honest Stage-22 handoff status', () => {
  assert.equal(rootPackage.scripts['module-16:react-data:gate'], 'node scripts/module-16/verify-stage-23-react-data.mjs');
  assert.equal(rootPackage.scripts['pass-354:client-billing-react-data:gate'], 'node scripts/module-16/verify-stage-23-react-data.mjs');
  assert.match(reactDataGate, /STAGE_22_ACCEPTED_READY_FOR_STAGE_23/);
  assert.match(reactDataGate, /STAGE_23_MODULE_16_REACT_DATA_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(reactDataGate, /Pass 355 - Module 16 accessible permission-aware React Client Billing workspace/);
});


// Pass 355 adds the source-bounded React workspace without expanding the reviewed backend/database boundary.
test('Pass 355 adds one Client Billing component and one page without backend or migration expansion', async () => {
  await access('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  await access('apps/web/src/features/client-billing/pages/client-billing-page.tsx');
  assert.match(reactWorkspaceGate, /pass: 355/);
  assert.match(reactWorkspaceGate, /newReactFiles: 2/);
  assert.match(reactWorkspaceGate, /reactComponentsAdded: 1/);
  assert.match(reactWorkspaceGate, /reactPagesAdded: 1/);
  assert.match(reactWorkspaceGate, /productionBackendChanges: 0/);
  assert.match(reactWorkspaceGate, /databaseChanges: 0/);
  assert.match(reactWorkspaceGate, /newMigrations: 0/);
  assert.match(reactWorkspaceGate, /publicRoutesAdded: 0/);
});

// Admin navigation mirrors the corrected Stage-23 module while preserving restricted-Project read discoverability.
test('Pass 355 registers permission-aware Client Billing navigation in the existing admin shell', () => {
  assert.match(adminShell, /import \{ ClientBillingPage \} from '..\/..\/client-billing\/pages\/client-billing-page\.js'/);
  for (const permission of PERMISSIONS) assert.ok(adminShell.includes(permission), `Admin shell missing ${permission}`);
  assert.match(adminShell, /const canUseModule16 = hasModule16CompanyPermission[\s\S]*projectScope\.kind === 'restricted'/);
  assert.match(adminShell, /setView\('client-billing'\)/);
  assert.match(adminShell, />Client Billing<\/button>/);
  assert.match(adminShell, /activeView === 'client-billing' && <ClientBillingPage \/>/);
});

// The page derives every source-reviewed Module-16 permission and keeps Project writes server-authoritative.
test('Pass 355 page derives all six Client Billing permissions and keeps restricted Project reads fail-honest', () => {
  for (const permission of PERMISSIONS) assert.ok(reactPage.includes(`usePermission('${permission}')`), `Page missing ${permission}`);
  assert.match(reactPage, /useProjectWorkspaceVisibility\(\)/);
  assert.match(reactPage, /usePermission\('clients\.read'\)/);
  assert.match(reactPage, /const canRead = canReadCompanyWide \|\| hasRestrictedProjectScope/);
  assert.match(reactPage, /Project-scoped writes remain API-authoritative/);
});

// The only Client Billing read remains the bounded aggregate Contract register.
test('Pass 355 renders the bounded Contract register without invented filter controls', () => {
  assert.match(reactWorkspace, /useClientContracts\(\{ page: registerPage, pageSize: 25 \}, props\.canRead\)/);
  assert.match(reactWorkspace, /does not invent search, status, Client or Project filters/);
  assert.doesNotMatch(reactWorkspace, /register\('search'\)|register\('status'\)|register\('contractFilter'\)|register\('projectFilter'\)|register\('clientFilter'\)/);
});

// A writer without register read is not blocked from every permitted command by an early-return UI.
test('Pass 355 does not early-return when Client Billing register read is unavailable', () => {
  assert.doesNotMatch(reactWorkspace, /if \(!props\.canRead\)\s*return/);
  assert.match(reactWorkspace, /Matching write commands remain available/);
  assert.match(reactWorkspace, /client_contracts\.manage/);
});

// Contract creation reuses source-owned Project and Client masters and sends no server-owned totals or numbering.
test('Pass 355 Contract creation reuses Module 5 Projects and Module 2 Clients only', () => {
  assert.match(reactWorkspace, /useProjects\(\{ page: projectPage, pageSize: 25 \}, props\.canDiscoverProjects\)/);
  assert.match(reactWorkspace, /useClients\(\{ page: clientPage, pageSize: 25 \}, props\.canDiscoverClients\)/);
  assert.match(reactWorkspace, /projectId: values\.projectId/);
  assert.match(reactWorkspace, /clientId: values\.clientId/);
  assert.match(reactWorkspace, /contractValue: values\.contractValue\.trim\(\)/);
  assert.match(reactWorkspace, /billingMethod: values\.billingMethod\.trim\(\)/);
  assert.match(reactWorkspace, /retentionPercent: values\.retentionPercent\.trim\(\)/);
  assert.doesNotMatch(reactWorkspace, /contractNo:\s*values|revisedValue:\s*values|status:\s*values|companyId:\s*values/);
});

// Draft Claim editing stays a complete replacement with exact strings and optional BOQ ID only.
test('Pass 355 implements the reviewed DRAFT Progress Claim worksheet without line CRUD', () => {
  assert.match(reactWorkspace, /useFieldArray\(\{ control: lineForm\.control, name: 'lines' \}\)/);
  assert.match(reactWorkspace, /selectedClaimIsDraft/);
  assert.match(reactWorkspace, /handleReplaceLines/);
  assert.match(reactWorkspace, /lines: values\.lines\.map/);
  assert.match(reactWorkspace, /boqItemId === '' \? \{\} : \{ boqItemId: line\.boqItemId \}/);
  assert.match(reactWorkspace, /currentValue: line\.currentValue\.trim\(\)/);
  assert.doesNotMatch(reactWorkspace, /createProgressClaimLine|updateProgressClaimLine|deleteProgressClaimLine/);
});

// The browser displays authoritative cumulative totals and refuses to calculate them as an approval authority.
test('Pass 355 shows cumulative valuation and retention from server readback', () => {
  for (const label of ['Previous certified', 'Current certified-period value', 'Cumulative gross', 'Retention', 'Deductions', 'Certified']) {
    assert.ok(reactWorkspace.includes(label), `Missing valuation label ${label}`);
  }
  assert.match(reactWorkspace, /Submission calculates the authoritative current\/previous\/gross snapshot/);
  assert.doesNotMatch(reactWorkspace, /reduce\([^\n]*currentValue|parseFloat\([^\n]*currentValue|Number\([^\n]*currentValue/);
});

// Certification sends the one reviewed writable value and leaves policy-derived values on the server.
test('Pass 355 certification sends certifiedValue only', () => {
  const section = reactWorkspace.slice(reactWorkspace.indexOf('async function handleCertifyClaim'), reactWorkspace.indexOf('/** Issue one Client Invoice'));
  assert.match(section, /input: \{ certifiedValue: values\.certifiedValue\.trim\(\) \}/);
  assert.doesNotMatch(section, /grossValue|previousValue|currentValue|retentionAmount|deductionAmount/);
  assert.match(reactWorkspace, /client_claims\.certify/);
});

// Invoice generation stays limited to the reviewed business dates and does not invent payment state.
test('Pass 355 issues Client Invoice from certified Claim with dates only and shows source status', () => {
  const section = reactWorkspace.slice(reactWorkspace.indexOf('async function handleIssueInvoice'), reactWorkspace.indexOf('/** Release one complete'));
  assert.match(section, /input: \{ invoiceDate: values\.invoiceDate, dueDate: values\.dueDate \}/);
  assert.doesNotMatch(section, /invoiceNo|grossAmount|retentionAmount|taxAmount|totalReceivable|status/);
  assert.match(reactWorkspace, /Invoice payment\/AR settlement state is not part of the reviewed Stage-23 API/);
  assert.doesNotMatch(reactWorkspace, />Mark paid<|>Record payment<|register\('paymentAmount'\)|name="paymentAmount"/i);
});

// Retention remains the reviewed bodyless full-release command with no browser amount control.
test('Pass 355 renders Retention Ledger status and full release without partial release input', () => {
  assert.match(reactWorkspace, /handleReleaseRetention\(retentionId: string\)/);
  assert.match(reactWorkspace, /releaseRetentionMutation\.mutateAsync\(retentionId\)/);
  assert.match(reactWorkspace, />Release full balance<\/button>/);
  assert.match(reactWorkspace, /no partial-release amount is invented/);
  assert.doesNotMatch(reactWorkspace, /register\('releaseAmount'\)|partialReleaseAmount/);
});

// Unsupported integration/read surfaces remain explicit instead of being fabricated in the UI.
test('Pass 355 keeps BOQ lookup payment AR and approved-Change integration deferred', () => {
  assert.match(reactWorkspace, /existing BOQ browser contract exposes no item-detail lookup/);
  assert.match(reactPage, /Payment\/AR settlement remains deferred to Stage-26 Finance Source Adapters/);
  assert.match(reactPage, /Approved Change values may revise the Client Contract only through the later reviewed target integration/);
  assert.match(reactWorkspaceGate, /boqItemLookupInvented: false/);
  assert.match(reactWorkspaceGate, /paymentMutationInvented: false/);
  assert.match(reactWorkspaceGate, /financeArAdapterGenerated: false/);
  assert.match(reactWorkspaceGate, /approvedChangeContractAdapterGenerated: false/);
});

// The workspace uses focused responsive rules rather than introducing a second design system.
test('Pass 355 adds only focused Module-16 responsive styles', () => {
  assert.match(webStyles, /\/\* Module 16 - Client Billing \*\//);
  assert.match(webStyles, /\.module16-form-grid/);
  assert.match(webStyles, /\.module16-summary-grid/);
  assert.match(webStyles, /\.module16-claim-lines/);
  assert.match(webStyles, /\.module16-contract-note/);
  assert.match(webStyles, /@media \(max-width: 720px\)/);
});

// Every newly named UI helper/handler keeps a purpose comment for junior-readable maintenance.
test('Pass 355 keeps purpose comments on every newly named Client Billing UI function', () => {
  for (const [source, name] of [
    [reactWorkspace, 'errorMessage'],
    [reactWorkspace, 'todayInputValue'],
    [reactWorkspace, 'emptyClaimLine'],
    [reactWorkspace, 'editableClaimLine'],
    [reactWorkspace, 'hasStatus'],
    [reactWorkspace, 'moneyLabel'],
    [reactWorkspace, 'FieldError'],
    [reactWorkspace, 'ClientBillingWorkspace'],
    [reactWorkspace, 'handleCreateContract'],
    [reactWorkspace, 'handleCreateClaim'],
    [reactWorkspace, 'handleReplaceLines'],
    [reactWorkspace, 'handleCertifyClaim'],
    [reactWorkspace, 'handleIssueInvoice'],
    [reactWorkspace, 'handleReleaseRetention'],
    [reactWorkspace, 'handleSelectContract'],
    [reactWorkspace, 'handleSelectClaim'],
    [reactWorkspace, 'handleRegisterPage'],
    [reactWorkspace, 'handleProjectPage'],
    [reactWorkspace, 'handleClientPage'],
    [reactPage, 'ClientBillingPage'],
    [reactWorkspaceGate, 'readJson']
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 320), position), /\/\*\*[\s\S]*?\*\//);
  }
});

// Pass 355 remains preparation-only and hands directly to browser E2E verification.
test('Pass 355 registers its React workspace gate and Pass-356 handoff', () => {
  assert.equal(rootPackage.scripts['module-16:react-workspace:gate'], 'node scripts/module-16/verify-stage-23-react-workspace.mjs');
  assert.equal(rootPackage.scripts['pass-355:client-billing-react-workspace:gate'], 'node scripts/module-16/verify-stage-23-react-workspace.mjs');
  assert.match(reactWorkspaceGate, /STAGE_23_MODULE_16_REACT_WORKSPACE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(reactWorkspaceGate, /STAGE_23_MODULE_16_REACT_WORKSPACE_READY_FOR_PASS_356/);
  assert.match(reactWorkspaceGate, /Pass 356 - Module 16 Playwright main Client Billing workflow and permission-negative browser verification/);
});

// Pass 356 adds only browser verification and the shared Playwright selector; Module-16 runtime behavior stays unchanged.
test('Pass 356 adds only the reviewed Module 16 Playwright verification boundary', () => {
  assert.match(playwrightGate, /pass: 356/);
  assert.match(playwrightGate, /stage: 23/);
  assert.match(playwrightGate, /productionRuntimeFilesChanged: 0/);
  assert.match(playwrightGate, /databaseChanges: 0/);
  assert.match(playwrightGate, /newMigrations: 0/);
  assert.match(playwrightGate, /publicRoutesAdded: 0/);
  assert.match(playwrightGate, /newPermissions: 0/);
  assert.match(playwrightGate, /newBrowserFiles: 1/);
  assert.match(playwrightGate, /reviewedRouteCount: 7/);
  assert.match(playwrightGate, /reviewedWriteCount: 6/);
});

// The browser starts from real authentication and uses the actual permission-aware Client Billing navigation.
test('Pass 356 browser workflow uses real auth and permission-aware Client Billing navigation', () => {
  assert.match(browserTest, /async function signIn\(page, email\)/);
  assert.match(browserTest, /button', \{ name: 'Client Billing' \}/);
  assert.match(browserTest, /PASS356-PROJECT/);
  assert.match(browserTest, /PASS356-CLIENT/);
  assert.match(browserTest, /CC-0001/);
  assert.match(browserTest, /PC-0001/);
});

// The main workflow verifies exact Claim valuation, certification, Invoice and Retention behavior.
test('Pass 356 covers Contract Claim certification Invoice and Retention release', () => {
  for (const value of ['1000.00', '10.0000', '2.5000', '100.0000', '250.00']) {
    assert.ok(browserTest.includes(`'${value}'`), `Browser workflow missing ${value}`);
  }
  assert.match(browserTest, /USD 225\.00/);
  assert.match(browserTest, /button', \{ name: 'Certify Progress Claim' \}/);
  assert.match(browserTest, /button', \{ name: 'Issue Client Invoice' \}/);
  assert.match(browserTest, /button', \{ name: 'Release full balance' \}/);
  assert.match(browserTest, /financeArAdapterDeferredToStage26/);
  assert.match(browserTest, /client-invoice:\$\{invoice\.id\}/);
});

// Browser request capture proves every reviewed route and all six retry-key writes are used.
test('Pass 356 captures all seven reviewed Module 16 operations and all six idempotent writes', () => {
  for (const route of [
    'GET /api/v1/client-billing/contracts',
    'POST /api/v1/client-billing/contracts',
    'POST /api/v1/client-billing/contracts/:id/claims',
    'PUT /api/v1/client-billing/claims/:id/lines',
    'POST /api/v1/client-billing/claims/:id/certify',
    'POST /api/v1/client-billing/claims/:id/invoice',
    'POST /api/v1/client-billing/retention/:id/release'
  ]) assert.ok(browserTest.includes(`'${route}'`), `Browser operation missing ${route}`);
  assert.match(browserTest, /for \(const request of writes\) expect\(request\.idempotencyKey\)\.toBeTruthy\(\)/);
  assert.match(browserTest, /expect\(releaseWrite\?\.body\)\.toBeNull\(\)/);
  assert.match(browserTest, /expect\(request\.query\)\.toEqual\(\{ page: '1', pageSize: '25' \}\)/);
});

// Captured payloads cannot take over Company, actor, numbering, totals, lifecycle or Finance posting authority.
test('Pass 356 keeps server-owned Client Billing authority out of browser request bodies', () => {
  for (const field of [
    'companyId', 'actorUserId', 'allowedProjectIds', 'contractNo', 'revisedValue', 'claimNo',
    'grossValue', 'previousValue', 'retentionAmount', 'deductionAmount', 'invoiceNo', 'grossAmount',
    'taxAmount', 'totalReceivable', 'releasedAmount', 'financeArPosted'
  ]) assert.ok(browserTest.includes(`'${field}'`), `Browser authority assertion missing ${field}`);
  assert.match(browserTest, /\['billingMethod', 'clientId', 'contractValue', 'currency', 'projectId', 'retentionPercent'\]/);
  assert.match(browserTest, /expect\(Object\.keys\(certifyWrite\?\.body \?\? \{\}\)\)\.toEqual\(\['certifiedValue'\]\)/);
  assert.match(browserTest, /expect\(Object\.keys\(invoiceWrite\?\.body \?\? \{\}\)\.sort\(\)\)\.toEqual\(\['dueDate', 'invoiceDate'\]\)/);
});

// Read-only browser and direct API checks prove all six mutation permissions remain enforced server-side.
test('Pass 356 verifies Client Billing read-only UI and direct HTTP 403 write protection', () => {
  for (const text of [
    'client_contracts.manage is required for this command.',
    'client_claims.create is required to create a Claim.',
    'client_claims.certify is required for certification.',
    'client_retention.release is required for retention release.'
  ]) assert.ok(browserTest.includes(text), `Missing read-only UI assertion ${text}`);
  for (const key of [
    'pass356-reader-denied-contract',
    'pass356-reader-denied-claim',
    'pass356-reader-denied-lines',
    'pass356-reader-denied-certify',
    'pass356-reader-denied-invoice',
    'pass356-reader-denied-release'
  ]) assert.ok(browserTest.includes(key), `Missing negative write ${key}`);
  assert.equal((browserTest.match(/expect\(denied[A-Za-z]+\.status\(\)\)\.toBe\(403\)/g) ?? []).length, 6);
});

// The shared Playwright selector enables Module 16 while preserving the one-module-at-a-time guard.
test('Pass 356 wires Module 16 into the shared Playwright selector', () => {
  assert.match(playwrightConfig, /const runModule16 = process\.env\.RUN_MODULE_16_E2E === '1'/);
  assert.match(playwrightConfig, /runModule21, runModule17, runModule16/);
  assert.match(playwrightConfig, /runModule16[\s\S]*?module-16-browser\.spec\.mjs/);
  assert.match(playwrightConfig, /enabledModuleCount !== 1/);
});

// Every new named browser/gate helper keeps the required purpose comment.
test('Pass 356 keeps purpose comments on every new named browser and gate function', () => {
  for (const [source, name] of [
    [browserTest, 'seedScenario'],
    [browserTest, 'signIn'],
    [browserTest, 'openClientBilling'],
    [browserTest, 'createContractInUi'],
    [browserTest, 'createClaimInUi'],
    [browserTest, 'saveClaimWorksheetInUi'],
    [browserTest, 'certifyClaimInUi'],
    [browserTest, 'issueInvoiceInUi'],
    [browserTest, 'isStage23Request'],
    [browserTest, 'requestBody'],
    [browserTest, 'trackStage23Requests'],
    [browserTest, 'normalizeStage23Operation'],
    [browserTest, 'assertStage23AuthorityBoundary'],
    [playwrightGate, 'readJson'],
    [playwrightGate, 'writeBlockedEvidence']
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 320), position), /\/\*\*[\s\S]*?\*\//);
  }
});

// Static preparation remains fail-honest until genuine Stage-22 live acceptance exists.
test('Pass 356 registers static/live gates and hands off to final Stage-23 acceptance', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-16'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-16:playwright:gate'], 'node scripts/module-16/verify-stage-23-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-16:playwright:gate:live'], 'node scripts/module-16/verify-stage-23-playwright.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-356:client-billing-playwright:gate'], 'node scripts/module-16/verify-stage-23-playwright.mjs --mode=static');
  assert.match(playwrightGate, /STAGE_23_MODULE_16_PLAYWRIGHT_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /STAGE_22_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /Pass 357 - Module 16 operational verification and final Stage-23 acceptance\/regression gate/);
});

// Pass 357 adds only operational/final verification and does not expand the reviewed production boundary.
test('Pass 357 keeps Module 16 production, routes, permissions and migration count unchanged', () => {
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /publicApiChanges: 0/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /reviewedRouteCount: 7/);
  assert.match(finalGate, /reviewedWriteRouteCount: 6/);
  assert.match(finalGate, /newPermissions: 0/);
});

// The focused operational suite covers concurrency, database authority, rollback and indexes.
test('Pass 357 adds focused Module 16 PostgreSQL operational coverage', () => {
  for (const title of [
    'Module 16 operational concurrent same-key Client Contract create stays singular',
    'Module 16 operational concurrent different Contract creates allocate distinct Foundation numbers',
    'Module 16 operational concurrent Invoice keys create one immutable billing source',
    'Module 16 operational concurrent Retention release keys converge without duplicate release events',
    'Module 16 operational PostgreSQL rejects cross-scope billing and issued-history mutation',
    'Module 16 operational forced Retention outbox failure rolls back the whole release transaction',
    'Module 16 operational Stage-23 Client Billing indexes are deployed'
  ]) assert.ok(integrationTest.includes(title), `Missing operational test: ${title}`);
  assert.match(operationsGate, /test:operations:module-16/);
  assert.match(operationsGate, /clean-and-previous-migrations/);
});

// Foundation numbering and idempotency must remain singular under concurrent Contract creation.
test('Pass 357 verifies concurrent Contract idempotency and collision-free numbering', () => {
  assert.match(integrationTest, /module16-ops-contract-same-key/);
  assert.ok(integrationTest.includes("assert.equal(await client.clientContract.count({ where: { id: contractId } }), 1);"));
  assert.ok(integrationTest.includes("assert.equal(sequence.nextValue, 2n);"));
  assert.match(integrationTest, /module16-ops-contract-project-a/);
  assert.match(integrationTest, /module16-ops-contract-project-b/);
  assert.match(integrationTest, /\['CC-0001', 'CC-0002'\]/);
  assert.ok(integrationTest.includes("assert.equal(sequence.nextValue, 3n);"));
});

// Invoice and Retention races must converge on one financial source and one release event set.
test('Pass 357 verifies concurrent Invoice and Retention lifecycle convergence', () => {
  assert.match(integrationTest, /module16-ops-invoice-a/);
  assert.match(integrationTest, /module16-ops-invoice-b/);
  assert.match(integrationTest, /CLIENT_INVOICE_ALREADY_CREATED/);
  assert.ok(integrationTest.includes("assert.equal(await client.clientInvoice.count({ where: { claimId: claim.id } }), 1);"));
  assert.ok(integrationTest.includes("assert.equal(await client.retentionLedger.count({ where: { sourceType: 'CLIENT_INVOICE', sourceId: invoiceId } }), 1);"));
  assert.match(integrationTest, /module16-ops-retention-a/);
  assert.match(integrationTest, /module16-ops-retention-b/);
  assert.ok(integrationTest.includes("assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_retention.released', resourceId: retention.id } }), 1);"));
});

// PostgreSQL triggers and late-failure rollback remain authoritative below the HTTP/service layer.
test('Pass 357 verifies direct PostgreSQL guards and Retention rollback', () => {
  assert.match(integrationTest, /Cross-Project direct Claim line must fail/);
  assert.match(integrationTest, /Progress Claim BOQ item must belong to a Project-mapped BOQ for the Client Contract Project/);
  assert.match(integrationTest, /Client Invoice claim must belong to the same Client Contract/);
  assert.match(integrationTest, /Client Invoice source history cannot be deleted/);
  assert.match(integrationTest, /Invoiced Progress Claim history is immutable/);
  assert.match(integrationTest, /Retention released amount cannot move backwards/);
  assert.match(integrationTest, /Retention ledger history cannot be deleted/);
  assert.match(integrationTest, /client_retention\.released/);
  assert.match(integrationTest, /rolledBack\.status, 'HELD'/);
  assert.match(integrationTest, /Missing Stage-23 Client Billing index/);
});

// The final gate preserves all reviewed source contracts and the corrected Stage-24 handoff.
test('Pass 357 final acceptance freezes the reviewed Stage 23 contract and hands off to Module 19', () => {
  for (const table of TABLES) assert.ok(finalGate.includes(`'${table}'`), `Final gate missing table ${table}`);
  for (const permission of PERMISSIONS) assert.ok(finalGate.includes(`'${permission}'`), `Final gate missing permission ${permission}`);
  for (const error of ERRORS) assert.ok(finalGate.includes(`'${error}'`), `Final gate missing error ${error}`);
  for (const event of EVENTS) assert.ok(finalGate.includes(`'${event}'`), `Final gate missing event ${event}`);
  assert.match(finalGate, /STAGE_23_ACCEPTED_READY_FOR_STAGE_24/);
  assert.match(finalGate, /24 - Module 19 RFI & Submittals/);
  assert.match(finalGate, /Pass 358 - Stage 24 \/ Module 19 RFI & Submittals contract freeze/);
});

// Deferred Finance and approved-Change integrations must remain explicit instead of being claimed complete early.
test('Pass 357 preserves Stage-26 Finance and Stage-27 integration boundaries', () => {
  assert.match(finalGate, /financeArAdapterGenerated: false/);
  assert.match(finalGate, /approvedChangeContractAdapterGenerated: false/);
  assert.match(finalGate, /stage26FinanceAdapterStillRequired: true/);
  assert.match(finalGate, /stage27IntegrationProofStillRequired: true/);
  assert.match(finalGate, /Client Invoice to AR posting\/reconciliation remains owned by Stage-26 Module 15B/);
  assert.match(finalGate, /approved Change Order to Client Contract target mapping\/source key is not defined/);
});

// Static evidence may pass while genuine runtime acceptance remains blocked behind the Stage-22 live handoff.
test('Pass 357 remains fail-honest about live Stage 23 acceptance', () => {
  assert.match(operationsGate, /STAGE_23_MODULE_16_OPERATIONS_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /STAGE_22_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_23_STATIC_GATE_PASSED_STAGE_22_LIVE_HANDOFF_PENDING/);
  assert.match(finalGate, /DO_NOT_DEPLOY_STAGE_23_UNTIL_STAGE_22_LIVE_HANDOFF/);
  assert.match(finalGate, /runtimeVerificationComplete: passed/);
  assert.match(finalGate, /runtimeDeploymentAllowed: passed/);
});

// New verifier helpers keep purpose comments and package scripts expose separate static/live gates.
test('Pass 357 keeps purpose comments and registers operational plus final Stage 23 gates', () => {
  for (const [source, name] of [
    [operationsGate, 'readJson'],
    [operationsGate, 'writeBlockedEvidence'],
    [finalGate, 'readEvidence'],
    [finalGate, 'localResult'],
    [finalGate, 'validateLivePrerequisites']
  ]) {
    const position = source.indexOf(`function ${name}`);
    assert.ok(position >= 0, `Missing named function ${name}`);
    assert.match(source.slice(Math.max(0, position - 320), position), /\/\*\*[\s\S]*?\*\//);
  }

  assert.equal(rootPackage.scripts['test:operations:module-16'], 'node -e "if (process.env.RUN_FOUNDATION_DB_TESTS !== \'1\') throw new Error(\'Set RUN_FOUNDATION_DB_TESTS=1 for Module 16 operational verification.\');" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 --test-name-pattern="^Module 16 operational" tests/integration/module-16-api.integration.test.mjs');
  assert.equal(rootPackage.scripts['module-16:operations:gate'], 'node scripts/module-16/verify-stage-23-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-16:operations:gate:live'], 'node scripts/module-16/verify-stage-23-operations.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-16:gate'], 'node scripts/module-16/verify-stage-23.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-16:gate:live'], 'node scripts/module-16/verify-stage-23.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-16:acceptance:live'], 'node scripts/module-16/verify-stage-23.mjs --mode=live');
  assert.equal(rootPackage.scripts['pass-357:client-billing-acceptance:gate'], 'node scripts/module-16/verify-stage-23.mjs --mode=static');
});
