# Module 22 — Approval Workflows Stage 3 Contract

## Purpose

Module 22 provides reusable approval chains for operational and financial documents. Owning business modules remain responsible for their own business-document state; Module 22 records and returns the approval decision.

The backend keeps the required five-file structure:

```text
apps/api/src/modules/approvals/
  approvals.schema.ts
  approvals.repository.ts
  approvals.service.ts
  approvals.routes.ts
  index.ts
```

## Public HTTP routes

Exactly these seven public routes are exposed:

```text
GET   /api/v1/approvals/inbox
GET   /api/v1/approvals/requests/:id
POST  /api/v1/approvals/requests/:id/actions
GET   /api/v1/approvals/definitions
POST  /api/v1/approvals/definitions
PATCH /api/v1/approvals/definitions/:id
POST  /api/v1/approvals/delegations
```

There is intentionally no public generic approval-request creation route. Owning modules create requests through the internal service boundary inside their own transaction.

## Persistence

The centralized Prisma schema contains:

- `approval_definitions`
- `approval_steps`
- `approval_requests`
- `approval_actions`
- `approval_delegations`

Project-aware approvers remain deferred until Project Management and Module 24B exist.

## Definitions and activation

Definitions are versioned. In-progress requests snapshot the definition version and immutable request payload.

Before a definition becomes `ACTIVE`, the service verifies:

- steps exist and remain sequential;
- condition data uses the allow-listed format;
- USER references resolve to active company users;
- ROLE references resolve to valid visible roles;
- a ROLE has enough active users for `minApprovals`;
- USER steps require exactly one approval.

Draft definitions may remain incomplete while being authored. Activation is the point where operational validity is required.

## Safe conditions

Condition data is never executable code. Only the approved operators are supported:

```text
eq
neq
gt
gte
lt
lte
in
```

No stored JavaScript, SQL or expression language is evaluated.

## Transaction-aware request creation

Future business modules use:

```text
requestApprovalInTransaction(tx, input)
```

This lets the owning document transition, approval request, audit and outbox records commit or roll back together.

Each owner command supplies a stable source key. The database enforces one approval request per `(company_id, source_key)`, making retries replay-safe instead of creating duplicate workflows.

## Approver resolution

Current approver types are:

```text
USER
ROLE
```

The service resolves active users in company scope. Project-aware resolution is intentionally deferred.

## Delegation identity

Every action records both:

```text
actor_user_id
represented_approver_user_id
```

A direct action uses the same user for both fields. A delegated action stores the delegate as actor and the original approval authority as represented approver.

The database unique constraint on request + step + represented approver prevents the same approval authority from being counted twice.

## Actions and state transitions

Actions are append-only:

```text
APPROVE
REJECT
RETURN
```

Terminal/expired requests reject further actions. Approval commands use Foundation idempotency so safe retries do not append duplicate decisions.

## Reminder, escalation and expiry timing

An approval step may optionally configure:

```text
reminderAfterMinutes
escalateAfterMinutes
expireAfterMinutes
```

Configured values are bounded and ordered:

```text
reminder < escalation < expiry
```

The durable Foundation queue runs:

```text
approval.reminder
approval.escalation
approval.expire
approval.expired-notification
```

Every worker job re-reads the request and checks that it is still `PENDING` on the same step. Stale jobs safely do nothing.

The requirements do not define authority reassignment during escalation, so escalation is a notification only and does not change approval rights.

The requirements mention expiry without defining a terminal state. The reviewed implementation amendment uses:

```text
status = EXPIRED
event  = approval.expired
```

Expiry is committed independently from notification delivery.

## Events

Durable events include:

```text
approval.requested
approval.step_approved
approval.rejected
approval.returned
approval.completed
approval.expired
```

Sensitive writes use Foundation audit/outbox behavior in the same transaction as the approval change.

## Permissions

Stable permissions are:

```text
approvals.inbox.read
approvals.act
approval_definitions.read
approval_definitions.manage
approval_delegations.manage
```

Route checks are revalidated by service/resource policy.

## React feature

```text
apps/web/src/features/approvals/
  api/
  hooks/
  components/
  pages/
```

The UI includes the approval inbox, request timeline, approve/reject/return dialog, definition administration and delegation management. TanStack Query owns server state; forms use React Hook Form + Zod.

## Verification

Static gate:

```bash
npm run module-22:gate
```

Live acceptance:

```bash
npm run module-22:acceptance:live
```

The live gate requires accepted Stage-2 evidence. Acceptance is valid only when `module-22-evidence/stage-3-live.json` reports the accepted Stage-3 status produced by the gate.
