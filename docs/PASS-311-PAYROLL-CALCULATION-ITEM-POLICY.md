# Pass 311 — Stage-20 Payroll Calculation Item, Proration, Overtime and Blocking-Exception Vocabulary Contract

## Purpose

Pass 311 freezes the smallest executable **Stage 20 / Module 14B Payroll calculation-item policy** that can be supported by the current source contract and the persistence already implemented in Pass 309.

This is a **contract and verification pass only**. It does not change Prisma, migrations, repositories, services, Fastify routes, React, permissions, Timesheet behavior, Job Cost or Finance.

The controlling source requires Payroll to:

- consume approved Workforce time;
- use approved HR/Payroll compensation authority;
- calculate earnings, deductions and net pay server-side;
- keep money and rates exact-decimal;
- stop finalization while blocking exceptions exist;
- keep finalized Payroll immutable;
- consume each approved Workforce source at most once.

The source does not define the meaning/frequency of `base_salary`, salary proration, an overtime multiplier, statutory deductions, manual deductions, earning/deduction code vocabulary, a money-rounding rule, or a calculation-exception `reason_key` vocabulary.

Pass 311 therefore freezes one deliberately narrow first calculation profile and makes unsupported cases explicit blocking exceptions instead of guessing payroll law or compensation policy.

## Existing frozen boundaries from Passes 304–310

Pass 311 keeps all earlier decisions:

```text
HR / Payroll owns compensation and rate authority.
Module 13 owns approved worked-time quantities and project cost coding.
The browser never owns rates, Payroll totals or calculated money.
Historical Payroll compensation comes only from employee_compensation_periods.
Original Workforce source identity is timesheet_entries.id.
Timesheet Adjustment consumption remains deferred.
Company is the first Payroll group.
Payroll periods are inclusive and Company-wide non-overlapping.
Payroll Run lifecycle is DRAFT -> PENDING_APPROVAL -> APPROVED -> FINALIZED.
DRAFT recalculation transactionally replaces the current calculation snapshot.
Module 22 owns the approval decision.
Leave effect, Shift and configured numeric hour limits are disabled in the first Payroll scope.
No statutory/tax formula is invented.
Compensation-history public read/write uses employees.manage.
Internal Payroll compensation lookup uses payroll.calculate.
```

## 1. Calculation is allowed only for a DRAFT Payroll Run

The future calculate/recalculate command may change a Payroll snapshot only while the Payroll Run is `DRAFT`.

A calculation transaction must lock the Payroll Run before replacing:

```text
payroll_source_consumptions for the run where consumed_at is null
payslips
payslip_items
payroll_calculation_exceptions
payroll_runs.gross_total
payroll_runs.deduction_total
payroll_runs.net_total
payroll_runs.calculated_at
Foundation payroll.calculated audit/outbox evidence
```

`PENDING_APPROVAL`, `APPROVED` and `FINALIZED` snapshots are not recalculable.

No calculation result is accepted from the browser.

## 2. First executable item vocabulary is intentionally minimal

Pass 311 activates exactly one generated Payslip item code:

```text
REGULAR_HOURS
```

Its fixed meaning is:

```text
itemType   = EARNING
code       = REGULAR_HOURS
description = Regular hours
quantity   = exact approved regular-hour quantity
rate       = exact effective hourly rate
amount     = exact quantity × rate, rounded once to DECIMAL(18,2)
```

No other item code becomes executable in this pass.

In particular, Pass 311 does not invent:

```text
BASE_SALARY
OVERTIME_HOURS
BONUS
ALLOWANCE
TAX
PENSION
LOAN
ABSENCE
LEAVE
MANUAL_DEDUCTION
```

Those names are examples of unsupported concepts only; they are not reserved public tokens or seeded codes.

## 3. HOURLY regular-time calculation is the only first-scope money formula

A Workforce source line can generate `REGULAR_HOURS` money only when all of these are true:

```text
parent Timesheet belongs to the authenticated Company
parent Timesheet status = APPROVED
Timesheet Entry work_date is inside the Payroll Run inclusive period
Employee belongs to the same Company
an employee_compensation_periods row covers work_date
that compensation row has pay_type = HOURLY
hourly_rate is present
source is not finalized in another Payroll Run
overtime_hours = 0
```

The effective compensation row is resolved by the source line's `work_date`, not by Payroll Run creation date, pay date, the newest compensation row, or the legacy Employee profile rate.

When one Employee has regular-hour sources under different effective hourly-rate periods, the future calculation may create one `REGULAR_HOURS` item per distinct effective compensation period/rate. It must not blend different rates into one guessed average rate.

The corresponding eligible Timesheet Entry IDs are recorded in `payroll_source_consumptions` with `consumed_at = null` as the durable DRAFT source snapshot.

## 4. Exact-decimal multiplication and rounding rule

Pass 309 persists:

```text
quantity DECIMAL(18,4)
rate     DECIMAL(18,4)
amount   DECIMAL(18,2)
```

The calculation must therefore use decimal/integer-safe arithmetic and never JavaScript binary floating-point money arithmetic.

For the first executable profile, Pass 311 explicitly freezes this project-level rounding amendment:

```text
REGULAR_HOURS amount
  = quantity × rate
  = round HALF_UP to 2 decimal places at the Payslip-item line
```

Aggregates then sum the stored two-decimal item amounts exactly:

```text
payslip.gross_pay  = sum(EARNING item amounts)
payslip.deductions = sum(DEDUCTION item amounts)
payslip.net_pay    = gross_pay - deductions

payroll_run.gross_total     = sum(payslip.gross_pay)
payroll_run.deduction_total = sum(payslip.deductions)
payroll_run.net_total       = gross_total - deduction_total
```

The rounding decision is explicit because the source requires exact decimals but does not define how a four-decimal quantity/rate product is reduced to a two-decimal money field.

## 5. No automatic deduction item exists in the first executable profile

The source requires deduction totals but defines no deduction formula or component vocabulary.

Therefore a successfully calculated first-scope HOURLY Payslip has:

```text
deduction items = none
deductions       = 0.00
net_pay          = gross_pay
```

This is not a statutory-payroll claim. It only means no reviewed deduction rule is enabled yet.

The browser cannot enter an arbitrary deduction amount to make the run proceed.

A later tax/statutory/manual-deduction feature requires a reviewed item code, authority, formula/input contract, audit behavior and tests.

## 6. SALARY calculation and salary proration remain blocked rather than guessed

The source defines `base_salary` but does not define whether it means monthly salary, weekly salary, annual salary, Payroll-period salary or another frequency.

Without that basis, even a full-period salary amount cannot be calculated safely, and a partial-period proration formula would be an additional guess.

Therefore Pass 311 freezes:

```text
SALARY money calculation = unsupported in the first executable profile
salary proration         = not performed
```

When a calculation encounters a source Employee whose applicable compensation row is `SALARY`, it records the blocking reason:

```text
SALARY_PERIOD_POLICY_REQUIRED
```

No `BASE_SALARY` item is generated and no rate conversion or proration occurs.

This exception can be removed only after a reviewed contract defines the salary amount basis/frequency and any partial-period behavior.

## 7. Overtime calculation remains blocked rather than guessing a multiplier

The source captures `overtime_hours` but defines no overtime multiplier, alternate rate, threshold, day type, holiday rule or approval override.

Therefore:

```text
overtime_hours > 0
    -> OVERTIME_RATE_POLICY_REQUIRED
```

for the affected Employee calculation.

Pass 311 does not silently pay overtime at 1.0x, 1.5x, 2.0x or another multiplier.

No overtime earning item is generated until a reviewed overtime-rate policy exists.

## 8. Blocking calculation-exception reason vocabulary

Pass 311 freezes exactly five internal `payroll_calculation_exceptions.reason_key` tokens for the first calculation implementation:

```text
MISSING_COMPENSATION_PERIOD
SALARY_PERIOD_POLICY_REQUIRED
OVERTIME_RATE_POLICY_REQUIRED
SOURCE_ALREADY_CONSUMED
SOURCE_INTEGRITY_CONFLICT
```

Their meanings are:

### `MISSING_COMPENSATION_PERIOD`

No authoritative `employee_compensation_periods` row covers the required Workforce source date.

Legacy `employees.base_salary` or `employees.hourly_rate` values must not be used as fallback.

### `SALARY_PERIOD_POLICY_REQUIRED`

The applicable compensation row is `SALARY`, but the source does not define salary frequency or proration.

### `OVERTIME_RATE_POLICY_REQUIRED`

At least one otherwise eligible approved source contains positive `overtime_hours`, but no reviewed overtime-rate policy exists.

### `SOURCE_ALREADY_CONSUMED`

The Timesheet Entry already has finalized Payroll consumption in another Payroll Run.

### `SOURCE_INTEGRITY_CONFLICT`

The source fails Company, approved-Timesheet or inclusive Payroll-period revalidation while calculation is locking/rebuilding the snapshot.

This token is an integrity/business guard. It must not expose another Company's identifiers or sensitive compensation values.

No generic `UNKNOWN_ERROR`, `MANUAL_OVERRIDE`, `TAX_ERROR`, `LEAVE_ERROR` or Shift-related reason is invented.

## 9. Exception persistence and employee snapshot behavior

Calculation may complete as a DRAFT review snapshot even when blocking exceptions exist.

For an Employee with any blocking calculation exception:

```text
Payslip for that Employee       = not generated
Payslip items for that Employee = not generated
exception rows                  = persisted
```

This prevents a partial Employee Payslip from looking payable while part of its calculation is unresolved.

Eligible source-membership rows may still be persisted for the DRAFT snapshot when their source integrity is valid and they are not already finalized elsewhere. `SOURCE_ALREADY_CONSUMED` and `SOURCE_INTEGRITY_CONFLICT` sources are not inserted as valid source-membership rows.

Other Employees without blocking exceptions may have valid DRAFT Payslips in the same run. Run totals are the exact sum of those valid DRAFT Payslips, but the run cannot be submitted or finalized while **any** exception row exists.

DRAFT recalculation replaces Payslips, items, source memberships, exceptions, totals and `calculated_at` atomically.

## 10. Public stable-error mapping remains source-bounded

The five reason keys above are durable internal calculation evidence; they are not five new public HTTP error codes.

The existing source-defined Module-14 error boundary remains authoritative:

```text
PAYROLL_RUN_CONFLICT
PAYROLL_HAS_BLOCKING_ERRORS
PAYROLL_ALREADY_FINALIZED
```

The future submit and finalize commands use:

```text
PAYROLL_HAS_BLOCKING_ERRORS
```

when any calculation-exception row remains.

Calculate/recalculate returns the server-owned DRAFT calculation snapshot and its blocking-exception summary through the later reviewed response schema; it does not fail the entire request merely because one Employee has a policy exception.

Sensitive exception text must not include salary/rate amounts.

## 11. No browser-owned calculation override

The browser may never provide:

```text
itemType
item code
quantity used for Payroll money
rate
amount
gross pay
deductions
net pay
rounding result
reason_key resolution
source-consumption state
```

The browser may only invoke the reviewed Payroll command and display server-owned results permitted by authorization.

Resolving a calculation exception means correcting authoritative compensation/source policy and recalculating the DRAFT run. No manual monetary override is enabled.

## 12. What Pass 311 resolves

```text
first executable earning item               -> REGULAR_HOURS only
HOURLY regular-time amount                   -> approved regular hours × effective hourly rate
money reduction to DECIMAL(18,2)            -> line-level HALF_UP rounding
first-scope deductions                       -> none; 0.00
salary calculation                           -> blocked, not guessed
salary proration                             -> blocked, not guessed
overtime calculation                         -> blocked, not guessed
blocking reason_key vocabulary               -> five frozen internal tokens
Employee with any calculation exception      -> no partial Payslip for that Employee
run with any calculation exception           -> remains DRAFT; submit/finalize blocked
public blocking error                        -> PAYROLL_HAS_BLOCKING_ERRORS
browser monetary override                    -> prohibited
```

## 13. Still unresolved after Pass 311

Stage-20 Payroll is not yet functionally complete. These items remain outside this contract:

1. salary amount basis/frequency and proration policy;
2. overtime multiplier/rate policy;
3. statutory, tax, benefit and other deduction generation;
4. late-approved time and Timesheet Adjustment Payroll-period/allocation policy;
5. exact Stage-20 versus Stage-26 Finance posting boundary;
6. Payslip `file_id` Document-versus-Document-Version target before publication;
7. public request/response schemas for the Stage-20 compensation and Payroll route amendments.

The first HOURLY regular-time calculation path is now sufficiently frozen for the later schema/repository/service passes, while unsupported salary/overtime cases remain fail-closed with durable reason keys.

## 14. Pass-311 change boundary

Pass 311 makes exactly zero changes to:

```text
Prisma models
migrations
database relations
backend production runtime
repository functions
service functions
Fastify runtime routes
React production runtime
permission codes
Module-13 production runtime
Job-Cost posting
Finance posting
```

Only this contract, focused verification, gate registration, README note and generated evidence belong to Pass 311.

## Next reviewed pass

**Pass 312 — Stage-20 HR/Payroll strict Zod/API schema contract for compensation maintenance and Payroll commands.**
