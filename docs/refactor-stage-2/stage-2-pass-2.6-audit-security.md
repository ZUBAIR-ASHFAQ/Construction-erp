# Stage 2 - Pass 2.6 Audit + Security

Status: COMPLETE for source/static hardening. Dependency-backed Prisma/typecheck and live PostgreSQL proof remain blocked by the Stage-0 environment limits.

## What was checked from code

- Read the shared audit record writer, sanitizer, types and Prisma `AuditLog` model.
- Traced audit writes across current API services/workers.
- Verified audit writes use the caller's Prisma transaction and trusted request/security context.
- Verified company, actor, request/correlation ID and project scope are server-derived.
- Read the original audit migration and later actor FK migration.
- Searched for audit-log read/update/delete usage in current application code.
- Verified before/after sanitization already removes common credentials, exception details and binary values.

## Real gaps found and fixed

1. Database append-only enforcement
   - `audit_logs` was intended to be append-only, but PostgreSQL did not prevent UPDATE or DELETE by a privileged application path.
   - Added one forward migration with a small trigger function that rejects every UPDATE/DELETE on `audit_logs`.
   - No historical migration was edited.

2. Additional sensitive-key aliases
   - Audit snapshots did not explicitly cover access/signing/encryption keys, authorization/bearer/JWT fields, signed URLs or storage keys.
   - Expanded the existing sanitizer deny-list instead of adding a new abstraction.

## Deliberately deferred

- Final `/api/v1/audit-logs` search/read surface belongs to the Documents & Audit module alignment pass.
- Explicit final `project_id` / `stage_id` audit columns belong to the Project Stages + Documents/Audit contract alignment. Foundation continues to preserve trusted project-scope snapshots until then.

## Validation

- Focused Pass 2.6 + audit + migration tests: 18 passed, 0 failed.
- `npm run check:workspace`: PASS.
- `npm run test:static`: 3,018 passed, 0 failed, 87 skipped.
- Global named-production-function purpose-comment rule: PASS inside the static suite.
- `npm run foundation:gate`: PASS, 8/8.
- `npm run typecheck`: BLOCKED by missing workspace dependencies/types already recorded in Stage 0.4.
- `npm run db:validate`: BLOCKED because Prisma CLI is not installed in this environment.
- Live PostgreSQL proof that UPDATE/DELETE is rejected: BLOCKED until the real/disposable database environment is available.

## Pass 2.6 exit decision

Foundation audit history is now database-enforced append-only at the migration contract level, while audit snapshots have stronger credential redaction. No business module, route, UI or unnecessary abstraction was added.
