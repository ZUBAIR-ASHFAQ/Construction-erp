# Prisma migrations — dependency-gated migration policy

The corrected execution contract requires every generation gate to be proven against:

1. a clean database; and
2. the immediately previous supported schema.

## Current migration inventory

- `20260822000100_foundation_company_master` — creates the canonical Foundation-owned `companies` table.
- `20260822000200_foundation_audit_infrastructure` — creates `audit_logs` with company ownership, request/actor/project-scope correlation and before/after snapshots.
- `20260822000300_foundation_transactional_outbox` — creates durable `outbox_events` with stable envelope metadata and retry-safe worker lease state.
- `20260822000400_foundation_idempotency_infrastructure` — creates company-scoped `idempotency_records` for request fingerprints, concurrent duplicate protection and replay of successful command results.
- `20260822000500_foundation_number_sequence_infrastructure` — creates company-scoped `number_sequences` for concurrency-safe transaction-bound business-number allocation.
- `20260822000600_foundation_queue_infrastructure` — creates durable `queue_jobs` with leases, retries, dead-letter handling and diagnostics.
- `20260822000700_foundation_initial_provisioning` — creates non-secret `company_configurations` plus durable `initial_bootstrap_runs` for idempotent company/sequence provisioning and the deferred Module 24A identity handoff.
- `20260822000800_module_24a_users_rbac_core` — Stage 1 / Pass 23 creates Users/RBAC Core persistence, enforces company-only role assignment scope, and introduces the deferred user references now that `users` exists.
- `20260822001100_module_18_document_management_core` — Stage 2 / Pass 47 creates company-scoped document folders, metadata, immutable versions and document links.
- `20260822001200_module_18_upload_intents` — Stage 2 / Pass 50 adds short-lived server-owned upload intent metadata for direct object-storage uploads.
- `20260823000400_module_5_project_management_core` — Stage 7 / Pass 138 creates the company-owned Project master and lifecycle history while deferring `project_members` and project-scoped authorization to Module 24B.
- `20260825000500_module_14b_payroll_persistence_core` — Stage 20 / Pass 309 adds the reviewed Module 14B Payroll persistence boundary: effective-dated compensation, Payroll/Payslip snapshots, blocking calculation evidence and direct approved Timesheet Entry source consumption.
- `20260826000100_module_21_project_scheduling_core` — Stage 21 / Pass 323 adds exactly the five reviewed Project Scheduling tables with one current Schedule per Project, optional same-Project WBS links, cycle-free first-scope FS dependencies, immutable baseline snapshots and append-only progress evidence.
- `20260830000400_final21_client_billing_cross_module_reconciliation` — Stage 52 / B17.8 restores Final-21 Client Billing owner-chain integrity with fail-closed Client/Project/Claim preflight and forward-only triggers; Stage billing, Documents and Finance remain owned by their source modules.

Stage 0 deliberately avoided Users/RBAC and Project Management foreign keys because those owners did not yet exist. Stage 1 now introduces Users/RBAC references while continuing to forbid Project Management foreign keys until the later owning gate.

## Repository policy

- Migration directories use `YYYYMMDDHHMMSS_snake_case` names.
- Every committed migration is assigned exactly once in `../migration-gates.json`.
- Applied/reviewed migration SQL is immutable. SHA-256 locks live in `../migration-checksums.json`.
- If a reviewed migration needs a correction after it has become part of supported history, create a new forward migration; do not rewrite old SQL.
- Deferred foreign keys are introduced only in the gate where both tables exist.
- The live verifier is destructive and may run only against an explicitly named migration-test database.

## Static verification

```bash
pnpm db:migrations:check
```

This requires only Node.js. It verifies migration naming/order, gate ownership, SQL presence and locked checksums.

## Live migration-gate verification

Start PostgreSQL, create the disposable database described in `.env.migration.example`, then run:

```bash
pnpm db:migrations:verify
```

The verifier performs:

- **clean** — resets `public`, then applies all migrations from zero;
- **previous** — reconstructs all gates before the latest gate, then applies the latest gate and checks Prisma migration status.

Individual paths:

```bash
pnpm db:migrations:verify:clean
pnpm db:migrations:verify:previous
```

Never point these commands at development, staging or production data.

## Adding a reviewed migration

1. Create/review the Prisma migration.
2. Add it to exactly one gate in `migration-gates.json`.
3. Run `pnpm db:migrations:checksums:update` and review the checksum diff.
4. Run `pnpm db:migrations:check`.
5. Run both live migration verification paths against the disposable PostgreSQL migration-test database.
