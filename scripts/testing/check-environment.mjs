import { validateTestDatabaseEnvironment } from './lib.mjs';
const result = validateTestDatabaseEnvironment();
console.log(`Foundation test database safety check passed for: ${result.databaseName}`);
