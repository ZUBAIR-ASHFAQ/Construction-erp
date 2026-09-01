# Pass 403 — Module 19 TanStack Query Hooks + Cache Invalidation

## Purpose

Pass 403 builds on the exact Pass-402 archive and adds only the TanStack Query server-state layer for **Stage 24 / Module 19 — RFI & Submittals**.

The typed API client from Pass 402 remains the only browser transport. This pass adds stable query keys, four read hooks and seven command hooks without generating pages, components, navigation or Playwright behavior.

## New production file

```text
apps/web/src/features/rfi-submittals/
└── hooks/
    └── rfi-submittals.ts
```

No existing production file changes in Pass 403.

## Query-key boundary

All Module-19 server state is rooted at:

```text
['module-19', 'rfi-submittals']
```

The four read surfaces are separated by resource and scope:

```text
RFI register       ['module-19', 'rfi-submittals', 'rfis', projectId, input]
RFI detail/thread  ['module-19', 'rfi-submittals', 'rfi', rfiId]
Submittal register ['module-19', 'rfi-submittals', 'submittals', projectId, input]
Submittal detail   ['module-19', 'rfi-submittals', 'submittal', submittalId]
```

The register inputs remain the bounded Pass-402 list filters. The hooks do not invent browser search/sort/date/assignee/type filters.

## Read hooks

```text
useRfis
useRfiDetails
useSubmittals
useSubmittalDetails
```

Project reads are disabled until a non-empty Project id is available. Detail reads are disabled until a concrete resource id is selected. Every read uses `retry: false`, matching the established project hook pattern and avoiding automatic replay of authorization/business failures.

The detail queries reload the durable Pass-401 histories:

```text
RFI detail -> responses[]
Submittal detail -> revisions[] -> reviews[]
```

No response or review history is copied into local component-owned server state.

## Command hooks

The seven write hooks map one-for-one to the accepted typed client commands:

```text
useCreateRfi
useRespondRfi
useCloseRfi
useReopenRfi
useCreateSubmittal
useSubmitSubmittal
useReviewSubmittal
```

Each mutation execution creates one new `crypto.randomUUID()` Foundation idempotency key and passes it to the Pass-402 API client. Idempotency generation is not reused by reads.

## Precise cache invalidation

Pass 403 does not invalidate the entire Module-19 cache after every command.

RFI behavior:

```text
create   -> owning Project RFI register
respond  -> selected RFI detail/thread only
close    -> selected RFI detail + owning Project RFI register
reopen   -> selected RFI detail + owning Project RFI register
```

A response does not change the current RFI register fields, so it does not force every register page to refetch.

Submittal behavior:

```text
create   -> owning Project Submittal register
submit   -> selected Submittal detail + owning Project Submittal register
review   -> selected Submittal detail + owning Project Submittal register
```

Submit/review can change server-owned Submittal lifecycle and durable revision/review history, so both detail and register are refreshed.

## Security and authority

The hooks do not evaluate Company ownership, Project membership or RBAC. They accept only the typed browser business inputs already frozen in Pass 402.

The API remains authoritative for:

- Company and actor identity;
- Project scope;
- permissions;
- numbering;
- RFI lifecycle;
- Submittal lifecycle/revision numbering;
- same-Project user/Document validation;
- append-only history;
- audit/outbox evidence.

The UI pass may hide actions using the existing permission context, but those presentation guards are intentionally not generated here.

## Intentionally absent

Pass 403 adds:

- no component;
- no page;
- no form;
- no router/navigation registration;
- no permission-aware action rendering;
- no Playwright workflow;
- no backend/API/schema/database change;
- no new permission/error/event vocabulary;
- no Module-20 production code.

## Verification boundary

The focused Pass-403 test verifies:

- exactly four Module-19 query hooks and seven command hooks;
- stable resource-specific query keys;
- Project/resource enabled guards;
- `retry: false` on all reads;
- a fresh idempotency key for all seven writes;
- response mutation invalidates only RFI detail;
- RFI lifecycle mutations invalidate detail + Project register;
- Submittal create invalidates only its Project register;
- Submittal submit/review invalidate detail + Project register;
- no whole-module invalidation shortcut is used;
- the Pass-402 API client and complete Module-19 backend/database contract remain byte-identical;
- no UI/routing/Module-20 production code is generated;
- every named function has a purpose comment.

The cumulative gate reruns Pass 401, migration-system and workspace checks. The historical Pass-402 gate contains an intentional “hooks must be absent” assertion that is superseded by this pass; Pass 403 instead locks the Pass-402 typed API client byte-for-byte and verifies its consumption directly.

## Next pass

**Pass 404 — Module 19 Accessible Permission-Aware React UI**

The next pass should consume only the accepted API client and hooks to build the RFI register/detail/thread plus Submittal register/revision/review workspace. It should keep TanStack Query as the server-state owner and must not change backend business rules.
