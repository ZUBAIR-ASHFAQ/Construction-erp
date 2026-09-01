import path from 'node:path';
import process from 'node:process';
import { assertFile, readJson, run, safeBackupDirectory, sha256File } from './lib.mjs';

const directory = safeBackupDirectory(process.env.RECOVERY_POSTGRES_BACKUP_DIR ?? process.argv[2] ?? '');
const manifest = await readJson(path.join(directory, 'manifest.json'));
if (manifest.kind !== 'construction-erp-postgres-backup' || manifest.formatVersion !== 1) throw new Error('Unsupported PostgreSQL recovery manifest.');
const dumpPath = path.join(directory, manifest.file);
const info = await assertFile(dumpPath);
if (info.size !== manifest.sizeBytes) throw new Error('PostgreSQL backup size does not match its manifest.');
if (await sha256File(dumpPath) !== manifest.sha256) throw new Error('PostgreSQL backup checksum verification failed.');
const pgRestore = process.env.PG_RESTORE_BIN?.trim() || 'pg_restore';
const result = await run(pgRestore, ['--list', dumpPath], { capture: true });
if (!result.stdout.trim()) throw new Error('pg_restore did not recognize any archive entries.');
console.log(`PostgreSQL backup verified (${result.stdout.trim().split(/\r?\n/).length} archive-list lines).`);
