import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary } from '../foundation/gate-lib.mjs';

const PASS_367_UNCHANGED_SCOPE_SNAPSHOT = '81c440e2dc66ec77e1df25b694f76c404370b6aa6015797f9f2f817cb8d12533';
const evidencePath = path.resolve('acceptance-evidence/pass-368-module-10-warehouse-ledger-low-stock.json');
const allowedChangedPaths = new Set([
  'README.md',
  'acceptance-evidence/pass-368-module-10-warehouse-ledger-low-stock.json',
  'apps/api/src/modules/inventory/index.ts',
  'apps/api/src/modules/inventory/inventory.repository.ts',
  'apps/api/src/modules/inventory/inventory.routes.ts',
  'apps/api/src/modules/inventory/inventory.schema.ts',
  'apps/api/src/modules/inventory/inventory.service.ts',
  'apps/web/src/features/inventory/api/inventory-api.ts',
  'apps/web/src/features/inventory/components/inventory-workspace.tsx',
  'apps/web/src/features/inventory/hooks/inventory.ts',
  'apps/web/src/features/inventory/pages/inventory-page.tsx',
  'docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md',
  'docs/PASS-368-MODULE-10-WAREHOUSE-LEDGER-LOW-STOCK.md',
  'docs/modules/inventory/STAGE-15-MODULE-10-CONTRACT.md',
  'package.json',
  'packages/database/prisma/migration-checksums.json',
  'packages/database/prisma/migration-gates.json',
  'packages/database/prisma/migrations/20260826000800_module_10_warehouse_ledger_low_stock_repair/migration.sql',
  'packages/database/prisma/schema.prisma',
  'scripts/acceptance/verify-pass-368-module-10-warehouse-ledger-low-stock.mjs',
  'tests/e2e/module-10-browser.spec.mjs',
  'tests/integration/module-10-api.integration.test.mjs',
  'tests/migration-system.test.mjs',
  'tests/module-10-static.test.mjs',
  'tests/pass-368-module-10-warehouse-ledger-low-stock.test.mjs',
  'tests/pass-365-module-9-revision-history-cancellation-evidence.test.mjs'
]);

/** Collect project files in stable order while excluding dependencies and VCS state. */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Hash every file outside the reviewed Pass-368 boundary to prove unrelated Pass-367 scope stayed byte-identical. */
async function unchangedScopeSnapshot() {
  const files = await collectFiles('.');
  const hash = createHash('sha256');
  let fileCount = 0;
  for (const file of files.sort((left, right) => left.localeCompare(right))) {
    const relative = path.relative('.', file).replaceAll('\\', '/');
    if (allowedChangedPaths.has(relative)) continue;
    const relativeBytes = Buffer.from(relative);
    const content = await readFile(file);
    const pathLength = Buffer.alloc(8);
    const contentLength = Buffer.alloc(8);
    pathLength.writeBigUInt64BE(BigInt(relativeBytes.length));
    contentLength.writeBigUInt64BE(BigInt(content.length));
    hash.update(pathLength);
    hash.update(relativeBytes);
    hash.update(contentLength);
    hash.update(content);
    fileCount += 1;
  }
  return { sha256: hash.digest('hex'), fileCount };
}

const boundary = await unchangedScopeSnapshot();
const results = [{
  name: 'pass-367-unchanged-scope-snapshot',
  status: boundary.sha256 === PASS_367_UNCHANGED_SCOPE_SNAPSHOT ? 'passed' : 'failed',
  details: boundary.sha256 === PASS_367_UNCHANGED_SCOPE_SNAPSHOT
    ? `Unrelated Pass-367 scope remains byte-identical across ${boundary.fileCount} files.`
    : `Expected ${PASS_367_UNCHANGED_SCOPE_SNAPSHOT} but found ${boundary.sha256}.`
}];

const typescriptFiles = [
  'apps/api/src/modules/inventory/inventory.schema.ts',
  'apps/api/src/modules/inventory/inventory.repository.ts',
  'apps/api/src/modules/inventory/inventory.service.ts',
  'apps/api/src/modules/inventory/inventory.routes.ts',
  'apps/api/src/modules/inventory/index.ts',
  'apps/web/src/features/inventory/api/inventory-api.ts',
  'apps/web/src/features/inventory/hooks/inventory.ts',
  'apps/web/src/features/inventory/components/inventory-workspace.tsx',
  'apps/web/src/features/inventory/pages/inventory-page.tsx'
];
const steps = [
  ['pass-368-focused-static', 'node', ['--test', 'tests/pass-368-module-10-warehouse-ledger-low-stock.test.mjs']],
  ['module-10-cumulative-static', 'node', ['--test', 'tests/module-10-static.test.mjs']],
  ['migration-system-static', 'node', ['--test', 'tests/migration-system.test.mjs']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'npm', ['run', 'check:workspace']],
  ['migration-policy', 'npm', ['run', 'db:migrations:check']],
  ['typescript-source-syntax', 'tsc', ['--noEmit', '--noCheck', '--noResolve', '--jsx', 'react-jsx', '--target', 'ES2022', '--module', 'ESNext', ...typescriptFiles]],
  ['module-10-integration-test-syntax', 'node', ['--check', 'tests/integration/module-10-api.integration.test.mjs']],
  ['module-10-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-10-browser.spec.mjs']]
];

if (results[0].status === 'passed') {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = results.length === steps.length + 1 && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-pass-368-module-10-warehouse-ledger-low-stock',
  generatedAt: new Date().toISOString(),
  pass: 368,
  baselinePass: 367,
  status: passed ? 'PASS_368_MODULE_10_WAREHOUSE_LEDGER_LOW_STOCK_ACCEPTED' : 'PASS_368_MODULE_10_WAREHOUSE_LEDGER_LOW_STOCK_FAILED',
  repairContractItems: ['M10-01', 'M10-02'],
  businessModulesAdded: 0,
  migrationsAdded: 1,
  migrationName: '20260826000800_module_10_warehouse_ledger_low_stock_repair',
  databaseTablesAdded: [],
  prismaModelsAdded: [],
  databaseColumnsAdded: ['inventory_balances.minimum_stock_quantity'],
  sourceRoutesPreserved: 8,
  publicRepairRoutesAdded: [
    'GET /api/v1/inventory/warehouses',
    'POST /api/v1/inventory/warehouses',
    'PATCH /api/v1/inventory/warehouses/:id',
    'GET /api/v1/inventory/stock-ledger',
    'PUT /api/v1/inventory/balances/minimum-stock',
    'GET /api/v1/inventory/low-stock'
  ],
  permissionsAdded: [],
  stableErrorsAdded: [],
  domainEventsAdded: [],
  warehouseDeleteOrReassignmentAdded: false,
  stockLedgerMutationAdded: false,
  lowStockRule: 'minimum_stock_quantity IS NOT NULL AND quantity_on_hand <= minimum_stock_quantity',
  minimumStockAuditOnly: true,
  uomConversionDeferredToPass369: true,
  stockCountReconciliationDeferredToPass369: true,
  returnAndStockPeriodPolicyDeferredToPass369: true,
  stage26FinanceAdapterDeferred: true,
  stage27IntegrationCompletionDeferred: true,
  unchangedScopeSnapshotExpected: PASS_367_UNCHANGED_SCOPE_SNAPSHOT,
  unchangedScopeSnapshotActual: boundary.sha256,
  unchangedScopeFileCount: boundary.fileCount,
  liveDatabaseVerificationExecuted: false,
  liveDatabaseVerificationReason: 'Dependency-free packaged acceptance was executed. Live PostgreSQL/Prisma and Playwright verification still requires configured workspace dependencies and disposable test services.',
  nextReviewedPass: 'Pass 369 - Module 10 UOM conversion, inventory count/reconciliation and return/stock-period policy completion',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
if (!passed) process.exitCode = 1;
else console.log('PASS_368_MODULE_10_WAREHOUSE_LEDGER_LOW_STOCK_ACCEPTED');
