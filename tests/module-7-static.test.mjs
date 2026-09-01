import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/budgets-job-cost/STAGE-12-MODULE-7-CONTRACT.md', 'utf8');
const contractGate = await readFile('scripts/module-7/verify-stage-12-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-7/verify-stage-12-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-7/verify-stage-12-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-7/verify-stage-12-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-7/verify-stage-12-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-7/verify-stage-12-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-7/verify-stage-12-integration-security.mjs', 'utf8');
const reactGate = await readFile('scripts/module-7/verify-stage-12-react.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-7/verify-stage-12-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-7/verify-stage-12-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-7/verify-stage-12.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-7-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const webApi = await readFile('apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts', 'utf8');
const webWorkspace = await readFile('apps/web/src/features/budgets-job-cost/components/budget-job-cost-workspace.tsx', 'utf8');
const webPage = await readFile('apps/web/src/features/budgets-job-cost/pages/budgets-job-cost-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8');
const integrationTest = await readFile('tests/integration/module-7-api.integration.test.mjs', 'utf8');
const schema = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/budgets-job-cost/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const schemaEvidence = JSON.parse(await readFile('module-7-evidence/stage-12-schema.json', 'utf8'));
const repositoryEvidence = JSON.parse(await readFile('module-7-evidence/stage-12-repository.json', 'utf8'));
const serviceEvidence = JSON.parse(await readFile('module-7-evidence/stage-12-service.json', 'utf8'));
const migration = await readFile('packages/database/prisma/migrations/20260824000200_module_7_budgets_job_costing_core/migration.sql', 'utf8');
const gateManifest = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksumManifest = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');

// Keep the Stage-12 boundary on the five source-defined Module-7 tables only.
test('Pass 212 freezes exactly the Module 7 table ownership boundary', () => {
  for (const table of [
    'project_budgets',
    'budget_lines',
    'cost_commitments',
    'cost_actuals',
    'forecast_lines',
  ]) assert.match(contract, new RegExp(`\\b${table}\\b`));
  assert.match(contract, /Module 7 owns exactly these source-defined tables/);
  assert.match(contract, /must not create duplicate Project, WBS, Cost Code, Cost Type, Finance or source-document masters/);
});

// Keep the public API exactly on the seven reviewed business operations.
test('Pass 212 freezes exactly seven reviewed Module 7 public routes', () => {
  const routes = [
    'GET  /api/v1/projects/:projectId/budgets/current',
    'POST /api/v1/projects/:projectId/budgets',
    'PUT  /api/v1/projects/:projectId/budgets/:id/lines',
    'POST /api/v1/projects/:projectId/budgets/:id/freeze',
    'GET  /api/v1/projects/:projectId/job-cost',
    'PUT  /api/v1/projects/:projectId/forecast',
    'GET  /api/v1/projects/:projectId/job-cost/ledger',
  ];
  for (const route of routes) assert.ok(contract.includes(route), `Missing route: ${route}`);
  assert.match(contractGate, /reviewedRouteCount: 7/);
});

// Prevent manual actual/commitment CRUD before real source modules and adapters exist.
test('Pass 212 keeps commitments and actuals source-derived with no public ingestion CRUD', () => {
  assert.match(contract, /no command for manually creating commitments or actuals/);
  assert.match(contract, /must not add public endpoints/);
  assert.match(contract, /job_cost\.source_posted/);
  assert.match(contract, /must not be fabricated by the browser-facing budget routes/);
  assert.match(contractGate, /publicSourceIngestionRoutes: 0/);
  assert.match(contractGate, /sourceAdaptersDeferred: true/);
});

// Preserve Module-6 posting-combination ownership without adding an undocumented line FK.
test('Pass 212 reuses Module 6 cost structure without inventing project_cost_code_id on budget lines', () => {
  assert.match(contract, /Module 6 already owns `project_cost_codes`/);
  assert.match(contract, /does not define a `project_cost_code_id` field/);
  assert.match(contract, /validate the combination against Module 6/);
  assert.match(contract, /cost_structure_id.*does not explicitly identify its foreign-key target/s);
});

// Keep Company, actor, scope, version and calculated financial authority on the server.
test('Pass 212 freezes server-owned Project and financial authority', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'versionNo',
    'status',
    'approvedAt',
    'totalCost',
  ]) assert.match(contract, new RegExp(`\\b${field}\\b`));
  assert.match(contract, /browser must never provide authoritative values/i);
  assert.match(contract, /server revalidates Company ownership plus Module-24B Project scope/);
});

// Freeze the stable Project-scoped permission vocabulary from the source.
test('Pass 212 freezes the six reviewed Module 7 permissions', () => {
  for (const permission of [
    'budgets.read',
    'budgets.create',
    'budgets.edit',
    'budgets.freeze',
    'job_cost.read',
    'forecast.update',
  ]) assert.match(contract, new RegExp(permission.replace('.', '\\.')));
  assert.match(contract, /All permission checks remain Project-resource scoped/);
});

// Freeze only the five source-defined Module-7 business conflict codes.
test('Pass 212 keeps the reviewed Module 7 error contract small and explicit', () => {
  for (const code of [
    'BUDGET_NOT_FOUND',
    'BUDGET_VERSION_LOCKED',
    'INVALID_COST_STRUCTURE',
    'FORECAST_PERIOD_LOCKED',
    'JOB_COST_RECONCILIATION_ERROR',
  ]) assert.match(contract, new RegExp(code));
  assert.match(contract, /Do not invent a larger public error-code vocabulary/);
});

// Preserve exact-decimal and immutable-source accounting rules at the contract boundary.
test('Pass 212 freezes precision and immutable source-history rules', () => {
  assert.match(contract, /money uses DECIMAL/);
  assert.match(contract, /actual costs are source-derived and are never manually overwritten/);
  assert.match(contract, /reversal\/adjustment/);
  assert.match(contract, /idempotent by source key/);
  assert.match(contract, /only one current approved budget version may exist per Project/);
});

// Keep approval conditional without inventing Module-7 workflow endpoints.
test('Pass 212 preserves the conditional approval gap instead of inventing approval routes', () => {
  assert.match(contract, /approval when configured/);
  assert.match(contract, /no submit\/approve command/);
  assert.match(contract, /must therefore not invent a Module-7 approval endpoint/);
  assert.match(contract, /POST   \/api\/v1\/projects\/:projectId\/budgets\/:id\/approve/);
});

// Keep response/filter and forecast authority gaps visible for later schema/service passes.
test('Pass 212 records unresolved job-cost, amount and forecast contract gaps', () => {
  assert.match(contract, /job-cost summary and ledger response shapes are not enumerated/i);
  assert.match(contract, /amount.*input-vs-calculation and rounding semantics are not stated/s);
  assert.match(contract, /forecast fields are user inputs versus server-calculated outputs/);
  assert.match(contract, /exact relationship between `as_of_date` and the latest closed Finance period/);
});

// Keep all five source events visible while delaying source-posted emission until a real adapter exists.
test('Pass 212 freezes the source event vocabulary without premature source posting', () => {
  for (const eventName of [
    'budget.created',
    'budget.frozen',
    'budget.revised',
    'forecast.updated',
    'job_cost.source_posted',
  ]) assert.match(contract, new RegExp(eventName.replace('.', '\\.')));
  assert.match(contractGate, /jobCostSourcePostedDeferredUntilSourceAdapter: true/);
});

// Keep the Pass-214 schema boundary intact after the next repository layer is added.
test('Pass 214 schema boundary remains intact after later repository generation', async () => {
  for (const model of ['ProjectBudget', 'BudgetLine', 'CostCommitment', 'CostActual', 'ForecastLine']) {
    assert.ok(prisma.includes(`model ${model} {`));
  }
  const moduleFiles = (await readdir('apps/api/src/modules/budgets-job-cost')).sort();
  assert.ok(moduleFiles.includes('budgets-job-cost.schema.ts'));
  assert.ok(moduleFiles.includes('budgets-job-cost.repository.ts'));
  assert.ok(moduleFiles.includes('budgets-job-cost.service.ts'));
  assert.equal(schemaEvidence.routesGenerated, false);
  assert.match(contract, /Pass 213 therefore adds persistence only/);
  assert.match(contract, /Pass 214 resolves only the strict Zod request\/response boundary/);
});

// Register one simple contract gate and keep activation dependent on genuine Stage-11 live evidence.
test('Pass 212 registers a fail-honest Stage-12 contract gate', () => {
  assert.equal(
    rootPackage.scripts['module-7:contract:gate'],
    'node scripts/module-7/verify-stage-12-contract.mjs',
  );
  assert.match(contractGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(contractGate, /STAGE_12_MODULE_7_CONTRACT_FROZEN_READY_FOR_PASS_213/);
  assert.match(contractGate, /STAGE_12_MODULE_7_CONTRACT_FROZEN_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(contractGate, /productionRuntimeActivationAllowed: passed && stage11LiveAccepted/);
  assert.match(contractGate, /persistencePreparationAllowed: passed/);
});

// Keep the implementation sequence on persistence next, with no shortcut to later layers.
test('Pass 212 points only to reviewed Module 7 persistence as Pass 213', () => {
  assert.match(contract, /Pass 213 - Module 7 reviewed Prisma models, constraints, indexes and migration/);
  assert.match(contractGate, /Pass 213 - Module 7 reviewed Prisma models, constraints, indexes and migration/);
});

// Create only the five source-defined Module-7 persistence models.
test('Pass 213 creates exactly the reviewed Module 7 models', () => {
  for (const [model, table] of [
    ['ProjectBudget', 'project_budgets'],
    ['BudgetLine', 'budget_lines'],
    ['CostCommitment', 'cost_commitments'],
    ['CostActual', 'cost_actuals'],
    ['ForecastLine', 'forecast_lines'],
  ]) {
    assert.match(prisma, new RegExp(`model\\s+${model}\\s*\\{[\\s\\S]*?@@map\\("${table}"\\)`));
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(prisma, /model\s+(BudgetApproval|JobCostLedger|BudgetSourceAdapter)\s*\{/);
});

// Keep Project versions and calculated money persistence narrow and decimal-safe.
test('Pass 213 persists Project budget versions without inventing current or status fields', () => {
  assert.match(prisma, /versionNo\s+Int\s+@map\("version_no"\)/);
  assert.match(prisma, /totalCost\s+Decimal[\s\S]*?@db\.Decimal\(18, 2\)/);
  assert.match(prisma, /totalRevenue\s+Decimal\?[\s\S]*?@db\.Decimal\(18, 2\)/);
  assert.match(migration, /project_budgets_project_version_uq/);
  assert.match(migration, /project_budgets_version_positive/);
  assert.doesNotMatch(prisma, /isCurrent|currentBudgetId|budgetStatusEnum/);
  assert.match(contract, /does \*\*not\*\* add `is_current`/);
});

// Reuse the existing Module-6 posting combination instead of adding a hidden budget-line FK.
test('Pass 213 validates budget line posting combinations against Module 6', () => {
  const block = prisma.match(/model BudgetLine \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(block, /wbsNodeId/);
  assert.match(block, /costCodeId/);
  assert.match(block, /costTypeId/);
  assert.doesNotMatch(block, /projectCostCodeId|costStructureId/);
  assert.match(migration, /module_7_validate_budget_line_scope/);
  assert.match(migration, /FROM "project_cost_codes" mapping/);
  assert.match(migration, /mapping\."is_posting_allowed" = TRUE/);
});

// Resolve the source cost structure target explicitly and keep it in Project scope.
test('Pass 213 maps commitment and actual cost structure to project_cost_codes', () => {
  for (const model of ['CostCommitment', 'CostActual']) {
    const block = prisma.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
    assert.match(block, /costStructureId\s+String\s+@map\("cost_structure_id"\) @db\.Uuid/);
    assert.match(block, /costStructure ProjectCostCode/);
  }
  assert.match(migration, /cost_commitments_cost_structure_fkey/);
  assert.match(migration, /cost_actuals_cost_structure_fkey/);
  assert.match(migration, /module_7_validate_source_cost_scope/);
  assert.match(contract, /cost_commitments\.cost_structure_id -> project_cost_codes\.id/);
});

// Lock the smallest explicit source-key interpretation for idempotent future ingestion.
test('Pass 213 makes commitment and actual source ingestion idempotent by scoped source key', () => {
  assert.match(migration, /cost_commitments_source_key_uq[\s\S]*?company_id[\s\S]*?project_id[\s\S]*?source_type[\s\S]*?source_id[\s\S]*?source_line_id/);
  assert.match(migration, /cost_actuals_source_key_uq[\s\S]*?company_id[\s\S]*?project_id[\s\S]*?source_type[\s\S]*?source_id[\s\S]*?source_line_id/);
  assert.match(contract, /company_id \+ project_id \+ source_type \+ source_id \+ source_line_id/);
  assert.doesNotMatch(migration, /CREATE TABLE ".*adapter|CREATE TABLE "job_cost_ledger/);
});

// Keep all financial persistence on PostgreSQL DECIMAL/NUMERIC values.
test('Pass 213 keeps budget source-cost and forecast amounts decimal-safe', () => {
  for (const field of ['amount', 'revenueAmount', 'originalAmount', 'remainingAmount', 'estimateToComplete', 'forecastFinalCost', 'forecastFinalRevenue']) {
    assert.match(prisma, new RegExp(`\\b${field}\\b[\\s\\S]{0,90}@db\\.Decimal`));
  }
  assert.doesNotMatch(migration, /DOUBLE PRECISION|REAL/);
});

// Prevent a forecast row from pointing at another Project's budget line.
test('Pass 213 enforces forecast Project ownership at the database boundary', () => {
  assert.match(migration, /module_7_validate_forecast_scope/);
  assert.match(migration, /JOIN "project_budgets" budget ON budget\."id" = line\."budget_id"/);
  assert.match(migration, /Forecast line must belong to the same Project as its Budget line/);
});

// Append one Stage-12 migration gate and lock its checksum without changing earlier migrations.
test('Pass 213 retains one Stage-12 migration gate with a locked checksum after later stages are appended', () => {
  const stage12Gate = gateManifest.gates.find((gate) => gate.gate === 'module-7-budgeting-job-costing-core-persistence');
  assert.ok(stage12Gate);
  assert.equal(stage12Gate.stage, 12);
  assert.deepEqual(stage12Gate.migrations, ['20260824000200_module_7_budgets_job_costing_core']);
  assert.match(checksumManifest.migrations['20260824000200_module_7_budgets_job_costing_core'] ?? '', /^[a-f0-9]{64}$/);
});

// Keep deployment fail-honest until genuine Stage-11 runtime acceptance exists.
test('Pass 213 persistence gate requires genuine Stage-11 live handoff before deployment', () => {
  assert.match(persistenceGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(persistenceGate, /runtimeVerificationComplete === true/);
  assert.match(persistenceGate, /STAGE_12_MODULE_7_PERSISTENCE_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(persistenceGate, /runtimeDeploymentAllowed: passed && stage11LiveAccepted/);
  assert.equal(rootPackage.scripts['module-7:persistence:gate'], 'node scripts/module-7/verify-stage-12-persistence.mjs');
  assert.match(persistenceGate, /Pass 214 - Module 7 Zod request\/response schema boundary/);
});


// Freeze the same seven Stage-12 operations in the Zod boundary and keep source-write routes absent.
test('Pass 214 exports exactly the reviewed Module 7 route and permission inventories', () => {
  for (const route of [
    '/api/v1/projects/:projectId/budgets/current',
    '/api/v1/projects/:projectId/budgets',
    '/api/v1/projects/:projectId/budgets/:id/lines',
    '/api/v1/projects/:projectId/budgets/:id/freeze',
    '/api/v1/projects/:projectId/job-cost',
    '/api/v1/projects/:projectId/forecast',
    '/api/v1/projects/:projectId/job-cost/ledger',
  ]) assert.ok(schema.includes(route), route);
  for (const permission of [
    'budgets.read',
    'budgets.create',
    'budgets.edit',
    'budgets.freeze',
    'job_cost.read',
    'forecast.update',
  ]) assert.ok(schema.includes(permission), permission);
  assert.doesNotMatch(schema, /route: '\/api\/v1\/projects\/:projectId\/job-cost\/(?:commitments|actuals)'/);
  assert.doesNotMatch(schema, /route: '\/api\/v1\/projects\/:projectId\/budgets\/:id\/(?:submit|approve|reopen)'/);
});

// Keep browser authority narrow for budget creation and replacement.
test('Pass 214 budget request schemas accept only reviewed business inputs', () => {
  const create = schema.match(/export const createBudgetBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const line = schema.match(/export const budgetLineInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const replace = schema.match(/export const replaceBudgetLinesBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';

  assert.match(create, /budgetType:\s*budgetTypeSchema/);
  for (const field of ['versionNo', 'status', 'approvedAt', 'totalCost', 'totalRevenue', 'estimateId', 'boqId']) {
    assert.doesNotMatch(create, new RegExp(`\\b${field}\\b`));
  }

  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId', 'quantity', 'unitRate', 'amount', 'revenueAmount']) {
    assert.match(line, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['companyId', 'projectId', 'projectCostCodeId', 'versionNo', 'status', 'totalCost']) {
    assert.doesNotMatch(line, new RegExp(`\\b${field}\\b`));
  }
  assert.match(replace, /lines:\s*z\.array\(budgetLineInputSchema\)/);
  assert.match(contract, /treats `amount` as an explicit draft business input/);
  assert.match(contract, /does not silently derive `amount` from quantity\/rate/);
});

// Preserve exact decimals without inventing source-unsupported positive-only or rounding rules.
test('Pass 214 serializes budget and forecast numeric values as exact decimal strings', () => {
  assert.match(schema, /const moneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /const quantityRateSchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /amount:\s*moneySchema/);
  assert.match(schema, /estimateToComplete:\s*moneySchema/);
  assert.match(schema, /forecastFinalCost:\s*moneySchema/);
  assert.doesNotMatch(schema, /z\.number\(\)[^\n]*(?:amount|cost|revenue|rate|quantity)/i);
  assert.match(contract, /does not invent positivity rules/);
  assert.match(contract, /does not invent a rounding policy/);
});

// Keep final forecast values server-owned and defer the unresolved locked-period boundary to the service.
test('Pass 214 exposes only estimate-to-complete and notes as forecast line inputs', () => {
  const input = schema.match(/export const forecastLineInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const body = schema.match(/export const updateForecastBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const response = schema.match(/export const forecastLineResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';

  assert.match(body, /asOfDate:\s*dateSchema/);
  assert.match(body, /lines:\s*z\.array\(forecastLineInputSchema\)/);
  assert.match(input, /budgetLineId:\s*uuidSchema/);
  assert.match(input, /estimateToComplete:\s*moneySchema/);
  assert.match(input, /notes:\s*notesSchema/);
  assert.doesNotMatch(input, /forecastFinalCost|forecastFinalRevenue|projectId|companyId|actual/);
  assert.match(response, /forecastFinalCost:\s*moneySchema/);
  assert.match(response, /forecastFinalRevenue:\s*moneySchema\.nullable\(\)/);
  assert.match(contract, /`forecastFinalCost` and `forecastFinalRevenue` remain response-only calculated outputs/);
  assert.match(contract, /does not guess the exact locked-period boundary/);
});

// Keep GET inputs minimal: no business filters until the source actually defines them.
test('Pass 214 keeps current-budget and job-cost queries empty and ledger pagination-only', () => {
  assert.match(schema, /getCurrentBudgetQuerySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /getJobCostQuerySchema = z\.object\(\{\}\)\.strict\(\)/);
  const ledger = schema.match(/export const getJobCostLedgerQuerySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(ledger, /\.\.\.paginationQueryShape/);
  assert.doesNotMatch(ledger, /wbs|costCode|costType|source|status|dateFrom|dateTo|asOfDate/i);
  assert.match(contract, /No WBS, Cost Code, Cost Type, source, status or date filters are invented/);
});

// Keep freeze bodyless and leave approval/lifecycle decisions to the service boundary.
test('Pass 214 keeps budget freeze bodyless without inventing approval lifecycle inputs', () => {
  assert.match(schema, /freezeBudgetBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  const freeze = schema.match(/export const freezeBudgetBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.doesNotMatch(freeze, /approved|status|actor|approvalRequest|reopen/);
  assert.match(contract, /strict bodyless command/);
  assert.match(contract, /No submit\/approve\/reopen endpoint is added/);
});

// Define the minimum safe response interpretation needed by the reviewed Stage-12 read routes.
test('Pass 214 defines safe budget, job-cost, forecast and ledger response schemas', () => {
  for (const name of [
    'projectBudgetResponseSchema',
    'budgetLineResponseSchema',
    'jobCostTotalsResponseSchema',
    'jobCostSummaryResponseSchema',
    'forecastLineResponseSchema',
    'updateForecastResponseSchema',
    'jobCostLedgerEntryResponseSchema',
    'jobCostLedgerResponseSchema',
  ]) assert.match(schema, new RegExp(`export const ${name}`));

  const summary = schema.match(/export const jobCostTotalsResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of [
    'budgetCost', 'committedCost', 'actualCost', 'estimateToComplete', 'forecastFinalCost',
    'variance', 'budgetRevenue', 'forecastFinalRevenue', 'margin'
  ]) assert.match(summary, new RegExp(`\\b${field}\\b`));

  const responses = schema.slice(schema.indexOf('export const budgetLineResponseSchema'));
  assert.doesNotMatch(responses, /companyId:\s*|actorUserId:\s*|permissions:\s*|projectScope:\s*/);
  assert.match(contract, /smallest executable response interpretation/);
});

// Keep source-derived ledger read-only and avoid freezing unknown status/source vocabularies as enums.
test('Pass 214 keeps job-cost source history read-only and string-backed', () => {
  assert.doesNotMatch(schema, /createCostCommitment|updateCostCommitment|createCostActual|updateCostActual|deleteCostActual/);
  assert.match(schema, /recordType:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(32\)/);
  assert.match(schema, /sourceType:\s*sourceTypeSchema/);
  assert.match(schema, /status:\s*statusSchema\.nullable\(\)/);
  assert.doesNotMatch(schema, /budgetTypeSchema\s*=\s*z\.enum|statusSchema\s*=\s*z\.enum|sourceTypeSchema\s*=\s*z\.enum/);
  assert.match(contract, /does not create commitment\/actual write schemas/);
});

// Reuse the existing shared error envelope for exactly the five reviewed Module-7 business conflicts.
test('Pass 214 exports only the reviewed Module 7 errors through shared error classes', () => {
  for (const code of [
    'BUDGET_NOT_FOUND',
    'BUDGET_VERSION_LOCKED',
    'INVALID_COST_STRUCTURE',
    'FORECAST_PERIOD_LOCKED',
    'JOB_COST_RECONCILIATION_ERROR',
  ]) assert.match(schema, new RegExp(code));
  assert.match(schema, /export function createModule7Error/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ValidationError/);
  assert.match(schema, /new ConflictError/);
  assert.doesNotMatch(schema, /BUDGET_APPROVAL_REQUIRED|BUDGET_ALREADY_APPROVED|FORECAST_NOT_FOUND/);
});

// Keep schema generation fail-honest and stop before repository/service/HTTP/React generation.
test('Pass 214 schema gate requires Stage-11 live handoff before runtime deployment', () => {
  assert.equal(rootPackage.scripts['module-7:schema:gate'], 'node scripts/module-7/verify-stage-12-schema.mjs');
  assert.match(schemaGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(schemaGate, /STAGE_12_MODULE_7_SCHEMA_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /STAGE_12_MODULE_7_SCHEMA_READY_FOR_PASS_215/);
  assert.match(schemaGate, /runtimeDeploymentAllowed:\s*passed && stage11LiveAccepted/);
  assert.match(schemaGate, /tsc/);
  assert.match(schemaGate, /--noCheck/);
  assert.match(schemaGate, /Pass 215 - Module 7 Company\/Project-scoped repository/);
  assert.match(contract, /Pass 215 - Module 7 Company\/Project-scoped repository/);
});


// Preserve the historical Pass-215 repository boundary after later HTTP work is added.
test('Pass 215 repository evidence still proves HTTP was deferred at that pass', async () => {
  const moduleFiles = (await readdir('apps/api/src/modules/budgets-job-cost')).sort();
  assert.ok(moduleFiles.includes('budgets-job-cost.repository.ts'));
  assert.ok(moduleFiles.includes('budgets-job-cost.schema.ts'));
  assert.equal(repositoryEvidence.routesGenerated, false);
  assert.match(contract, /Pass 215 adds only the Module-7 repository boundary/);
});

// Keep Company ownership trusted and exact Project child access constrained by the requested Project.
test('Pass 215 derives Company ownership from request context and scopes child rows by Project', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.doesNotMatch(repository, /companyId:\s*string;/);
  assert.match(repository, /findProjectBudgetById\(projectId: string, budgetId: string\)/);
  assert.match(repository, /where: scope\.where\(\{ id: budgetId, projectId \}\)/);
  assert.match(repository, /budget:\s*\{[\s\S]*projectId,[\s\S]*companyId: scope\.companyId/);
  assert.match(repository, /project:\s*\{ companyId: scope\.companyId \}/);
});

// Prepare safe concurrency primitives for server-owned version/current-budget decisions.
test('Pass 215 prepares Project and budget row locks without inventing current-budget persistence', () => {
  assert.match(repository, /lockProjectForBudgetWrite/);
  assert.match(repository, /FROM projects[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(repository, /lockProjectBudgetForWrite/);
  assert.match(repository, /FROM project_budgets[\s\S]*project_id = \$\{projectId\}::uuid[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*FOR UPDATE/);
  assert.match(repository, /findLatestProjectBudgetByStatus/);
  assert.doesNotMatch(repository, /APPROVED|CURRENT|isCurrent|is_current/);
  assert.match(contract, /does not interpret which string-backed status means "current approved"/);
});

// Validate every budget-line classification against one posting-enabled Module-6 mapping.
test('Pass 215 validates exact budget posting combinations before replacement', () => {
  assert.match(repository, /findPostingCostStructures/);
  assert.match(repository, /this\.db\.projectCostCode\.findMany/);
  assert.match(repository, /projectId,/);
  assert.match(repository, /project: \{ companyId: scope\.companyId \}/);
  assert.match(repository, /isPostingAllowed: true/);
  assert.match(repository, /wbsNodeId: item\.wbsNodeId/);
  assert.match(repository, /costCodeId: item\.costCodeId/);
  assert.match(repository, /costTypeId: item\.costTypeId/);
  assert.match(repository, /replaceBudgetLines/);
  assert.doesNotMatch(repository, /projectCostCodeId/);
});

// Keep budget totals server-persisted and lifecycle changes compare-and-set.
test('Pass 215 prepares authoritative budget totals and guarded lifecycle updates', () => {
  assert.match(repository, /sumBudgetLines/);
  assert.match(repository, /_sum:\s*\{[\s\S]*amount: true,[\s\S]*revenueAmount: true/);
  assert.match(repository, /updateProjectBudgetTotals/);
  assert.match(repository, /updateProjectBudgetStatus/);
  assert.match(repository, /status: expectedStatus/);
  assert.match(repository, /data: \{ status: targetStatus, approvedAt \}/);
});

// Keep forecast browser authority separated from repository persistence and validate referenced budget lines.
test('Pass 215 prepares Project-safe forecast replacement with server-calculated final values', () => {
  assert.match(repository, /ForecastLineRepositoryInput/);
  assert.match(repository, /forecastFinalCost: string/);
  assert.match(repository, /forecastFinalRevenue\?: string \| null/);
  assert.match(repository, /findBudgetLinesByIds/);
  assert.match(repository, /replaceForecastLines/);
  assert.match(repository, /budgetLines\.length !== budgetLineIds\.length/);
  assert.match(contract, /additional final-cost\/revenue values are repository inputs only/);
  assert.match(contract, /They are not browser authority/);
  assert.match(contract, /does not decide the exact Finance locked-period boundary/);
});

// Source-derived commitment/actual history remains read-only in Module 7 until later adapters exist.
test('Pass 215 adds only read aggregation and ledger access for source-derived cost history', () => {
  assert.match(repository, /sumCostCommitments/);
  assert.match(repository, /sumCostActuals/);
  assert.match(repository, /listJobCostLedger/);
  assert.doesNotMatch(repository, /createCostCommitment|updateCostCommitment|deleteCostCommitment/);
  assert.doesNotMatch(repository, /createCostActual|updateCostActual|deleteCostActual/);
  assert.match(contract, /adds \*\*no\*\* create\/update\/delete method for `cost_commitments` or `cost_actuals`/);
});

// The combined ledger is bounded, Company/Project scoped and deterministic without new business filters.
test('Pass 215 implements only bounded read-only combined job-cost ledger pagination', () => {
  assert.match(repository, /assertPageWindow\(input\)/);
  assert.match(repository, /MODULE_7_MAX_PAGE_SIZE/);
  assert.match(repository, /UNION ALL/);
  assert.match(repository, /FROM cost_commitments c[\s\S]*c\.company_id = \$\{scope\.companyId\}::uuid[\s\S]*c\.project_id = \$\{projectId\}::uuid/);
  assert.match(repository, /FROM cost_actuals a[\s\S]*a\.company_id = \$\{scope\.companyId\}::uuid[\s\S]*a\.project_id = \$\{projectId\}::uuid/);
  assert.match(repository, /OFFSET \$\{input\.skip\}[\s\S]*LIMIT \$\{input\.take\}/);
  assert.match(contract, /sort order exists only to make pagination deterministic/);
});

// Keep business calculations out of the repository so Pass 216 owns EAC/variance/margin semantics.
test('Pass 215 exposes raw aggregates but does not calculate job-cost business KPIs', () => {
  assert.match(repository, /sumBudgetLines/);
  assert.match(repository, /sumCostCommitments/);
  assert.match(repository, /sumCostActuals/);
  assert.match(repository, /sumForecastLines/);
  assert.doesNotMatch(repository, /\bcalculateEac\b|\bcalculateVariance\b|\bcalculateMargin\b/i);
  assert.match(contract, /does \*\*not\*\* decide which commitment aggregate becomes the public `committedCost`/);
  assert.match(contract, /remain Pass-216 service responsibilities/);
});

// Register the fail-honest repository gate and preserve the Stage-11 live deployment boundary.
test('Pass 215 repository gate is registered and points to Pass 216 only', () => {
  assert.equal(rootPackage.scripts['module-7:repository:gate'], 'node scripts/module-7/verify-stage-12-repository.mjs');
  assert.match(repositoryGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(repositoryGate, /STAGE_12_MODULE_7_REPOSITORY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(repositoryGate, /STAGE_12_MODULE_7_REPOSITORY_READY_FOR_PASS_216/);
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage11LiveAccepted/);
  assert.match(repositoryGate, /module-6-regression/);
  assert.match(repositoryGate, /module-15a-regression/);
  assert.match(repositoryGate, /Pass 216 - Module 7 service\/business rules/);
  assert.match(contract, /Pass 216 - Module 7 service\/business rules/);
});

// Preserve the historical Pass-216 service boundary after the Pass-217 HTTP layer is added.
test('Pass 216 service evidence still proves HTTP and React were deferred at that pass', async () => {
  const moduleFiles = (await readdir('apps/api/src/modules/budgets-job-cost')).sort();
  assert.ok(moduleFiles.includes('budgets-job-cost.service.ts'));
  assert.equal(serviceEvidence.routesGenerated, false);
  assert.equal(serviceEvidence.reactGenerated, false);
  assert.match(contract, /Pass 216 adds the Module-7 service layer/);
  assert.match(contract, /does not add Fastify routes, React code, approval endpoints or source-ingestion adapters/);
});

// Revalidate exact Project scope and all six reviewed permissions in the service instead of trusting route hints.
test('Pass 216 enforces exact Module 24B Project resource policy for all service operations', () => {
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /scope\.kind === 'restricted' && !scope\.projectIds\.includes\(projectId\)/);
  for (const permission of [
    'budgets.read',
    'budgets.create',
    'budgets.edit',
    'budgets.freeze',
    'job_cost.read',
    'forecast.update',
  ]) assert.match(service, new RegExp(permission.replace('.', '\\.')));
});

// Use only service-local DRAFT/FROZEN tokens and latest FROZEN selection instead of inventing a public status enum/current flag.
test('Pass 216 implements the narrow DRAFT to FROZEN budget lifecycle and current approved selection', () => {
  assert.match(service, /const BUDGET_DRAFT = 'DRAFT'/);
  assert.match(service, /const BUDGET_FROZEN = 'FROZEN'/);
  assert.match(service, /findLatestProjectBudgetByStatus\(projectId, BUDGET_FROZEN\)/);
  assert.match(service, /updateProjectBudgetStatus\([\s\S]*BUDGET_DRAFT,[\s\S]*BUDGET_FROZEN/);
  assert.doesNotMatch(service, /isCurrent/);
  assert.match(service, /ApprovalsService/);
  assert.match(service, /hasStatus\(approval\.status, 'APPROVED'\)/);
  assert.match(contract, /highest-version `FROZEN` budget/);
  assert.match(contract, /no `is_current` column, `APPROVED` token or status enum is added/);
});

// Keep version numbering, line replacement, total calculation, audit and outbox inside service-owned transactions.
test('Pass 216 makes budget create, replace and freeze atomic with server-owned totals', () => {
  assert.match(service, /withTransaction\(this\.db/);
  assert.match(service, /lockProjectForBudgetWrite/);
  assert.match(service, /versionNo: \(latest\?\.versionNo \?\? 0\) \+ 1/);
  assert.match(service, /replaceBudgetLines\(/);
  assert.match(service, /sumBudgetLines\(/);
  assert.match(service, /updateProjectBudgetTotals\(/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /eventType: 'budget\.created'/);
  assert.match(service, /eventType: 'budget\.frozen'/);
  assert.match(service, /eventType: 'budget\.revised'/);
});

// Revalidate active Module-6 posting records instead of trusting stale IDs at edit/freeze/forecast time.
test('Pass 216 revalidates active Project WBS Cost Code and Cost Type combinations', () => {
  assert.match(service, /requireValidCostStructures/);
  assert.match(service, /findPostingCostStructures/);
  assert.match(service, /findWbsNodesByIds/);
  assert.match(service, /findCostCodesByIds/);
  assert.match(service, /findCostTypesByIds/);
  assert.match(service, /mapping\.status/);
  assert.match(service, /INVALID_COST_STRUCTURE/);
});

// Preserve exact signed decimal arithmetic for all Module-7 totals and KPIs.
test('Pass 216 calculates job-cost money without binary floating point', () => {
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /BigInt/);
  assert.match(service, /MAX_MONEY_MINOR_UNITS/);
  assert.match(contract, /forecastFinalCost = actualCost \+ committedCost \+ estimateToComplete/);
  assert.match(contract, /committedCost.*remaining commitment/s);
  assert.match(contract, /variance\s+= budgetCost - forecastFinalCost/);
  assert.match(contract, /margin = forecastFinalRevenue - forecastFinalCost/);
  assert.doesNotMatch(service, /parseFloat|Number\([^)]*amount|toFixed\(/);
});

// Keep forecast browser authority narrow and use Finance Core only as a read-only locked-period check.
test('Pass 216 validates forecast period and calculates response-only final fields server-side', () => {
  assert.match(service, /new FinanceRepository\(tx\)\.findFiscalPeriodsForPostingDate\(asOfDate\)/);
  assert.match(service, /FINANCE_PERIOD_OPEN/);
  assert.match(service, /FORECAST_PERIOD_LOCKED/);
  assert.match(service, /sumRemainingCommitmentsByCostStructureIds/);
  assert.match(service, /sumActualsByCostStructureIds/);
  assert.match(repository, /postingDate: \{ lte: throughDate \}/);
  assert.match(service, /forecastFinalCost: minorUnitsToMoney\(finalCostMinorUnits\)/);
  assert.match(service, /forecastFinalRevenue: nullableStoredMoney\(budgetLine\.revenueAmount\)/);
  assert.match(contract, /browser never supplies either calculated field/);
});

// Keep commitments/actuals read-only and defer job_cost.source_posted to later reviewed adapters.
test('Pass 216 does not create source-ingestion authority or emit job_cost.source_posted', () => {
  assert.doesNotMatch(service, /createCostCommitment|updateCostCommitment|deleteCostCommitment/);
  assert.doesNotMatch(service, /createCostActual|updateCostActual|deleteCostActual/);
  assert.doesNotMatch(service, /eventType: 'job_cost\.source_posted'/);
  assert.match(contract, /browser-facing service never emits `job_cost\.source_posted`/);
});

// Keep current job-cost summary and ledger read-only while using the reviewed error on impossible duplicate forecast state.
test('Pass 216 prepares job-cost summary and bounded ledger service reads', () => {
  assert.match(service, /async getJobCost\(projectId: string\)/);
  assert.match(service, /sumCostCommitments/);
  assert.match(service, /sumCostActuals/);
  assert.match(service, /sumForecastLines/);
  assert.match(service, /JOB_COST_RECONCILIATION_ERROR/);
  assert.match(service, /async getJobCostLedger/);
  assert.match(service, /listJobCostLedger/);
  assert.match(service, /const page = input\.page \?\? 1/);
  assert.match(service, /const pageSize = input\.pageSize \?\? 25/);
});

// Register the fail-honest Pass-216 gate and point only to the reviewed HTTP layer next.
test('Pass 216 service gate is registered and points to Pass 217 only', () => {
  assert.equal(rootPackage.scripts['module-7:service:gate'], 'node scripts/module-7/verify-stage-12-service.mjs');
  assert.match(serviceGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(serviceGate, /STAGE_12_MODULE_7_SERVICE_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /STAGE_12_MODULE_7_SERVICE_READY_FOR_PASS_217/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && stage11LiveAccepted/);
  assert.match(serviceGate, /module-6-regression/);
  assert.match(serviceGate, /module-15a-regression/);
  assert.match(serviceGate, /Pass 217 - Module 7 Fastify routes/);
  assert.match(contract, /Pass 217 - Module 7 Fastify routes/);
});


// Add only the reviewed HTTP/OpenAPI/module-registration layer in Pass 217.
test('Pass 217 adds the Module 7 route and index files without generating React', async () => {
  const moduleFiles = (await readdir('apps/api/src/modules/budgets-job-cost')).sort();
  assert.deepEqual(moduleFiles, [
    'budgets-job-cost.repository.ts',
    'budgets-job-cost.routes.ts',
    'budgets-job-cost.schema.ts',
    'budgets-job-cost.service.ts',
    'index.ts',
  ]);
  assert.match(contract, /Pass 217 adds only the HTTP\/OpenAPI\/module-registration layer/);
  assert.match(contract, /does not add:[\s\S]*React Budgeting & Job Costing pages/);
});

// Preserve the seven source-defined routes and add only the Pass-361 bounded DRAFT recovery read.
test('Pass 361 keeps the seven source routes plus one bounded DRAFT recovery operation', () => {
  const expected = [
    ["get", '/api/v1/projects/:projectId/budgets/current'],
    ["get", '/api/v1/projects/:projectId/budgets/draft'],
    ["post", '/api/v1/projects/:projectId/budgets'],
    ["put", '/api/v1/projects/:projectId/budgets/:id/lines'],
    ["post", '/api/v1/projects/:projectId/budgets/:id/freeze'],
    ["get", '/api/v1/projects/:projectId/job-cost'],
    ["put", '/api/v1/projects/:projectId/forecast'],
    ["get", '/api/v1/projects/:projectId/job-cost/ledger'],
  ];
  for (const [method, route] of expected) {
    assert.ok(routes.includes(`app.${method}('${route}'`), `${method.toUpperCase()} ${route}`);
  }
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 8);
  assert.doesNotMatch(routes, /job-cost\/(?:commitments|actuals|reconcile)|budgets\/:id\/(?:submit|approve|reopen)/);
});

// Authenticate all routes while leaving exact Project permission evaluation in the service/resource policy.
test('Pass 217 authenticates every operation and keeps Project authorization service-authoritative', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 8);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 8);
  assert.doesNotMatch(routes, /hasPermission|requireCompanyRoutePermission/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  for (const permission of [
    'budgets.read',
    'budgets.create',
    'budgets.edit',
    'budgets.freeze',
    'job_cost.read',
    'forecast.update',
  ]) assert.match(service, new RegExp(permission.replace('.', '\\.')));
});

// Keep Fastify request metadata aligned with the frozen Zod schemas rather than persistence fields.
test('Pass 217 reparses every request segment through the Pass 214 Zod boundary', () => {
  for (const parser of [
    'module7ProjectParamsSchema',
    'module7BudgetParamsSchema',
    'getCurrentBudgetQuerySchema',
    'getDraftBudgetQuerySchema',
    'createBudgetBodySchema',
    'replaceBudgetLinesBodySchema',
    'freezeBudgetBodySchema',
    'getJobCostQuerySchema',
    'updateForecastBodySchema',
    'getJobCostLedgerQuerySchema',
  ]) assert.match(routes, new RegExp(parser));
  assert.match(routes, /parseRequest\(freezeBudgetBodySchema, request\.body \?\? \{\}, 'body'\)/);
  assert.match(routes, /querystring: \{ type: 'object', additionalProperties: false \}/);
  assert.match(routes, /pageSize: \{ type: 'integer', minimum: 1, maximum: 100 \}/);
  assert.doesNotMatch(routes, /\bcompanyId\b|\bactorUserId\b|\bprojectScope\b/);
  const forecastRequest = routes.match(/app\.put\('\/api\/v1\/projects\/:projectId\/forecast'[\s\S]*?response:/)?.[0] ?? '';
  assert.doesNotMatch(forecastRequest, /forecastFinalCost|forecastFinalRevenue|actualCost|committedCost/);
});

// Validate every success DTO and preserve exact-decimal string OpenAPI shapes.
test('Pass 217 validates success responses and documents financial decimals as strings', () => {
  assert.match(routes, /getCurrentBudgetResponseSchema\.parse/);
  assert.match(routes, /getDraftBudgetResponseSchema\.parse/);
  assert.match(routes, /createBudgetResponseSchema\.parse/);
  assert.match(routes, /replaceBudgetLinesResponseSchema\.parse/);
  assert.match(routes, /freezeBudgetResponseSchema\.parse/);
  assert.match(routes, /jobCostSummaryResponseSchema\.parse/);
  assert.match(routes, /updateForecastResponseSchema\.parse/);
  assert.match(routes, /jobCostLedgerResponseSchema\.parse/);
  assert.match(routes, /const MONEY_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
  assert.match(routes, /const QUANTITY_RATE_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
});

// Keep OpenAPI on the reviewed Module-7 business error vocabulary plus shared Foundation envelopes.
test('Pass 217 documents only reviewed Module 7 business conflicts', () => {
  for (const code of [
    'BUDGET_NOT_FOUND',
    'BUDGET_VERSION_LOCKED',
    'INVALID_COST_STRUCTURE',
    'FORECAST_PERIOD_LOCKED',
    'JOB_COST_RECONCILIATION_ERROR',
  ]) assert.match(routes, new RegExp(code));
  assert.doesNotMatch(routes, /BUDGET_APPROVAL_REQUIRED|BUDGET_ALREADY_APPROVED|FORECAST_NOT_FOUND/);
  for (const shared of [
    'INVALID_REQUEST',
    'AUTHENTICATION_REQUIRED',
    'AUTH_SESSION_EXPIRED',
    'FORBIDDEN',
    'RESOURCE_NOT_FOUND',
    'INTERNAL_SERVER_ERROR',
  ]) assert.match(routes, new RegExp(shared));
});

// Publish the module through its index and register it after Finance Core in the API composition root.
test('Pass 217 exports and registers the Module 7 Fastify plugin', () => {
  assert.match(moduleIndex, /export \{ registerBudgetsJobCostingRoutes \} from '\.\/budgets-job-cost\.routes\.js'/);
  assert.match(moduleIndex, /export \{ BudgetsJobCostingService \}/);
  assert.match(moduleIndex, /export \{ BudgetsJobCostingRepository \}/);
  assert.match(app, /import \{ registerBudgetsJobCostingRoutes \} from '\.\/modules\/budgets-job-cost\/index\.js'/);
  assert.match(app, /app\.register\(registerFinanceRoutes, \{ database: options\.database \}\);[\s\S]*app\.register\(registerBudgetsJobCostingRoutes, \{[\s\S]*database: options\.database,[\s\S]*budgetApprovalDefinitionCode: options\.budgetApprovalDefinitionCode \?\? null[\s\S]*\}\);/);
});

// Keep stable OpenAPI IDs for the seven source operations and the Pass-361 DRAFT recovery read.
test('Pass 361 prepares eight stable Module 7 OpenAPI operations', () => {
  for (const operationId of [
    'module7GetCurrentBudget',
    'module7GetDraftBudget',
    'module7CreateBudget',
    'module7ReplaceBudgetLines',
    'module7FreezeBudget',
    'module7GetJobCost',
    'module7UpdateForecast',
    'module7GetJobCostLedger',
  ]) assert.match(routes, new RegExp(operationId));
  assert.equal((routes.match(/tags: \['Module 7 - Budgeting & Job Costing'\]/g) ?? []).length, 8);
});

// Register the fail-honest Pass-217 gate and stop at integration/security verification next.
test('Pass 217 HTTP gate is registered and points only to Pass 218', () => {
  assert.equal(rootPackage.scripts['module-7:http:gate'], 'node scripts/module-7/verify-stage-12-http.mjs');
  assert.match(httpGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(httpGate, /STAGE_12_MODULE_7_HTTP_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /STAGE_12_MODULE_7_HTTP_READY_FOR_PASS_218/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage11LiveAccepted/);
  assert.match(httpGate, /sourceReviewedRouteCount: 7/);
  assert.match(httpGate, /activeRouteCount: 8/);
  assert.match(httpGate, /Pass 218 - Module 7 PostgreSQL\/Fastify integration/);
  assert.match(contract, /Pass 218 - Module 7 PostgreSQL\/Fastify integration/);
});

// Keep Pass 218 verification-only while preparing a genuine disposable PostgreSQL/Fastify suite.
test('Pass 218 adds integration and security verification without changing Module 7 production files', async () => {
  const moduleFiles = (await readdir('apps/api/src/modules/budgets-job-cost')).sort();
  assert.deepEqual(moduleFiles, [
    'budgets-job-cost.repository.ts',
    'budgets-job-cost.routes.ts',
    'budgets-job-cost.schema.ts',
    'budgets-job-cost.service.ts',
    'index.ts',
  ]);
  assert.match(integrationTest, /const live = process\.env\.RUN_FOUNDATION_DB_TESTS === '1'/);
  assert.match(integrationTest, /buildApp/);
  assert.match(integrationTest, /resetFoundationTestData/);
  assert.match(contract, /Pass 218 adds verification only/);
  assert.match(contract, /does not change the Module-7 production runtime/);
});

// Exercise the complete reviewed Stage-12 HTTP workflow in the prepared live suite.
test('Pass 218 integration suite covers all seven Module 7 operations and exact job-cost calculations', () => {
  for (const fragment of [
    '/budgets/current',
    '/budgets`',
    '/budgets/${budgetId}/lines',
    '/budgets/${budgetId}/freeze',
    '/job-cost`',
    '/forecast`',
    '/job-cost/ledger?page=1&pageSize=10',
  ]) assert.match(integrationTest, new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  for (const total of [
    "budgetCost: '1000'",
    "committedCost: '300'",
    "actualCost: '200'",
    "estimateToComplete: '200'",
    "forecastFinalCost: '700'",
    "variance: '300'",
    "margin: '800'",
  ]) assert.ok(integrationTest.includes(total), total);

  assert.match(integrationTest, /budget\.created/);
  assert.match(integrationTest, /budget\.frozen/);
  assert.match(integrationTest, /budget\.revised/);
  assert.match(integrationTest, /forecast\.updated/);
  assert.match(integrationTest, /job_cost\.source_posted[^\n]*\}\), 0/);
});

// Recheck the exact resource-policy, Company boundary and server-owned input constraints at runtime.
test('Pass 218 integration suite covers Project RBAC, cross-Company isolation and strict browser authority', () => {
  assert.match(integrationTest, /module7-reader@example\.test/);
  assert.match(integrationTest, /module7-member@example\.test/);
  assert.match(integrationTest, /module7-admin-b@example\.test/);
  assert.match(integrationTest, /PROJECT_2_ID/);
  assert.match(integrationTest, /companyId: COMPANY_B_ID, status: 'FROZEN', versionNo: 99/);
  assert.match(integrationTest, /errorCode\(response\), 'FORBIDDEN'/);
  assert.match(integrationTest, /CLOSED_PROJECT_ID/);
});

// Protect locked budgets, Module-6 cost structures and Finance locked-period behavior through real API assertions.
test('Pass 218 integration suite covers locked budget, invalid cost structure and locked forecast period cases', () => {
  assert.match(integrationTest, /BUDGET_VERSION_LOCKED/);
  assert.match(integrationTest, /INVALID_COST_STRUCTURE/);
  assert.match(integrationTest, /FORECAST_PERIOD_LOCKED/);
  assert.match(integrationTest, /INACTIVE_COST_TYPE_ID/);
  assert.match(integrationTest, /asOfDate: '2026-02-15'/);
  assert.match(integrationTest, /budget\.revised/);
});

// Exercise the Stage-12 database integrity triggers and source-key uniqueness without adding source CRUD.
test('Pass 218 integration suite covers database Project-scope constraints and source idempotency', () => {
  assert.match(integrationTest, /client\.budgetLine\.create/);
  assert.match(integrationTest, /client\.costCommitment\.create/);
  assert.match(integrationTest, /client\.forecastLine\.create/);
  assert.match(integrationTest, /posting-enabled cost structure\|constraint\|23514/);
  assert.match(integrationTest, /selected Project\|constraint\|23514/);
  assert.match(integrationTest, /same Project\|constraint\|23514/);
  assert.match(integrationTest, /unique\|constraint\|P2002/);
  assert.doesNotMatch(routes, /app\.(?:post|put|patch|delete)\('\/api\/v1\/projects\/:projectId\/job-cost\/(?:commitments|actuals)/);
});

// Lock the generated OpenAPI to the reviewed route inventory and narrow request authority.
test('Pass 218 live OpenAPI verification checks exactly seven Module 7 operations and forbidden routes', () => {
  for (const operationId of [
    'module7GetCurrentBudget',
    'module7GetDraftBudget',
    'module7CreateBudget',
    'module7ReplaceBudgetLines',
    'module7FreezeBudget',
    'module7GetJobCost',
    'module7UpdateForecast',
    'module7GetJobCostLedger',
  ]) assert.match(integrationTest, new RegExp(operationId));
  assert.match(integrationTest, /documented\.sort\(\), actual\.sort\(\)/);
  assert.match(integrationTest, /job-cost\/commitments/);
  assert.match(integrationTest, /job-cost\/actuals/);
  assert.match(integrationTest, /budgets\/\{id\}\/approve/);
  assert.match(integrationTest, /queryNames, \['page', 'pageSize'\]/);
  assert.match(integrationTest, /Object\.keys\(createBody\.properties\), \['budgetType'\]/);
});

// Register a fail-honest static/live gate and advance only to the React pass after verification.
test('Pass 218 integration-security gate is registered, guarded and points only to Pass 219', () => {
  assert.equal(rootPackage.scripts['module-7:integration-security:gate'], 'node scripts/module-7/verify-stage-12-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-7:integration-security:gate:live'], 'node scripts/module-7/verify-stage-12-integration-security.mjs --mode=live');
  assert.match(rootPackage.scripts['test:integration:module-7'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:integration:module-7'], /module-7-api\.integration\.test\.mjs/);
  assert.match(integrationSecurityGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(integrationSecurityGate, /STAGE_11_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219/);
  assert.match(integrationSecurityGate, /runtimeVerificationComplete: passed && mode === 'live' && stage11LiveAccepted/);
  assert.match(integrationSecurityGate, /productionRuntimeChanges: 0/);
  assert.match(integrationSecurityGate, /Pass 219 - Module 7 React Budgeting & Job Costing/);
  assert.match(contract, /Pass 219 - Module 7 React Budgeting & Job Costing/);
});


// Keep Pass 219 on the exact reviewed seven-operation browser API without source-history writes.
test('Pass 219 adds a typed browser API for exactly the reviewed Module 7 workflow', () => {
  for (const fragment of [
    'projects/${projectId}/budgets/current',
    'projects/${projectId}/budgets`',
    'projects/${projectId}/budgets/${budgetId}/lines',
    'projects/${projectId}/budgets/${budgetId}/freeze',
    'projects/${projectId}/job-cost`',
    'projects/${projectId}/forecast',
    'projects/${projectId}/job-cost/ledger${suffix}',
  ]) assert.ok(webApi.includes(fragment), fragment);
  assert.doesNotMatch(webApi, /job-cost\/(?:commitments|actuals)/);
  assert.doesNotMatch(webApi, /budgets\/\$\{budgetId\}\/(?:approve|reopen|submit)/);
});

// Keep Module-7 server state inside TanStack Query and refresh the one maintained query family after writes.
test('Pass 219 uses TanStack Query for Module 7 server state and reviewed mutations', () => {
  assert.match(webHooks, /const MODULE_7_QUERY_KEY = \['module-7', 'budgets-job-cost'\]/);
  for (const hook of [
    'useCurrentBudget',
    'useJobCost',
    'useJobCostLedger',
    'useCreateBudget',
    'useReplaceBudgetLines',
    'useFreezeBudget',
    'useUpdateForecast',
  ]) assert.match(webHooks, new RegExp(`export function ${hook}`));
  assert.ok((webHooks.match(/invalidateQueries\(\{ queryKey: MODULE_7_QUERY_KEY \}\)/g) ?? []).length >= 4);
});

// Use React Hook Form and Zod for the three reviewed browser write surfaces while preserving exact-decimal strings.
test('Pass 219 validates budget and forecast forms without browser-owned financial authority', () => {
  assert.match(webWorkspace, /useForm<CreateBudgetFormValues>/);
  assert.match(webWorkspace, /useForm<BudgetLineFormValues>/);
  assert.match(webWorkspace, /useForm<ForecastFormValues>/);
  assert.match(webWorkspace, /zodResolver\(createBudgetFormSchema\)/);
  assert.match(webWorkspace, /zodResolver\(budgetLineFormSchema\)/);
  assert.match(webWorkspace, /zodResolver\(forecastFormSchema\)/);
  assert.match(webWorkspace, /inputMode="decimal"/);
  const browserWriteInputs = [
    webApi.match(/export type CreateBudgetInput = Readonly<\{[\s\S]*?\}>;/)?.[0] ?? '',
    webApi.match(/export type ReplaceBudgetLinesInput = Readonly<\{[\s\S]*?\}>;/)?.[0] ?? '',
    webApi.match(/export type UpdateForecastInput = Readonly<\{[\s\S]*?\}>;/)?.[0] ?? ''
  ].join('\n');
  assert.doesNotMatch(browserWriteInputs, /companyId|actorUserId|projectScope|approvedAt|versionNo|totalCost|totalRevenue|forecastFinalCost|forecastFinalRevenue/);
});

// Expose the source-defined minimum UI without inventing manual actual/commitment editing.
test('Pass 219 renders the reviewed budget, job-cost, drilldown and forecast UI', () => {
  for (const label of [
    'Budget grid',
    'Cost-code drilldown',
    'Job-cost position',
    'Committed',
    'Actual',
    'EAC / forecast final cost',
    'Variance',
    'Revenue',
    'Margin',
    'Forecast assumptions & comments',
    'Job-cost ledger',
  ]) assert.ok(webWorkspace.includes(label), label);
  assert.match(webWorkspace, /Read-only commitments and actuals/);
  assert.doesNotMatch(webWorkspace, /Create commitment|Edit actual|Delete actual/);
});

// Reuse Module-5 Project discovery and Module-6 cost-structure readback instead of inventing lookup routes.
test('Pass 219 reuses existing Project and Module 6 read contracts', () => {
  assert.match(webPage, /useProjects\(\{ page: projectPage, pageSize: 25 \}/);
  assert.match(webWorkspace, /useWbsTree\(project\.id, canReadWbs\)/);
  assert.match(webWorkspace, /useCostCodes\(\{ page: 1, pageSize: 100 \}/);
  assert.match(webWorkspace, /findCostStructureId/);
  assert.match(webWorkspace, /Cost Type master read\/create routes are not defined by Module 6/);
});

// Register permission-aware Module-7 navigation while keeping the API as final authorization authority.
test('Pass 219 registers permission-aware Budgeting & Job Costing navigation', () => {
  assert.match(adminShell, /import \{ BudgetsJobCostingPage \}/);
  for (const permission of ['budgets.read', 'budgets.create', 'budgets.edit', 'budgets.freeze', 'job_cost.read', 'forecast.update']) {
    assert.match(adminShell, new RegExp(permission.replace('.', '\\.')));
  }
  assert.match(adminShell, /Budgeting & Job Costing/);
  assert.match(adminShell, /activeView === 'budgets-job-cost'/);
  assert.match(webPage, /Sensitive create\/edit\/freeze\/forecast controls are shown only/);
});

// Keep remaining UI limits explicit while proving Pass 361 resolves interrupted DRAFT recovery.
test('Pass 361 resolves DRAFT recovery without inventing generic budget history CRUD', () => {
  assert.match(webWorkspace, /newest editable DRAFT is recovered through the bounded server read added by Pass 361/);
  assert.match(webWorkspace, /Full budget history\/list management remains intentionally outside this repair/);
  assert.match(webHooks, /export function useDraftBudget/);
  assert.match(webApi, /export function getDraftBudget/);
  assert.match(webStyles, /Module 7 Budgeting & Job Costing/);
});

// Register the fail-honest Pass-219 gate and advance only to Playwright verification.
test('Pass 219 React gate is registered and points only to Pass 220', () => {
  assert.equal(rootPackage.scripts['module-7:react:gate'], 'node scripts/module-7/verify-stage-12-react.mjs');
  assert.match(reactGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(reactGate, /STAGE_12_MODULE_7_REACT_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(reactGate, /STAGE_12_MODULE_7_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD/);
  assert.match(reactGate, /productionBackendChanges: 0/);
  assert.match(reactGate, /databaseChanges: 0/);
  assert.match(reactGate, /Pass 220 - Module 7 Playwright Budgeting & Job Costing workflow verification/);
  assert.match(contract, /Pass 220 - Module 7 Playwright Budgeting & Job Costing workflow verification/);
});

// Prepare one genuine browser workflow over the real web/API/database boundary without adding production functionality.
test('Pass 220 prepares the real Module 7 budget to forecast browser workflow', () => {
  assert.match(browserTest, /@playwright\/test/);
  assert.match(browserTest, /resetFoundationTestData/);
  assert.match(browserTest, /Budgeting & Job Costing/);
  assert.match(browserTest, /Create budget version/);
  assert.match(browserTest, /Save complete line set/);
  assert.match(browserTest, /Request approval \/ freeze/);
  assert.match(browserTest, /page\.reload\(\)/);
  assert.match(browserTest, /budgets\/draft/);
  assert.match(browserTest, /Save forecast assumptions/);
  assert.match(browserTest, /Cost-code drilldown/);
  assert.match(browserTest, /Job-cost ledger/);
  assert.match(browserTest, /TEST_COMMITMENT/);
  assert.match(browserTest, /TEST_ACTUAL/);
  assert.match(browserTest, /forecastFinalCost/);
  assert.match(browserTest, /January browser forecast/);
});

// Recheck browser input authority and the read-only source-history boundary at the UI/API edge.
test('Pass 220 verifies narrow Module 7 browser authority and read-only user denial', () => {
  for (const field of [
    'companyId', 'actorUserId', 'projectScope', 'versionNo', 'approvedAt',
    'totalCost', 'forecastFinalCost', 'committedCost', 'actualCost', 'sourceType'
  ]) assert.match(browserTest, new RegExp(field));
  assert.match(browserTest, /assertModule7AuthorityBoundary/);
  assert.match(browserTest, /job-cost\/commitments/);
  assert.match(browserTest, /job-cost\/actuals/);
  assert.match(browserTest, /toBe\(403\)/);
  assert.match(browserTest, /Create budget version' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Save forecast assumptions' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /job_cost\.source_posted/);
});

// Register Module 7 as one isolated Playwright target and keep the live browser run explicitly guarded.
test('Pass 220 registers isolated Module 7 Playwright scripts and config', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-7'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-7:playwright:gate'], 'node scripts/module-7/verify-stage-12-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-7:playwright:gate:live'], 'node scripts/module-7/verify-stage-12-playwright.mjs --mode=live');
  assert.match(playwrightConfig, /RUN_MODULE_7_E2E/);
  assert.match(playwrightConfig, /module-7-browser\.spec\.mjs/);
  assert.match(playwrightGate, /RUN_MODULE_7_E2E_REQUIRED/);
  assert.match(playwrightGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
});

// Keep the pass fail-honest until the prior live handoff exists and advance only to operations verification.
test('Pass 220 Playwright gate preserves Stage 11 live prerequisite and points only to Pass 221', () => {
  assert.match(playwrightGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(playwrightGate, /STAGE_11_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /STAGE_12_MODULE_7_PLAYWRIGHT_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /STAGE_12_MODULE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_221/);
  assert.match(playwrightGate, /runtimeVerificationComplete: passed && mode === 'live' && stage11LiveAccepted/);
  assert.match(playwrightGate, /productionRuntimeChanges: 0/);
  assert.match(playwrightGate, /databaseChanges: 0/);
  assert.match(playwrightGate, /Pass 221 - Module 7 operational, migration and concurrency verification/);
  assert.match(contract, /Pass 221 - Module 7 operational, migration and concurrency verification/);
});



// Add one operational verification gate without creating a second Module-7 integration-test file.
test('Pass 221 adds the focused Module 7 operational commands and gate', async () => {
  assert.equal(
    rootPackage.scripts['test:operations:module-7'],
    'node -e "if (process.env.RUN_FOUNDATION_DB_TESTS !== \'1\') throw new Error(\'Set RUN_FOUNDATION_DB_TESTS=1 for Module 7 operational verification.\')" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 --test-name-pattern="^Module 7 operational" tests/integration/module-7-api.integration.test.mjs'
  );
  assert.equal(
    rootPackage.scripts['module-7:operations:gate'],
    'node scripts/module-7/verify-stage-12-operations.mjs --mode=static'
  );
  assert.equal(
    rootPackage.scripts['module-7:operations:gate:live'],
    'node scripts/module-7/verify-stage-12-operations.mjs --mode=live'
  );
  const integrationFiles = (await readdir('tests/integration')).filter((name) => name.includes('module-7'));
  assert.deepEqual(integrationFiles, ['module-7-api.integration.test.mjs']);
});

// Exercise the existing Project row locks and source-key indexes rather than adding new runtime locking abstractions.
test('Pass 221 prepares concurrency verification for versioning, freeze, forecast replacement and source idempotency', () => {
  assert.match(integrationTest, /Module 7 operational concurrency serializes budget versioning, freeze and forecast replacement/);
  assert.match(integrationTest, /Array\.from\(\{ length: 6 \}/);
  assert.match(integrationTest, /budget\.versionNo\)\.sort\(\(a, b\) => a - b\), \[1, 2, 3, 4, 5, 6\]/);
  assert.match(integrationTest, /budget\.frozen' \} \}\), 1/);
  assert.match(integrationTest, /budget\.revised' \} \}\), 1/);
  assert.match(integrationTest, /asOfDate: '2026-01-20'/);
  assert.match(integrationTest, /storedForecasts\.length, 1/);
  assert.match(integrationTest, /Promise\.allSettled/);
  assert.match(integrationTest, /CONCURRENT_PO/);
  assert.match(integrationTest, /CONCURRENT_ACTUAL/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(migration, /cost_commitments_source_key_uq/);
  assert.match(migration, /cost_actuals_source_key_uq/);
});

// Prove one post-replacement calculation failure rolls the whole replace-all transaction back.
test('Pass 221 prepares rollback verification for budget lines, totals and audit', () => {
  assert.match(integrationTest, /Module 7 operational rollback and query plans preserve atomic budget writes and reviewed indexes/);
  assert.match(integrationTest, /9999999999999999\.99/);
  assert.match(integrationTest, /response\.statusCode, 400/);
  assert.match(integrationTest, /after\.totalCost\.toString\(\), '1000'/);
  assert.match(integrationTest, /after\.lines\.length, 1/);
  assert.match(integrationTest, /budget\.lines_replaced' \} \}\), 1/);
  assert.match(service, /return withTransaction\(this\.db, async \(tx\) =>/);
  assert.match(service, /requireMoneyRange\(storedMoneyToMinorUnits\(totals\._sum\.amount\)\)/);
});

// Verify reviewed Stage-12 indexes through plans and avoid environment-specific duration thresholds.
test('Pass 221 verifies Module 7 query-plan indexes without hard timing thresholds', () => {
  for (const indexName of [
    'project_budgets_company_project_status_version_idx',
    'budget_lines_budget_cost_structure_idx',
    'cost_commitments_project_status_idx',
    'cost_actuals_project_posting_date_idx',
    'forecast_lines_project_as_of_date_idx',
  ]) assert.match(integrationTest, new RegExp(indexName));
  assert.match(integrationTest, /SET LOCAL enable_seqscan = off/);
  assert.match(integrationTest, /EXPLAIN \(FORMAT JSON\)/);
  assert.doesNotMatch(integrationTest, /Execution Time|performance\.now|Date\.now\(\)/);
});

// Keep live operational execution fail-honest until every prior Stage-12 handoff is genuine.
test('Pass 221 operations gate requires Stage 11, integration/security and Playwright live handoffs', () => {
  assert.match(operationsGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(operationsGate, /STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219/);
  assert.match(operationsGate, /STAGE_12_MODULE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_221/);
  assert.match(operationsGate, /STAGE_11_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_12_MODULE_7_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_12_MODULE_7_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
});

// Re-run both supported migration paths before the focused concurrency/rollback suite.
test('Pass 221 operational gate verifies migrations before Module 7 PostgreSQL operations', () => {
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-7/);
  assert.match(operationsGate, /clean database migration deployment/);
  assert.match(operationsGate, /upgrade from immediately previous supported schema/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
});

// Keep Pass 221 verification-only and point the sequence to the final Stage-12 acceptance gate.
test('Pass 221 adds no production or database change and prepares Pass 222 final acceptance', () => {
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /STAGE_12_MODULE_7_OPERATIONS_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /STAGE_12_MODULE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_222/);
  assert.match(operationsGate, /Pass 222 - Module 7 final Stage-12 acceptance gate/);
});


// Add one final Stage-12 gate without changing Module-7 runtime behavior.
test('Pass 222 adds the final Stage-12 acceptance commands only', () => {
  assert.equal(
    rootPackage.scripts['module-7:gate'],
    'node scripts/module-7/verify-stage-12.mjs --mode=static',
  );
  assert.equal(
    rootPackage.scripts['module-7:gate:live'],
    'node scripts/module-7/verify-stage-12.mjs --mode=live',
  );
  assert.equal(
    rootPackage.scripts['module-7:acceptance:live'],
    'npm run module-7:gate:live',
  );
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
});

// Re-run dependency and Module-7 static regressions before any live acceptance attempt.
test('Pass 222 final static gate covers Stage-12 dependencies, Module 7, workspace and migration policy', () => {
  assert.match(finalGate, /tests\/module-15a-static\.test\.mjs/);
  assert.match(finalGate, /tests\/module-6-static\.test\.mjs/);
  assert.match(finalGate, /tests\/module-24b-static\.test\.mjs/);
  assert.match(finalGate, /tests\/module-7-static\.test\.mjs/);
  assert.match(finalGate, /test:static/);
  assert.match(finalGate, /scripts\/check-workspace\.mjs/);
  assert.match(finalGate, /scripts\/migrations\/check-migrations\.mjs/);
  assert.match(finalGate, /tests\/integration\/module-7-api\.integration\.test\.mjs/);
  assert.match(finalGate, /tests\/e2e\/module-7-browser\.spec\.mjs/);
});

// Require every genuine live handoff before the final Stage-12 gate can touch databases or browsers.
test('Pass 222 final live gate is fail-honest about all Stage-12 prerequisites', () => {
  assert.match(finalGate, /STAGE_11_ACCEPTED_READY_FOR_STAGE_12/);
  assert.match(finalGate, /STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219/);
  assert.match(finalGate, /STAGE_12_MODULE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_221/);
  assert.match(finalGate, /STAGE_12_MODULE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_222/);
  assert.match(finalGate, /STAGE_11_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_12_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_12_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_12_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /MODULE_7_LIVE_GATE_CONFIRM/);
  assert.match(finalGate, /MIGRATION_TEST_CONFIRM/);
  assert.match(finalGate, /RUN_MODULE_7_E2E/);
  assert.match(finalGate, /RUN_FOUNDATION_DB_TESTS/);
});

// Run dependency-backed quality, migration, backend, browser and operational checks only after live safety validation.
test('Pass 222 final live gate prepares the complete dependency-backed Stage-12 acceptance chain', () => {
  for (const command of [
    "['clean-install', 'npm', ['ci']]",
    "['typecheck', 'npm', ['run', 'typecheck']]",
    "['lint', 'npm', ['run', 'lint']]",
    "['prisma-validate', 'npm', ['run', 'db:validate']]",
    "['prisma-generate', 'npm', ['run', 'db:generate']]",
    "['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']]",
    "['build', 'npm', ['run', 'build']]",
    "['module-7-backend-security-integration', 'npm', ['run', 'test:integration:module-7']]",
    "['module-7-browser-workflow', 'npm', ['run', 'test:e2e:module-7']]",
    "['module-7-operational-verification', 'npm', ['run', 'test:operations:module-7']]",
    "['module-15a-operational-regression', 'npm', ['run', 'test:operations:module-15a']]",
  ]) assert.ok(finalGate.includes(command), `Missing final live step: ${command}`);
});

// Accept only the reviewed Module-7 scope and point the dependency sequence to Procurement.
test('Pass 222 acceptance evidence preserves the Module-7 boundary and points to Stage 13', () => {
  assert.match(finalGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  for (const table of ['project_budgets', 'budget_lines', 'cost_commitments', 'cost_actuals', 'forecast_lines']) {
    assert.match(finalGate, new RegExp(table));
  }
  assert.match(finalGate, /sourceRouteCount: 7/);
  assert.match(finalGate, /routeCount: 8/);
  for (const permission of ['budgets.read', 'budgets.create', 'budgets.edit', 'budgets.freeze', 'job_cost.read', 'forecast.update']) {
    assert.match(finalGate, new RegExp(permission.replace('.', '\\.')));
  }
  assert.match(finalGate, /sourceDerivedEventDeferred: 'job_cost\.source_posted'/);
  assert.match(finalGate, /sourceAdaptersDeferred: true/);
  assert.match(finalGate, /Stage 13 - Module 8 Procurement & RFQ/);
});

// Keep static success truthful while the inherited Stage-11 live handoff is unavailable.
test('Pass 222 static result cannot be mistaken for live Stage-12 acceptance', () => {
  assert.match(finalGate, /STAGE_12_STATIC_GATE_PASSED_STAGE_11_LIVE_HANDOFF_PENDING/);
  assert.match(finalGate, /STAGE_12_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING/);
  assert.match(finalGate, /STAGE_12_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE/);
  assert.match(finalGate, /runtimeVerificationComplete: passed/);
  assert.match(finalGate, /mode === 'live'/);
  assert.match(finalGate, /runtimeDeploymentAllowed: passed/);
});
