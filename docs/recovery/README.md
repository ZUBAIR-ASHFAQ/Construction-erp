# Foundation disaster recovery runbook

Foundation requires both PostgreSQL and S3-compatible object storage to be backed up **and restore-tested**. A backup is not accepted merely because a file exists.

## Backup

Use a secure host with `pg_dump`/`pg_restore` installed and the workspace dependencies installed.

```bash
npm run recovery:backup:postgres
npm run recovery:backup:storage
```

Each backup receives a manifest with size/checksum evidence. Object blobs are stored under SHA-256-derived local filenames so an object key can never escape the backup directory.

## Offline verification

```bash
RECOVERY_POSTGRES_BACKUP_DIR=... npm run recovery:verify:postgres
RECOVERY_STORAGE_BACKUP_DIR=... npm run recovery:verify:storage
```

PostgreSQL verification checks the dump checksum and asks `pg_restore --list` to parse the archive. Object-storage verification hashes every local object and compares it to the manifest.

## Restore drill

Routine drills must target a disposable recovery database and a separate recovery bucket. Set the explicit destructive confirmations from `.env.recovery.example`, then run:

```bash
npm run recovery:drill
```

The drill verifies the source backups, restores PostgreSQL, verifies core Foundation tables, restores every object, then downloads and hashes every restored object. A successful exit is the evidence required by the Foundation acceptance gate.

## Production recovery

Production restore is intentionally refused by default. An approved incident runbook may set `RECOVERY_ALLOW_PRODUCTION_RESTORE=1`. Restoring to the original source bucket also requires `RECOVERY_ALLOW_SOURCE_BUCKET_RESTORE=1`. These flags are deliberately separate from `RESTORE_CONFIRM` to reduce accidental destructive execution.

## Security

Backups contain ERP data and must be treated as production-sensitive data. Encrypt backup media at rest, restrict access, keep backup credentials outside the repository, use retention/rotation appropriate to the deployment, and never attach backup data or credentials to application logs. The scripts never print database passwords or storage secrets.

## Recovery acceptance evidence

For each drill retain operational evidence outside the application database: backup ID/time, PostgreSQL manifest SHA-256, object manifest, drill start/end time, restore target identifiers, successful verification output, operator/change ticket, and any remediation. Do not store secrets in the evidence record.
