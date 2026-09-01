# Pass B15.8 - Final-21 Site Expense React Integration

## Purpose

Pass B15.8 adds the Final Module 14 React feature after the Site Expense backend, posting behavior and Module 21 evidence integration are stable.

The implementation stays inside the required React feature shape:

- `api/`
- `hooks/`
- `components/`
- `pages/`

No router package or extra frontend architecture is introduced.

## Changes

### 1. Typed Site Expense API client

`site-expenses-api.ts` mirrors only the six frozen Module 14 endpoints:

- list/filter Site Expenses;
- create DRAFT expense;
- get detail;
- update DRAFT expense;
- post expense;
- reverse expense.

Create, update, post and reverse send a Foundation `Idempotency-Key`.

The browser never sends Company ownership, actor identity, permissions, generated expense number, posting status or posting timestamps.

### 2. TanStack Query hooks

`site-expenses.ts` owns Site Expense list/detail/mutation server state.

Posting and reversal invalidate:

- Site Expense reads;
- Finance reads;
- Project Budget / Job Cost reads.

This keeps the visible accounting and actual-cost source data synchronized after a controlled Site Expense posting transition.

### 3. Site Expense workspace

The workspace includes:

- bounded Site Expense register;
- Project, Stage, category, payment-mode, status and date filters;
- server pagination;
- DRAFT creation;
- DRAFT editing;
- optional Project Stage attribution;
- CASH / BANK / PAYABLE treatment;
- Cash/Bank account selection when Finance read access is available;
- optional evidence Document selection when Documents read access is available;
- explicit Post action;
- explicit Reverse action;
- immutable-history guidance for POSTED/REVERSED rows.

React Hook Form + Zod handle the business form boundary. TanStack Query remains the owner of server state.

### 4. Reused source-module selectors

B15.8 reuses existing Project, Project Stage, Finance Cash/Bank and Documents hooks rather than duplicating those APIs inside Site Expense.

The existing Documents query hook gained an optional `enabled` flag so Site Expense can avoid background Document requests when `documents.read` is unavailable. Existing callers remain compatible because the flag defaults to `true`.

### 5. Category contract limitation kept explicit

The frozen Final Module 14 HTTP contract contains no expense-category catalog/CRUD endpoint even though `expense_categories` is a required table and the UI requires a category.

B15.8 therefore does **not** invent a seventh backend route. The form accepts a configured company expense-category UUID and offers IDs already observed in the register through a datalist.

A future controlling-spec change would be required before adding category-management HTTP endpoints.

### 6. Permission-aware navigation

The existing lightweight `AdminShell` now includes Site Expenses and checks the five frozen Site Expense permissions or a restricted Project scope before showing the workspace entry.

Inside the page, create/update/post/reverse controls are each bound to their corresponding permission.

## Deliberately not added

B15.8 does not add:

- a new Prisma model;
- a new migration;
- a seventh Site Expense endpoint;
- generic DELETE/archive/approval workflow;
- direct Profitability writes;
- duplicate Project, Stage, Finance or Document API clients;
- a new routing dependency;
- a Site Expense-specific file upload/storage system.

## Verification target

B15.8 is complete when:

1. the React feature contains only `api/hooks/components/pages`;
2. the typed API client matches the six frozen Site Expense routes;
3. write commands carry idempotency keys;
4. TanStack Query owns server state;
5. React Hook Form + Zod handle create/edit forms;
6. Project/Stage/Finance/Documents selectors reuse existing modules;
7. DRAFT rows can be edited/posted and POSTED rows can only be reversed;
8. Site Expense navigation is permission-aware;
9. no new migration or backend route is introduced;
10. all changed named functions retain short purpose comments.

Next pass: **B15.9 - Site Expense backend/API integration tests, negative permission/company/Project scope tests, posting/reversal reconciliation checks and OpenAPI verification.**

## Verification completed

- cumulative B15.1-B15.8 focused tests: **77/77 PASS**;
- complete `final-21-*` static regression: **253/253 PASS**;
- workspace structure check: **PASS**;
- Final-21 legacy cleanup manifest check: **PASS**;
- migration-system tests: **8/8 PASS**;
- migration policy: **81/81 migrations locked across 81 gates**;
- TypeScript syntax transpilation for all B15.8-touched TS/TSX files: **PASS**.

A full dependency-backed web typecheck/build is not claimed because this source archive does not contain installed `node_modules`; invoking `tsc` stops at the missing `vite/client` type package before application typechecking begins.
