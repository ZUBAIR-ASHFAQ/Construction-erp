# Pass 307 — Payroll Calculation, Exception, Leave-Effect and Workforce-Policy Scope Contract

## Purpose

Pass 307 freezes the narrow **Stage 20 / Module 14B Payroll calculation scope** that can be supported without inventing tax law, compensation history, Shift data, hour-limit numbers, leave-accrual rules or browser-owned payroll amounts.

This is a contract and verification pass only. It does not add Payroll persistence, compensation persistence, a migration, repository/service logic, Fastify routes, React behavior, a permission, a tax engine, a leave workflow, a Shift model, Job-Cost posting or Finance posting.

The controlling source requires all of the following:

- approved Module-13 regular/overtime hours are controlled Payroll input;
- Payroll calculates earnings, deductions and net pay server-side;
- blocking exceptions must be resolved before finalization;
- salary/rates use exact decimals and explicit effective dates;
- leave affects Payroll only where the Payroll policy includes leave;
- Workforce daily/period hour limits are enforced by policy and duplicate employee/project/date/shift entries are prevented where not allowed;
- finalized Payroll is immutable and corrections occur through later adjustment/reversal rather than destructive editing.

The source does **not** define statutory/tax formulas, earning/deduction component vocabulary, pay-type tokens, salary proration, overtime multipliers, Shift persistence, configured hour-limit values, leave approval/read routes, paid/unpaid leave rules, override request shapes, exception tables, or post-approval Timesheet-adjustment period allocation.

Pass 307 therefore resolves only what can be frozen safely and records the remaining runtime blockers explicitly.

## Existing frozen boundaries from Passes 304–306

Pass 304 already establishes:

```text
HR / Payroll = compensation and labor-rate authority
Module 13    = approved worked-time quantity and project cost coding authority
Browser      = never authoritative for rates, labor cost or Payroll totals
```

Pass 305 already establishes original Payroll source identity as `timesheet_entries.id`, correction identity as `timesheet_adjustments.id`, and finalized at-most-once uniqueness as Company + source kind + source-line ID.

Pass 306 already establishes:

```text
Payroll group = authenticated Company
period        = inclusive [period_start, period_end]
status        = DRAFT -> PENDING_APPROVAL -> APPROVED -> FINALIZED
```

and freezes a bodyless Payroll submit command as the required approval transition before finalization.

Pass 307 does not reopen those decisions.

## Pass-307 calculation and input-policy amendment

### 1. Payroll calculation remains entirely server-owned

The future calculate command must derive its source set and all monetary results on the server.

The browser must never submit authoritative:

```text
gross pay
deduction total
net pay
regular rate
overtime rate
overtime multiplier
salary proration
leave amount
statutory/tax amount
blocking-exception resolution
calculation status
source-consumed status
```

The browser may request calculation of a reviewed Payroll Run, but it cannot provide the result.

### 2. Exact-decimal aggregate arithmetic is frozen

The source already defines exact-decimal Payroll totals and `payslip_items.amount`.

Once future server-owned Payslip items exist, the aggregate arithmetic is:

```text
gross_total     = exact sum of earning item amounts
deduction_total = exact sum of deduction item amounts
net_total       = gross_total - deduction_total
```

The same exact-decimal rule applies per Payslip.

This contract does **not** define how an earning or deduction item amount is generated. Item generation still depends on approved compensation/pay-type/effective-date policy and any reviewed deduction policy.

No binary floating-point money arithmetic is allowed.

### 3. No statutory or tax engine is invented

The source requires earnings and deductions but does not define tax jurisdiction, tax brackets, social contributions, pension rules, benefits, garnishments or other statutory calculations.

Therefore the first reviewed medium-ERP Payroll scope does not invent any statutory/tax formula.

A future statutory deduction may be added only through a reviewed policy/configuration contract. Until then, an undefined statutory amount must not be guessed, defaulted from model knowledge, or silently deducted.

### 4. Unsupported compensation must become a blocking calculation exception

Pass 304 already prohibits inferring pay type or using an undated current Employee rate as historical authority.

Therefore a future calculation must fail the affected Employee as a **blocking exception** when the server cannot determine an unambiguous approved compensation basis for the Payroll period/work date.

Examples of blocking conditions include semantic cases such as:

```text
missing explicit pay type
missing effective-dated compensation
ambiguous overlapping compensation authority
unsupported overtime pay rule when overtime exists
missing required source relationship
source already finalized into another Payroll Run
```

These are contract meanings, not new public error-code tokens. Pass 307 does not invent an exception enum or table.

### 5. Calculation overrides are out of the first Stage-20 scope

The source says Payroll users review exceptions and audit calculation overrides, but it defines no override API, permission, request shape or persistence model.

The first Stage-20 calculation scope therefore does **not** allow the browser to manually override calculated Payroll money.

A blocking exception is resolved by correcting the authoritative source/configuration and recalculating the DRAFT run.

A future manual override requires a separate reviewed command, authorization, reason, audit and immutable calculation-snapshot contract.

### 6. Leave is excluded from the first Payroll calculation scope

The source says leave is recorded/approved **where included in Payroll policy**. It does not require every Payroll policy to include leave.

The current project has only leave-request creation and has no reviewed leave list/detail/approve/reject command, leave accrual/balance model, paid/unpaid policy, holiday/weekend calendar or leave-to-pay formula.

Pass 307 therefore freezes the first Stage-20 Payroll scope as:

```text
leave effect on Payroll = disabled / not included
```

Consequences:

- PENDING leave requests are never Payroll authority.
- No leave request is converted into paid hours, unpaid deduction or salary proration.
- No leave balance or accrual calculation is invented.
- `leave.approved` is not emitted by Payroll.
- Payroll does not reinterpret `employees.manage` as leave approval authority.

If leave is later enabled in Payroll policy, the leave read/approval lifecycle and exact pay effect must be amended first.

### 7. Shift is not a Stage-20 Payroll dimension in the first reviewed scope

The source mentions duplicate employee/project/date/shift entries but defines no Shift field/table/reference in `workforce_assignments`, `timesheets` or `timesheet_entries`.

Pass 307 therefore does not invent a Shift master or `shift_id` merely to make Payroll proceed.

For the first reviewed Payroll scope:

```text
Payroll consumes approved regular_hours and overtime_hours quantities.
Payroll does not group, price or validate by Shift.
```

This is an explicit scope narrowing. If Shift-aware attendance/pay premiums are later required, Shift persistence and duplicate semantics must be reviewed before activation.

### 8. No numeric Workforce hour limit is invented

The source says daily/period hour limits are enforced **by policy**, but it supplies no configured maximum values or policy source.

Pass 307 freezes:

```text
configured daily/period numeric hour cap = absent in the first reviewed scope
```

Therefore Payroll must not hard-code limits such as 8, 12, 16, 24, 40 or 48 hours.

Module-13 approval remains the authority that the recorded quantities were reviewed. Payroll consumes only approved quantities and does not invent a second unconfigured hour-limit engine.

If a Company later configures an hour-limit policy, the policy source, units, period basis, exceptions and enforcement point require a reviewed amendment.

### 9. Approved original Timesheet Entries are the first calculable Workforce source set

For the first Stage-20 calculation scope, the server may consider an original `timesheet_entries` row only when:

```text
Timesheet belongs to the authenticated Company
Timesheet status is APPROVED
entry work_date is inside the Payroll Run inclusive period
Employee belongs to the same Company
future compensation authority can resolve the required pay basis
source line has not been finalized into another Payroll Run
```

Project/WBS/Cost Code/Cost Type remain source context for later Job-Cost integration; they do not allow the browser to control Payroll rate or amount.

### 10. Post-approval Timesheet Adjustments remain excluded until their period policy is defined

Pass 305 froze `timesheet_adjustments.id` as the durable correction identity, but the source does not say which Payroll Run receives a late correction or whether it changes regular hours, overtime hours, or another earning/deduction basis.

Pass 307 therefore does not make every existing adjustment automatically calculable.

The first calculable Workforce source set contains original approved Timesheet Entries only. Adjustment consumption remains blocked until a separate reviewed correction-period and quantity-allocation contract exists.

This exclusion must be visible in Stage-20 acceptance evidence; it must not be silently described as complete adjustment support.

### 11. Blocking exceptions need durable server-owned persistence before submit can be implemented

Pass 306 requires all blocking calculation exceptions to be resolved before Payroll submission.

That rule cannot be enforced honestly if exceptions exist only in memory or only in a browser response.

The future Stage-20 persistence amendment must therefore support durable calculation evidence sufficient to prove:

```text
which Payroll Run calculation produced the result
which Employee/Payslip was affected
whether an exception blocks submission/finalization
what source/configuration condition caused it
whether recalculation replaced the prior DRAFT calculation snapshot
```

Pass 307 freezes this **capability requirement**, not a table name, enum vocabulary or browser-editable resolution flag.

### 12. Recalculation replaces only a DRAFT calculation snapshot

A DRAFT Payroll Run may be recalculated after authoritative inputs are corrected.

Recalculation must:

- derive the source set again on the server;
- replace the prior DRAFT calculated snapshot transactionally;
- recompute all exact-decimal totals from server-generated items;
- recreate/reconcile blocking exception evidence for that DRAFT snapshot;
- never release a source already finalized in another Payroll Run;
- never mutate a `PENDING_APPROVAL`, `APPROVED` or `FINALIZED` calculation snapshot.

No separate calculation-version API is invented in this pass.

### 13. Finalization cannot bypass unresolved calculation blockers

Finalization remains separate from calculation and approval.

The future service must fail finalization when:

```text
calculation snapshot is missing
blocking exceptions exist
approval is not APPROVED
calculation snapshot changed after the approved snapshot
source-consumption uniqueness cannot be committed
```

The exact stable error mapping remains limited to the source-defined Payroll errors unless a later reviewed amendment adds more. Pass 307 does not create new public error codes.

### 14. Job Cost and Finance remain outside this calculation contract

This pass calculates no `cost_actuals`, no Journal, no AP item and no Finance adapter record.

Project cost coding on Timesheet Entries is preserved as source context only.

The exact labor-cost basis and Stage-20/Stage-26 Finance posting split remain separate contracts. This pass must not make Payroll calculation appear finance-complete.

## A3/A7/A8 outcome from Pass 303

### A3 — Payroll calculation policy

**Resolved at aggregate/scope level by Pass 307:** all monetary results are server-owned exact decimals; gross/deduction/net aggregates derive from server-generated Payslip items; no statutory/tax engine or browser monetary override is invented; unresolved authoritative input produces a blocking calculation exception.

**Still blocking runtime:** the source still lacks explicit pay type, effective-dated compensation persistence, overtime formula, earning/deduction item-generation policy and durable exception persistence.

### A7 — Shift/hour-limit correctness before Payroll consumption

**Resolved for the first reviewed scope by explicit narrowing:** Shift is disabled as a Payroll dimension because no Shift persistence exists, and no numeric hour-cap policy is configured. Payroll consumes only Module-13 approved regular/overtime quantities and must not invent Shift or hour-limit values.

**Future activation requirement:** a Company-configured Shift or hour-limit policy requires a reviewed persistence/configuration amendment before activation.

### A8 — Leave effects when Payroll policy includes leave

**Resolved for the first reviewed scope:** leave effect is disabled/not included in Stage-20 Payroll calculation. No paid/unpaid leave, accrual, balance, deduction or proration rule is invented.

**Future activation requirement:** leave must first gain a reviewed read/approval lifecycle plus exact Payroll effect.

## Explicitly prohibited shortcuts

Until later Stage-20 passes complete the remaining persistence and compensation contracts, do not:

```text
Let the browser submit Payroll totals or item amounts
Use floating-point arithmetic for money
Invent tax or statutory deductions
Infer pay type from nullable Employee fields
Use current Employee compensation as historical authority
Guess salary proration or hourly conversion
Assume 1.5x / 2x overtime
Add a Shift table/field without review
Hard-code daily or weekly hour limits
Treat a leave request as paid/unpaid Payroll input
Create a manual Payroll money override endpoint
Treat every Timesheet Adjustment as immediately Payroll-consumable
Keep blocking exceptions only in browser memory
Recalculate PENDING_APPROVAL / APPROVED / FINALIZED Payroll
Create Job-Cost actuals or Finance journals from this contract pass
```

## No production change in Pass 307

Pass 307 makes exactly zero changes to:

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
Payroll formulas tied to specific pay types/components
Payroll persistence
Timesheet persistence
leave workflow
Shift/hour policy runtime
Job-Cost posting
Finance posting
```

## Stage-20 runtime status

Pass 307 resolves A7 and A8 for the first reviewed scope and narrows A3, but Stage-20 runtime generation remains blocked.

The remaining blockers are:

1. explicit pay-type representation and effective-dated compensation persistence;
2. approved earning/deduction item-generation policy, including overtime behavior;
3. durable Payroll calculation/exception/source-consumption persistence and uniqueness;
4. post-approval Timesheet Adjustment period/quantity allocation;
5. Stage-20 versus Stage-26 Finance posting boundary.

The next reviewed pass is **Pass 308 — Stage-20 Payroll persistence amendment contract**. It must freeze the smallest persistence changes required for effective-dated compensation, Payroll calculation snapshots, blocking exceptions and at-most-once Workforce source consumption without starting unrelated master-data repairs or Finance source adapters.
