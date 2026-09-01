import path from 'node:path';
import process from 'node:process';
import { assertFile, ensureDirectory, parsePostgresConnection, postgresProcessEnv, requiredEnv, run, safeBackupDirectory, sha256File, utcStamp, writeJson } from './lib.mjs';

const root = safeBackupDirectory(process.env.RECOVERY_BACKUP_DIR ?? path.resolve('backups'));
const backupId = process.env.RECOVERY_BACKUP_ID?.trim() || utcStamp();
const directory = path.join(root, backupId, 'postgres');
await ensureDirectory(directory);
const dumpPath = path.join(directory, 'database.dump');
const connection = parsePostgresConnection(requiredEnv('DATABASE_URL'));
const pgDump = process.env.PG_DUMP_BIN?.trim() || 'pg_dump';

console.log(`Creating PostgreSQL recovery backup ${backupId} for database ${connection.database}.`);
await run(pgDump, [
  '--format=custom',
  '--compress=9',
  '--no-owner',
  '--no-acl',
  '--file', dumpPath
], { env: postgresProcessEnv(connection) });
const info = await assertFile(dumpPath);
const checksum = await sha256File(dumpPath);
await writeJson(path.join(directory, 'manifest.json'), {
  formatVersion: 1,
  kind: 'construction-erp-postgres-backup',
  backupId,
  createdAt: new Date().toISOString(),
  databaseName: connection.database,
  file: 'database.dump',
  sizeBytes: info.size,
  sha256: checksum,
  format: 'pg_dump-custom',
  restoreRequires: 'pg_restore'
});
console.log(`PostgreSQL backup completed: ${directory}`);
