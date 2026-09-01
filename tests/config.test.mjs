import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConfigurationError,
  DEVELOPMENT_DATABASE_URL,
  loadServerConfig,
  loadWebConfig
} from '../packages/config/dist/index.js';

test('server configuration has safe development defaults', () => {
  const config = loadServerConfig({});
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 3000);
  assert.equal(config.logLevel, 'info');
  assert.deepEqual(config.webOrigins, ['http://localhost:5173']);
  assert.equal(config.database.url, DEVELOPMENT_DATABASE_URL);
  assert.equal(config.storage.provider, 's3');
  assert.equal(config.storage.endpoint, 'http://localhost:9000');
  assert.equal(config.storage.bucket, 'construction-erp');
  assert.equal(config.storage.maxSignedUrlTtlSeconds, 300);
  assert.equal(config.authActionPublicUrl, 'http://localhost:5173');
  assert.equal(config.authNotificationWebhookUrl, null);
  assert.equal(config.authNotificationWebhookToken, null);
});

test('server configuration rejects an invalid API port', () => {
  assert.throws(
    () => loadServerConfig({ API_PORT: '70000' }),
    (error) => error instanceof ConfigurationError && error.issues.some((issue) => issue.key === 'API_PORT')
  );
});

test('production server configuration requires public URL, web origin and database URL', () => {
  assert.throws(
    () => loadServerConfig({ NODE_ENV: 'production' }),
    (error) => {
      if (!(error instanceof ConfigurationError)) return false;
      const keys = new Set(error.issues.map((issue) => issue.key));
      return keys.has('API_PUBLIC_URL')
        && keys.has('WEB_ORIGINS')
        && keys.has('DATABASE_URL')
        && keys.has('STORAGE_BUCKET')
        && keys.has('AUTH_ACTION_TOKEN_SECRET');
    }
  );
});

test('production server configuration parses explicit values', () => {
  const databaseUrl = 'postgresql://erp:secret@db.internal:5432/erp?schema=public';
  const config = loadServerConfig({
    NODE_ENV: 'production',
    API_PUBLIC_URL: 'https://erp.example.com/',
    WEB_ORIGINS: 'https://erp.example.com, https://admin.example.com',
    API_PORT: '8080',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl,
    STORAGE_BUCKET: 'construction-erp-prod',
    STORAGE_REGION: 'us-east-1',
    AUTH_ACTION_TOKEN_SECRET: 'production-auth-action-secret-0123456789abcdef',
    AUTH_ACTION_PUBLIC_URL: 'https://erp.example.com/auth',
    AUTH_NOTIFICATION_WEBHOOK_URL: 'https://notifications.example.com/auth',
    AUTH_NOTIFICATION_WEBHOOK_TOKEN: 'production-notification-token'
  });

  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.publicUrl, 'https://erp.example.com');
  assert.equal(config.port, 8080);
  assert.equal(config.logLevel, 'warn');
  assert.deepEqual(config.webOrigins, ['https://erp.example.com', 'https://admin.example.com']);
  assert.equal(config.database.url, databaseUrl);
  assert.equal(config.storage.bucket, 'construction-erp-prod');
  assert.equal(config.storage.endpoint, null);
  assert.equal(config.authActionTokenSecret, 'production-auth-action-secret-0123456789abcdef');
  assert.equal(config.authActionPublicUrl, 'https://erp.example.com/auth');
  assert.equal(config.authNotificationWebhookUrl, 'https://notifications.example.com/auth');
  assert.equal(config.authNotificationWebhookToken, 'production-notification-token');
});

test('removed approval and RFQ policy environment keys are ignored by the final server config', () => {
  const config = loadServerConfig({
    APPROVAL_NOTIFICATION_WEBHOOK_URL: 'not-a-url',
    TENDER_ESTIMATE_APPROVAL_DEFINITION_CODE: 'legacy',
    BUDGET_APPROVAL_DEFINITION_CODE: 'legacy',
    PROCUREMENT_REQUISITION_APPROVAL_DEFINITION_CODE: 'legacy',
    PROCUREMENT_REQUIRE_RATIONALE_FOR_NON_LOWEST_SELECTION: 'yes',
    PURCHASE_ORDER_APPROVAL_DEFINITION_CODE: 'legacy',
    SUBCONTRACT_APPROVAL_DEFINITION_CODE: 'legacy',
    EQUIPMENT_USAGE_APPROVAL_DEFINITION_CODE: 'legacy',
    TIMESHEET_APPROVAL_DEFINITION_CODE: 'legacy',
    PAYROLL_APPROVAL_DEFINITION_CODE: 'legacy',
    CHANGE_REQUEST_APPROVAL_DEFINITION_CODE: 'legacy'
  });

  for (const key of [
    'approvalNotificationWebhookUrl',
    'tenderEstimateApprovalDefinitionCode',
    'budgetApprovalDefinitionCode',
    'procurementRequisitionApprovalDefinitionCode',
    'procurementRequireRationaleForNonLowestSelection',
    'purchaseOrderApprovalDefinitionCode',
    'subcontractApprovalDefinitionCode',
    'equipmentUsageApprovalDefinitionCode',
    'timesheetApprovalDefinitionCode',
    'payrollApprovalDefinitionCode',
    'changeRequestApprovalDefinitionCode'
  ]) {
    assert.equal(Object.hasOwn(config, key), false);
  }
});

test('database URL must use PostgreSQL protocol without echoing secret values', () => {
  const secret = 'mysql://root:super-secret@localhost/erp';
  assert.throws(
    () => loadServerConfig({ DATABASE_URL: secret }),
    (error) => {
      if (!(error instanceof ConfigurationError)) return false;
      assert.equal(error.message.includes('super-secret'), false);
      return error.issues.some((issue) => issue.key === 'DATABASE_URL' && issue.received === undefined);
    }
  );
});

test('auth action signing secret is server-only and never echoed in validation errors', () => {
  const secret = 'short-secret';
  assert.throws(
    () => loadServerConfig({ AUTH_ACTION_TOKEN_SECRET: secret }),
    (error) => {
      if (!(error instanceof ConfigurationError)) return false;
      assert.equal(error.message.includes(secret), false);
      return error.issues.some((issue) => issue.key === 'AUTH_ACTION_TOKEN_SECRET' && issue.received === undefined);
    }
  );
});

test('web configuration exposes only its explicit public allow-list', () => {
  const config = loadWebConfig({
    MODE: 'development',
    VITE_APP_NAME: 'ERP Dev',
    VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
    DATABASE_URL: 'postgres://must-not-leak',
    SOME_SECRET: 'must-not-leak'
  });

  assert.deepEqual(Object.keys(config).sort(), ['apiBaseUrl', 'appName', 'mode']);
  assert.equal(config.appName, 'ERP Dev');
  assert.equal('DATABASE_URL' in config, false);
  assert.equal('SOME_SECRET' in config, false);
});

test('web configuration rejects invalid API URL', () => {
  assert.throws(
    () => loadWebConfig({ VITE_API_BASE_URL: 'not-a-url' }),
    ConfigurationError
  );
});
