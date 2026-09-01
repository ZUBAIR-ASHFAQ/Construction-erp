# @construction-erp/database

Centralized PostgreSQL/Prisma infrastructure for the Construction ERP modular monolith.

## Centralized persistence implemented so far

- one centralized Prisma schema and Prisma Client
- PostgreSQL datasource via `DATABASE_URL`
- transaction helper and API connection lifecycle
- canonical Foundation `Company` model / `companies` table
- Foundation `AuditLog` model / `audit_logs` table
- Foundation `OutboxEvent` model / `outbox_events` table
- Foundation `IdempotencyRecord` model / `idempotency_records` table
- Foundation `NumberSequence` model / `number_sequences` table
- Foundation `QueueJob` model / `queue_jobs` table
- Foundation `CompanyConfiguration` model / `company_configurations` table
- Foundation `InitialBootstrapRun` model / `initial_bootstrap_runs` table
- Administration `User`, `AuthSession`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Department`, and `UserProjectScope` models
- Stage-1 deferred user references from Foundation audit/outbox/queue/bootstrap records
- committed migration history
- migration gate manifest and immutable SHA-256 migration locks
- clean-database and previous-supported-schema verification tooling

Foundation audit, outbox, idempotency, numbering, queue and provisioning tables use the canonical company FK because the company master exists. Pass 23 is the first gate where the Administration `users` table exists, so the previously deferred actor/administrator user references are introduced here. Project Management foreign keys remain prohibited until their owning gate exists.

## Prisma commands

Run from the repository root:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate:dev -- --name <migration_name>
pnpm db:migrate:deploy
```

## Migration policy commands

```bash
pnpm db:migrations:check
pnpm db:migrations:verify
pnpm db:migrations:verify:clean
pnpm db:migrations:verify:previous
```

The live verifier is destructive and requires `MIGRATION_TEST_DATABASE_URL` plus the explicit confirmation token documented in `.env.migration.example`.

Do not add business-module-specific Prisma clients or databases. Future module tables are added to this centralized schema and migration history only at their approved dependency gate.
