# Pass 359 — Module 6 durable WBS freeze and controlled reopen

## Purpose

Pass 359 implements only the first repair frozen by Pass 358: **M6-01 — WBS freeze is not durable**.

The requirements say a frozen WBS/cost-structure baseline cannot be changed normally and later changes require controlled revision or authorized reopen. The earlier Stage-9 implementation recorded freeze audit/outbox evidence but had no durable state that later writes could enforce.

This pass makes that one rule executable before Stage 24. It does not start the separate Cost Type, Budget, Procurement, PO, Project, BOQ, Inventory, Subcontract, Equipment, HR, Finance, Billing or Scheduling repairs.

## Pass boundary

### Added persistence

One Module-6 support table is added:

```text
project_cost_structure_states
project_id   PK / one row per Project
company_id   same-company ownership
status       OPEN | FROZEN
revision_no  starts at 1
frozen_at    nullable while OPEN
frozen_by    authenticated actor when frozen
updated_at
```

This is not a new ERP business module. It is the minimum Project-level state needed to make the existing Module-6 freeze command authoritative across requests.

### Historical backfill

The migration finds the latest earlier `project.cost_structure_frozen` audit record per Project and creates a `FROZEN` state row. Before Pass 359 there was no reopen command, so a previously accepted freeze remains frozen. A historical actor is linked only when that User belongs to the same Company; otherwise the snapshot keeps `frozen_by` null rather than breaking migration.

### Database enforcement

PostgreSQL rejects direct `INSERT`, `UPDATE` or `DELETE` against:

```text
wbs_nodes
project_cost_codes
```

when either the old or new Project is frozen. This prevents direct SQL or concurrent paths from bypassing the service guard.

## Backend behavior

### Reads

`GET /api/v1/projects/:projectId/wbs` now returns:

```text
nodes[]
assignments[]
costStructureState {
  projectId
  status       OPEN | FROZEN
  revisionNo
  frozenAt
}
```

A Project with no state row is safely interpreted as `OPEN`, revision `1`.

### Existing writes

These existing operations now reject with `WBS_COST_STRUCTURE_FROZEN` while frozen:

```text
POST  /api/v1/projects/:projectId/wbs/nodes
PATCH /api/v1/projects/:projectId/wbs/nodes/:id
PUT   /api/v1/projects/:projectId/cost-code-assignments
```

The service checks durable state after the Project lock. The database trigger is the defensive second layer.

### Freeze

`POST /api/v1/projects/:projectId/wbs/freeze`

- remains bodyless;
- reuses `wbs.freeze`;
- locks the Project;
- rejects normal freeze of a closed/non-active Project according to the existing lifecycle rule;
- writes `FROZEN` state with authenticated actor/time;
- records audit and `project.cost_structure_frozen` outbox evidence in the same transaction;
- returns the durable state;
- repeated freeze while already frozen returns the same revision without duplicate transition audit/outbox rows.

### Controlled reopen repair command

Pass 359 adds exactly one public repair command:

```text
POST /api/v1/projects/:projectId/wbs/reopen
```

It is intentionally bodyless and reuses the existing `wbs.freeze` permission; no new permission is created.

A real transition:

```text
FROZEN revision N
        ↓
OPEN revision N+1
```

clears current freeze metadata and records:

```text
Audit:  project.cost_structure_reopened
Outbox: project.cost_structure_reopened
```

Repeated reopen while already OPEN returns the existing state without duplicate transition evidence.

## Repository changes

Only three focused repository methods are added:

```text
findProjectCostStructureState
freezeProjectCostStructure
reopenProjectCostStructure
```

They derive `company_id` from trusted repository scope. No generic state CRUD repository is added.

## React changes

The existing Module-6 workspace now reads the authoritative server state.

While `FROZEN`:

- WBS create/edit controls are hidden;
- mapping inputs/actions are read-only;
- the user sees status, revision and freeze timestamp;
- users with `wbs.freeze` see **Reopen cost structure**.

After reopen, the next revision is shown and normal WBS/mapping controls become available again. No client-owned Company, actor, permission or Project authority is sent.

## Deliberately not implemented in Pass 359

Pass 359 does not add:

```text
Cost Type list/create/manage API
Cost Code or WBS archive/delete commands
new Module-6 permission codes
public Cost Code/WBS status enums
BOQ Project mapping changes
Budget approval integration
Finance AP/AR adapters
Stage-27 target adapters
advanced WBS revision snapshots
new backend module files
```

Those boundaries remain in the Pass-358 repair contract.

## Required verification

Static acceptance must prove:

1. the original Stage-9 migration remains unchanged;
2. the new migration is checksum/gate registered;
3. durable state has same-Company Project/actor relationships and safe checks;
4. service and repository use trusted Company/Project/actor scope;
5. WBS/mapping writes reject while frozen;
6. direct database writes are protected by triggers;
7. freeze/reopen are naturally idempotent at transition level;
8. audit/outbox transition evidence is transactional;
9. OpenAPI exposes the seven source operations plus exactly one reopen repair command;
10. React uses server-owned durable state and does not invent Cost Type CRUD;
11. live integration/Playwright scenarios contain the new freeze/reopen workflow;
12. the full Stage-0→23 static regression still passes.

## Next repair

After Pass 359 acceptance, the next frozen repair is:

**Pass 360 — Module 6 Cost Type master and archive lifecycle completion.**
