# Pass 306 — Payroll Run Identity, Period Lock and Approval Lifecycle Contract

## Purpose

Pass 306 freezes the minimum **Module 14B Payroll Run identity, Company-wide period rule, and Module-22 approval lifecycle** required before Stage-20 Payroll persistence/runtime can be generated safely.

This is a contract and verification pass only. It does not add Payroll tables, a migration, repository/service logic, Fastify routes, React behavior, a permission, a calculation formula, a Finance posting adapter, or Job-Cost posting.

The controlling source requires all of the following:

- Stage 20 completes Payroll after Workforce, Finance Core, Approval Workflows and Document Management exist.
- Payroll Runs store Company, period start/end, pay date, status and server-calculated totals.
- Payroll periods cannot overlap for the same Payroll group if configured.
- Payroll is created, calculated, reviewed, submitted/approved and then finalized.
- Finalization requires approval completed and all blocking exceptions resolved.
- Finalized Payroll is immutable.
- Approved Workforce time supplies the Payroll input and one source line can reach Payroll at most once.

The source does **not** define a Payroll-group table/field, Payroll status vocabulary, Payroll submit route, Payroll approval-request field, approval-definition code, rejection/return mapping, or exact period-lock persistence.

Pass 306 therefore records an explicit narrow project amendment for those missing lifecycle semantics without starting runtime code.

## Existing source and project boundaries

The reviewed Module-14 table shape contains:

```text
payroll_runs
  id
  company_id
  period_start
  period_end
  pay_date
  status
  gross_total
  deduction_total
  net_total
  finalized_at
```

The reviewed public Payroll commands currently name:

```text
POST /api/v1/hr/payroll-runs
POST /api/v1/hr/payroll-runs/:id/calculate
POST /api/v1/hr/payroll-runs/:id/finalize
```

The source workflow nevertheless explicitly contains a submit/approval step between calculation/review and finalization.

Module 22 already provides approval definitions, immutable request snapshots, inbox/action processing and `APPROVE` / `REJECT` / `RETURN` decisions. Business modules own their own lifecycle transitions and must never allow the browser to choose Company, actor, permission or approval authority.

Pass 305 already froze original Payroll source identity as `timesheet_entries.id`, correction identity as `timesheet_adjustments.id`, and finalized at-most-once uniqueness as Company + source kind + source-line ID.

## Pass-306 project amendment

### 1. Payroll Run durable identity is `payroll_runs.id`

`payroll_runs.id` is the durable identity of one Payroll processing cycle.

Company and date range are business uniqueness/overlap inputs, not replacements for the UUID primary key. No human Payroll Run number is invented because the source does not define one.

### 2. The first medium-ERP scope uses one Company-wide Payroll group

The source says overlap is prevented for the same Payroll group **if configured**, but it defines no Payroll-group master, column or configuration source.

For the reviewed medium ERP, Pass 306 freezes the minimum scope as:

```text
Payroll group identity = authenticated Company
```

Therefore no `payroll_group_id`, Payroll-group table, group selector or browser-owned group token is added to the first Stage-20 design.

If multiple Payroll groups are required later, that is a separate reviewed amendment with its own persistence, authorization and migration contract.

### 3. Payroll Run date ranges are inclusive and cannot overlap inside one Company

The run period is the inclusive interval:

```text
[period_start, period_end]
```

The server must require:

```text
period_start <= period_end
```

and, in the first Company-wide group scope, it must reject creation of another Payroll Run for the same Company when the inclusive date range overlaps an existing Payroll Run.

This is intentionally stricter than silently guessing which lifecycle statuses may be ignored. Pass 306 does not invent a cancellation/void/delete lifecycle that would make an old overlapping run disappear.

A future reviewed reversal/void amendment may define when a superseding run is allowed. Until then, overlapping Company Payroll Runs fail closed.

`pay_date` is retained as source-defined business data, but Pass 306 does not invent a rule that it must be before/after a particular period boundary.

### 4. Minimal Payroll Run lifecycle vocabulary

The source requires draft calculation, approval, and immutable finalization but does not enumerate status tokens. Pass 306 freezes only the minimum server-owned lifecycle required by those steps:

```text
DRAFT
PENDING_APPROVAL
APPROVED
FINALIZED
```

These are Stage-20 Payroll persistence tokens, not browser-selectable values.

Meaning:

- `DRAFT` — run may be calculated/recalculated and reviewed.
- `PENDING_APPROVAL` — calculation snapshot is frozen while Module 22 owns the decision.
- `APPROVED` — the latest applicable Module-22 approval completed successfully; no recalculation is allowed.
- `FINALIZED` — immutable Payroll result; source consumption and finalization guarantees must hold.

Pass 306 does not add `REJECTED` or `RETURNED` as Payroll status tokens. Those remain Module-22 approval-request outcomes; the Payroll Run returns to `DRAFT` only through server-side reconciliation of that terminal approval result so the user can correct/recalculate and submit a new approval attempt.

### 5. A real submit command is required; do not overload calculate or finalize

The source workflow explicitly has review -> submit/approve -> finalize, but the reviewed Module-14 route table omitted the submit command.

Pass 306 freezes this explicit API amendment for Stage 20:

```http
POST /api/v1/hr/payroll-runs/:id/submit
```

The command is **bodyless**. It requires an `Idempotency-Key` and accepts no Company, actor, status, approval-definition code, approver, totals, source IDs or permission data from the browser.

This is not generic CRUD. It is the missing business transition already required by the source workflow and by the rule that finalization requires completed approval.

The submit command reuses the existing `payroll.calculate` authority rather than inventing a new public permission token. Module-22 decision actions remain controlled by Module 22's existing `approvals.act` authority. Finalization remains controlled by `payroll.finalize`.

Pass 306 only freezes this amendment. It does not add the Fastify route yet.

### 6. Server-owned Module-22 approval mapping

Payroll approval must reuse Module 22 with server-owned configuration.

The browser must never send an `approvalDefinitionCode` or choose approvers.

The future Stage-20 service must create the approval request using a server-owned mapping equivalent to:

```text
resource type = payroll_run
resource id   = payroll_runs.id
snapshot      = immutable calculated Payroll Run approval snapshot
```

The exact configured approval-definition code remains deployment/server configuration, not a public request field.

One approval attempt is tied to one immutable calculated snapshot. Rejected/returned attempts stay in Module-22 history; after correction/recalculation, a new submit creates a new approval attempt instead of rewriting the old request.

### 7. Submission preconditions

The bodyless submit command may move a run from `DRAFT` to `PENDING_APPROVAL` only when the server verifies all of the following:

```text
same authenticated Company
current run status is DRAFT
calculation exists and matches the current run/source snapshot
all blocking calculation exceptions are resolved
selected Workforce inputs satisfy the approved-source rules frozen in Pass 305
no conflicting active approval attempt exists for the same calculated snapshot
```

The browser cannot mark exceptions resolved, set totals, or provide the approved source set as authority.

The exact exception persistence/calculation rules remain a separate blocking contract.

### 8. Pending approval freezes the calculated Payroll snapshot

While a run is `PENDING_APPROVAL`:

```text
recalculate        -> forbidden
change source set  -> forbidden
change totals      -> forbidden
submit again       -> idempotent replay / existing attempt
finalize           -> forbidden until Module 22 is APPROVED
```

The approval request must reference the immutable server-calculated snapshot used for that attempt.

This prevents approval of one set of totals followed by finalization of silently changed data.

### 9. Module-22 outcome mapping

Module 22 remains the authority for the approval decision.

The Payroll service owns the Payroll lifecycle mapping:

```text
Module 22 PENDING   -> Payroll PENDING_APPROVAL
Module 22 APPROVED  -> Payroll APPROVED
Module 22 RETURNED  -> Payroll DRAFT after server reconciliation
Module 22 REJECTED  -> Payroll DRAFT after server reconciliation
```

Returned/rejected approval history remains immutable in Module 22. The Payroll Run may be corrected and recalculated, but the previous approval request must never be rewritten or reused as the new approval attempt.

`EXPIRED` is also not treated as approval. A future server reconciliation may return the run to `DRAFT`; Pass 306 does not invent an automatic retry schedule.

### 10. Finalize is a separate bodyless command after approval

`POST /api/v1/hr/payroll-runs/:id/finalize` remains the reviewed finalization command.

It may succeed only when the server revalidates:

```text
Payroll Run belongs to authenticated Company
run is APPROVED
latest applicable Module-22 request is APPROVED
approved calculation snapshot is unchanged
blocking exceptions remain resolved
source-consumption uniqueness can be committed atomically
```

Finalization must not create a new approval request and must not accept an approval decision from the request body.

Successful finalization moves the run to `FINALIZED`, records `finalized_at`, preserves immutable results, and participates in the future atomic source-consumption/outbox boundary.

The exact Finance Core posting behavior remains blocked by Pass 303 A10 and is not decided here.

### 11. Payroll period locking has three distinct meanings

Pass 306 separates concepts that must not be collapsed into one boolean.

#### Draft calculation

A `DRAFT` Payroll Run does not create a durable Payroll lock merely because it was calculated. It may be recalculated until submission.

#### Approval snapshot lock

`PENDING_APPROVAL` and `APPROVED` freeze that Payroll Run's calculated snapshot. This protects the approval decision from recalculation or source-set mutation.

#### Final source-consumption lock

`FINALIZED` is the point at which the durable Company + source kind + source-line uniqueness from Pass 305 must be committed. That is the at-most-once Payroll-consumption lock.

Module 13 already prevents normal replacement of approved Timesheet entries. A later post-approval Timesheet Adjustment remains a distinct source identity; it must not rewrite a finalized Payroll Run or silently reopen a finalized period.

The exact later Payroll period that receives such an adjustment remains unresolved.

### 12. `PAYROLL_PERIOD_LOCKED` must be server-derived

The browser must never send a Payroll lock flag.

For Stage 20, the server may raise `PAYROLL_PERIOD_LOCKED` when a requested Workforce mutation would violate a Payroll lifecycle/consumption lock known from durable server state.

Pass 306 does not add a Payroll foreign key or consumed flag to Module-13 tables. The physical lookup remains dependent on the source-consumption persistence amendment identified by Pass 305.

### 13. No destructive reopening of finalized Payroll

`FINALIZED` Payroll is immutable.

Pass 306 does not create:

```text
reopen finalized Payroll
edit finalized Payslip
release finalized source consumption
delete Payroll Run
cancel Payroll Run
void Payroll Run
```

The source says corrections occur through adjustment/reversal in a later run. Exact reversal persistence and later-run correction rules remain separate contract work.

## A4/A5/A6 outcome from Pass 303

### A4 — Payroll approval lifecycle

**Resolved at contract level by Pass 306:** an explicit bodyless Payroll submit command is required; it reuses `payroll.calculate`, creates a server-owned Module-22 approval request, freezes the calculated snapshot, maps approved state back to Payroll, and keeps finalization separate under `payroll.finalize`.

**Still blocking runtime:** exact calculation/exception persistence and the physical Payroll models required to store lifecycle/source-consumption state have not yet been generated.

### A5 — Payroll-run identity and overlap rule

**Resolved at contract level by Pass 306:** durable identity is `payroll_runs.id`; first medium-ERP Payroll group is the authenticated Company; inclusive periods cannot overlap inside that Company; no Payroll-group master/selector is invented.

### A6 — Approved Timesheet eligibility and Payroll-period locking

**Resolved at lifecycle level by Pass 305 + Pass 306:** original entries are approved/work-date eligible; pending/approved Payroll freezes the calculated snapshot; finalization commits the durable source-consumption lock; all lock authority remains server-side.

**Still blocking runtime:** the source-consumption persistence relation/columns do not yet exist, and late Timesheet Adjustment period allocation is unresolved.

## Explicitly prohibited shortcuts

Until later reviewed Stage-20 passes complete persistence and calculation contracts, do not:

```text
Create multiple Payroll groups from browser input
Allow overlapping Company Payroll Runs
Let the browser set Payroll status
Let calculate silently double as submit
Let finalize silently create the first approval request
Let the browser choose approvalDefinitionCode or approvers
Recalculate a PENDING_APPROVAL or APPROVED snapshot
Treat Module-22 PENDING/RETURNED/REJECTED as approved
Reuse a rejected/returned approval request after recalculation
Treat a DRAFT calculation as finalized source consumption
Put Payroll Run ID in the source uniqueness key so another run can consume the same source line
Reopen or edit FINALIZED Payroll destructively
Invent cancellation/void/reversal behavior in this pass
Post Finance or Job Cost from this contract pass
```

## No production change in Pass 306

Pass 306 makes exactly zero changes to:

```text
Prisma models
migrations
database tables/relations
backend runtime
repository functions
service functions
Fastify routes
React runtime
permission codes
Payroll calculation formulas
Payroll persistence
Timesheet persistence
Job-Cost posting
Finance posting
```

## Stage-20 runtime status

Pass 306 resolves A4, A5 and the lifecycle portion of A6 at contract level, but Stage-20 runtime generation remains blocked.

The remaining blockers include:

1. effective-dated compensation persistence and explicit pay type;
2. earnings/deductions/net calculation, exception persistence and rounding policy;
3. physical Payroll source-consumption persistence/uniqueness enforcement;
4. Shift/hour-limit contract completion before authoritative Payroll consumption;
5. leave-effect scope and approval/read contract;
6. post-approval adjustment period allocation;
7. Stage-20 versus Stage-26 Finance posting boundary.

The next reviewed pass is **Pass 307 — Payroll calculation, exception, leave-effect and Workforce-policy scope contract**. It must resolve the remaining calculation/input-policy blockers without starting Finance source adapters or unrelated earlier-module repairs.
