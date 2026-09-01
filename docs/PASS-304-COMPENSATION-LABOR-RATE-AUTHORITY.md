# Pass 304 — Compensation and Labor-Rate Authority Contract

## Purpose

Pass 304 freezes only the compensation and labor-rate authority required before **Stage 20 / Module 14B Payroll Completion** can safely calculate Payroll from approved Module-13 Workforce time.

This is a contract and verification pass. It does not add Payroll persistence, change Employee persistence, invent a compensation-history table, add a permission, calculate pay, post Job Cost, or post Finance entries.

The controlling source says:

- Module 14A exists before Workforce and provides Employee employment/compensation inputs.
- Module 13 approved hours become controlled Payroll input and project labor-cost source.
- Job-cost labor values use approved rates from HR/Payroll policy, not browser-entered cost.
- Module 14B consumes approved Timesheet/overtime inputs and calculates earnings, deductions and net pay server-side.
- Pay rates/salary use exact decimal values and compensation effective dates are explicit.
- Sensitive salary data requires stricter access than ordinary Employee profile data.
- `payslip_items` contains quantity, rate and amount fields suitable for a finalized calculation snapshot.

The source does **not** define pay-type tokens, compensation-component tables, an effective-dated compensation table, overtime multipliers, salary-to-hour conversion, payroll-group identity, salary-read permission, or the exact labor-cost formula.

## Authority freeze

### 1. HR/Payroll owns compensation authority

Compensation authority belongs to **Module 14 — HR & Payroll**.

Module 13 owns worked-time quantities and project cost coding only. A Timesheet, Timesheet Entry or browser request must never become the authority for:

```text
base salary
hourly rate
overtime multiplier
allowance rate
deduction rate
labor cost
Payroll gross/deduction/net totals
Job-Cost labor amount
```

The existing Module-13 rule that the browser supplies hours but no labor rate/cost remains correct.

### 2. Existing Employee compensation fields remain inputs, not a historical Payroll snapshot

The current Module-14A Employee record contains:

```text
base_salary nullable
hourly_rate nullable
```

Those fields remain valid reviewed compensation **inputs**. Pass 304 does not reinterpret them as a complete historical compensation ledger because the source separately requires explicit effective dates and approved compensation components.

The Payroll engine must therefore not assume that the current Employee row is the correct rate for every historical work date or Payroll period.

### 3. Do not infer pay type from nullable rates

The source workflow mentions `pay type`, but no `pay_type` field or stable vocabulary exists in the reviewed table definition.

Therefore Stage 20 must not infer rules such as:

```text
hourly_rate present => hourly employee
base_salary present => salaried employee
both present => choose one automatically
base_salary / fixed hours => hourly equivalent
hourly_rate * fixed monthly hours => salary equivalent
```

The exact pay-type representation and selection rule remain a blocking source contract gap.

### 4. Effective-date selection is mandatory before calculation

The source explicitly requires compensation effective dates.

A Payroll calculation must eventually select the authorized compensation record applicable to the relevant Payroll/work period using an explicit effective-date rule. It must not silently use whichever Employee rate happens to be current when calculation runs.

Current Stage-18 persistence has no compensation effective-date field/history relation. Therefore **Payroll calculate/finalize runtime remains blocked** until a reviewed persistence contract can represent the required dated authority.

Pass 304 does not invent that table or migration.

### 5. Overtime hours are quantities, not a rate policy

Module 13 already stores exact:

```text
regular_hours
overtime_hours
```

This is sufficient as a quantity boundary, but it does not define the overtime pay rate.

Until the source is amended, Stage 20 must not assume:

```text
1.5x
2x
same as regular rate
weekend premium
holiday premium
shift premium
```

No overtime multiplier or premium formula is frozen by this pass.

### 6. Payroll calculation remains server-owned

When Stage 20 calculation becomes executable, the browser may select reviewed business inputs such as the Payroll period but must not supply authoritative:

```text
employee compensation rate
overtime multiplier
computed earnings
computed deductions
gross total
net total
labor cost
Finance amount
```

The server must combine only approved source inputs and server-owned compensation policy.

### 7. Finalized payslip lines are the appropriate calculation snapshot boundary

The source-defined `payslip_items` fields include:

```text
item_type
code
description
quantity nullable
rate nullable
amount
```

Therefore the final Payroll implementation may preserve the rate/quantity/amount actually used by a calculated/finalized Payslip as immutable calculation evidence.

This does **not** authorize Pass 304 to invent item codes, component types, formulas, rounding rules or a compensation-component master. Those remain unresolved.

### 8. Job Cost must not price raw Timesheets independently

Module 13 says Job-Cost labor values use approved HR/Payroll rates rather than user-entered arbitrary cost.

The authority boundary is frozen as:

```text
Approved Timesheet hours
        ↓
HR/Payroll authorized rate policy
        ↓
server-calculated labor value
        ↓
Job Cost source/posting contract
```

Module 7 or the browser must not independently price the same Timesheet using an unrelated free-text/manual rate.

The exact Job-Cost labor-value formula remains unresolved: the source does not say whether Job Cost consumes base hourly pay, gross earnings, employer burden, loaded labor cost, or another approved rate basis. That formula remains blocked and its cross-module proof remains Stage 27 work.

### 9. Compensation read authority remains stricter than ordinary Employee read

The source says salary data needs stricter permissions but does not define a salary-specific permission code.

Existing Stage-18 behavior therefore remains frozen:

- ordinary Employee list/readback does not expose `baseSalary` or `hourlyRate`;
- no new `compensation.read`, `salary.read` or similar permission is invented;
- no compensation list/detail public API is invented;
- Payroll server-side calculation may eventually read compensation internally under the reviewed Payroll command authority, but that does not make compensation generally readable to the browser.

A dedicated compensation-read permission/API requires a source amendment before public exposure.

### 10. Compensation changes require audit without broad salary leakage

The source requires compensation changes to be audited and also treats salary data as sensitive.

The contract therefore keeps both requirements:

- a compensation mutation must produce auditable evidence of who changed the authoritative compensation and when;
- generic audit/outbox payloads must not become an unrestricted salary-disclosure channel;
- the exact protected before/after salary-detail read policy remains unresolved until salary-read authorization is defined.

## A1/A2/A3 outcome from Pass 303

### A1 — Effective compensation and pay authority

**Authority resolved:** HR/Payroll is the sole compensation authority; Timesheet/browser/Job Cost are not rate authorities.

**Still blocking:** explicit pay type, effective-dated compensation persistence/history, approved compensation components, and salary-specific read authorization are not defined by the source.

### A2 — Overtime and approved labor-rate policy

**Authority resolved:** regular/overtime hours are approved Workforce quantities; rate policy belongs to HR/Payroll and is server-owned.

**Still blocking:** overtime multiplier/premium vocabulary and the exact Job-Cost labor-rate basis are not defined.

### A3 — Payroll calculation inputs and formulas

**Input boundary resolved:** approved Workforce hours plus server-owned HR/Payroll compensation authority are valid inputs; browser-computed pay is not.

**Still blocking:** earning/deduction component vocabulary, formula ordering, rounding, tax/statutory behavior, salary-to-period/hour proration and exception rules are not defined.

## Explicitly prohibited assumptions for future passes

Until a reviewed contract says otherwise, do not implement any of these shortcuts:

```text
Use current Employee rate for all historical periods
Infer pay type from which nullable field is populated
Convert base salary to hourly rate using a guessed divisor
Use 1.5x or 2x overtime by convention
Let Timesheet UI submit labor cost or pay rate
Let Job Cost independently choose an Employee rate
Expose salary through employees.read
Create generic compensation CRUD automatically
Invent compensation-component codes
Invent tax/statutory deduction formulas
```

## No production change in Pass 304

Pass 304 makes exactly zero changes to:

```text
Prisma models
migrations
database tables/relations
backend module runtime
repository functions
service functions
Fastify routes
React runtime
permission codes
status/event vocabulary
Payroll formulas
Job-Cost formulas
Finance posting
```

## Stage-20 runtime status

Pass 304 improves the Stage-20 contract by freezing compensation/rate ownership, but it does **not** make Payroll runtime safe to generate yet.

The remaining blocking decisions include:

1. effective-dated compensation persistence and pay-type representation;
2. earnings/deductions/net calculation policy;
3. Payroll approval lifecycle and Module-22 mapping;
4. Payroll-group/overlap identity;
5. approved Timesheet selection/locking and source-consumption identity;
6. Shift/hour-limit contradiction before authoritative Payroll consumption;
7. leave effect when Payroll policy includes leave;
8. Stage-20 versus Stage-26 Finance posting boundary.

The next reviewed pass is **Pass 305 — Module 13 Payroll source-consumption and posting-identity contract**. It must freeze how approved Timesheet rows are selected, locked, identified and consumed at most once without yet inventing Payroll formulas or Finance adapters.
