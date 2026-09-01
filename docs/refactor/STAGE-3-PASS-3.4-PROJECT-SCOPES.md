# Stage 3 Pass 3.4 - Project Scope Security

## Purpose

Align Administration Project access with the final 21-module contract without mixing access scope into Project membership or company role assignment.

## Implemented

- Added dedicated `user_project_scopes` persistence with same-company User and Project foreign keys.
- Added `admin.project_scopes.manage` and mapped existing `users.manage` grants forward.
- Added `PUT /api/v1/admin/users/:id/project-scopes` with a simple `{ projectIds: [] }` replacement contract.
- Made explicit active `user_project_scopes` authoritative for authenticated restricted Project scope.
- Kept `system-admin` company role as the existing all-Projects exception.
- Validated requested Projects inside the current company and inside the actor's own Project scope.
- Protected replacement from silently removing an existing Project scope that the actor cannot administer.
- Repeating the same replacement is a no-op, so scope rows and audit/outbox history do not churn.
- Added audit/outbox event `user.project_scope_changed`.
- Kept legacy `ProjectMember` and Project-scoped role-assignment data untouched for compatibility until their later final-scope refactors.

## Migration behavior

The forward migration creates `user_project_scopes` and backfills Projects represented by currently active legacy Project memberships. It does not drop or rewrite legacy membership/role tables.

## Deferred

- Project-scope UI editor belongs to the later Stage 3 frontend pass.
- Live Prisma/migration/API proof still requires installed dependencies and a disposable PostgreSQL database.

## Validation

- Focused Pass 3.4 + migration tests: 14 passed, 0 failed.
- Full dependency-free static suite: 3,039 passed, 0 failed, 87 skipped.
- Foundation static gate: 8 passed, 0 failed.
- Legacy Module 24A compatibility gate: 47 passed, 0 failed.
- Workspace structure check: passed.
- Migration policy: 57 migrations locked across 57 gates.
- Named-function purpose-comment policy: passed as part of the static suite.
- Full TypeScript typecheck is environment-blocked because workspace dependencies/generated package types are not installed.
- Prisma validation is environment-blocked because the Prisma CLI is not installed.
- Live migration/API isolation proof remains blocked until a disposable PostgreSQL test database is available.
