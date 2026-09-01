# Pass 367 — Module 4 BOQ Durable Revision Readback

## Purpose

Close repair item **M4A-01** without widening BOQ write authority. The source requires historical BOQ revisions to remain available and requires a revision-comparison React workflow, while the original six-route API did not contain a detail/history read operation.

## Reviewed repair

Pass 367 adds exactly two read-only operations:

- `GET /api/v1/boqs/:id`
- `GET /api/v1/boqs/:id/revisions/:revId`

The first returns the authorized BOQ plus ordered revision metadata. The second returns one authorized revision, its persistent item hierarchy and the server-calculated total. Both reuse `boq.read` and the existing company/project resource policy.

## Deliberate non-changes

- no Prisma model or database table
- no migration
- no repository function
- no permission
- no stable error
- no domain event
- no item CRUD endpoint
- no change to freeze immutability or the original six write/workflow source operations

## React behavior

TanStack Query now loads BOQ history and individual revision snapshots from the server. The existing revision panel can therefore reopen historical revisions and compare any two stored revisions after a browser reload instead of relying on mutation responses kept in memory.

## Verification boundary

Focused static checks, cumulative Module 4A/4B checks, full static regression, workspace and migration policy, TypeScript syntax, integration-test syntax and Playwright syntax are required. Live PostgreSQL/Prisma/browser execution is recorded separately and is not claimed when the dependency-backed disposable environment is unavailable.
