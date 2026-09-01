# Pass 390 — Stage 24 / Module 19 Submittal Repository Layer

Pass 390 is built on the exact Pass-379 accepted baseline.

The requested Pass-390 repository layer depends on the Submittal persistence and boundary-schema contracts planned for Passes 388–389. Those files were not present in the supplied baseline, so this archive includes only the **minimum prerequisite persistence + schema needed for the repository to be real and compilable**. It does not implement service logic, Fastify routes, React UI, or RFI persistence.

## Source-owned Submittal persistence

- `submittals`
- `submittal_revisions`
- `submittal_reviews`

The repository provides only persistence operations:

- `listSubmittals`
- `findSubmittalById`
- `findCurrentRevision`
- `listSubmittalRevisions`
- `listSubmittalReviews`
- `createSubmittal`
- `createSubmittalRevision`
- `markRevisionSubmitted`
- `createSubmittalReview`
- `updateSubmittalStatus`

Lifecycle decisions remain deliberately deferred to Pass 391 service work.

## Scope and integrity

- Company ownership comes from trusted repository context.
- Project reads/writes never widen an explicit Module-24B Project scope.
- Submittal numbers are unique per Company + Project.
- Revision numbers are unique per Submittal.
- Project, responsible user, submitter, reviewer, and Document references use direct foreign keys.
- Review rows are append-only historical evidence at the database layer.
- No client-supplied Company/actor/status/numbering authority is introduced.

## Deliberately absent

- RFI persistence/repository work.
- Module-19 service logic.
- Module-19 Fastify routes/registration.
- Audit/outbox orchestration.
- Approval/reviewer authorization decisions.
- React API/hooks/UI.
- Stage-25 Daily Site Reports.

Every named function added in this pass has a short purpose comment and no extra helper/service/manager file was created.
