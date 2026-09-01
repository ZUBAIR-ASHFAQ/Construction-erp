# Final-21 Pass B13 — Equipment Management

## Purpose

Pass B13 aligns Module 12 Equipment Management with the Final 21-module Construction ERP contract. The module now owns only Equipment master data, Project/Stage assignments, usage/rental cost, maintenance history and bounded history readback.

## Implemented

- Kept the backend as the required five files only: schema, repository, service, routes and index.
- Aligned the Equipment master to `code`, `name`, `equipment_type`, `ownership_type`, optional `default_rate`, optional `rate_unit` and status.
- Added real optional Project Stage ownership to Equipment assignments.
- Preserved exclusive assignment periods and added database/service overlap protection.
- Simplified Equipment usage to assignment, date, quantity, rate, server-calculated amount, actor and status.
- Removed active meter, fuel, cost-structure and approval/post-cost workflow fields from Equipment usage.
- Usage now posts one source-keyed `CostActual` with category `equipment` to the assignment Project and optional Stage.
- Simplified maintenance to date, type, cost, note and status.
- Added bounded combined assignment, usage, maintenance and Project/Stage Equipment-cost history.
- Added the final permission vocabulary: `equipment.read`, `equipment.manage`, `equipment.assign`, `equipment.usage.create`, `equipment.maintenance.manage`.
- Migrated old `equipment.usage` and `equipment.maintenance` grants to their Final-21 replacements.
- Replaced the old broad fleet UI with the Final-21 register, Project/Stage assignment, usage, maintenance and cost-summary workflow.
- Removed obsolete Stage-17 Module-12 verifier scripts, evidence, legacy integration/e2e/static tests and repair-pass tests rather than maintaining duplicate behavior.
- Historical migrations remain unchanged; B13 uses one forward migration.
- Added short purpose comments to changed named functions and methods.

## Exact public API

- `GET /api/v1/equipment`
- `POST /api/v1/equipment`
- `POST /api/v1/equipment/:id/assignments`
- `POST /api/v1/equipment/:id/usage`
- `POST /api/v1/equipment/:id/maintenance`
- `GET /api/v1/equipment/:id/history`

No generic Equipment CRUD, transfer, archive/dispose, return, utilization, usage-submit or post-cost routes are carried forward.

## Safety and cost rules

- Company identity, actor, status, amount and source keys are server-owned.
- Inactive Equipment cannot receive a new assignment or usage entry.
- Assignment Project and optional Stage must resolve inside the authenticated Company/Project scope.
- Exclusive assignment periods cannot overlap.
- Usage must belong to an active assignment and fall inside its effective dates.
- Quantity and rate use precise decimal validation; usage amount is calculated without floating-point arithmetic.
- Each posted usage produces one stable source key: `equipment_usage:<usageId>`.
- Equipment cost is source-derived in Module 9 and is not typed directly into profitability.
- Maintenance history is preserved; later posted correction policy should use reversal/adjustment rather than silent history mutation.

## Verification target

Pass B13 must pass:

- B13 Equipment regression tests.
- Existing Final-21 regression suite.
- Workspace validation.
- Legacy cleanup manifest regeneration/check.
- Migration checksum and gate policy.
- TypeScript syntax transpilation for changed production files.
- ZIP integrity verification.

Live clean/previous-schema migration execution still requires a disposable PostgreSQL `MIGRATION_TEST_DATABASE_URL` and explicit destructive-test confirmation.
