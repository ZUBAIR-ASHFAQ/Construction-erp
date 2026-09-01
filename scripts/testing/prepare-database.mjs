import process from 'node:process';
import { databaseDir, run, validateTestDatabaseEnvironment } from './lib.mjs';

const RESET_SQL = `DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nGRANT ALL ON SCHEMA public TO CURRENT_USER;\n`;
const { databaseUrl, databaseName } = validateTestDatabaseEnvironment();
const env = { ...process.env, DATABASE_URL: databaseUrl };

console.log(`Preparing disposable Foundation test database: ${databaseName}`);
await run('pnpm', ['exec', 'prisma', 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], {
  cwd: databaseDir,
  env,
  input: RESET_SQL
});
await run('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
  cwd: databaseDir,
  env
});
await run('pnpm', ['exec', 'prisma', 'migrate', 'status', '--schema', 'prisma/schema.prisma'], {
  cwd: databaseDir,
  env
});
console.log('Disposable Foundation test database is migrated and ready.');
