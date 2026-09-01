import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';

const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const lib = await readFile('scripts/recovery/lib.mjs', 'utf8');
const pgBackup = await readFile('scripts/recovery/backup-postgres.mjs', 'utf8');
const pgRestore = await readFile('scripts/recovery/restore-postgres.mjs', 'utf8');
const storageBackup = await readFile('scripts/recovery/backup-object-storage.mjs', 'utf8');
const storageRestore = await readFile('scripts/recovery/restore-object-storage.mjs', 'utf8');
const storageVerify = await readFile('scripts/recovery/verify-restored-object-storage.mjs', 'utf8');
const drill = await readFile('scripts/recovery/run-drill.mjs', 'utf8');
const runbook = await readFile('docs/recovery/README.md', 'utf8');

test('Pass 20 exposes guarded PostgreSQL and object-storage recovery tooling', async () => {
  assert.equal(rootPackage.version, '0.38.0');
  for (const file of [
    '.env.recovery.example',
    'scripts/recovery/backup-postgres.mjs',
    'scripts/recovery/restore-postgres.mjs',
    'scripts/recovery/backup-object-storage.mjs',
    'scripts/recovery/restore-object-storage.mjs',
    'scripts/recovery/run-drill.mjs',
    'docs/recovery/README.md'
  ]) await access(file);
});

test('PostgreSQL backups use pg_dump custom archives and checksums without putting URL on command line', () => {
  assert.match(pgBackup, /--format=custom/);
  assert.match(pgBackup, /sha256File/);
  assert.match(pgBackup, /postgresProcessEnv/);
  assert.doesNotMatch(pgBackup, /--dbname.*DATABASE_URL/);
});

test('destructive database restore requires explicit confirmation and defaults to disposable targets', () => {
  assert.match(lib, /RESTORE_CONSTRUCTION_ERP_DATA/);
  assert.match(lib, /RECOVERY_ALLOW_PRODUCTION_RESTORE/);
  assert.match(lib, /DISPOSABLE_DATABASE_PATTERN/);
  assert.match(pgRestore, /--clean/);
  assert.match(pgRestore, /--if-exists/);
  assert.match(pgRestore, /--exit-on-error/);
});

test('object backup uses opaque local file names and per-object SHA-256', () => {
  assert.match(storageBackup, /objectBackupFileName/);
  assert.match(storageBackup, /streamBodyToFile/);
  assert.match(storageBackup, /sha256/);
  assert.doesNotMatch(storageBackup, /path\.join\(objectsDir, summary\.Key\)/);
});

test('object restore is non-overwriting by default and restored contents are fully re-hashed', () => {
  assert.match(storageRestore, /IfNoneMatch: '\*'/);
  assert.match(storageRestore, /RECOVERY_ALLOW_OBJECT_OVERWRITE/);
  assert.match(storageRestore, /RECOVERY_ALLOW_SOURCE_BUCKET_RESTORE/);
  assert.match(storageVerify, /GetObjectCommand/);
  assert.match(storageVerify, /sha256/);
});

test('recovery drill covers both persistence systems and documents restore-tested acceptance', () => {
  assert.match(drill, /verify-postgres-backup/);
  assert.match(drill, /restore-postgres/);
  assert.match(drill, /verify-restored-postgres/);
  assert.match(drill, /restore-object-storage/);
  assert.match(drill, /verify-restored-object-storage/);
  assert.match(runbook, /restore-tested/i);
  assert.match(runbook, /production restore is intentionally refused/i);
});
