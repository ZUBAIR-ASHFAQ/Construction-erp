import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vendorService = await readFile('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.service.ts', 'utf8');
const vendorWorkspace = await readFile('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx', 'utf8');
const supplierPayablesRepository = await readFile('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts', 'utf8');
const supplierPayablesService = await readFile('apps/api/src/modules/supplier-payables/supplier-payables.service.ts', 'utf8');
const clientService = await readFile('apps/api/src/modules/clients/clients.service.ts', 'utf8');
const clientDetails = await readFile('apps/web/src/features/clients/components/client-details-panel.tsx', 'utf8');
const clientApi = await readFile('apps/web/src/features/clients/api/clients-api.ts', 'utf8');
const clientBillingRepository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const clientReceiptsRepository = await readFile('apps/api/src/modules/client-receipts/client-receipts.repository.ts', 'utf8');
const projectSchema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const projectService = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const projectRoutes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const projectDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');
const administrationRoutes = await readFile('apps/api/src/modules/administration/administration.routes.ts', 'utf8');
const administrationService = await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8');
const administrationRepository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const documentsRoutes = await readFile('apps/api/src/modules/documents-audit/documents-audit.routes.ts', 'utf8');
const financeRoutes = await readFile('apps/api/src/modules/finance/finance.routes.ts', 'utf8');
const inventoryRoutes = await readFile('apps/api/src/modules/inventory/inventory.routes.ts', 'utf8');
const bootstrapProvision = await readFile('packages/bootstrap/src/provision.ts', 'utf8');

const R1_DECISIONS = Object.freeze({
  administrationOrganizationProfile: 'ADD_NARROW_ADMIN_ORGANIZATION_PROFILE_GET_PATCH_NO_GENERIC_COMPANY_CRUD',
  financeStatements: 'USE_ONE_SHARED_FINANCE_REPORTING_READ_MODEL_WHEN_MODULE_20_IS_BUILT',
  warehouseConfiguration: 'BOOTSTRAP_MINIMUM_USABLE_CONFIGURATION_NO_GENERIC_WAREHOUSE_CRUD_IN_R1',
  extraAuthRoutes: 'KEEP_AS_FOUNDATION_AUTH_SUPPORT',
  documentBrowserListRoute: 'KEEP_AS_REQUIRED_DOCUMENT_BROWSER_READ'
});

/** Freeze the repair-policy decisions that later passes must implement without broadening scope. */
test('R1 freezes explicit Final-21 repair ownership decisions', () => {
  assert.equal(
    R1_DECISIONS.administrationOrganizationProfile,
    'ADD_NARROW_ADMIN_ORGANIZATION_PROFILE_GET_PATCH_NO_GENERIC_COMPANY_CRUD'
  );
  assert.equal(
    R1_DECISIONS.financeStatements,
    'USE_ONE_SHARED_FINANCE_REPORTING_READ_MODEL_WHEN_MODULE_20_IS_BUILT'
  );
  assert.equal(
    R1_DECISIONS.warehouseConfiguration,
    'BOOTSTRAP_MINIMUM_USABLE_CONFIGURATION_NO_GENERIC_WAREHOUSE_CRUD_IN_R1'
  );
  assert.equal(R1_DECISIONS.extraAuthRoutes, 'KEEP_AS_FOUNDATION_AUTH_SUPPORT');
  assert.equal(R1_DECISIONS.documentBrowserListRoute, 'KEEP_AS_REQUIRED_DOCUMENT_BROWSER_READ');
});

/** Freeze the exact documented Project Management route surface before business repairs begin. */
test('R1 freezes exact Module 6 Project API route parity', () => {
  const actualRoutes = [...projectRoutes.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);

  assert.deepEqual(actualRoutes, [
    'GET /api/v1/projects',
    'POST /api/v1/projects',
    'GET /api/v1/projects/:id',
    'PATCH /api/v1/projects/:id',
    'POST /api/v1/projects/:id/activate',
    'POST /api/v1/projects/:id/suspend',
    'POST /api/v1/projects/:id/complete',
    'POST /api/v1/projects/:id/close'
  ]);
});

/** Keep intentional auth support and the required document-browser read while rejecting generic Company CRUD. */
test('R1 classifies intentional extra routes instead of treating them as accidental CRUD', () => {
  for (const route of [
    '/api/v1/auth/refresh',
    '/api/v1/auth/invitations/accept',
    '/api/v1/auth/password-reset/request',
    '/api/v1/auth/password-reset/complete'
  ]) {
    assert.ok(administrationRoutes.includes(`'${route}'`), `missing intentional auth support route ${route}`);
  }

  assert.match(documentsRoutes, /app\.get\('\/api\/v1\/documents'/);
  assert.match(documentsRoutes, /summary: 'List visible documents for the document browser'/);
  assert.doesNotMatch(administrationRoutes, /\/api\/v1\/admin\/(?:companies|company)(?:['/:])/);
});

/** Prevent premature duplicate Finance statements and generic Warehouse CRUD before their approved repair passes. */
test('R1 prevents scope expansion while statement and configuration ownership is pending', () => {
  assert.doesNotMatch(financeRoutes, /\/api\/v1\/finance\/(?:profit-loss|profit-and-loss|p-and-l|balance-sheet|cash-flow)/);
  assert.doesNotMatch(inventoryRoutes, /\/api\/v1\/inventory\/warehouses(?:['/:])/);
});

/** R3: Vendor detail reads Supplier Payables without duplicating payable balances in Module 5. */
test('R3 implemented: Supplier detail exposes real permission-safe payable summary from Module 17', () => {
  assert.doesNotMatch(vendorService, /payableSummaryAvailable:\s*false/);
  assert.match(vendorService, /SupplierPayablesService/);
  assert.match(vendorService, /readVendorPayableSummary/);
  assert.match(vendorService, /error instanceof AuthorizationError/);
  assert.match(supplierPayablesRepository, /async getVendorPayableSummary/);
  assert.match(supplierPayablesRepository, /status: 'POSTED'/);
  assert.match(supplierPayablesRepository, /supplierPayment: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(supplierPayablesService, /async getVendorPayableSummary/);
  assert.match(supplierPayablesService, /outstandingMinorUnits/);
  assert.doesNotMatch(vendorWorkspace, /Available after Supplier Payables is implemented/);
  assert.match(vendorWorkspace, /payableSummary\?\.postedInvoiceTotal/);
  assert.match(vendorWorkspace, /payableSummary\?\.allocatedPaymentTotal/);
  assert.match(vendorWorkspace, /payableSummary\?\.outstandingAmount/);
});

/** R4: Client detail renders source-derived finance values only when the owning module permissions allow them. */
test('R4 implemented: Client financial summary renders source values under source permissions', () => {
  assert.match(clientDetails, /receiptSummary\.receivedAmount/);
  assert.match(clientDetails, /receiptSummary\.allocatedAmount/);
  assert.match(clientDetails, /receiptSummary\.advanceAmount/);
  assert.match(clientDetails, /receiptSummary\.outstandingAmount/);
  assert.doesNotMatch(clientDetails, /Available after Client Receipts is implemented/);
  assert.doesNotMatch(clientDetails, /receiptSummaryAvailable/);
  assert.match(clientService, /canReadBilling = hasPermission\('client_billing\.read'\)/);
  assert.match(clientService, /canReadReceipts = hasPermission\('client_receipts\.read'\)/);
  assert.match(clientService, /ClientBillingRepository/);
  assert.match(clientService, /readClientBillingSummary\(clientId, visibility\)/);
  assert.match(clientService, /readReceiptFinancialTotals\(\{ clientId, allowedProjectIds \}\)/);
  assert.match(clientService, /billingSummary: billing[\s\S]*: null/);
  assert.match(clientService, /receiptSummary: receivedAmount === null \|\| allocatedAmount === null[\s\S]*\? null[\s\S]*: \{/);
  assert.match(clientBillingRepository, /async readClientBillingSummary/);
  assert.match(clientBillingRepository, /status: \{ in: \['ISSUED', 'POSTED'\] \}/);
  assert.match(clientReceiptsRepository, /allowedProjectIds\?: readonly string\[\] \| null/);
  assert.match(clientApi, /billingSummary:[\s\S]*\| null/);
  assert.match(clientApi, /receiptSummary:[\s\S]*outstandingAmount: string \| null[\s\S]*\| null/);
});

/** R5: Project detail consolidates source-owned summaries without copying source totals into Project tables. */
test('R5 implemented: Project detail exposes the required consolidated source summary', () => {
  for (const field of ['stageSummary', 'teamSummary', 'budgetSummary', 'costSummary', 'billingSummary', 'receiptSummary']) {
    assert.match(projectService, new RegExp(`\\b${field}\\b`), `missing Project summary field ${field}`);
  }
  assert.match(projectService, /ProjectStagesService\(this\.db\)\.getProjectSummary\(projectId\)/);
  assert.match(projectService, /ProjectTeamService\(this\.db\)\.getProjectSummary\(projectId\)/);
  assert.match(projectService, /BudgetsJobCostService\(this\.db\)\.getBudgetSummary\(projectId\)/);
  assert.match(projectService, /BudgetsJobCostService\(this\.db\)\.getJobCost\(projectId\)/);
  assert.match(projectService, /ClientBillingService\(this\.db\)\.getProjectSummary\(projectId\)/);
  assert.match(projectService, /readReceiptFinancialTotals\(\{ projectId \}\)/);
  assert.match(projectDetails, /details\.stageSummary/);
  assert.match(projectDetails, /details\.teamSummary/);
  assert.match(projectDetails, /details\.budgetSummary/);
  assert.match(projectDetails, /details\.costSummary/);
  assert.match(projectDetails, /details\.billingSummary/);
  assert.match(projectDetails, /details\.receiptSummary/);
  assert.doesNotMatch(projectDetails, /later modules/i);
});

/** R2: A fresh company receives the minimum configuration needed by built operational modules. */
test('R2 implemented: Initial bootstrap creates minimum Warehouse Expense Category and Fiscal Period configuration', () => {
  assert.match(bootstrapProvision, /provisionMinimumOperationalConfiguration\(tx, company\.id, input\.company\.fiscalSettings\)/);
  assert.match(bootstrapProvision, /tx\.warehouse\.create\(/);
  assert.match(bootstrapProvision, /projectId:\s*null/);
  assert.match(bootstrapProvision, /DEFAULT_WAREHOUSE_CODE\s*=\s*'MAIN'/);
  assert.match(bootstrapProvision, /tx\.expenseCategory\.create\(/);
  assert.match(bootstrapProvision, /DEFAULT_EXPENSE_CATEGORY_CODE\s*=\s*'GENERAL'/);
  assert.match(bootstrapProvision, /tx\.fiscalPeriod\.create\(/);
  assert.match(bootstrapProvision, /status:\s*'OPEN'/);
  assert.match(bootstrapProvision, /configuredFiscalYearStartMonth/);
  assert.match(bootstrapProvision, /currentFiscalPeriod/);
});

/** R7: Project errors use the exact stable codes from the controlling Final-21 contract. */
test('R7 implemented: Project lifecycle and commercial-model errors use documented stable codes', () => {
  for (const source of [projectSchema, projectService, projectRoutes]) {
    assert.match(source, /PROJECT_NOT_READY/);
    assert.match(source, /INVALID_PROJECT_TRANSITION/);
    assert.doesNotMatch(source, /PROJECT_NOT_READY_TO_CLOSE/);
    assert.doesNotMatch(source, /INVALID_PROJECT_STATUS_TRANSITION/);
  }

  assert.match(projectSchema, /INVALID_PROJECT_MODEL/);
  assert.match(projectService, /createProjectError\('INVALID_PROJECT_MODEL'\)/);
  assert.match(projectRoutes, /PROJECT_CREATE_CONFLICT_RESPONSE = errorResponseSchema\(\['DUPLICATE_PROJECT_CODE', 'INVALID_PROJECT_MODEL'\]\)/);
  assert.match(projectRoutes, /PROJECT_UPDATE_CONFLICT_RESPONSE = errorResponseSchema\(\['INVALID_PROJECT_MODEL', 'INVALID_PROJECT_TRANSITION'\]\)/);
});

/** R6: Administration resolves the React Organization Profile requirement with one narrow Foundation Company projection. */
test('R6 implemented: Administration exposes narrow organization profile read and edit operations', () => {
  assert.match(administrationRoutes, /app\.get\('\/api\/v1\/admin\/organization-profile'/);
  assert.match(administrationRoutes, /app\.patch\('\/api\/v1\/admin\/organization-profile'/);
  assert.doesNotMatch(administrationRoutes, /app\.(?:post|delete)\('\/api\/v1\/admin\/organization-profile'/);
  assert.match(administrationService, /getOrganizationProfile\(\)/);
  assert.match(administrationService, /updateOrganizationProfile\(input/);
  assert.match(administrationRepository, /this\.db\.company\.findUnique/);
  assert.match(administrationRepository, /this\.db\.company\.update/);
  assert.match(administrationRoutes, /Base currency, status and fiscal settings are read-only/i);
});
