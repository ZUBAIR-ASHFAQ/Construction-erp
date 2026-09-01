# Pass B18.9 - Final-21 Client Receipts React Completion

## Purpose

B18.9 adds the required four-part React feature for Module 16 Client Receipts / Payments without changing the six-route backend contract or database persistence.

## React feature added

`apps/web/src/features/client-receipts/` now contains only:

- `api/client-receipts-api.ts`
- `hooks/client-receipts.ts`
- `components/client-receipts-workspace.tsx`
- `pages/client-receipts-page.tsx`

TanStack Query owns server state. React Hook Form plus Zod owns write-form validation.

## Receipt creation workflow

The browser uses real source-module selectors instead of raw identifiers:

- active Client selector when Client read access is available,
- allowed Project selector,
- optional Project Stage selector,
- Finance Cash / Bank account selector filtered by the selected `CASH` or `BANK` payment method.

Selecting a Project keeps its Client ownership authoritative. The UI sends only business inputs; Company, actor, status, numbering, posting ownership and calculated totals remain server-derived.

Receipt creation remains the documented atomic create/post command. The screen explains that received cash is posted to Cash/Bank and Client Advance / unapplied cash first. Cash received is not profit and does not reduce AR until allocation.

## Register and payment history

The Client Receipt register can be filtered by Client, Project and status. The same register therefore provides bounded Client/Project payment history without creating a separate duplicate history store.

The UI displays the source-derived Module 16 values returned by the API:

- Receipt amount / received cash,
- allocated amount,
- advance / unallocated amount,
- current active allocations.

The browser does not recompute these authoritative values.

## Invoice allocation

A posted Receipt with remaining unallocated cash can be allocated only through an issued Client Invoice selector for the same Project. Raw Invoice UUID entry is intentionally not exposed.

The UI shows Invoice billed value as context, while current Invoice outstanding remains server-authoritative. The server rechecks both remaining receipt cash and Invoice outstanding before every allocation.

## Unallocation and receipt reversal

Existing active allocations are visible on Receipt detail. Authorized users can invoke the explicit unallocation command. The browser does not delete or rewrite allocation history itself.

A posted Receipt can expose the controlled reversal action only after its active allocations are cleared. Finance compensating entries and immutable original receipt history remain backend-owned.

## Cross-module query refresh

Successful Receipt creation, allocation, unallocation or reversal refreshes:

- Client Receipts,
- Client Billing,
- Project Stages / Progress,
- Finance,
- Client Management summaries.

This keeps received, allocated, advance, outstanding and cash views synchronized with their source modules.

## Permission boundaries

The page binds the four Module 16 permissions:

- `client_receipts.read`
- `client_receipts.create`
- `client_receipts.allocate`
- `client_receipts.reverse`

Supporting selectors also respect Client, Project, Stage, Finance and Client Invoice read permissions. The UI does not fall back to unsafe raw-ID entry when a supporting read permission is unavailable.

## Boundaries preserved

- No Prisma model changed.
- No migration was added.
- The backend remains exactly five files.
- The public Client Receipts API remains exactly six routes.
- No new router library or generic CRUD endpoint was introduced.
- No received, allocated, advance, outstanding or profit formula was moved into browser-owned state.

## Next pass

**B18.10 - Client Receipts final integration, E2E and freeze:** prove invoice payment, random advance, partial allocation, over-allocation rejection, scope isolation, idempotency and compensating reversal through live integration and browser workflows where the required runtime dependencies are available.
