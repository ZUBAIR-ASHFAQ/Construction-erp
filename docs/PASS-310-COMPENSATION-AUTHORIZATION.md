# Pass 310 — Compensation Maintenance, Write & Sensitive-Read Authorization Contract

## Purpose

Pass 310 freezes the smallest authorization and public-maintenance contract required to make the Stage-20 `employee_compensation_periods` persistence from Pass 309 usable without exposing salary data through ordinary Employee reads or inventing a new permission family.

This is a **contract and verification pass only**. It does not change Prisma, migrations, repositories, services, Fastify routes, React, permission seeds, Payroll formulas, Timesheet behavior, Job Cost or Finance.

The controlling requirements already establish all of these boundaries:

- Employee compensation is maintained by HR/Payroll.
- Salary and pay-rate values use exact decimals and effective dates are explicit.
- Salary data requires stricter access than general Employee profile data.
- Payroll calculation consumes approved compensation authority server-side.
- Browser input must not own Payroll totals, lifecycle state, Company identity or actor identity.
- Compensation changes require audit evidence.

The source does **not** define a dedicated `salary.read`, `compensation.read`, `compensation.manage` or compensation-approval permission. Pass 310 therefore reuses the narrowest existing HR authority instead of adding a speculative permission.

## 1. Existing permissions remain the complete permission vocabulary

No new permission code is added.

The relevant reviewed permissions remain:

```text
employees.read
employees.manage
payroll.read
payroll.calculate
payroll.finalize
payslip.self_read
```

Pass 310 freezes these meanings for compensation access:

```text
Ordinary Employee profile read
    employees.read

Public compensation-history read
    employees.manage

Public compensation-history write
    employees.manage

Internal Payroll calculation lookup
    payroll.calculate
```

`employees.read` alone must never expose `base_salary`, `hourly_rate`, compensation-period amounts or compensation history.

`payroll.read` alone is **not** a general Employee salary-history permission. It permits authorized Payroll result/read surfaces, not unrestricted HR compensation browsing.

`payroll.calculate` permits the Payroll service to resolve effective compensation internally for calculation after its own authorization check. It does not grant a browser a general compensation-history endpoint.

`payslip.self_read` remains limited to the authorized employee's own Payslip contract and is not a compensation-master read permission.

## 2. Public compensation maintenance uses two explicit Stage-20 amendment routes

The source's original Module-14 route table has no effective-dated compensation maintenance endpoint. Pass 309 now has an authoritative effective-dated table, so Stage 20 needs a minimal explicit amendment rather than hiding compensation inside generic Employee PATCH behavior.

The reviewed Stage-20 compensation amendment is exactly:

```http
GET  /api/v1/hr/employees/:id/compensation-periods
POST /api/v1/hr/employees/:id/compensation-periods
```

No generic compensation CRUD is added.

There is deliberately no:

```text
PATCH compensation period
DELETE compensation period
PUT replace compensation history
bulk salary import
compensation approval endpoint
browser-selected Payroll rate
```

The GET route exists only for authorized HR compensation maintenance/readback. The POST route appends one authoritative effective-dated compensation period.

## 3. Sensitive-read authority

The compensation-history GET route requires:

```text
employees.manage
```

This is intentionally stricter than the ordinary Employee register, which uses `employees.read` and omits compensation values.

The response may include only the selected Employee's Company-scoped compensation periods:

```text
id
employeeId
payType
baseSalary nullable
hourlyRate nullable
effectiveFrom
effectiveTo nullable
```

The response must not include Foundation secrets, unrelated Employees, actor internals, permission internals or Payroll calculation state.

The Employee must belong to the authenticated Company before any compensation row is returned. A foreign-Company Employee must behave as not found/forbidden according to the existing resource-isolation policy without leaking its existence.

## 4. Compensation write authority

The compensation-history POST route requires:

```text
employees.manage
```

and a Foundation `Idempotency-Key` because it is a sensitive business write.

The browser may supply only:

```text
payType
baseSalary nullable
hourlyRate nullable
effectiveFrom
```

The browser must not supply:

```text
companyId
employee company ownership
actor user ID
createdBy
status
approvedBy
Payroll Run ID
Timesheet ID
Job-Cost value
Finance account
calculated totals
effectiveTo
```

`effectiveTo` is server-owned so a new period can close the immediately previous authoritative period safely.

The accepted pay-type vocabulary remains exactly the Pass-308/309 internal tokens:

```text
SALARY
HOURLY
```

with the already-reviewed shapes:

```text
SALARY -> baseSalary required, hourlyRate absent
HOURLY -> hourlyRate required, baseSalary absent
```

All monetary/rate inputs remain exact decimal strings at the HTTP boundary; binary floating-point conversion is prohibited.

## 5. Append-only effective-date maintenance rule

Compensation history is maintained as an ordered effective-date ledger, not destructively edited rows.

For one Employee:

1. The service locks the Employee row inside the write transaction.
2. The Employee must belong to the authenticated Company.
3. If no compensation period exists, the supplied `effectiveFrom` creates the first authoritative period.
4. If history exists, the new `effectiveFrom` must be **strictly later** than the latest period's `effectiveFrom`.
5. The service closes the previous latest period to the calendar day immediately before the new `effectiveFrom`.
6. The new row is inserted with `effectiveTo = null`.
7. Existing older compensation rows are never deleted or rewritten except for closing the immediately previous open/latest range as part of the same append transaction.
8. Database non-overlap checks remain the final race-safety boundary.

This deliberately avoids an arbitrary PATCH/DELETE correction workflow that the source does not define.

A mistaken historical compensation row therefore cannot be silently rewritten through Stage-20 compensation maintenance. A later correction/reversal contract is required before destructive historical correction is allowed.

Future-dated compensation is allowed as an append when it is later than the current latest effective date. Payroll resolves the period whose effective range covers the Payroll source/work date; it does not simply read the newest row.

## 6. Existing Employee baseSalary/hourlyRate fields are not Payroll history

The existing Stage-18 Employee create/update contracts may continue to accept the source-defined current profile inputs:

```text
baseSalary
hourlyRate
```

but they do **not** create, modify or replace authoritative `employee_compensation_periods` rows.

This avoids silently changing an already-reviewed Module-14A API in a contract pass.

From Stage 20 onward:

```text
employees.base_salary / employees.hourly_rate
    = current/profile compensation inputs only

employee_compensation_periods
    = authoritative historical Payroll compensation source
```

Payroll calculation must therefore produce a blocking calculation exception when no applicable compensation period exists, even if legacy/current Employee salary fields contain values.

The later Stage-20 UI must make this distinction clear rather than implying that editing the ordinary Employee profile alone updates historical Payroll authority.

## 7. Internal Payroll compensation lookup is not a public salary-read route

Payroll calculation requires `payroll.calculate` and may call a repository method that resolves the effective compensation period for an Employee/date.

That internal lookup:

- is Company-scoped;
- is used only inside the authorized Payroll calculation transaction;
- returns exact decimal values to server business logic;
- is not exposed as a generic browser API;
- does not require the requesting Payroll officer to also have `employees.manage` merely for the server to calculate Payroll.

This keeps public HR salary browsing separate from Payroll execution authority while avoiding a new permission code.

## 8. Audit and disclosure boundary

The source requires compensation changes to be audited but also marks salary data as sensitive.

Every successful compensation-period append must create Foundation audit evidence in the same transaction.

The generic audit record may contain non-secret structural metadata such as:

```text
employeeId
compensationPeriodId
payType
effectiveFrom
closedPreviousPeriodId nullable
changedFields
```

It must **not** put raw salary/rate amounts into broadly readable generic audit/outbox payloads.

No new compensation domain event is invented because the source does not define one. In particular, Pass 310 does not add:

```text
employee.compensation_changed
salary.changed
compensation.updated
```

as an outbox event.

Detailed compensation amounts remain available only through the protected compensation read route and authorized internal Payroll calculation.

## 9. Stable error behavior for the future runtime

Pass 310 does not add runtime error codes yet, but it freezes the minimum semantic outcomes that the next schema/service passes must map onto the project's stable error style:

```text
Employee not found / outside Company
Invalid SALARY or HOURLY field shape
Invalid exact decimal amount/rate
Duplicate or non-increasing effectiveFrom
Compensation date-range conflict
Missing applicable compensation during Payroll calculation
```

Error messages must never echo protected salary/rate values.

The exact public error-code strings are deferred to the Stage-20 schema/service contract pass instead of being guessed here.

## 10. React authorization boundary for later implementation

The Stage-20 HR/Payroll React feature may show compensation-history controls only when the signed-in user has:

```text
employees.manage
```

An `employees.read`-only user continues to see the ordinary Employee register without salary/rate history.

A Payroll user with `payroll.read` / `payroll.calculate` but without `employees.manage` may operate the reviewed Payroll workflow, but the UI must not expose the general Employee compensation-history screen to that user.

The API remains authoritative even when UI controls are hidden.

## 11. What Pass 310 resolves

Pass 310 resolves the earlier blocking questions as follows:

```text
new salary permission required?              -> no
ordinary Employee read may expose salary?    -> no
public compensation read authority           -> employees.manage
public compensation write authority          -> employees.manage
Payroll internal rate lookup authority       -> payroll.calculate
maintenance API shape                        -> GET + POST compensation-period routes only
write replay protection                      -> Idempotency-Key
history mutation model                       -> append next period; close previous range atomically
browser owns effectiveTo?                    -> no
raw salary in generic audit/outbox?           -> no
new compensation outbox event?               -> no
legacy Employee salary fields are history?   -> no
```

## 12. Still unresolved after Pass 310

Stage-20 runtime is **not** fully unblocked yet. These items still require reviewed contracts before complete Payroll calculation/service generation:

1. salary-period/proration behavior for `SALARY` employees;
2. earning/deduction item `code` vocabulary and generation rules;
3. overtime-rate behavior when approved overtime exists;
4. blocking calculation-exception `reason_key` vocabulary and stable error mapping;
5. late-approved time and post-approval Timesheet Adjustment Payroll-period/allocation policy;
6. exact Stage-20 versus Stage-26 Finance posting boundary;
7. Payslip `file_id` Document-versus-Document-Version target before publication.

The compensation maintenance contract itself is now sufficiently frozen for later schema/repository/service implementation.

## No production change in Pass 310

Pass 310 makes exactly zero changes to:

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

## Status and next pass

Truthful status:

```text
PASS_310_COMPENSATION_AUTHORIZATION_FROZEN_STAGE_20_CALCULATION_POLICY_PENDING
```

Next reviewed pass: **Pass 311 — Stage-20 Payroll calculation item, proration, overtime and blocking-exception vocabulary contract**. It must define calculation semantics without adding runtime code until the remaining formula rules are explicit.
