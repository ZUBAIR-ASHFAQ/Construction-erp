# Stage 3 Pass 3.5 - Departments

## Scope

This pass aligns the explicit final Module 2 Department contract only. It does not move Finance-owned bank/cash data into Administration and does not invent an Organization Profile HTTP contract that is absent from the final route list.

## Implemented

- Added company-owned `Department` persistence with `id`, `company_id`, `name`, `status`, and timestamps.
- Added `admin.departments.manage` and preserved existing administrators that already hold legacy `users.manage`.
- Added bounded `GET /api/v1/admin/departments`.
- Added validated `POST /api/v1/admin/departments`.
- Department company ownership is derived from authenticated request context, never request input.
- Department creation is audited as a privileged Administration write.
- Bank/cash account ownership remains in Finance.

## Organization profile decision

The Company master already owns legal/display name, status, base currency, time zone, locale, fiscal settings, and timestamps. Repair Pass R6 resolves the earlier contract gap with only `GET/PATCH /api/v1/admin/organization-profile`. The surface reads the trusted Foundation Company row, permits edits only to legal/display name, time zone, and locale, reuses `admin.users.read`/`admin.users.manage`, and keeps status, base currency, and fiscal settings read-only so Administration does not become generic Company or Finance configuration CRUD.

## Verification

- Focused Pass 3.5 tests: PASS (7/7)
- Static suite: PASS (3046 passed, 0 failed, 87 skipped)
- Foundation static gate: PASS
- Module 24A compatibility gate: PASS (47/47)
- Migration policy: PASS (58/58 locked)
- Workspace check: PASS
- Function-purpose comment policy: PASS through the static suite
- TypeScript full typecheck: BLOCKED by unavailable workspace dependencies/generated package types
- Prisma validation: BLOCKED because Prisma CLI is unavailable in this environment
- Live database migration/integration proof: BLOCKED because no disposable PostgreSQL environment is available
