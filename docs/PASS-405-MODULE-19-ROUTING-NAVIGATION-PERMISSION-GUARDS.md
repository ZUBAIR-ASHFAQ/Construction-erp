# Pass 405 — Module 19 Routing + Navigation + Permission Guards

## Purpose

Pass 405 builds on the exact Pass-404 archive and activates the already-built Stage-24 RFI & Submittals React page inside the existing permission-aware application shell.

This pass is intentionally narrow. The project already uses `AdminShell` state navigation rather than a URL router for ERP workspace switching, so Pass 405 follows that established architecture instead of adding a new routing dependency just for Module 19.

## Source boundary

The controlling Construction ERP specification requires Module 19 to provide the RFI register/detail/thread and Submittal register/revision/reviewer surfaces, while hiding actions the user lacks permission for and keeping API authorization authoritative.

The reviewed Module-19 permission vocabulary remains exactly:

- `rfi.read`
- `rfi.create`
- `rfi.respond`
- `rfi.close`
- `submittals.read`
- `submittals.create`
- `submittals.submit`
- `submittals.review`

Project-scoped visibility continues to reuse the authenticated Module-24B Project scope. No browser-owned Company, Project, actor or effective-resource permission is invented.

## Production changes

### `apps/web/src/features/administration/components/admin-shell.tsx`

The existing shell now:

- imports `RfiSubmittalsPage`;
- recognizes the `rfi-submittals` workspace view;
- exposes Module 19 when the identity has a reviewed Module-19 permission or a non-empty restricted Project scope;
- includes Module 19 in the current-view authorization guard;
- includes Module 19 in the permission-aware fallback selection;
- renders one `RFI & Submittals` navigation button only when `canUseModule19` is true;
- renders `RfiSubmittalsPage` only when the guarded active view is `rfi-submittals`;
- passes the existing Document Management navigation callback only when the Document workspace itself is visible.

The callback is:

```tsx
<RfiSubmittalsPage onOpenDocuments={canReadDocuments ? showDocuments : undefined} />
```

This keeps Document upload/version ownership in Module 18 rather than adding a Module-19 file browser or upload API.

### `apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx`

Only the explanatory contract note changes. It now reflects that shell navigation and the existing Document Management callback are active, while Playwright remains deferred to Pass 406.

No RFI/Submittal forms, hooks, API payloads or business rules are changed.

## Permission behavior

The shell-level visibility rule follows the same established pattern already used by other Project-scoped modules:

```text
reviewed Module-19 company permission
OR
non-empty restricted Project scope
```

The page then applies the more specific read/write controls already implemented in Pass 404. The API remains authoritative for every request, including Project/resource policy checks that cannot be inferred completely from `/auth/me`.

This pass does not add a `rfi.reopen` permission. Reopen continues to use the reviewed `rfi.close` authority already implemented by the backend and Pass-404 UI.

## Architecture intentionally preserved

Pass 405 does not add React Router, TanStack Router, URL route definitions or a second application shell. `apps/web/src/main.tsx` remains unchanged because it already mounts the shared `AdminShell` under `AuthProvider` and `QueryClientProvider`.

The following also remain unchanged:

- Module-19 typed API client;
- Module-19 TanStack Query hooks;
- Module-19 workspace forms/components;
- shared web styles;
- Prisma schema and migrations;
- Module-19 backend schema/repository/service/routes/index;
- API registration;
- permissions, stable errors and domain-event vocabulary;
- Stage-25 / Module-20 production code.

## Verification boundary

The Pass-405 focused gate verifies:

- the existing Module-19 page is imported by `AdminShell`;
- all eight reviewed permissions feed the shell visibility rule;
- restricted Project scope can expose the Project-scoped workspace without inventing a new read authority;
- the view union, current-view guard and fallback chain all include Module 19;
- the sidebar button is guarded by `canUseModule19`;
- the page renders only through the guarded active view;
- Document Management navigation is passed only when authorized;
- `main.tsx`, the Pass-402 API client, Pass-403 hooks, Pass-404 workspace/styles and backend/database contracts are byte-identical;
- no router package or Module-20 production behavior is added;
- named functions retain purpose comments.

The historical Pass-404 gate is not part of this cumulative command because it intentionally asserts that navigation must not yet be registered. That one negative assertion is superseded by Pass 405; the Pass-404 production UI itself remains locked by hashes in the new gate.

## Next pass

**Pass 406 — Module 19 Playwright Workflow**

The next pass should add the browser-level workflow for RFI create → respond → close → reopen and Submittal create → submit → review/revise-resubmit, including denied-action and reload/readback behavior. It should not change the accepted backend or production UI unless a real browser test exposes a defect.
