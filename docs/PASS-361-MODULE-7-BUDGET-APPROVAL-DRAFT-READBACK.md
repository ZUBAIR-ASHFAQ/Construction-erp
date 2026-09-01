# Pass 361 — Module 7 Budget Approval + DRAFT Readback

## Purpose

Pass 361 repairs only the two Module-7 findings frozen by Pass 358:

- **M7-01** — Budget freeze bypasses conditional approval.
- **M7-02** — an unfinished DRAFT Budget cannot reliably recover after browser-session loss.

It is a post-Stage-23 repair pass on top of Pass 360. It does **not** start Pass 362, Module-8 integrity repair, Stage-24 RFI/Submittals, Stage-26 Finance source adapters or Stage-27 cross-module completion.

## M7-01 — reuse Module 22 for configured Budget freeze approval

The existing bodyless Budget freeze command remains the only Module-7 command. Pass 361 adds optional server configuration:

```text
BUDGET_APPROVAL_DEFINITION_CODE=BUDGET_FREEZE
```

When that value is blank, direct freeze remains supported because the source requires approval only when configured.

When configured, `freezeBudget()`:

1. revalidates `budgets.freeze` against the Project;
2. locks the Project and DRAFT Budget;
3. revalidates active Module-6 WBS / Cost Code / Cost Type mappings;
4. recalculates authoritative Budget totals;
5. builds a normalized snapshot of the Budget's business lines and totals;
6. fingerprints that snapshot into a stable Module-22 source key;
7. requests or replays the configured Module-22 approval inside the same owning transaction;
8. leaves the Budget `DRAFT` unless the authoritative approval status is `APPROVED`;
9. freezes only the approved snapshot and then emits the existing Module-7 audit/outbox evidence.

No client-supplied approval ID/status is accepted. No custom Budget approver table, permission or approval route is introduced.

## M7-02 — latest-DRAFT recovery

Pass 361 adds one narrow read:

```text
GET /api/v1/projects/:projectId/budgets/draft
```

It reuses `budgets.read` and the existing repository method that returns the latest Project Budget by status. There is no new repository abstraction, no list endpoint, no pagination surface and no new database persistence.

The React feature now loads both:

- latest FROZEN Budget; and
- latest editable DRAFT Budget.

If a DRAFT exists after page reload, it becomes the active editor again. The browser still cannot supply Company, actor, Project scope, version, status, approval status or authoritative totals.

## Scope boundary

```text
Business modules added:       0
Prisma models added:          0
Database tables added:        0
Migrations added:             0
Module-7 source routes:       7
Repair routes added:          1
Active Module-7 routes:       8
Permissions added:            0
Stable Module-7 errors added: 0
Module-7 events added:        0
Custom approval routes:       0
```

Only Module 7, direct application configuration wiring, focused tests/evidence and the existing Module-7 React workflow are changed.

## Verification intent

The Pass-361 focused and cumulative gates prove that:

- the server config is optional and safely validated;
- configured freeze uses Module 22 rather than a custom approval model;
- a non-approved request leaves Budget status as `DRAFT`;
- an unchanged retry reuses the same snapshot-sensitive approval source key;
- only `APPROVED` can reach the DRAFT → FROZEN transition;
- the latest-DRAFT read is authenticated, Project scoped and `budgets.read` protected;
- React restores an unfinished DRAFT after reload;
- no manual commitment/actual source-write API is introduced;
- all six Module-7 permissions, five owned tables and Stage-26/27 deferrals remain unchanged.
