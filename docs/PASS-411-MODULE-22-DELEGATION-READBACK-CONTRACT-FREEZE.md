# Pass 411 — Module 22 Delegation Readback Contract Freeze

## Purpose

Pass 411 closes the **contract-decision** half of cumulative audit item A408-03 without changing production behavior. The reviewed Module-22 source defines a delegation screen in the React requirements, while its original public route table defines only `POST /api/v1/approvals/delegations`. The current project can create a delegation and already contains the company-scoped repository reader `listDelegationsForCompany()`, but the durable list is not exposed through service, HTTP, browser API, TanStack Query or the existing delegation screen.

This pass therefore freezes one narrow read-only amendment for Pass 412. It does not implement that amendment yet.

## Source boundary

The original seven reviewed Module-22 routes remain source-authoritative. Pass 411 does not reinterpret them as generic CRUD. The only approved amendment is the minimum durable readback needed by the already-required delegation screen:

```http
GET /api/v1/approvals/delegations?page=1&pageSize=25
```

After Pass 412, Module 22 may expose exactly eight public routes: the seven source routes plus this one frozen readback amendment.

No other delegation route is approved by this freeze.

## Frozen request contract

`GET /api/v1/approvals/delegations` is read-only.

Accepted query fields are exactly:

```text
page      optional positive integer, default 1
pageSize  optional positive integer, default 25, maximum 100
```

No `status`, `fromUserId`, `toUserId`, date-range, search, sort or free-form filter is added. The repository already supports some internal filters, but exposing them is unnecessary for the minimum source-required screen and would enlarge the public API without a reviewed need.

There is no request body and no idempotency key.

## Frozen authorization and scope

The route must:

- require the existing active authenticated session;
- reuse the existing `approval_delegations.manage` permission;
- derive `companyId` from trusted request security context;
- return only delegations owned by that company;
- never accept browser-supplied Company, actor, role or permission authority.

No new permission such as `approval_delegations.read` is introduced. The existing source permission is already the authority for the delegation administration screen.

## Frozen response contract

The normal API envelope contains one bounded page:

```text
data
  items[]
    id
    fromUserId
    toUserId
    fromDate
    toDate
    scope
      resourceTypes[]
    status
  page
  pageSize
  total
```

`companyId` is intentionally not returned. The readback uses the same delegation fields already returned by the accepted create command, plus standard pagination metadata.

Dates remain serialized API strings from the stored date values. Pass 412 must not add a second date/time model merely for this list.

The list order is frozen to the already-implemented repository order:

```text
fromDate DESC
id ASC
```

## Existing implementation capability to reuse

Pass 412 must reuse:

```text
ApprovalsRepository.listDelegationsForCompany()
```

That repository method already:

- applies `requireCompanyRepositoryScope()`;
- validates bounded `skip` / `take` values;
- queries `approvalDelegation` in Company scope;
- returns `{ items, total }`;
- orders by `fromDate DESC`, then `id ASC`.

The public Pass-412 service must call it with only calculated `skip` and `take` for the frozen page/pageSize contract.

No second delegation repository reader is allowed for this screen.

## Frozen Pass-412 implementation shape

Pass 412 may make only the minimum in-place changes needed for the readback chain:

```text
approvals.schema.ts
  + listApprovalDelegationsQuerySchema

approvals.service.ts
  + listDelegations()

approvals.routes.ts
  + GET /api/v1/approvals/delegations

approvals-api.ts
  + listApprovalDelegations()
  + page/input types

hooks/approvals.ts
  + useApprovalDelegations()

approval-admin.tsx
  + durable existing-delegations list inside ApprovalDelegationAdmin
```

The existing five-file backend folder structure stays unchanged. The existing frontend `api/`, `hooks/`, `components/`, `pages/` structure stays unchanged. No new production file is required.

## Cache behavior frozen for Pass 412

The delegation list must receive its own key below the existing Module-22 root, for example the current hierarchy plus `delegations` and the page input. Creating a delegation must invalidate the delegation-list key as well as the existing approval reads needed for inbox assignment changes.

Server state must remain owned by TanStack Query. The existing-delegations list must not be copied into a new long-lived `useState` cache.

## Explicit non-goals

Pass 411 does **not** authorize any of the following:

- `GET /api/v1/approvals/delegations/:id`;
- PATCH/edit delegation;
- DELETE delegation;
- revoke/cancel/expire commands;
- a new delegation status enum;
- public status/user/date/search/sort filters;
- user-name expansion or a new people lookup subsystem;
- a new Prisma table, column, index or migration;
- a new repository function;
- a new permission, stable error or domain event;
- a new backend helper/service file;
- a new React feature folder or separate delegation component file;
- any Stage-25 / Module-20 production work.

The current source does not define these contracts, so this repair does not invent them.

## Production boundary

Pass 411 is documentation + verification only. The entire accepted Pass-410 production snapshot must remain byte-identical:

```text
451 production files
ecad3f2be21ac22ca4d0ffef48cc0d383aefe7fe22d0a56ed84d858f802496a8
```

The accepted Module-22 production files are separately hash-locked by the Pass-411 verification test.

## Acceptance for this freeze

Pass 411 is accepted only if verification proves all of the following:

- the source-era Module-22 implementation still exposes exactly seven routes before Pass 412;
- no delegation GET route has been implemented prematurely;
- `listDelegationsForCompany()` already exists and is Company-scoped, paginated and stably ordered;
- no service/browser API/hook list method exists yet;
- the freeze authorizes exactly one readback amendment;
- the amendment reuses `approval_delegations.manage` and adds no permission vocabulary;
- no generic delegation CRUD is authorized;
- all Module-22 production files and the whole Pass-410 production snapshot remain byte-identical;
- the maintained static suite remains green;
- Stage 25 / Module 20 remains blocked.

## Next pass

Pass 412 is **Module 22 Delegation Readback Implementation**. It must implement only the contract frozen here, in the existing files, and then verify Company isolation, negative permission behavior, pagination, durable browser readback and cache invalidation before continuing to Pass 413.
