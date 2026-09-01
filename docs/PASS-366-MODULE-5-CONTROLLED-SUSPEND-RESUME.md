# Pass 366 — Module 5 Controlled Suspend / Resume Lifecycle

## Purpose

Close frozen repair item M5-01 without expanding Module 5 into generic lifecycle CRUD. The source workflow names `SUSPENDED` as a controlled Project state, while its original route table omitted the commands needed to enter and leave that state.

## Runtime repair

Pass 366 adds exactly two HTTP commands:

```text
POST /api/v1/projects/:id/suspend
POST /api/v1/projects/:id/resume
```

Transition and authority rules:

```text
ACTIVE -> SUSPENDED   requires projects.close
SUSPENDED -> ACTIVE   requires projects.activate
```

Each command accepts only an optional `reason` (maximum 5,000 characters). Company, actor identity, Project scope, permissions and status are server-owned.

Suspension and resumption reuse existing Module-5 repository primitives: Project write lock, conditional status transition and lifecycle-history insertion. No new repository function is needed.

The same transaction writes:

- Project status transition;
- one `project_status_history` row;
- Foundation audit action (`project.suspended` or `project.resumed`).

A retry after the target status is already reached returns the current Project and creates no duplicate transition evidence.

## Event boundary

The source-defined Project outbox vocabulary does not contain suspended/resumed events. Pass 366 does not invent new domain events. There is therefore no `project.suspended` or `project.resumed` outbox message; those names are audit actions only.

## Downstream write boundary

Modules with an existing writable-Project guard now reject both `SUSPENDED` and `CLOSED` Projects for normal operational writes. Scheduling receives the same minimal guard before its existing write commands. Modules already requiring `ACTIVE` Projects remain unchanged in policy.

This repair does not globally redesign every module's lifecycle policy and does not alter Stage-26 Finance adapters or Stage-27 integration completion.

## Database impact

```text
New tables:              0
New Prisma models:       0
New migrations:          0
New repository methods:  0
New permissions:         0
New stable errors:       0
New domain events:       0
Repair HTTP commands:    2
```

Existing `projects.status` and `project_status_history` already support `SUSPENDED`, so no duplicate persistence is introduced.

## UI

The existing Project detail screen gains permission-aware status controls:

- ACTIVE + `projects.close` -> Suspend Project
- SUSPENDED + `projects.activate` -> Resume Project

Optional lifecycle reasons are written through React Hook Form + Zod. Suspended Projects remain visible, while the UI explains that normal downstream operational writes remain blocked until resume.

## Verification boundary

Pass 366 verifies:

- original seven source-defined Module-5 operations remain preserved;
- exactly two Pass-366 repair operations are added;
- strict reason-only request bodies;
- permission and cross-Company denial paths;
- durable/idempotent lifecycle history and audit behavior;
- no invented suspended/resumed outbox events;
- downstream writable-Project guards reject SUSPENDED;
- OpenAPI and Project React controls include the repair commands;
- existing Module-5 and full-project static regression stay green;
- Prisma schema and migration inventory remain unchanged.

## Deferred / not part of Pass 366

No Project reopen command, generic status mutation endpoint, new lifecycle permission family, Finance adapter, Report or Dashboard behavior is added.

Next repair pass: **Pass 367 — Module 4 BOQ durable revision-detail/history readback.**
