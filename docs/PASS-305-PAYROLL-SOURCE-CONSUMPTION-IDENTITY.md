# Pass 305 — Payroll Source-Consumption and Posting-Identity Contract

## Purpose

Pass 305 freezes the narrow **Module 13 -> Module 14B Payroll source-consumption identity** needed before Stage 20 can safely consume approved Workforce time.

This is a contract and verification pass only. It does not create Payroll tables, add a migration, modify Timesheet persistence, calculate pay, expose a Payroll API, post Job Cost, or post Finance entries.

The controlling source requires all of the following at the same time:

- Module 13 approved hours become locked Payroll input and project labor-cost source.
- Approved time is immutable except through controlled adjustment.
- One Workforce source entry reaches Payroll/Job Cost at most once.
- Module 14B imports approved Timesheet/overtime inputs, calculates Payroll server-side, and finalizes immutable Payroll results.
- Corrections to finalized Payroll occur through adjustment/reversal in a later run.
- Stage 27 must prove Employee -> Timesheet -> Payroll and labor-cost behavior is atomic/idempotent end to end.

The source does **not** define a Payroll source-consumption table, a source-key column on `payslip_items`, a Payroll posting-status field on Module-13 tables, a correction-period allocation rule, or an exact Job-Cost source-key mapping.

## Source facts already available

Current Stage-19 persistence provides durable UUID identities for:

```text
timesheets.id
timesheet_entries.id
timesheet_adjustments.id
```

A Timesheet Entry also stores:

```text
work_date
project_id
wbs_node_id
cost_code_id
cost_type_id
regular_hours
overtime_hours
```

A Timesheet Adjustment stores:

```text
timesheet_id
original_entry_id
adjustment_hours
reason
approved_by
created_at
```

Stage 19 already prevents normal entry replacement after the Timesheet becomes approved and keeps post-approval correction append-only.

## Pass-305 project amendment

The source requires stable at-most-once identity but does not name its physical key. Pass 305 therefore freezes only the minimum identity semantics that can be derived from the durable Stage-19 records without inventing Payroll formulas or public APIs.

### 1. The Timesheet header is grouping context, not the Payroll source line

`timesheets.id` identifies the approved source document, but it is not granular enough to enforce at-most-once consumption because one Timesheet can contain multiple Project/cost-coded entries.

The original worked-time Payroll source line is therefore identified by:

```text
source document: timesheets.id
source line:     timesheet_entries.id
```

The durable **line identity** is `timesheet_entries.id`.

### 2. Post-approval corrections have their own source identity

A `timesheet_adjustments` row is append-only and has its own UUID. It must never overwrite or reuse the identity of the original Timesheet Entry.

For future consumption tracking:

```text
original worked-time source line -> timesheet_entries.id
post-approval correction line    -> timesheet_adjustments.id
```

`original_entry_id` preserves traceability from the correction back to the original entry.

This does not yet decide which Payroll period consumes a late adjustment or whether a separate adjustment-approval lifecycle is required. Those rules remain blocked.

### 3. Source kind must distinguish original entries from adjustments

An original entry ID and an adjustment ID come from different source relations. A future durable Payroll consumption claim therefore needs a discriminator equivalent to:

```text
TIMESHEET_ENTRY
TIMESHEET_ADJUSTMENT
```

These names describe the Pass-305 identity concept; they are **not** added as public API enums or database tokens in this pass.

A future storage design must be able to distinguish the two kinds without relying on browser input.

### 4. Only approved Timesheets can supply original Payroll hours

The source says approved hours become Payroll input. Therefore:

```text
DRAFT Timesheet             -> not Payroll-consumable
PENDING approval Timesheet  -> not Payroll-consumable
APPROVED Timesheet          -> eligible source state
```

Stage 20 must revalidate that source state on the server. A browser cannot promote an unapproved Timesheet into the Payroll source set.

Pass 305 does not invent additional Timesheet lifecycle tokens.

### 5. Original source selection is work-date based

The source records labor by date, and every Timesheet Entry has `work_date` while a Payroll Run has `period_start` and `period_end` in the reviewed Stage-20 table definition.

The narrow selection rule frozen for **original Timesheet Entries** is:

```text
same authenticated Company
AND source Timesheet is approved
AND entry.work_date is inside the Payroll Run period (inclusive)
```

The Timesheet header period remains validation/grouping context. It must not cause an entry outside the Payroll Run's own date boundary to be silently consumed.

This rule does not solve Payroll-group identity, overlapping Payroll groups, Shift policy, or late-adjustment period allocation.

### 6. At-most-once is a durable server-side uniqueness invariant

A completed/finalized Payroll consumption must be durably unique by a key equivalent to:

```text
company_id
+ source_kind
+ source_line_id
```

The Payroll Run ID must **not** be part of the uniqueness boundary that allows the same source line to be finalized again in another run. The consuming run is traceability data, not permission to duplicate the source.

A browser-provided `consumed`, `posted`, `sourceKind`, `sourceLineId`, or Payroll posting-status flag is never authoritative.

### 7. Calculation replay and final consumption are different concerns

Foundation command idempotency can make one HTTP command replay-safe, but command idempotency alone does not prove that the same Timesheet Entry cannot be consumed by two different Payroll Runs or two different request keys.

Therefore Stage 20 needs both:

```text
command idempotency
AND
durable source-consumption uniqueness
```

Pass 305 does not invent intermediate consumption-status tokens such as `RESERVED`, `CALCULATED`, or `CONSUMED` because the source does not define them.

### 8. Finalized consumption is not released by recalculation or correction

The source says finalized Payroll is immutable and corrections occur through adjustment/reversal in a later run.

Therefore once an original Timesheet Entry has been finalized into Payroll:

- recalculating another draft run must not make that original line available again;
- reversing/adjusting Payroll must preserve traceability to the finalized consumption;
- a later Workforce correction must use its distinct `timesheet_adjustments.id` identity rather than re-consuming the original entry ID.

The exact Payroll reversal record shape remains unresolved.

### 9. Payroll-period locking must be derived from durable consumption evidence

Module 13 says approved Payroll periods block normal edits. Stage 19 already blocks normal entry replacement once a Timesheet is approved, but it has no Payroll relationship because Module 14B does not yet exist.

Stage 20 must eventually be able to answer, server-side, whether a source line has been finalized/consumed by Payroll. That durable evidence is also the basis for any future `PAYROLL_PERIOD_LOCKED` enforcement that goes beyond the existing approved-Timesheet immutability rule.

Pass 305 does not add a `payroll_run_id`, `payroll_status`, or `consumed_at` column to Module-13 tables because the controlling source does not define that physical design.

### 10. Current source-defined Payroll tables cannot yet enforce this invariant by themselves

The reviewed Module-14 table set names:

```text
payroll_runs
payslips
payslip_items
```

but the reviewed `payslip_items` fields contain no Timesheet Entry/Adjustment source identity. The current project also correctly has not generated those Stage-20 tables yet.

Therefore the at-most-once invariant cannot honestly be implemented from the current Stage-19 + reviewed Stage-20 table fields alone.

Before Payroll persistence/runtime is generated, a reviewed persistence amendment must provide a durable mapping that can store:

```text
Company identity
consuming Payroll Run identity
consuming Payslip/Employee identity where applicable
source kind
source line ID
finalized/consumed proof
```

and enforce uniqueness across the source identity.

Pass 305 freezes the **required capability and uniqueness semantics**, not an unsupported table name or column layout.

### 11. Adjustments remain a separate unresolved consumption policy

The existing Stage-19 adjustment row gives stable correction identity and traceability, but the source does not define:

```text
whether adjustment requires separate approval before Payroll
which Payroll period receives a late adjustment
whether adjustment changes regular or overtime quantity
how a negative correction is bounded
how Payroll reversal and Workforce adjustment interact
```

Therefore Pass 305 freezes the adjustment **identity** only. It does not declare every existing adjustment immediately Payroll-consumable.

### 12. Job Cost is not pulled into Stage 20

Module 7 already has a source-derived `cost_actuals` ledger with its own stable source-key concept, but the source defers full Employee -> Timesheet -> Payroll -> labor-cost proof to Stage 27 and does not define the exact labor-value basis.

Pass 305 therefore does not:

```text
create cost_actuals rows
emit job_cost.source_posted
choose a Job-Cost source_type token
map Payroll source identity into Job Cost
choose base pay vs gross pay vs loaded labor cost
```

Those remain later integration work.

## A6/A9 outcome from Pass 303

### A6 — Approved Timesheet eligibility and Payroll-period locking

**Resolved by Pass 305:** original Payroll source lines come only from approved Timesheets and are selected by `timesheet_entries.work_date` inside the Payroll Run period, under the authenticated Company.

**Still blocking:** Payroll-group identity, durable Payroll-consumption persistence, correction-period allocation, Shift/hour-limit completion and any extra lock behavior beyond approved-Timesheet immutability.

### A9 — At-most-once Payroll consumption/source identity

**Identity resolved by Pass 305:** original source line = `timesheet_entries.id`; correction source line = `timesheet_adjustments.id`; source kind distinguishes those relations; finalized consumption must be unique by Company + source kind + source line ID.

**Still blocking:** the reviewed source supplies no physical Payroll source-consumption relation/columns capable of enforcing that uniqueness. A persistence amendment is required before runtime.

## Explicitly prohibited shortcuts

Until a reviewed persistence/lifecycle contract completes Stage 20, do not:

```text
Treat timesheets.id alone as the unique Payroll source line
Use Payroll Run ID inside the uniqueness key in a way that permits duplicate consumption across runs
Use HTTP Idempotency-Key as the only duplicate-consumption protection
Mark a Timesheet Entry consumed only in memory
Let the browser send authoritative consumed/posted flags
Mutate an original approved Timesheet Entry to represent a correction
Reuse the original entry source ID for a post-approval adjustment
Assume every Timesheet Adjustment is automatically Payroll-approved
Assign late adjustments to a Payroll period by guesswork
Create Job-Cost actuals during this contract pass
Invent a payroll_source_consumptions table before its persistence shape is reviewed
```

## No production change in Pass 305

Pass 305 makes exactly zero changes to:

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
status/event vocabulary
Payroll formulas
Payroll persistence
Job-Cost posting
Finance posting
```

## Stage-20 runtime status

Pass 305 resolves the stable Workforce source-line identity and the minimum original-entry eligibility/at-most-once semantics, but Stage-20 runtime generation remains blocked.

The remaining blocking contract work includes:

1. physical Payroll source-consumption persistence and uniqueness enforcement;
2. Payroll Run grouping/overlap identity;
3. Payroll approval lifecycle and Module-22 mapping;
4. effective-dated compensation persistence/pay type;
5. earnings/deductions/net calculation and rounding policy;
6. adjustment approval/period allocation;
7. Shift/hour-limit correction before authoritative consumption;
8. leave effect when included in Payroll policy;
9. Stage-20 versus Stage-26 Finance posting boundary.

The next reviewed pass is **Pass 306 — Payroll Run identity, period-lock and approval-lifecycle contract**. It must resolve A4/A5 and the remaining lifecycle portion of A6 without starting Payroll formulas or Finance source adapters.
