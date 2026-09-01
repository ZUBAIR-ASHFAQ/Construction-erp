# Pass 407 — Stage 24 / Module 19 Final Acceptance Audit

## Purpose

Pass 407 is the cumulative Stage-24 acceptance audit for **Module 19 — RFI & Submittals** on top of the exact Pass-406 archive.

This pass is **ACCEPTANCE_AUDIT_ONLY**. It does not change production runtime behavior, Prisma models, migration SQL, permissions, stable errors, domain events, API routes, React behavior or Stage-25 / Module-20 code.

The audit re-checks the complete Module-19 chain produced through Passes 390–406 against the controlling Construction ERP requirements instead of assuming that earlier pass descriptions were complete.

## Baseline freeze

The deterministic Pass-406 production snapshot is preserved exactly.

Production roots covered by the freeze:

- `apps/`
- `packages/`
- `docker/`
- `docker-compose.yml`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `playwright.config.mjs`

Deterministic production snapshot SHA-256:

`d63da857e5dbc43585188139cb80ae77b35a415ae01ef876b7132c6335111494`

## What is already complete

### Persistence and backend structure

The accepted Stage-24 implementation contains the five source-owned persistence records:

- `rfis`
- `rfi_responses`
- `submittals`
- `submittal_revisions`
- `submittal_reviews`

Module 19 uses the required five-file Fastify backend folder:

- `rfi-submittals.schema.ts`
- `rfi-submittals.repository.ts`
- `rfi-submittals.service.ts`
- `rfi-submittals.routes.ts`
- `index.ts`

The two Stage-24 migrations remain checksum/gate registered, and append-only database protection exists for RFI responses and Submittal reviews.

### API and authority

The nine original source operations remain present:

1. `GET /api/v1/projects/:projectId/rfis`
2. `POST /api/v1/projects/:projectId/rfis`
3. `POST /api/v1/rfis/:id/respond`
4. `POST /api/v1/rfis/:id/close`
5. `POST /api/v1/rfis/:id/reopen`
6. `GET /api/v1/projects/:projectId/submittals`
7. `POST /api/v1/projects/:projectId/submittals`
8. `POST /api/v1/submittals/:id/submit`
9. `POST /api/v1/submittals/:id/reviews`

The two narrow Pass-401 readback repairs also remain present:

- `GET /api/v1/rfis/:id`
- `GET /api/v1/submittals/:id`

Those repairs exist only to make the source-required detail/thread/revision/review UI durable after reload; they do not create generic CRUD.

The accepted permission vocabulary remains exactly:

- `rfi.read`
- `rfi.create`
- `rfi.respond`
- `rfi.close`
- `submittals.read`
- `submittals.create`
- `submittals.submit`
- `submittals.review`

The accepted event vocabulary remains exactly:

- `rfi.created`
- `rfi.responded`
- `rfi.closed`
- `submittal.submitted`
- `submittal.reviewed`

Company, Project scope, actor identity, numbering and lifecycle authority remain server-owned. Sensitive commands use Foundation idempotency, audit and outbox behavior.

### React and browser verification assets

The React feature now has the required `api/`, `hooks/`, `components/` and `pages/` structure. It includes the RFI register/detail/thread, overdue view, Submittal register/revision package/reviewer panel, permission-aware actions and Document Management navigation.

The packaged verification assets include:

- 6 RFI PostgreSQL/Fastify integration scenarios;
- 5 Submittal PostgreSQL/Fastify integration scenarios;
- 1 Module-19 Playwright browser scenario covering the main RFI/Submittal workflow plus denied actions and reload readback.

These live suites remain guarded by the existing disposable-database/browser environment flags. Pass 407 does not falsely claim that a live PostgreSQL/Playwright environment was available inside this archive-only verification environment.

## Final source-gap audit

The cumulative audit found three source requirements that are **not yet fully satisfied by the Pass-406 production snapshot**.

### M19-B01 — Initial RFI attachments are still not persisted/linked

**Status: `BLOCK_STAGE_25`**

The source workflow says a new RFI is created with attachments. Pass 394 explicitly froze this as an unresolved Module-18 document-link integration gap because the source `rfis` table has no direct attachment field.

That gap is still open in Pass 406:

- `createRfiBodySchema` has no attachment/document-link input;
- RFI creation creates no Module-18 `DocumentLink` for the new RFI;
- RFI detail readback exposes response documents only, not initial RFI attachment links.

The project already has the Module-18 generic `document_links` mechanism, so this should be resolved through the existing cross-cutting Document contract rather than by inventing a new RFI attachment table.

### M19-B02 — Historical attachment evidence is not bound to an immutable Document version

**Status: `BLOCK_STAGE_25`**

The source requires Document attachments to reference immutable Document versions where decision history requires it.

Current RFI response and Submittal revision persistence stores `documentId` pointing to the mutable Document header. The service verifies that the Document has a current version at command time, but the stored historical row does not retain the exact `DocumentVersion.id` used at that decision point.

A later Document version can therefore become current without the RFI response/Submittal revision row itself identifying which immutable version was reviewed or attached at the time.

This must be repaired without overwriting historical records and without weakening Module-18 ownership.

### M19-B03 — Source-required Module-19 notifications are not implemented

**Status: `BLOCK_STAGE_25`**

The source requires notifications for:

- new RFI/Submittal assignment;
- RFI response;
- Submittal review decision;
- overdue condition.

The Pass-406 Module-19 service records the approved domain events through the Foundation outbox, but there is no Module-19 notification job/consumer/delivery contract and no overdue notification producer.

Existing authentication and approval notification workers are purpose-specific and must not be reused as an undocumented Module-19 transport. The next repair must freeze a small Module-19 notification contract using existing Foundation queue/outbox primitives rather than creating a new business module.

## Source ambiguity retained rather than guessed

### RFI `location`

The source workflow narrative says RFI creation includes a location, but the source `rfis` critical-field list does not contain a location field and the reviewed route table does not define a request-body shape.

Pass 407 therefore does **not** invent a `location` column, enum or generic location object. This remains an explicit source ambiguity. If a future controlling requirement defines the persistence shape, it can be added through a reviewed migration.

### Requester response acceptance

The narrative says the requester may accept a response or reopen according to policy, while the reviewed route table exposes close/reopen but no separate accept-response command or acceptance state. The existing close command remains the only source-defined completion transition; Pass 407 does not invent another lifecycle.

## Verification boundary

The Pass-407 gate verifies:

1. exact Pass-406 production snapshot preservation;
2. required five-file Module-19 backend structure;
3. all five source-owned Prisma models/tables and both Stage-24 migrations remain present;
4. exact eight permissions, six stable errors and five domain events remain frozen;
5. the current 11-route surface remains nine source operations plus only the two approved readback repairs;
6. Company/Project scoping, idempotency, audit/outbox and append-only test coverage remain represented;
7. React/TanStack Query/React Hook Form + Zod/permission-aware/browser workflow assets remain present;
8. the three confirmed blockers above remain explicitly detected rather than silently accepted;
9. Stage-25 / Module-20 production code is still absent.

## Exit decision

**STAGE 24 FINAL ACCEPTANCE: BLOCKED**

The Module-19 core workflow is substantially implemented and the current static verification remains healthy, but Stage 25 must **not** begin yet because M19-B01, M19-B02 and M19-B03 are source-supported gaps.

The next pass must be:

**Pass 408 — Module 19 Attachment/Immutable-Version + Notification Contract Repair Freeze**

Pass 408 should first freeze the smallest safe repair contract around the existing Module-18 `document_links` / `document_versions` ownership and Foundation outbox/queue infrastructure. It must not create a new business module, generic attachment subsystem, new RFI lifecycle or undocumented notification channel.

After those repairs are implemented and verified, run a new final Stage-24 acceptance checkpoint before starting **Stage 25 — Module 20 Daily Site Reports**.
