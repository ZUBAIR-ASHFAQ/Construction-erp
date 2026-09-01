# Stage 3 Pass 3.7 - Document Linking and Secure Download

## Scope

Align final Module 21 document linking/unlinking with company and project authorization without changing unrelated business modules.

## Implemented

- Added `documents.link` and final POST/DELETE link routes.
- Added explicit company, optional version/project/stage, and creator ownership to `document_links`.
- Added a forward-only migration that backfills existing links before enforcing new ownership fields.
- Added current safe resource allow-list: `project`, `employee`, `client_invoice`.
- Link targets are resolved inside the authenticated company and project mismatches are rejected.
- Optional link version must belong to the same document; otherwise the current immutable version is pinned.
- Link and unlink actions write audit and outbox events.
- Unlink removes only the association. Document and version history remain intact.
- Existing downloads continue to require document permission and company-scoped signed object-storage access.

## Intentionally Deferred

The final requirements also name Stage, client receipt, and supplier invoice resources. Their final target tables/modules do not exist yet in this refactor, so this pass does not pretend to authorize those resource types. They should be added to the allow-list when their final modules are implemented.

Audit-log search is Pass 3.8 and document-link UI controls are Pass 3.9.

## Validation

- Pass 3.7 focused tests: 8/8 passed.
- Combined targeted Documents/migration regression: 39/39 passed.
- Full dependency-free static suite: 3,061 passed, 0 failed, 87 skipped.
- Foundation static gate: passed (8/8 acceptance checks).
- Administration compatibility gate: passed (47/47 focused checks).
- Module 18 Documents static gate: passed.
- Migration policy: passed with 60/60 migrations checksum-locked.
- Function-purpose comment policy: passed inside the full static suite.
- Full TypeScript check remains blocked by unavailable workspace dependencies/generated package types.
- Prisma validation and live migration/database checks remain blocked because Prisma CLI and a disposable PostgreSQL environment are unavailable.
