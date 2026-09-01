# Stage 3 - Pass 3.2: Authentication + User Management

Status: **IMPLEMENTED - STATIC VERIFIED / LIVE ENVIRONMENT BLOCKED**

## Scope implemented

- Added the final Module 2 authentication routes:
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/logout`
  - existing `GET /api/v1/auth/me` remains the current-identity route.
- Added the final Module 2 user routes:
  - `GET /api/v1/admin/users`
  - `POST /api/v1/admin/users`
  - `PATCH /api/v1/admin/users/:id`
- Updated the React API client to use the final login/logout and `/admin/users` routes.
- The final user PATCH accepts either editable profile fields or one lifecycle status (`ACTIVE` / `INACTIVE`). Profile and status changes are intentionally separate requests so existing service transactions remain clear and atomic.
- User activation still reissues onboarding when no credential exists.
- User deactivation still clears pending auth actions and revokes active sessions.
- Company ownership, actor identity, permissions and project scope remain server-derived. No user create/update request accepts `companyId`.

## Compatibility decision

Legacy `/auth/sign-in`, `/auth/sign-out`, `/users`, and user lifecycle command routes remain temporarily available because many still-unmigrated module integration tests and callers use them. The React application now uses the final Module 2 routes. Removing the aliases before dependent modules are migrated would create avoidable breakage.

## Intentionally deferred

The following belong to later Stage 3 passes and were not changed here:

- final `admin.*` permission-code naming and role ownership alignment (Pass 3.3);
- dedicated project-scope persistence and routes (Pass 3.4);
- departments and organization administration (Pass 3.5);
- Documents/Audit work (Passes 3.6-3.8).

## Verification

- Focused Pass 3.2 + legacy Module 24A static tests: **16/16 passed**.
- Full dependency-free static suite: **3113 tests, 3026 passed, 0 failed, 87 skipped**.
- Foundation static gate: **8/8 passed**.
- Legacy Module 24A static gate: **47/47 passed**.
- Workspace check: **passed**.
- Named production function purpose-comment policy: **passed** through the static suite.
- Full TypeScript typecheck: **blocked by the existing unavailable dependencies/generated Prisma types**, not by a discovered Pass 3.2 failure.

## Coding standard

This pass keeps business logic in the existing service, adds no new module/folder/abstraction, and uses short purpose comments for added behavior. The changes are deliberately small so a junior developer can follow the request path from route -> existing service -> repository.
