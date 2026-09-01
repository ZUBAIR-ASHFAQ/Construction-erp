# Pass 360 — Module 6 Cost Type Master + Archive Lifecycle

## Baseline

Pass 360 is applied only on the accepted **Pass 359 — Module 6 durable WBS freeze/reopen** archive.

## Repair-contract items

This pass closes exactly the two Pass-358 Module-6 items:

- `M6-02` — Cost Type master is persisted but not publicly manageable.
- `M6-03` — referenced WBS/Cost Code lifecycle must preserve history and avoid hard delete.

It does not start Pass 361 or any Stage-26/27 integration work.

## Implementation boundary

No new business module, Prisma model, table, migration or permission is added.

The existing permissions are reused:

```text
cost_codes.read
cost_codes.manage
wbs.manage
```

The pass adds only these public operations:

```text
POST /api/v1/projects/:projectId/wbs/nodes/:id/archive
POST /api/v1/projects/:projectId/wbs/nodes/:id/restore
POST /api/v1/cost-codes/:id/archive
POST /api/v1/cost-codes/:id/restore
GET  /api/v1/cost-types
POST /api/v1/cost-types
POST /api/v1/cost-types/:id/archive
POST /api/v1/cost-types/:id/restore
```

There are no delete endpoints.

## Lifecycle behavior

Archive/restore uses only status transitions:

```text
ACTIVE -> ARCHIVED
ARCHIVED -> ACTIVE
```

The row UUID never changes and referenced historical rows are never deleted.

WBS archive/restore is allowed only while the durable Project cost structure is OPEN. A frozen Project returns the existing `WBS_COST_STRUCTURE_FROZEN` conflict until the authorized Pass-359 reopen command is used.

Existing mapping and downstream validation already require active WBS/Cost Code/Cost Type records before accepting new posting combinations. Therefore archived masters remain historical but are not valid for new active writes.

## Cost Type master

The existing `cost_types` table remains the single persistence source. Pass 360 adds bounded Company-scoped list/create plus archive/restore under the existing Cost Code read/manage permissions. No separate `cost_types.*` permission family is invented.

Cost Type creation is audited. Cost Type archive/restore is audited. No new domain event is invented because the source does not define one for Cost Type changes.

## React behavior

The Module-6 page now shows:

- Company Cost Code master with archive/restore;
- Company Cost Type master with list/create/archive/restore;
- Project WBS rows with archive/restore;
- Cost Type choices in the existing Project mapping editor;
- historical archived statuses without destructive delete controls.

The backend remains authoritative for Company ownership, Project scope, permissions, frozen-state checks and active posting-combination validation.

## Deliberately not implemented

Pass 360 does not add:

```text
new Prisma table or migration
new permission codes
Cost Type delete
Cost Code delete
WBS delete
arbitrary Cost Type update CRUD
Budget approval/readback
RFQ item repair
Finance adapters
Stage-27 cross-module adapters
```

## Required verification

Pass 360 acceptance must prove:

1. the Pass-359 migration/schema remain unchanged;
2. no migration or database table is added;
3. no new permission or source domain-event name is added;
4. Cost Type list/create is Company-scoped and bounded;
5. Cost Type and Cost Code archive/restore preserve rows and historical references;
6. WBS archive/restore revalidates Project permission and rejects while frozen;
7. new active mapping attempts reject archived WBS/Cost Code/Cost Type references;
8. no DELETE route exists;
9. React renders Cost Type master and lifecycle controls without client-owned authority;
10. integration/OpenAPI/Playwright scenarios include the repaired workflow;
11. the cumulative Module-6 and full static regressions still pass.

## Next repair

After Pass 360 acceptance, the next frozen repair is:

**Pass 361 — Module 7 Budget approval + DRAFT readback.**
