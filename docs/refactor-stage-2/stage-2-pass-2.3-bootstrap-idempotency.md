# Stage 2 - Pass 2.3 Bootstrap / Initial Provisioning

Status: COMPLETE for code hardening and static verification. Live database replay proof remains blocked by the Stage 0 environment limitations.

## Purpose

Verify the actual initial-provisioning code instead of relying on old acceptance notes. Keep the existing Foundation design where it is correct and change only a real replay-safety gap.

## What was verified from code

- `bootstrapInitialInstallation()` normalizes the reviewed input before touching the database.
- A SHA-256 fingerprint covers company data, non-secret configuration, number-sequence definitions and identity intent.
- A PostgreSQL transaction advisory lock serializes competing initial-bootstrap calls.
- The same bootstrap key with different input is rejected.
- A different bootstrap key cannot create another initial company after a company/bootstrap run exists.
- Company, company configuration, number sequences, bootstrap-run state and optional identity provisioning execute in the same database transaction.
- A pending bootstrap can be replayed later to complete identity provisioning.
- A completed bootstrap replays the existing result instead of creating another company, user or role.
- The administrator password is runtime-only and is not persisted in the bootstrap document or bootstrap-run table.
- The identity adapter reconciles roles, permissions, administrator user, credential and company-level role assignments with existing rows instead of blindly inserting duplicates.

## Real gap found and fixed

The completed bootstrap record previously accepted any persisted `systemRoleIdsByCode` object containing valid UUID strings. A corrupted or incorrectly produced completion record could therefore replay successfully even if:

- two requested role codes pointed to the same role UUID, or
- the persisted role-code set no longer matched the original reviewed bootstrap input.

Pass 2.3 now fails closed in both cases:

1. Identity provisioning must return a distinct role UUID for every requested system-role code.
2. Persisted role UUIDs must remain unique per role code.
3. A completed replay verifies that persisted role codes exactly match the role codes in the normalized bootstrap input.

No new abstraction, database table, migration or business module was added.

## Files changed

- `packages/bootstrap/src/identity.ts`
- `packages/bootstrap/src/provision.ts`
- `tests/bootstrap.test.mjs`
- this pass record

## Verification

- Focused bootstrap static tests: PASS, 11/11.
- Full static suite: PASS, 3,007 passed / 0 failed / 87 skipped.
- Foundation static gate: PASS, including 8/8 acceptance checks.
- Bootstrap TypeScript typecheck: BLOCKED by the existing missing workspace/Prisma/Node type dependencies recorded in Stage 0; no new Pass 2.3 argument/type error remains.
- Live PostgreSQL bootstrap/replay test: BLOCKED because this environment still has no usable database/dependency setup from Stage 0.

## Deferred intentionally

- Final 21-module permission catalog alignment belongs to Administration alignment, not this pass.
- Final project/PO/invoice/receipt/payment sequence definitions belong to Pass 2.7.
- Old Module 24A naming/history is not rewritten in this pass because historical migrations/evidence must not be edited casually.

## Pass 2.3 exit decision

Bootstrap orchestration is structurally idempotent and concurrency-safe, and replay proof is now stricter. No additional bootstrap production-code change is justified without live database evidence.
