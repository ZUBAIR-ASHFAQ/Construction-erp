# Pass 370 — Module 11 Durable Readback, Approved Revision History and Retention Release

Pass 370 closes frozen repair items M11-01, M11-02 and M11-03 before Stage 24. It is a post-Stage-23 repair amendment to the already accepted Stage-16 Module-11 contract; it does not create a new business module and does not rewrite the original eight source-reviewed operations.

## Durable readback

The repair adds bounded server-backed reads for one Subcontract, its progress application/certification history, approved revision history and retention release history. Every read derives Company and allowed-Project scope from authenticated server context and uses the existing `subcontracts.read` permission.

## Approved revision contract

An approved revision applies only to an `EXECUTED` Subcontract. The request supplies a reason plus quantity/rate/amount for every existing scope line exactly once. Scope-line IDs, BOQ links, WBS/cost-code/cost-type mappings and Project identity remain fixed in this first repair scope. A revised line amount may not fall below already certified cumulative value.

Revision approval reuses the existing Module-22 Subcontract approval definition and the existing `subcontracts.execute` authority. The service locks the Project and Subcontract, updates the live scope/header value, refreshes Module-7 source-keyed commitments, stores an immutable before/after revision snapshot, records audit evidence and emits the already source-defined `subcontract.revised` outbox event atomically.

## Retention release contract

Retention release is bodyless: the browser cannot choose an amount. The server sums certified retention, subtracts immutable prior releases and releases the complete outstanding amount. The command requires both existing `subcontracts.certify` and `subcontracts.close` authority, so no new permission token is invented. Release rows are append-only and closeout now proves outstanding retention is zero instead of requiring historical retained value itself to be zero.

No new retention domain event is invented because the Module-11 source event vocabulary does not define one; the release is audit recorded. Formal Subcontract certification -> AP posting remains Stage 26, and Change Order target adapters remain Stage 27.

## Persistence amendment

The migration adds only two narrowly scoped immutable evidence tables:

- `subcontract_revisions`
- `subcontract_retention_releases`

Both actor references use real `users` foreign keys and database triggers enforce same-Company actor ownership. UPDATE/DELETE attempts against approved revision or retention-release history are rejected at the database boundary.

## Public repair surface

- `GET /api/v1/subcontracts/:id`
- `GET /api/v1/subcontracts/:id/payment-applications`
- `GET /api/v1/subcontracts/:id/revisions`
- `GET /api/v1/subcontracts/:id/retention`
- `POST /api/v1/subcontracts/:id/revisions`
- `POST /api/v1/subcontracts/:id/retention/release`

The original eight Stage-16 operations, seven permissions, five stable errors and five source events remain preserved.
