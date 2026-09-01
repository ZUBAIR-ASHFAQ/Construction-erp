import path from 'node:path';
import process from 'node:process';
import { assertRestoreTarget, parsePostgresConnection, postgresProcessEnv, readJson, requiredEnv, run, safeBackupDirectory, sha256File, assertFile } from './lib.mjs';

const directory = safeBackupDirectory(process.env.RECOVERY_POSTGRES_BACKUP_DIR ?? process.argv[2] ?? '');
const manifest = await readJson(path.join(directory, 'manifest.json'));
if (manifest.kind !== 'construction-erp-postgres-backup' || manifest.formatVersion !== 1) throw new Error('Unsupported PostgreSQL recovery manifest.');
const dumpPath = path.join(directory, manifest.file);
await assertFile(dumpPath);
if (await sha256File(dumpPath) !== manifest.sha256) throw new Error('Refusing restore because the PostgreSQL backup checksum is invalid.');
const target = parsePostgresConnection(requiredEnv('RESTORE_DATABASE_URL'), 'RESTORE_DATABASE_URL');
assertRestoreTarget(target);
const pgRestore = process.env.PG_RESTORE_BIN?.trim() || 'pg_restore';
console.log(`Restoring backup ${manifest.backupId} into database ${target.database}.`);
await run(pgRestore, [
  '--clean', '--if-exists', '--exit-on-error', '--no-owner', '--no-acl',
  '--dbname', target.database,
  dumpPath
], { env: postgresProcessEnv(target) });
console.log('PostgreSQL restore completed. Run the recovery drill verification before declaring recovery successful.');
