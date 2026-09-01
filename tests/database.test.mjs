import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const databasePackage = JSON.parse(await readFile('packages/database/package.json', 'utf8'));
const compose = await readFile('docker-compose.yml', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000100_foundation_company_master/migration.sql',
  'utf8'
);
const migrationLock = await readFile('packages/database/prisma/migrations/migration_lock.toml', 'utf8');

test('Prisma is centralized and configured for PostgreSQL', () => {
  assert.match(schema, /provider\s*=\s*"postgresql"/);
  assert.match(schema, /env\("DATABASE_URL"\)/);
  assert.match(schema, /provider\s*=\s*"prisma-client-js"/);
});

test('centralized schema preserves Foundation and reviewed Stage 1-24 persistence', () => {
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
  assert.deepEqual(models, ['Company', 'AuditLog', 'OutboxEvent', 'IdempotencyRecord', 'NumberSequence', 'QueueJob', 'CompanyConfiguration', 'InitialBootstrapRun', 'User', 'AuthCredential', 'AuthSession', 'Role', 'Permission', 'RolePermission', 'UserRoleAssignment', 'UserProjectScope', 'Department', 'DocumentFolder', 'Document', 'DocumentVersion', 'DocumentLink', 'DocumentUploadIntent', 'ApprovalDefinition', 'ApprovalStep', 'ApprovalRequest', 'ApprovalAction', 'ApprovalDelegation', 'Client', 'ClientContact', 'Opportunity', 'OpportunityNote', 'Tender', 'EstimateVersion', 'EstimateItem', 'TenderSubmission', 'Boq', 'BoqRevision', 'BoqItem', 'Project', 'ProjectMember', 'ProjectStatusHistory', 'ProjectCostStructureState', 'WbsNode', 'CostCode', 'CostType', 'ProjectCostCode', 'GlAccount', 'FiscalPeriod', 'Journal', 'JournalLine', 'ProjectBudget', 'BudgetLine', 'CostCommitment', 'CostActual', 'ForecastLine', 'Vendor', 'VendorContact', 'PurchaseRequisition', 'PurchaseRequisitionItem', 'Rfq', 'RfqItem', 'RfqVendor', 'SupplierQuotation', 'SupplierQuotationItem', 'PurchaseOrder', 'PurchaseOrderItem', 'PurchaseOrderRevision', 'PurchaseOrderRevisionItem', 'InventoryItem', 'Warehouse', 'InventoryBalance', 'GoodsReceipt', 'GoodsReceiptItem', 'InventoryItemUnitConversion', 'InventoryCount', 'InventoryCountLine', 'InventoryStockPeriod', 'StockTransaction', 'Subcontractor', 'Subcontract', 'SubcontractItem', 'SubcontractPaymentApplication', 'SubcontractRevision', 'SubcontractRetentionRelease', 'SubcontractPaymentLine', 'Equipment', 'EquipmentAssignment', 'EquipmentUsage', 'EquipmentMaintenance', 'Employee', 'LeaveRequest', 'WorkforceAssignment', 'Timesheet', 'TimesheetEntry', 'TimesheetAdjustment', 'EmployeeCompensationPeriod', 'PayrollRun', 'Payslip', 'PayslipItem', 'PayrollCalculationException', 'PayrollSourceConsumption', 'ProjectSchedule', 'ScheduleActivity', 'ScheduleDependency', 'ScheduleBaseline', 'ScheduleProgressUpdate', 'ChangeRequest', 'ChangeRequestLine', 'ChangeOrder', 'ChangeOrderImpact', 'ClientContract', 'ProgressClaim', 'ProgressClaimLine', 'ClientInvoice', 'RetentionLedger', 'Submittal', 'SubmittalRevision', 'SubmittalReview', 'Rfi', 'RfiResponse']);
  assert.match(schema, /@@map\("companies"\)/);
  assert.match(schema, /id\s+String\s+@id\s+@default\(uuid\(\)\)\s+@db\.Uuid/);
});

test('Company model contains every source-required master field', () => {
  for (const pattern of [
    /legalName\s+String\s+@map\("legal_name"\)/,
    /displayName\s+String\s+@map\("display_name"\)/,
    /status\s+String/,
    /baseCurrency\s+String\s+@map\("base_currency"\)/,
    /timeZone\s+String\s+@map\("time_zone"\)/,
    /locale\s+String/,
    /fiscalSettings\s+Json\s+@map\("fiscal_settings"\)/,
    /createdAt\s+DateTime/,
    /updatedAt\s+DateTime/,
  ]) {
    assert.match(schema, pattern);
  }
});

test('first migration creates only the companies table with canonical UUID primary key', () => {
  const createTables = [...migration.matchAll(/CREATE TABLE\s+"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(createTables, ['companies']);
  assert.match(migration, /"id" UUID NOT NULL/);
  assert.match(migration, /CONSTRAINT "companies_pkey" PRIMARY KEY \("id"\)/);
});

test('company migration preserves required fields and conservative integrity constraints', () => {
  for (const column of [
    'legal_name', 'display_name', 'status', 'base_currency', 'time_zone',
    'locale', 'fiscal_settings', 'created_at', 'updated_at'
  ]) {
    assert.match(migration, new RegExp(`"${column}"`));
  }
  assert.match(migration, /companies_base_currency_iso_shape/);
  assert.match(migration, /\^\[A-Z\]\{3\}\$/);
  assert.match(migration, /jsonb_typeof\("fiscal_settings"\) = 'object'/);
  assert.match(migration, /CREATE INDEX "companies_status_idx"/);
});

test('Pass 04 does not invent a company status enum or future-module foreign keys', () => {
  assert.doesNotMatch(schema, /^enum\s+CompanyStatus\b/m);
  assert.doesNotMatch(migration, /REFERENCES/i);
  assert.doesNotMatch(migration, /CREATE TABLE\s+"users"/i);
  assert.doesNotMatch(migration, /CREATE TABLE\s+"projects"/i);
});

test('Prisma migration lock is PostgreSQL', () => {
  assert.match(migrationLock, /provider\s*=\s*"postgresql"/);
});

test('database package exposes Prisma generation and migration commands', () => {
  assert.ok(databasePackage.scripts['prisma:generate']);
  assert.ok(databasePackage.scripts['prisma:validate']);
  assert.ok(databasePackage.scripts['prisma:migrate:dev']);
  assert.ok(databasePackage.scripts['prisma:migrate:deploy']);
  assert.equal(databasePackage.dependencies['@prisma/client'], '^6.0.0');
  assert.equal(databasePackage.devDependencies.prisma, '^6.0.0');
});

test('local PostgreSQL service has persistent storage and a healthcheck', () => {
  assert.match(compose, /postgres:16-alpine/);
  assert.match(compose, /pg_isready/);
  assert.match(compose, /construction_erp_postgres_data/);
});

test('API validates config then injects centralized database client', () => {
  assert.match(apiMain, /loadServerConfig\(process\.env\)/);
  assert.match(apiMain, /createDatabaseClient/);
  assert.match(apiMain, /database/);
});
