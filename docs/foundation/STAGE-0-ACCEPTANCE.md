# Foundation Stage-0 acceptance gate

This gate is the transition point from Foundation to **Stage 1 — Module 24A Users/RBAC Core**. It does not create a 25th business module.

## Static gate

```bash
npm run foundation:gate
```

The static gate proves repository/workspace structure, immutable migration policy, Foundation dependency-free tests, and the explicit Stage-0 contract assertions. It writes `foundation-evidence/stage-0-static.json`.

A static pass means the source tree is **ready to attempt the live gate**. It does not prove PostgreSQL/S3 runtime recovery.

## Live gate

The live gate is intentionally explicit because it resets disposable databases and performs a destructive recovery drill:

```bash
FOUNDATION_LIVE_GATE_CONFIRM=RUN_CONSTRUCTION_ERP_FOUNDATION_LIVE_GATE \
RUN_FOUNDATION_DB_TESTS=1 \
TEST_DATABASE_CONFIRM=RESET_CONSTRUCTION_ERP_TEST_DATABASE \
RECOVERY_DRILL_CONFIRM=RUN_CONSTRUCTION_ERP_RECOVERY_DRILL \
RESTORE_CONFIRM=RESTORE_CONSTRUCTION_ERP_DATA \
npm run foundation:gate:live
```

The environment must also provide the disposable migration/test PostgreSQL URLs and recovery source/target storage settings documented in `.env.test.example`, `.env.migration.example`, and `.env.recovery.example`.

The live gate builds the workspace, verifies clean-database and previous-supported-schema migrations, runs live Foundation integration tests, and executes the PostgreSQL + object-storage restore drill. Only a successful live evidence file should be treated as deployment-level Stage-0 recovery proof.

## Identity bootstrap boundary

The corrected generation order places Users/RBAC at Stage 1, but Foundation owns the initial provisioning orchestration. Therefore the Stage-0 gate verifies the durable identity handoff contract rather than inventing Foundation-owned `users`/`roles` tables. Module 24A must supply the identity adapter and complete the same idempotent bootstrap run with the system administrator and system roles.

## Stage-0 acceptance scope

The gate checks that the source tree contains the Foundation capabilities required before protected business modules: monorepo/configuration, PostgreSQL/Prisma, canonical company master, migration discipline, request context, tenant isolation, common errors, structured logs, audit, transactional outbox, idempotency, numbering, S3-compatible storage, durable queueing, stable integration contracts, initial provisioning orchestration, testing infrastructure, operations/observability, and backup/restore tooling.

Evidence JSON deliberately excludes connection strings, credentials, access keys, tokens, request payloads, and backup contents.

## One-command live acceptance

The live Stage-0 runner reuses the reproducible baseline, backup scripts, migration verifier, integration tests and Stage-0 gate without adding another acceptance framework.

The command creates a **fresh PostgreSQL backup and a fresh object-storage backup first**, then restores those exact backups into the configured disposable recovery targets:

```bash
npm run foundation:acceptance:live
```

Before running it, load the reviewed values from `.env.migration.example`, `.env.test.example` and `.env.recovery.example`, and set these explicit destructive confirmations:

```text
FOUNDATION_LIVE_GATE_CONFIRM=RUN_CONSTRUCTION_ERP_FOUNDATION_LIVE_GATE
MIGRATION_TEST_CONFIRM=RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE
TEST_DATABASE_CONFIRM=RESET_CONSTRUCTION_ERP_TEST_DATABASE
RUN_FOUNDATION_DB_TESTS=1
RECOVERY_DRILL_CONFIRM=RUN_CONSTRUCTION_ERP_RECOVERY_DRILL
RESTORE_CONFIRM=RESTORE_CONSTRUCTION_ERP_DATA
```

The live runner generates one shared `RECOVERY_BACKUP_ID` when the operator does not provide one. The PostgreSQL and object-storage backup paths are derived from that ID automatically, so the restore drill always verifies the fresh backups created by the same run.

Do not point the migration, integration-test or recovery URLs/buckets at production. A live-runner failure means Stage 0 remains blocked; do not manually change the evidence file to `READY_FOR_STAGE_1_LIVE`.
