# Stage 10 — Module 4B BOQ Project Mapping Contract

## Purpose

Stage 10 completes the deferred Project/WBS/Cost Code relationships for **Module 4 — BOQ Management** after the Project master and Module 6 cost structure exist.

`4B` is an implementation gate inside Module 4. It is **not** another ERP business module.

The controlling dependency-aware order is:

```text
Stage 6   Module 4A - BOQ Commercial Core
Stage 7   Module 5 - Project Management
Stage 8   Module 24B - Project Scope Activation
Stage 9   Module 6 - WBS & Cost Codes
Stage 10  Module 4B - BOQ Project Mapping
Stage 11  Module 15A - Finance Core
```

Stage 10 exists because Module 4A intentionally could not create foreign keys to Projects, WBS nodes or Cost Codes before those tables existed.

## Stage prerequisite

The direct Stage-10 handoff is genuine Stage-9 live acceptance:

```text
STAGE_9_ACCEPTED_READY_FOR_STAGE_10
```

The Module 4B contract may be reviewed and frozen while the live handoff is still pending. That does not authorize the Stage-10 migration or deployment.

Module 4A remains the commercial BOQ base that Stage 10 extends; Stage 10 does not replace or duplicate it.

## Ownership boundary

Module 4B extends the existing Module 4 tables only with the relationships deferred by the controlling contract:

```text
boqs.project_id nullable
boq_items.wbs_node_id nullable
boq_items.cost_code_id nullable
```

Stage 10 does **not** create another BOQ table or another Project/WBS/Cost Code master.

Ownership remains:

```text
boqs / boq_revisions / boq_items     Module 4
projects                              Module 5
wbs_nodes / cost_codes                Module 6
project authorization                 Module 24B
```

Do not add `cost_type_id` to BOQ items in this gate. The completed Module 4 table definition names only `wbs_node_id` and `cost_code_id` for item mapping.

## Existing BOQs remain valid

Existing Stage-6 tender BOQs must remain valid after the Stage-10 migration.

Therefore:

- `boqs.project_id` is nullable;
- existing `tender_id` values remain preserved;
- no migration may require an existing tender BOQ to have a Project;
- no migration may silently create or guess a Project/WBS/Cost Code mapping;
- frozen and historical BOQ revisions remain historical records.

The completed Module 4 source permits a BOQ to be tender-linked, Project-linked, or both because at least one of `tender_id` or `project_id` is required.

## Project relationship

When `boqs.project_id` is present:

- it references an existing Module-5 Project;
- the Project must belong to the same Company as the BOQ;
- Project-scoped access is enforced through the existing Module-24B resource policy;
- client-supplied Company identity or permission scope is never trusted.

A Project membership by itself is not a permission grant. The caller must still hold the appropriate Module-4 permission for the requested operation.

## BOQ item WBS and Cost Code mapping

The completed Module 4 item shape adds nullable:

```text
wbs_node_id
cost_code_id
```

When a BOQ item supplies `wbs_node_id`:

- the BOQ must have a Project relationship;
- the WBS node must belong to that exact Project;
- the WBS node must belong to the same Company through its Project relationship.

When a BOQ item supplies `cost_code_id`:

- the BOQ must have a Project relationship;
- the Cost Code must belong to the same Company as the BOQ Project.

The source does not state that the two nullable mapping columns must always be supplied together. Stage 10 therefore must not invent an all-or-nothing pair rule at the contract layer.

Module 6 owns Cost Types and posting combinations. Module 4 does not gain a `cost_type_id` column or duplicate Module-6 mapping ownership in this gate.

## Exact API surface

Module 4B does **not** add another generic endpoint. The completed Module 4 continues to use the same six reviewed operations:

```text
GET  /api/v1/boqs
POST /api/v1/boqs
POST /api/v1/boqs/:id/revisions
PUT  /api/v1/boqs/:id/revisions/:revId/items
POST /api/v1/boqs/:id/revisions/:revId/freeze
GET  /api/v1/boqs/:id/revisions/:revId/export
```

Stage 10 activates the deferred relationship fields inside the existing contracts rather than inventing a `boq-mappings` CRUD API.

In particular, do not add:

```text
POST   /api/v1/boqs/:id/project
PUT    /api/v1/boqs/:id/mapping
DELETE /api/v1/boqs/:id/mapping
POST   /api/v1/boqs/:id/revisions/:revId/items/:itemId/map
```

unless the controlling source contract is explicitly amended.

## Completed request boundary

### Create BOQ

The completed create contract may accept:

```text
tenderId optional
projectId optional
code
title
currency
```

At least one of `tenderId` or `projectId` is required, matching the completed Module 4 validation rule.

When both IDs are supplied, each relationship must independently resolve inside the authenticated Company. The client still cannot provide `companyId`, actor identity, permissions, Project scope, lifecycle status or current revision identity.

### Replace draft item set

The existing replace-all item command remains authoritative. Each submitted item may additionally contain:

```text
wbsNodeId optional
costCodeId optional
```

The server continues to calculate `amount` and preserve the existing transient `rowKey` / `parentRowKey` hierarchy contract from Module 4A.

No client-provided Project identifier is accepted inside item rows. The BOQ's server-validated `project_id` is the Project authority for WBS validation.

## Project-aware read and write policy

Tender-only BOQs remain Company-scoped Module-4 resources.

Project-linked BOQs become Project-scoped resources:

- Company ownership is always enforced;
- `boq.read`, `boq.create`, `boq.edit`, `boq.freeze` and `boq.export` remain the Module-4 permission codes;
- Project-linked reads/writes must pass the existing Module-24B Project resource policy for that exact Project;
- a permission scoped to Project A cannot authorize a Project-B BOQ;
- Company-wide permission behavior may continue where the existing reviewed RBAC policy grants it.

The list/read layer must not leak Project-linked BOQs outside the caller's authorized Project scope.

## Stable errors and validation

Reuse the existing Module-4 stable errors:

```text
BOQ_NOT_FOUND
BOQ_REVISION_LOCKED
INVALID_BOQ_ITEM
BOQ_SCOPE_CONFLICT
```

`BOQ_SCOPE_CONFLICT` is the reviewed error for invalid tender/Project/WBS/Cost Code scope combinations. Stage 10 does not need a new public error code merely to describe a foreign-key mismatch.

Existing rules remain unchanged:

- frozen revisions are immutable;
- item amount is server-calculated from decimal quantity/rate;
- hierarchy/item validation remains all-or-nothing;
- downstream consumers reference a specific revision/item rather than an ambiguous latest row.

## Events, audit and outbox

The source-defined Module-4 events remain:

```text
boq.created
boq.revision_created
boq.revision_frozen
```

No new mapping event name is invented by this contract pass.

Project/WBS/Cost Code mapping changes are audit-sensitive item changes. Audit records must include actor, Company/Project scope, entity/request identity and important before/after values without secrets.

Foundation outbox behavior remains transactional where a reviewed event is emitted.

## Persistence migration requirements for the next pass

Pass 191 may prepare a reviewed migration that:

- adds nullable `project_id` to `boqs`;
- makes the existing Module-4A `tender_id` nullable because the completed source allows a Project-only BOQ;
- adds nullable `wbs_node_id` and `cost_code_id` to `boq_items`;
- adds same-Company BOQ -> Project integrity;
- adds BOQ-item -> WBS and BOQ-item -> Cost Code foreign keys;
- adds the minimum indexes needed for the new relationships;
- preserves all existing BOQ rows and frozen revisions;
- does not guess or auto-create mappings for historical tender BOQs.

Cross-table rules that a plain foreign key cannot express, such as ensuring an item's WBS belongs to its BOQ Project, must be enforced using the simplest existing project-aware repository/service/database pattern rather than duplicated abstractions.

## Source-contract gap kept explicit

The source defines the six Module-4 routes but does not define a dedicated command for attaching a Project to an **already-existing tender-only BOQ** after Project award.

Stage 10 therefore does not invent such a route during Pass 190. New BOQs can use the completed create contract once the schema/API passes activate it. Existing tender BOQs remain valid and nullable until a reviewed existing workflow can establish the Project relationship safely. The Stage-27 integration-completion gate must still prove Tender -> BOQ -> Project Award source preservation and permission-scoped mapping.

## Pass 190 boundary

Pass 190 is contract-only. It does not change:

```text
Prisma schema
migration SQL
BOQ Zod schemas
repository
service
routes
OpenAPI
React
Playwright
```

The next pass is:

```text
Pass 191 - Module 4B reviewed Prisma relationship migration
```


## Pass 367 amendment — durable revision readback

The historical Stage-6 source contract remains six operations. Pass 367 adds exactly two reviewed read-only repair routes because the required revision-comparison UI could not reconstruct historical revisions after reload:

- `GET /api/v1/boqs/:id` — BOQ master plus ordered revision metadata.
- `GET /api/v1/boqs/:id/revisions/:revId` — one durable revision with its stored item hierarchy and server total.

Both routes reuse `boq.read`, company/project resource policy, existing repository reads, and the existing stable BOQ errors. Pass 367 adds no table, migration, permission, event, item CRUD operation, or generic BOQ CRUD surface. Frozen revision immutability and the six source workflow operations remain unchanged.
