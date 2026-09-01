# Pass 308 — Stage-20 Payroll Persistence Amendment Contract

## Purpose

Pass 308 freezes the smallest **Stage 20 / Module 14B Payroll persistence amendment** needed to make the already-reviewed Payroll workflow implementable without guessing historical compensation, calculated source membership, blocking-exception state or at-most-once Workforce consumption.

This is a contract and verification pass only. It does not change Prisma, create a migration, add a repository/service function, expose a Fastify route, change React, add a permission, calculate Payroll, post Job Cost or post Finance.

The controlling source already defines these Module-14 persistence resources:

```text
employees
leave_requests
payroll_runs
payslips
payslip_items
```

It also requires:

- pay type plus approved compensation inputs;
- exact-decimal salary/rates with explicit effective dates;
- approved Timesheet/overtime input;
- durable calculation before submit/finalize;
- blocking exceptions resolved before finalization;
- immutable finalized Payroll;
- at-most-once Payroll consumption of an approved Workforce source line.

The source-defined five tables cannot represent all of those requirements by themselves. Pass 308 therefore records an explicit project-level amendment instead of silently treating current Employee rates, browser state or Foundation audit/outbox rows as missing Payroll business state.

## Existing frozen boundaries from Passes 304–307

Pass 308 keeps all earlier decisions:

```text
HR / Payroll owns compensation authority.
Module 13 owns approved worked-time quantities and project cost coding.
Browser input never owns rates, Payroll totals or labor cost.
Original Payroll Workforce source identity is timesheet_entries.id.
Timesheet-adjustment consumption remains outside the first calculation scope.
Payroll group is the authenticated Company.
Company Payroll periods are inclusive and non-overlapping.
Payroll Run lifecycle is DRAFT -> PENDING_APPROVAL -> APPROVED -> FINALIZED.
Payroll submit is a reviewed bodyless amendment that reuses Module 22 approval.
Leave effect, Shift and configured numeric hour limits are disabled in the first reviewed Payroll scope.
No statutory/tax formula or browser monetary override is invented.
```

## Amendment rule

Appendix A remains the source of the Module-14 business scope. The following persistence additions are **explicit implementation amendments required to make those source rules enforceable**. They do not create a new business module.

The first Stage-20 persistence boundary contains the three source-defined Payroll tables plus exactly three supporting tables:

```text
employee_compensation_periods      amendment: effective-dated pay authority
payroll_runs                       source-defined Payroll Run
payslips                           source-defined Employee Payroll snapshot
payslip_items                      source-defined calculation lines
payroll_calculation_exceptions     amendment: durable blocking calculation evidence
payroll_source_consumptions        amendment: calculated Workforce source membership + final consumption
```

No compensation-component master, payroll-group table, tax table, Shift table, leave-balance table, Payroll journal table or Job-Cost adapter table is added by this contract.

## 1. Effective-dated compensation persistence

### New table: `employee_compensation_periods`

Minimum fields:

```text
id                 UUID primary key
company_id         UUID -> companies.id
employee_id        UUID -> employees.id
pay_type           VARCHAR(16)
base_salary        DECIMAL(18,2) nullable
hourly_rate        DECIMAL(18,4) nullable
effective_from     DATE
effective_to       DATE nullable
created_at         TIMESTAMPTZ
```

The first reviewed internal pay-type vocabulary is deliberately limited to the two compensation shapes already present on Employee:

```text
SALARY
HOURLY
```

These are server-owned persistence tokens. Pass 308 does not add a public compensation API or browser-editable Payroll pay-type field.

Required row shape:

```text
SALARY -> base_salary is present, hourly_rate is null
HOURLY -> hourly_rate is present, base_salary is null
```

`effective_to`, when present, cannot be before `effective_from`.

For one Employee, authoritative compensation periods must not overlap. The future write transaction must serialize compensation-range changes by locking the Employee row before checking overlap. Pass 308 does not require a PostgreSQL extension merely to implement a range-exclusion constraint.

### Existing Employee fields are retained but stop being historical Payroll authority

The source-defined fields remain on `employees`:

```text
base_salary
hourly_rate
```

They are not removed because they are part of the reviewed Module-14A contract. They remain current compensation inputs/profile-maintenance fields, but Stage-20 Payroll must resolve historical pay only from an explicit effective-dated compensation period.

No automatic migration/backfill may infer a compensation period from existing Employee values because the missing `pay_type` and effective date cannot be reconstructed safely.

An Employee with existing `base_salary` / `hourly_rate` but no applicable compensation-period row therefore produces a blocking Payroll calculation exception rather than a guessed rate.

### Compensation approval/read boundary remains narrow

The source says compensation is approved/sensitive but does not define a separate compensation-read permission or compensation approval route. Pass 308 therefore does not invent one.

Future compensation writes remain subject to the reviewed HR write authority and Foundation audit. Public compensation readback remains blocked until its authorization contract is explicitly reviewed.

## 2. Source-defined Payroll Run persistence plus one required snapshot marker

### Source table: `payroll_runs`

Source-defined fields remain:

```text
id
company_id
period_start
period_end
pay_date
status
gross_total
deduction_total
net_total
finalized_at nullable
```

Pass 308 adds exactly one persistence field required to distinguish an uncalculated DRAFT from a durable DRAFT calculation snapshot:

```text
calculated_at TIMESTAMPTZ nullable
```

No `payroll_group_id` is added. Pass 306 already froze the authenticated Company as the first Payroll group.

The server-owned Payroll Run status vocabulary remains:

```text
DRAFT
PENDING_APPROVAL
APPROVED
FINALIZED
```

Required persistence invariants:

- `period_start <= period_end`;
- Company Payroll Run periods do not overlap;
- monetary totals use exact DECIMAL values;
- `net_total = gross_total - deduction_total`;
- `PENDING_APPROVAL`, `APPROVED` and `FINALIZED` require a non-null `calculated_at`;
- `FINALIZED` requires a non-null `finalized_at`;
- non-finalized runs keep `finalized_at` null.

Payroll Run creation must serialize the Company overlap check. The implementation may lock the Company row and query overlapping runs inside the same transaction instead of adding a new Payroll-group abstraction.

## 3. Source-defined Payslip snapshot

### Source table: `payslips`

The reviewed fields remain:

```text
id
payroll_run_id
employee_id
gross_pay
deductions
net_pay
file_id nullable
status
```

Required Stage-20 relational rule:

```text
one Payslip per Payroll Run + Employee
```

Money remains exact DECIMAL and:

```text
net_pay = gross_pay - deductions
```

`status` remains server-owned and must not become an independent browser workflow authority. Pass 308 does not invent a separate public Payslip lifecycle vocabulary; the Payroll Run remains the authoritative workflow state.

The exact target of source-defined `file_id` is still ambiguous between Document and Document Version. That does not block Payroll calculation because the field is nullable. No incorrect file FK is invented in this pass.

## 4. Source-defined Payslip items are the monetary calculation snapshot

### Source table: `payslip_items`

The reviewed fields remain:

```text
id
payslip_id
item_type
code
description
quantity nullable
rate nullable
amount
```

For aggregate arithmetic to be unambiguous, the first internal `item_type` classification is frozen to:

```text
EARNING
DEDUCTION
```

This does not define earning/deduction `code` vocabulary or formulas.

Persistence precision for the first implementation is:

```text
quantity DECIMAL(18,4) nullable
rate     DECIMAL(18,4) nullable
amount   DECIMAL(18,2)
```

`amount` is stored as a non-negative exact amount; `item_type` determines whether the value contributes to earnings or deductions. This avoids mixing positive/negative sign conventions.

The Pass-307 aggregate rules remain:

```text
payslip.gross_pay  = sum(EARNING.amount)
payslip.deductions = sum(DEDUCTION.amount)
payslip.net_pay    = gross_pay - deductions

payroll_run.gross_total     = sum(payslip.gross_pay)
payroll_run.deduction_total = sum(payslip.deductions)
payroll_run.net_total       = gross_total - deduction_total
```

No binary floating-point money calculation is permitted.

## 5. Durable blocking calculation exceptions

### New table: `payroll_calculation_exceptions`

Minimum fields:

```text
id                 UUID primary key
payroll_run_id     UUID -> payroll_runs.id
employee_id        UUID nullable -> employees.id
timesheet_entry_id UUID nullable -> timesheet_entries.id
reason_key         VARCHAR(120)
message            TEXT
created_at         TIMESTAMPTZ
```

Every row in this table is blocking. A separate `is_blocking`, `resolved`, `resolved_by` or browser-owned override field is unnecessary in the first scope.

The exact `reason_key` vocabulary is not frozen by Pass 308. It will be defined with the calculation/service contract rather than being guessed in a persistence pass.

Required behavior:

- DRAFT calculation writes exception rows transactionally with the calculated snapshot;
- DRAFT recalculation replaces the current run's exception set transactionally;
- submit and finalize fail while any exception row exists for the run;
- exception rows cannot be edited by the browser;
- exception messages must not leak salary/rate values to users lacking compensation authorization;
- once the run leaves DRAFT, the exception snapshot is immutable.

Foundation audit/outbox records remain cross-cutting evidence. They are not substitutes for this durable Payroll business state.

## 6. Durable calculated Workforce source membership and final consumption

### New table: `payroll_source_consumptions`

The first reviewed scope consumes only original approved Timesheet Entries, so the physical relation uses a direct FK rather than a generic `resource_type/resource_id` pair.

Minimum fields:

```text
id                 UUID primary key
company_id         UUID -> companies.id
payroll_run_id     UUID -> payroll_runs.id
timesheet_entry_id UUID -> timesheet_entries.id
consumed_at        TIMESTAMPTZ nullable
```

Required indexes/uniqueness semantics:

```text
UNIQUE (payroll_run_id, timesheet_entry_id)

UNIQUE (company_id, timesheet_entry_id)
WHERE consumed_at IS NOT NULL
```

The first uniqueness prevents the same source line from appearing twice in one calculation snapshot. The partial Company/source uniqueness enforces at-most-once **finalized** Payroll consumption while allowing a DRAFT calculation snapshot to be replaced without falsely treating selection as final consumption.

This physical shape is equivalent to the Pass-305 abstract identity:

```text
company_id + source_kind(TIMESHEET_ENTRY) + source_line_id
```

but uses a direct UUID FK because Module 13 is a normal business relationship and the source says normal relationships use direct foreign keys.

### Calculation-time meaning

During DRAFT calculation, one row is created for each selected approved `timesheet_entries.id` and `consumed_at` remains null.

These rows are the durable source-membership snapshot. They ensure submit/approval refers to the same exact source set that produced the Payslip calculation instead of re-running a broad period query later.

DRAFT recalculation may transactionally replace the run's unconsumed source rows.

### Submit/approval meaning

When the run leaves DRAFT, its source-membership rows are frozen. New Timesheet approvals after that point do not silently enter the already-submitted Payroll snapshot.

The policy for a late-approved historical source after a Payroll period has been submitted/finalized remains outside this pass and must use a reviewed later correction policy rather than mutating the frozen run.

### Finalization meaning

Finalization must, in one business transaction:

1. lock/revalidate the approved Payroll Run;
2. verify there are no blocking exception rows;
3. verify each snapshotted Timesheet Entry still belongs to the same Company and an APPROVED Timesheet;
4. verify the source has no finalized consumption in another Payroll Run;
5. set `consumed_at` on the run's source rows;
6. transition the Payroll Run/Payslip snapshot to finalized state;
7. write required Foundation audit/outbox evidence.

If any unique-source or validation step fails, the finalization transaction rolls back.

No Job-Cost actual or Finance journal is created by this persistence contract.

## 7. Timesheet Adjustments remain a future direct-FK extension

Pass 305 already froze `timesheet_adjustments.id` as the correction identity, but Pass 307 excluded adjustment consumption until the correction-period and regular/overtime allocation policy is defined.

Therefore Pass 308 does not add a generic source-kind polymorphic column merely for future flexibility.

A later reviewed adjustment amendment may add a dedicated `timesheet_adjustment_id` relation or a dedicated adjustment-consumption table after its Payroll-period behavior is frozen.

## 8. Calculation snapshot transaction boundary

A future DRAFT calculate/recalculate transaction must own these Payroll writes together:

```text
payroll_source_consumptions where consumed_at is null
payslips
payslip_items
payroll_calculation_exceptions
payroll_runs.gross_total
payroll_runs.deduction_total
payroll_runs.net_total
payroll_runs.calculated_at
Foundation audit/outbox for payroll.calculated
```

If any write fails, the previous DRAFT snapshot must remain intact or the entire replacement must roll back. A half-replaced Payslip/source/exception set is invalid.

The source set and money snapshot are frozen when the run transitions to `PENDING_APPROVAL`.

## 9. Approval linkage needs no Payroll foreign-key column

Pass 306 already freezes Module 22 as Payroll approval authority using:

```text
resourceType = payroll_run
resourceId   = payroll_runs.id
```

Module 22 already persists its own approval request and immutable payload snapshot. Pass 308 therefore does not add `approval_request_id` to `payroll_runs` merely to duplicate a cross-cutting relationship.

The Payroll submit service will find/reuse the authorized Module-22 request through that stable resource identity.

## 10. Existing source tables are not repurposed for missing state

Pass 308 explicitly prohibits these shortcuts:

```text
Do not put historical compensation JSON on employees.
Do not use Employee.current base_salary/hourly_rate as historical Payroll authority.
Do not keep blocking exceptions only in API/browser memory.
Do not use audit_logs or outbox_events as the Payroll exception table.
Do not mark a Timesheet or Timesheet Entry with a single payroll_run_id as the consumption ledger.
Do not mutate approved Timesheet Entries to record Payroll consumption.
Do not create generic polymorphic source references when a direct Timesheet Entry FK is available.
Do not create a payroll_groups table for the first Company-wide Payroll scope.
Do not add tax/statutory/leave/Shift tables in this persistence amendment.
Do not add Job-Cost or Finance source-adapter tables here.
```

## 11. Migration and compatibility rules for the future implementation pass

The later persistence implementation must:

- add the source-defined Stage-20 Payroll tables and the three reviewed supporting tables in one Stage-20 migration gate;
- keep existing Module-14A Employee and Leave data intact;
- keep existing Module-13 Timesheet IDs stable;
- add no guessed compensation-history rows during migration;
- create required FKs, checks and indexes only after their target tables already exist;
- verify both a clean database and the immediately previous supported Stage-19 schema;
- verify rollback/atomicity and Company isolation in later integration/operations passes.

No migration is created in Pass 308 itself.

## 12. What this persistence amendment resolves

Pass 308 resolves the physical-data question for these Stage-20 blockers:

```text
explicit pay type representation                -> employee_compensation_periods.pay_type
explicit compensation effective dates          -> effective_from / effective_to
historical compensation authority              -> employee_compensation_periods
calculation existence marker                    -> payroll_runs.calculated_at
calculated Employee snapshot                    -> payslips / payslip_items
blocking calculation evidence                   -> payroll_calculation_exceptions
exact calculated Workforce source membership    -> payroll_source_consumptions rows
at-most-once finalized source consumption       -> consumed_at + partial unique source constraint
```

It does **not** resolve the formulas that populate those rows.

## 13. Remaining Stage-20 runtime blockers after Pass 308

Stage-20 runtime generation is still blocked on:

1. the exact compensation maintenance/write contract that creates authoritative effective-dated records without exposing sensitive salary data;
2. salary-period/proration calculation and the earning/deduction item-generation vocabulary;
3. overtime-rate behavior when approved overtime exists;
4. exact blocking-exception `reason_key` and service/error mapping;
5. late-approved time and post-approval Timesheet Adjustment correction-period/allocation policy;
6. exact Stage-20 versus Stage-26 Finance posting boundary;
7. Payslip `file_id` Document-versus-Document-Version target before file publication is implemented.

Those gaps must not be hidden by the persistence migration.

## No production change in Pass 308

Pass 308 makes exactly zero changes to:

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
Payroll calculation runtime
Timesheet runtime
Job-Cost posting
Finance posting
```

## Stage-20 status and next pass

The reviewed persistence shape is now frozen, but no table/migration is generated yet.

Truthful status:

```text
PASS_308_STAGE_20_PAYROLL_PERSISTENCE_AMENDMENT_FROZEN_RUNTIME_BLOCKED
```

Next reviewed pass: **Pass 309 — Stage-20 Payroll persistence implementation**. It may implement only the Prisma models, constraints/indexes and one migration described here; repository/service/API/React behavior must remain deferred to later passes.
