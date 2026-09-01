import path from 'node:path';
import process from 'node:process';
import { run, rootDir, validateTestDatabaseEnvironment } from './lib.mjs';

const currentIntegrationTests = [
  'foundation-database.integration.test.mjs',
  'final-21-site-expenses-api.integration.test.mjs',
  'final-21-supplier-payables-api.integration.test.mjs',
  'final-21-client-billing-api.integration.test.mjs',
  'final-21-client-receipts-api.integration.test.mjs',
  'final-21-project-profitability-api.integration.test.mjs',
  'final-21-reports-api.integration.test.mjs',
  'final-21-dashboard-api.integration.test.mjs'
];

validateTestDatabaseEnvironment();
if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 to execute live current-schema integration tests.');
}

const files = currentIntegrationTests.map((name) => path.join('tests', 'integration', name));
console.log(`Running ${files.length} current integration test file(s). Legacy module integration tests are historical only.`);
await run('node', ['--test', '--test-concurrency=1', ...files], { cwd: rootDir, env: process.env });
