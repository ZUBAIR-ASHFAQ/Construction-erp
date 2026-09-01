# Pass 404 — Module 19 Accessible Permission-Aware React UI

## Purpose

Pass 404 builds on the exact Pass-403 archive and adds the first visible React workspace for **Stage 24 / Module 19 — RFI & Submittals**.

The pass consumes only the accepted Pass-402 typed API client and Pass-403 TanStack Query hooks. It does not change the backend, Prisma schema, migration, HTTP contract, browser API transport or query/mutation behavior.

## New production files

```text
apps/web/src/features/rfi-submittals/
├── components/
│   └── rfi-submittals-workspace.tsx
└── pages/
    └── rfi-submittals-page.tsx
```

The shared `apps/web/src/styles.css` gains only Module-19 layout/responsive styles.

## RFI workspace

The RFI surface provides:

- Project context through the existing Module-5 Project hooks;
- server-paginated RFI register;
- source-defined `OPEN` / `CLOSED` status filter;
- an explicitly current-page-only overdue toggle because the reviewed RFI list route has no overdue query parameter;
- RFI number, subject, discipline, assignee, due date and lifecycle state;
- durable detail readback with the append-only `responses[]` thread;
- create form using React Hook Form + Zod;
- response form with optional Project Document reference;
- bodyless close command;
- reopen form with required rationale;
- permission-aware action visibility.

The browser does not invent edit/delete/archive behavior or another RFI lifecycle state.

## Submittal workspace

The Submittal surface provides:

- server-paginated Project register;
- exact server-status text filter without inventing a complete public Submittal status enum;
- create form with responsible active Project member and optional first-revision Document reference;
- durable revision package from `revisions[]`;
- append-only nested `reviews[]` history;
- current DRAFT revision submission panel;
- current SUBMITTED revision reviewer-decision panel;
- the four reviewed decisions only: `APPROVED`, `APPROVED_WITH_COMMENTS`, `REVISE_RESUBMIT`, `REJECTED`;
- permission-aware submit/review controls.

The UI compares DRAFT/SUBMITTED only to decide whether the already-existing command panel is relevant. The API remains authoritative and still rejects invalid transitions.

## Same-Project user references

RFI assignee and Submittal responsible-user choices come from the selected Project's existing `members[]` readback. Only members whose server status is `ACTIVE` are offered.

Pass 404 does not add a new user-search endpoint and does not require company-wide user enumeration merely to issue a Project collaboration record.

The backend continues to verify user status and Project membership authoritatively.

## Document handling

Module 18 remains the owner of uploads, versioning and signed access.

Module 19 forms accept only the Document IDs already supported by the backend contract. Existing attached Document IDs are visible in RFI responses and Submittal revision packages. When the caller can open Document Management and the parent shell supplies navigation, the UI exposes an **Open Documents** action.

No binary upload, fake local attachment state or new document-link API is introduced.

## Permission presentation

The page consumes the existing authentication context and source permission vocabulary:

```text
rfi.read
rfi.create
rfi.respond
rfi.close
submittals.read
submittals.create
submittals.submit
submittals.review
```

Company-wide command visibility uses `usePermission(...)`. Existing restricted Project scope can make read workspaces visible, matching the established project-scoped frontend pattern; the API still resolves the exact effective Project permission before returning/mutating records.

Project and Document workspace visibility reuse the existing Module-24 helper hooks.

## Accessibility and responsive behavior

Pass 404 keeps forms and actions keyboard-native and labelled:

- explicit labels for Project, filters and every business field;
- semantic forms/buttons/tables;
- visible table captions;
- validation errors adjacent to fields;
- request errors use `role="alert"`;
- no click-only non-button controls;
- responsive one-column form/summary layouts below the existing mobile breakpoint;
- long UUIDs and response/review text wrap instead of forcing viewport overflow.

## Server-state boundary

TanStack Query remains the owner of all durable server state. The page stores only presentation state such as:

- selected Project/resource IDs;
- server page numbers;
- filter inputs;
- the current-page-only overdue toggle.

RFI responses and Submittal revisions/reviews are never copied into component-owned state.

All seven writes continue through the Pass-403 mutation hooks, which generate Foundation idempotency keys and invalidate only the affected caches.

## Intentionally absent

Pass 404 adds no:

- router/navigation registration;
- sidebar entry;
- Playwright scenario;
- new API method;
- new TanStack Query hook;
- new permission/error/event vocabulary;
- backend/schema/repository/service/route change;
- Prisma model or migration;
- Module-20 production code.

## Verification boundary

The focused Pass-404 gate verifies:

- the page and workspace exist;
- the source-required RFI register/detail/thread and Submittal register/revision/reviewer surfaces are present;
- all reviewed write forms use React Hook Form + Zod;
- all eight Module-19 permissions are consumed;
- RFI status filtering remains `OPEN` / `CLOSED` only;
- overdue filtering is labelled current-page-only rather than pretending to be a server query;
- Submittal status is not frozen into a made-up complete enum;
- Project members are reused for assignee/responsible-user choices;
- all seven accepted mutation hooks are used;
- durable history comes from detail queries rather than local arrays;
- Document Management ownership remains visible;
- no router/navigation or Module-20 production change is made;
- API/hooks/backend/database files remain byte-identical;
- named production functions keep purpose comments.

## Next pass

**Pass 405 — Module 19 Routing + Navigation + Permission Guards**

The next pass should register this already-built page in the existing application shell, wire the optional Document Management navigation callback and expose the Module-19 workspace only through the established permission/project-scope visibility rules. It must not rewrite this pass's business forms or backend contract.
