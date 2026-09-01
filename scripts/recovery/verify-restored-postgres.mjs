import process from 'node:process';
import { parsePostgresConnection, postgresProcessEnv, requiredEnv, run } from './lib.mjs';
const target = parsePostgresConnection(requiredEnv('RESTORE_DATABASE_URL'), 'RESTORE_DATABASE_URL');
const psql = process.env.PSQL_BIN?.trim() || 'psql';
const sql = `SELECT CASE WHEN to_regclass('public.companies') IS NULL THEN 0 ELSE 1 END AS companies_table, CASE WHEN to_regclass('public.audit_logs') IS NULL THEN 0 ELSE 1 END AS audit_table, CASE WHEN to_regclass('public.outbox_events') IS NULL THEN 0 ELSE 1 END AS outbox_table;`;
const result = await run(psql, ['--no-psqlrc', '--tuples-only', '--no-align', '--command', sql], { env: postgresProcessEnv(target), capture: true });
const values = result.stdout.trim().split('|').map((value) => value.trim());
if (values.length !== 3 || values.some((value) => value !== '1')) throw new Error('Restored PostgreSQL Foundation tables failed verification.');
console.log(`Restored PostgreSQL database ${target.database} passed Foundation table verification.`);
