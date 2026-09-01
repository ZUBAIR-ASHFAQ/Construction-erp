# Pass 391 — Stage 24 / Module 19 Submittal Service Workflow

Pass 391 builds directly on the Pass-390 Submittal persistence/schema/repository layer. It adds the service layer only; Fastify routes, module registration, RFI work and React remain deferred.

## Implemented workflow

- Project-scoped Submittal list with server-side permission/scope enforcement.
- Idempotent Submittal creation with Foundation numbering.
- First `DRAFT` Submittal revision created atomically with the header.
- Due date cannot be before the creation calendar date.
- Responsible user must be active and an active member of the same Project.
- Optional creation Document must be active, versioned and belong to the same Project.
- Current `DRAFT` revision submission is serialized with a Submittal row lock.
- Submission requires a same-Project versioned Document.
- Submission records actor/time server-side, audit evidence and `submittal.submitted` outbox event atomically.
- Review requires `submittals.review`, the current `SUBMITTED` revision and an active reviewer.
- Review rows remain append-only historical evidence.
- Review records audit evidence and `submittal.reviewed` outbox event atomically.
- `REVISE_RESUBMIT` creates the next numbered `DRAFT` revision while preserving the reviewed revision and its reviews.

## Repository additions required by real service concurrency

Pass 391 adds only two persistence primitives to the existing repository:

- `lockSubmittalForWrite`
- `updateSubmittalRevisionStatus`

The row lock serializes submit/review lifecycle decisions. The revision-status write stores the review outcome; neither method decides business policy.

## Deliberately deferred

- RFI persistence/service.
- Module-19 Fastify routes and `index.ts` registration.
- React API/hooks/pages.
- Stage-25 Daily Site Reports.
- Extra status vocabulary beyond implementation-private lifecycle values needed by the reviewed workflow.

No new database table or migration is required by Pass 391.
