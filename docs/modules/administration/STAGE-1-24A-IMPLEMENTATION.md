# Module 24A — Current Implementation

## Scope

Module 24A owns company-scoped identity and authorization before Project Management exists. It provides authentication, sessions, users, roles and permissions. Project membership remains deferred to Module 24B.

The backend keeps the required five-file module structure:

```text
apps/api/src/modules/administration/
  administration.schema.ts
  administration.repository.ts
  administration.service.ts
  administration.routes.ts
  index.ts
```

## Persistence

The centralized Prisma schema owns:

- `users`
- `auth_credentials`
- `auth_sessions`
- `roles`
- `permissions`
- `role_permissions`
- `user_role_assignments`

Authentication action state for invitation/password recovery is stored without persisting raw signed bearer tokens.

## Authentication

Supported flows include:

- sign in;
- access/refresh rotation;
- sign out;
- current identity lookup;
- invitation acceptance;
- password-reset request and completion;
- session revocation after password reset/deactivation.

Passwords are hashed. Plaintext passwords, raw refresh tokens and signed invitation/reset tokens are never stored or logged.

## Asynchronous invitation and password-reset delivery

Invitation and password-reset delivery use the existing durable Foundation queue. The worker:

1. loads the current user action state;
2. verifies purpose, nonce and expiry;
3. creates the signed token only at delivery time;
4. sends the configured webhook request with the queue job ID as idempotency key;
5. safely ignores stale jobs;
6. relies on Foundation retry/dead-letter handling for delivery failures.

Worker commands:

```bash
npm run dev:auth-notifications
npm run start:auth-notifications
```

## RBAC

The server derives company and actor identity from trusted request context. The client never supplies trusted roles, permissions or company ownership.

Role permission replacement and user role assignment are service-owned transactions. System permissions cannot be tenant-deleted.

## Project scope deferral

Module 24A does not claim validated Project scope because the `projects` table does not exist yet. Project membership activation belongs to Module 24B after Module 5 Project Management is generated.

## React feature

```text
apps/web/src/features/administration/
  api/
  hooks/
  components/
  pages/
```

The feature covers sign-in/recovery, users, activation/deactivation, role editing, permission assignment and company-scope role assignment. TanStack Query owns server state; React Hook Form + Zod own forms.

## Verification

Static gate:

```bash
npm run module-24a:gate
```

Live acceptance:

```bash
npm run module-24a:acceptance:live
```

The live runner uses disposable databases and the real auth-notification worker/browser flow. Acceptance is valid only when `module-24a-evidence/stage-1-live.json` reports:

```text
STAGE_1_ACCEPTED_READY_FOR_STAGE_2
```

The evidence file must never be manually promoted. After acceptance, the next dependency-safe stage is **Module 18 - Document Management**.
