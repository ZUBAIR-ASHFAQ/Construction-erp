import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile('apps/api/src/app.ts', 'utf8');
const mainSource = await readFile('apps/api/src/main.ts', 'utf8');
const adminShellSource = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');

const EXCLUDED_RUNTIME_IMPORT_PATHS = [
  './modules/approvals/',
  './modules/tendering-estimation/',
  './modules/boq/',
  './modules/wbs-cost-codes/',
  './modules/scheduling/',
  './modules/change-orders/',
  './modules/rfi-submittals/'
];

const EXCLUDED_RUNTIME_CONFIG_OPTIONS = [
  'tenderEstimateApprovalDefinitionCode',
  'changeRequestApprovalDefinitionCode',
  'budgetApprovalDefinitionCode',
  'procurementRequisitionApprovalDefinitionCode',
  'purchaseOrderApprovalDefinitionCode',
  'subcontractApprovalDefinitionCode',
  'equipmentUsageApprovalDefinitionCode',
  'timesheetApprovalDefinitionCode',
  'payrollApprovalDefinitionCode'
];

const EXCLUDED_ROUTE_REGISTRARS = [
  'registerApprovalsRoutes',
  'registerTenderingEstimationRoutes',
  'registerBoqRoutes',
  'registerWbsCostCodesRoutes',
  'registerSchedulingRoutes',
  'registerChangeOrdersRoutes',
  'registerRfiSubmittalsRoutes'
];


const EXCLUDED_BACKEND_MODULE_DIRS = [
  'approvals',
  'tendering-estimation',
  'boq',
  'wbs-cost-codes',
  'scheduling',
  'change-orders',
  'rfi-submittals'
];

const EXCLUDED_BACKEND_IMPORT_FRAGMENTS = EXCLUDED_BACKEND_MODULE_DIRS.map((name) => `/modules/${name}/`);

/** Return whether one repository path currently exists. */
async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Return API TypeScript files below one directory for final-scope import checks. */
async function walkApiSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walkApiSources(filePath));
    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(filePath);
  }
  return files;
}

const EXCLUDED_WORKSPACE_VIEW_IDS = [
  'approvals',
  'tenders',
  'boqs',
  'wbs-cost-codes',
  'scheduling',
  'change-orders',
  'rfi-submittals'
];


const EXCLUDED_FRONTEND_FEATURE_DIRS = [
  'approvals',
  'tendering-estimation',
  'boq',
  'wbs-cost-codes',
  'scheduling',
  'change-orders',
  'rfi-submittals'
];

const EXCLUDED_FRONTEND_IMPORT_FRAGMENTS = EXCLUDED_FRONTEND_FEATURE_DIRS.map((name) => `/features/${name}/`);

/** Return TypeScript/TSX files below one directory for static final-scope checks. */
async function walkFrontendSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walkFrontendSources(filePath));
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(filePath);
  }
  return files;
}

const EXCLUDED_WORKSPACE_IMPORTS = [
  '../../approvals/pages/approvals-page.js',
  '../../tendering-estimation/pages/tenders-page.js',
  '../../boq/pages/boqs-page.js',
  '../../wbs-cost-codes/pages/wbs-cost-codes-page.js',
  '../../scheduling/pages/scheduling-page.js',
  '../../change-orders/pages/change-orders-page.js',
  '../../rfi-submittals/pages/rfi-submittals-page.js'
];

// Guard the final 21-module API so excluded standalone modules cannot stay registered.
test('final 21-module scope does not register excluded standalone modules', () => {
  const activeExcludedRegistrars = EXCLUDED_ROUTE_REGISTRARS.filter((registrar) =>
    appSource.includes(`app.register(${registrar}`)
  );

  assert.deepEqual(
    activeExcludedRegistrars,
    [],
    `Excluded final-scope modules are still registered in apps/api/src/app.ts: ${activeExcludedRegistrars.join(', ')}`
  );
});

// Guard the main web shell so excluded standalone workspaces cannot remain user-facing navigation entries.
test('final 21-module scope does not expose excluded standalone workspaces in the main shell', () => {
  const activeExcludedImports = EXCLUDED_WORKSPACE_IMPORTS.filter((importPath) => adminShellSource.includes(importPath));
  const activeExcludedViews = EXCLUDED_WORKSPACE_VIEW_IDS.filter((viewId) =>
    adminShellSource.includes(`activeView === '${viewId}'`) || adminShellSource.includes(`setView('${viewId}')`)
  );

  assert.deepEqual(
    activeExcludedImports,
    [],
    `Excluded final-scope workspaces are still imported by AdminShell: ${activeExcludedImports.join(', ')}`
  );
  assert.deepEqual(
    activeExcludedViews,
    [],
    `Excluded final-scope workspaces are still reachable from AdminShell: ${activeExcludedViews.join(', ')}`
  );
});

// Guard API entrypoints so excluded modules cannot return through imports or startup-only configuration.
test('final 21-module API entrypoints do not reference excluded standalone runtime modules', () => {
  const activeExcludedImports = EXCLUDED_RUNTIME_IMPORT_PATHS.filter((importPath) => appSource.includes(importPath));
  const activeExcludedConfig = EXCLUDED_RUNTIME_CONFIG_OPTIONS.filter((option) => mainSource.includes(`${option}:`));

  assert.deepEqual(
    activeExcludedImports,
    [],
    `Excluded final-scope modules are still imported by apps/api/src/app.ts: ${activeExcludedImports.join(', ')}`
  );
  assert.deepEqual(
    activeExcludedConfig,
    [],
    `Excluded final-scope startup configuration is still passed by apps/api/src/main.ts: ${activeExcludedConfig.join(', ')}`
  );
});

// Guard frontend source cleanup so excluded feature folders and cross-imports cannot return after Pass A3.
test('final 21-module frontend source removes excluded standalone feature folders and imports', async () => {
  const featureEntries = await readdir('apps/web/src/features', { withFileTypes: true });
  const activeExcludedFolders = EXCLUDED_FRONTEND_FEATURE_DIRS.filter((name) =>
    featureEntries.some((entry) => entry.isDirectory() && entry.name === name)
  );

  const sourceFiles = await walkFrontendSources('apps/web/src');
  const legacyImportHits = [];
  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    for (const fragment of EXCLUDED_FRONTEND_IMPORT_FRAGMENTS) {
      if (source.includes(fragment) || source.includes(fragment.replace('/features/', '../../'))) {
        legacyImportHits.push(`${filePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(
    activeExcludedFolders,
    [],
    `Excluded frontend feature folders still exist: ${activeExcludedFolders.join(', ')}`
  );
  assert.deepEqual(
    legacyImportHits,
    [],
    `Frontend source still imports excluded feature modules: ${legacyImportHits.join(', ')}`
  );
});

// Guard backend cleanup so excluded module source and the generic approval worker cannot return after Pass A4.
test('final 21-module backend source removes excluded standalone module folders and imports', async () => {
  const existingFolders = [];
  for (const name of EXCLUDED_BACKEND_MODULE_DIRS) {
    if (await pathExists(`apps/api/src/modules/${name}`)) existingFolders.push(name);
  }

  const apiFiles = await walkApiSources('apps/api/src');
  const legacyImportHits = [];
  for (const filePath of apiFiles) {
    const source = await readFile(filePath, 'utf8');
    for (const fragment of EXCLUDED_BACKEND_IMPORT_FRAGMENTS) {
      if (source.includes(fragment) || source.includes(fragment.replace('/modules/', '../modules/'))) {
        legacyImportHits.push(`${filePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(existingFolders, [], `Excluded backend module folders still exist: ${existingFolders.join(', ')}`);
  assert.deepEqual(legacyImportHits, [], `API source still imports excluded backend modules: ${legacyImportHits.join(', ')}`);
  assert.equal(await pathExists('apps/api/src/workers/approval-timing.worker.ts'), false, 'Standalone approval timing worker still exists');
});

// Guard cross-cutting cleanup so removed generic approval/change-order runtime plumbing cannot return after Pass A5.
test('final 21-module runtime removes obsolete approval, change-order and RFQ policy plumbing', async () => {
  const sources = {
    config: await readFile('packages/config/src/server.ts', 'utf8'),
    env: await readFile('apps/api/.env.example', 'utf8'),
    app: appSource,
    main: mainSource,
    playwright: await readFile('playwright.config.mjs', 'utf8'),
    logging: await readFile('packages/logging/src/redaction.ts', 'utf8'),
    contracts: await readFile('packages/contracts/src/resource-reference.ts', 'utf8'),
    contractIndex: await readFile('packages/contracts/src/index.ts', 'utf8'),
    budgetService: await readFile('apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts', 'utf8'),
    adminSchema: await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8'),
    adminService: await readFile('apps/api/src/modules/administration/administration.service.ts', 'utf8'),
    styles: await readFile('apps/web/src/styles.css', 'utf8')
  };

  const obsoleteRuntimeTokens = [
    'approvalNotificationWebhookUrl',
    'approvalNotificationWebhookToken',
    'tenderEstimateApprovalDefinitionCode',
    'budgetApprovalDefinitionCode',
    'procurementRequisitionApprovalDefinitionCode',
    'procurementRequireRationaleForNonLowestSelection',
    'purchaseOrderApprovalDefinitionCode',
    'subcontractApprovalDefinitionCode',
    'equipmentUsageApprovalDefinitionCode',
    'timesheetApprovalDefinitionCode',
    'payrollApprovalDefinitionCode',
    'changeRequestApprovalDefinitionCode',
    'APPROVAL_NOTIFICATION_WEBHOOK',
    'APPROVAL_DEFINITION_CODE',
    'REQUIRE_RATIONALE_FOR_NON_LOWEST'
  ];

  for (const [name, source] of Object.entries({
    config: sources.config,
    env: sources.env,
    app: sources.app,
    main: sources.main,
    playwright: sources.playwright,
    logging: sources.logging
  })) {
    const hits = obsoleteRuntimeTokens.filter((token) => source.includes(token));
    assert.deepEqual(hits, [], `${name} still contains obsolete runtime configuration: ${hits.join(', ')}`);
  }

  assert.doesNotMatch(`${sources.contracts}\n${sources.contractIndex}`, /ApprovalResourceReference|createApprovalResourceReference/);
  assert.doesNotMatch(sources.budgetService, /applyApprovedChangeOrderInTransaction|prepareChangeBudgetAdjustments|sourceType:\s*['"]change_order['"]/);
  assert.doesNotMatch(sources.styles, /Module 22 Approval Workflows|\.approval-(?:tabs|filter-grid|form-grid|condition-grid|summary|payload|dialog|fieldset|step-list|step-card)/);
  assert.doesNotMatch(sources.adminSchema, /isRemovedFinal21PermissionCode|REMOVED_FINAL_21_PERMISSION_CODES/);
  assert.doesNotMatch(sources.adminService, /isRemovedFinal21PermissionCode|filterActivePermissionCodes/);
});

// Guard Client Management so the excluded CRM opportunity pipeline cannot return through active runtime code.
test('final 21-module Client Management excludes CRM opportunities from active API and UI code', async () => {
  const clientFiles = [
    'apps/api/src/modules/clients/clients.schema.ts',
    'apps/api/src/modules/clients/clients.repository.ts',
    'apps/api/src/modules/clients/clients.service.ts',
    'apps/api/src/modules/clients/clients.routes.ts',
    'apps/web/src/features/clients/api/clients-api.ts',
    'apps/web/src/features/clients/hooks/clients.ts',
    'apps/web/src/features/clients/pages/clients-page.tsx',
    'apps/web/src/features/clients/components/client-details-panel.tsx'
  ];
  const forbiddenTokens = [
    '/api/v1/opportunities',
    'opportunities.read',
    'opportunities.manage',
    'OpportunityPipeline',
    'createOpportunity',
    'listOpportunities',
    'getOpportunity',
    'changeOpportunityStage',
    'reopenOpportunity'
  ];
  const hits = [];

  for (const filePath of clientFiles) {
    const source = await readFile(filePath, 'utf8');
    for (const token of forbiddenTokens) {
      if (source.includes(token)) hits.push(`${filePath}: ${token}`);
    }
  }

  assert.deepEqual(hits, [], `Active Client Management still contains excluded CRM opportunity logic: ${hits.join(', ')}`);
  assert.equal(
    await pathExists('apps/web/src/features/clients/components/opportunity-pipeline.tsx'),
    false,
    'Excluded CRM opportunity pipeline component still exists'
  );
});
