# Stage 1 — Module 24A Users/RBAC Core Contract

Status: **Implemented; static acceptance passes and final dependency-backed acceptance remains pending.**

Module 24A is the company-scope identity and authorization gate. It remains part of Module 24 and does not create another business module. Foundation is its only hard prerequisite. Project membership remains deferred to Module 24B after Module 5 Project Management exists.

## Scope

Module 24A owns:

- users and user lifecycle;
- password credentials;
- access/refresh sessions and revocation;
- roles and stable permission codes;
- role-permission mappings;
- company-scoped user-role assignments;
- effective permission resolution;
- company-scoped authorization;
- Foundation bootstrap identity completion;
- trusted request context containing actor, company and effective permissions.

Before 24B, request context must keep:

```ts
projectScope: { kind: 'not-resolved' }
```

Module 24A must not create a Project model, project foreign key, validated project membership or project-scoped role assignment.

## Persistence

Module 24A owns:

```text
users
auth_credentials
auth_sessions
roles
permissions
role_permissions
user_role_assignments
```

Every `company_id` resolves to Foundation `companies`. `user_role_assignments` is company-only in 24A; project scope is rejected with `INVALID_SCOPE_ASSIGNMENT`.

## HTTP contract

The approved 13 core Module 24 routes are preserved:

```text
POST  /api/v1/auth/sign-in
POST  /api/v1/auth/refresh
POST  /api/v1/auth/sign-out
GET   /api/v1/auth/me
GET   /api/v1/users
POST  /api/v1/users
PATCH /api/v1/users/:id
POST  /api/v1/users/:id/activate
POST  /api/v1/users/:id/deactivate
GET   /api/v1/roles
POST  /api/v1/roles
PUT   /api/v1/roles/:id/permissions
PUT   /api/v1/users/:id/roles
```

The same approved requirements also require invitation, password reset and recovery. Three narrow commands implement that workflow without opening generic CRUD:

```text
POST /api/v1/auth/invitations/accept
POST /api/v1/auth/password-reset/request
POST /api/v1/auth/password-reset/complete
```

No generic DELETE routes are approved.

## Stable permissions

```text
users.read
users.create
users.update
users.manage
roles.read
roles.manage
sessions.manage
```

## Stable errors

```text
AUTH_INVALID_CREDENTIALS
AUTH_SESSION_EXPIRED
USER_NOT_FOUND
DUPLICATE_USER_EMAIL
ROLE_NOT_FOUND
FORBIDDEN
INVALID_SCOPE_ASSIGNMENT
```

## Security invariants

- Never trust client-supplied company, actor, role, permission or project scope.
- Passwords use a modern password hash; plaintext passwords are never stored or logged.
- Access and refresh tokens are separate random credentials and only their hashes are persisted.
- Refresh rotates session credentials and revoked/expired credentials fail closed.
- Deactivated users cannot authenticate and their sessions are revoked.
- Administrators cannot grant permissions or assign roles beyond their own authority.
- System permission codes are stable platform contracts.
- Invitation/reset tokens are one-time, signed and never stored in plaintext.
- Invitation/reset notifications are queued durably; signed links are created only by the delivery worker and stale jobs no-op.
- Audit, outbox and logs never contain passwords, session tokens or other secret material.

## Foundation integration

The existing Foundation bootstrap orchestration calls the Module 24A identity provisioner. The provisioner idempotently creates or reconciles the initial administrator, system roles, all seven stable permissions, administrator role assignments and secure credentials, then returns `administratorUserId` and `systemRoleIdsByCode` so Foundation can complete its bootstrap record.

## Required structure

```text
apps/api/src/modules/administration/
  index.ts
  administration.repository.ts
  administration.routes.ts
  administration.schema.ts
  administration.service.ts

apps/web/src/features/administration/
  api/
  components/
  hooks/
  pages/
```

Prisma remains centralized in the database package. Authentication helpers use the existing API authentication plugin rather than adding extra Module 24A source files.

## Testing contract

Repository/service/API behavior must cover cross-company isolation, negative permission checks, session lifecycle, bootstrap permissions, privilege-escalation prevention, invitation/recovery and project-scope deferral. React/Playwright must exercise the real onboarding and administration workflow, including durable invitation/password-reset queue delivery through the authentication notification worker. Browser tests must consume the delivered signed links rather than minting their own action tokens. The final Stage 1 gate must also pass clean and previous-schema migrations before Module 18 begins.
