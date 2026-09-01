# Stage 3 Pass 3.3 - Roles and Permissions

## Scope

This pass aligns Roles and Permissions with final Module 2 Administration while keeping temporary compatibility with the legacy Module 24A access model.

## Implemented

- Added final Administration permission codes for user and role administration.
- Added temporary legacy/final permission aliases so existing administrators keep access during the refactor.
- Added final routes:
  - `GET /api/v1/admin/roles`
  - `POST /api/v1/admin/roles`
  - `PUT /api/v1/admin/roles/:id/permissions`
  - `PUT /api/v1/admin/users/:id/roles`
- Final user-role replacement changes company-level roles only. Project scope remains separate for Pass 3.4.
- Kept server-side privilege-escalation checks for permission and role assignment.
- Added a forward migration that creates final Administration permission rows and maps existing legacy grants to their final aliases.
- Updated the React role editor to use the final Administration role endpoints while preserving unrelated module permissions.
- Legacy role routes remain temporarily available for unmigrated code.

## Validation

- Pass 3.3 focused tests: 7 passed, 0 failed.
- Full static suite: 3033 passed, 0 failed, 87 skipped.
- Foundation static gate: 8 passed, 0 failed.
- Module 24A compatibility gate: 47 passed, 0 failed.
- Migration policy: 56 migrations locked across 56 gates.
- Workspace validation: passed.
- Full TypeScript verification remains blocked by the previously recorded missing workspace dependencies/generated types.
- Live database/API verification remains blocked until a disposable PostgreSQL test environment is available.

## Deferred to Pass 3.4

- Dedicated final `user_project_scopes` persistence and API behavior.
- Removal of Project scope from the legacy `UserRoleAssignment` model.
- Final Project-scope UI replacement.
