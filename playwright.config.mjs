import { defineConfig } from '@playwright/test';

const webUrl = 'http://127.0.0.1:5173';
const apiUrl = 'http://127.0.0.1:3000';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const authActionTokenSecret = process.env.AUTH_ACTION_TOKEN_SECRET ?? 'test-only-auth-action-secret-0123456789abcdef';
const runSiteExpenses = process.env.RUN_FINAL_21_SITE_EXPENSES_E2E === '1';
const runSupplierPayables = process.env.RUN_FINAL_21_SUPPLIER_PAYABLES_E2E === '1';
const runClientBilling = process.env.RUN_FINAL_21_CLIENT_BILLING_E2E === '1';
const runClientReceipts = process.env.RUN_FINAL_21_CLIENT_RECEIPTS_E2E === '1';
const runProjectProfitability = process.env.RUN_FINAL_21_PROJECT_PROFITABILITY_E2E === '1';
const runReports = process.env.RUN_FINAL_21_REPORTS_E2E === '1';
const runDashboard = process.env.RUN_FINAL_21_DASHBOARD_E2E === '1';
const enabledWorkflowCount = [runSiteExpenses, runSupplierPayables, runClientBilling, runClientReceipts, runProjectProfitability, runReports, runDashboard].filter(Boolean).length;

if (enabledWorkflowCount !== 1) {
  throw new Error('Set exactly one current Final-21 E2E flag: RUN_FINAL_21_SITE_EXPENSES_E2E=1, RUN_FINAL_21_SUPPLIER_PAYABLES_E2E=1, RUN_FINAL_21_CLIENT_BILLING_E2E=1, RUN_FINAL_21_CLIENT_RECEIPTS_E2E=1, RUN_FINAL_21_PROJECT_PROFITABILITY_E2E=1, RUN_FINAL_21_REPORTS_E2E=1, or RUN_FINAL_21_DASHBOARD_E2E=1.');
}

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for the browser workflow.');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: runSiteExpenses
    ? 'final-21-site-expenses-browser.spec.mjs'
    : runSupplierPayables
      ? 'final-21-supplier-payables-browser.spec.mjs'
      : runClientBilling
        ? 'final-21-client-billing-browser.spec.mjs'
        : runClientReceipts
          ? 'final-21-client-receipts-browser.spec.mjs'
          : runProjectProfitability
            ? 'final-21-project-profitability-browser.spec.mjs'
            : runReports
              ? 'final-21-reports-browser.spec.mjs'
              : 'final-21-dashboard-browser.spec.mjs',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: webUrl
  },
  webServer: [
    {
      command: 'pnpm --filter @construction-erp/api start',
      url: `${apiUrl}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        API_HOST: '127.0.0.1',
        API_PORT: '3000',
        WEB_ORIGINS: webUrl,
        AUTH_ACTION_TOKEN_SECRET: authActionTokenSecret
      }
    },
    {
      command: 'pnpm --filter @construction-erp/web dev --host 127.0.0.1 --port 5173 --strictPort',
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_BASE_URL: `${apiUrl}/api/v1`
      }
    }
  ]
});
