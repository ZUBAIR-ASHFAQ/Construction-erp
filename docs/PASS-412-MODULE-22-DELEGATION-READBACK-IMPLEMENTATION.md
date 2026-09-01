# Pass 412 — Module 22 Delegation Readback Implementation

## Purpose

Pass 412 implements only the narrow delegation readback frozen in Pass 411. The source requires a delegation screen, while the original Module-22 route table provided creation but no durable list readback. This pass closes that UI/readback mismatch without adding generic delegation CRUD.

## Implemented HTTP amendment

```http
GET /api/v1/approvals/delegations?page=1&pageSize=25
```

The request accepts only `page` and `pageSize`. Defaults are page 1 and page size 25; the maximum page size is 100. There is no body and no idempotency header.

The response is:

```text
data
  items[]
    id
    fromUserId
    toUserId
    fromDate
    toDate
    scope.resourceTypes[]
    status
  page
  pageSize
  total
```

`companyId` is not returned.

## Security and repository reuse

The route authenticates normally. `ApprovalsService.listDelegations()` requires the existing `approval_delegations.manage` permission and derives Company scope from trusted request context. It calls the already-existing `ApprovalsRepository.listDelegationsForCompany()` with calculated `skip` and `take` values only.

No second repository function was added. Repository ordering remains `fromDate DESC`, then `id ASC`.

## React readback

The existing Module-22 browser API now exposes `listApprovalDelegations()`, backed by `ApprovalDelegationPage` and `ListApprovalDelegationsInput` types. TanStack Query adds `useApprovalDelegations()` below the existing Module-22 query root.

Creating a delegation now invalidates:

- the delegation-list key, so the administration screen refreshes;
- the inbox key, because an active delegation can change assignment visibility.

The delegation screen renders the durable server page with Previous/Next pagination. Only the current page number is local UI state; delegation rows remain TanStack Query server state and are not copied into `useState`.

## Verification coverage

The existing live Module-22 API suite now includes a guarded scenario for:

- authentication/permission behavior;
- page/pageSize bounds;
- stable ordering across pages;
- Company A / Company B isolation;
- omission of `companyId` from the public item;
- exact stored resource-type scope readback.

The existing Playwright workflow now verifies that a created delegation appears in the list and remains visible after a browser reload, proving durable server readback rather than form-local state.

## Preserved boundaries

Pass 412 adds no:

- Prisma model, column, index or migration;
- repository function;
- permission;
- stable error;
- domain event;
- dependency;
- delegation detail/edit/delete/revoke endpoint;
- status/user/date/search/sort filter;
- user-name expansion subsystem;
- backend helper/service file;
- frontend feature folder/component file;
- Stage-25 / Module-20 production work.

The backend remains the required five-file Module-22 folder, and the frontend remains inside the existing `api/`, `hooks/`, `components/`, and `pages/` structure.

## Cumulative repair handoff

Pass 412 closes cumulative audit item A408-03. The next repair is Pass 413 — Module 10 Durable Inventory Count UI Repair. Stage 25 / Module 20 remains blocked until the cumulative repair sequence reaches final acceptance.

## Verified current state

Dependency-free verification completed with:

```text
Pass-412 focused gate: 82 tests, 78 passed, 4 historical skips, 0 failed
Maintained static suite: 3,058 tests, 2,986 passed, 72 historical skips, 0 failed
Migration policy: 53 migrations across 53 gates
Required workspace/stack check: passed
Changed TypeScript/TSX transpilation diagnostics: 0
```

The six changed production files produce the current 451-file production snapshot:

```text
3359fae380216644c24e67cc47395eb45f396a3a7664dad60a6c295c1b95cdf1
```

The guarded live PostgreSQL and Playwright scenarios were updated but are not claimed as executed in this dependency-free archive environment.
