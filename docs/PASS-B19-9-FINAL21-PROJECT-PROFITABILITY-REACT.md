# Pass B19.9 - Final-21 Project Profitability React Feature

## Purpose

B19.9 adds the standard four-part React feature for Final Module 19 - Project Profitability. It consumes the four read-only, already-frozen backend operations and does not move profitability calculation or source ownership into the browser.

## React feature added

`apps/web/src/features/project-profitability/` contains only:

- `api/project-profitability-api.ts`
- `hooks/project-profitability.ts`
- `components/project-profitability-workspace.tsx`
- `pages/project-profitability-page.tsx`

TanStack Query owns all Module 19 server state. React Hook Form plus Zod validates the bounded as-of, trend and portfolio read filters.

## Read-only API client

The browser client exposes exactly the four Module 19 GET operations:

1. Project profitability summary;
2. Stage profitability plus Project-only reconciliation;
3. bounded Project revenue/cost/profit trend;
4. permission-scoped Project profitability portfolio.

No POST, PATCH, PUT or DELETE operation exists in this feature.

## Project summary

The UI shows the server-returned values separately:

- recognized revenue;
- actual cost;
- profit/loss;
- billed amount;
- received amount;
- allocated receipts;
- advance/unallocated cash;
- outstanding receivable;
- Supplier payable.

The browser never recomputes these financial values. A visible note states that Client cash is separate from profit. Profit remains a server-owned calculation based on recognized revenue minus actual cost.

## Stage drill-down and reconciliation

The Stage table keeps Stage weight, approved physical progress and financial values visibly separate. It also shows the server-returned `projectOnly` and `projectTotal` buckets.

Project-only values are not guessed into Stages and are not distributed by Stage weight. This preserves the B19.6/B19.8 reconciliation contract:

`sum(Stage values) + Project-only values = Project total`

## Trend

The bounded trend table displays only the fields returned by the trend API:

- recognized revenue;
- actual cost;
- profit/loss.

Received cash, advances, outstanding and Supplier payable are not introduced into trend calculations by the browser.

## Portfolio comparison

The portfolio table displays Project-level profitability and financial-position values while preserving each Project's own currency. The UI does not create a cross-currency grand total, conversion or synthetic portfolio currency.

Project rows can be selected to open their Project summary, Stage drill-down and trend.

## Project selection

The screen reuses the existing permission-scoped Project register. When available, the permission-scoped Module 19 portfolio provides the same safe Project option shape. No raw Project ID text field is exposed.

The server remains authoritative for Company ownership, Project scope and effective permissions.

## Permission boundaries

The page and shell recognize the three frozen Module 19 permissions:

- `project_profitability.read`
- `project_profitability.finance.read`
- `project_profitability.portfolio.read`

Project summary, Stage and trend reads require the read plus finance-read authority. Portfolio visibility is kept separate and still revalidated by the backend.

## Boundaries preserved

- No Prisma model changed.
- No migration was added.
- The backend remains the same five-file Module 19 implementation.
- The public Module 19 API remains exactly four GET routes.
- No browser mutation or profitability persistence was added.
- No browser-owned profit, outstanding, advance or Supplier payable formula was added.
- No router dependency or duplicate Project lookup endpoint was introduced.

## Next pass

**B19.10 - Project Profitability final integration, Playwright and freeze:** verify the complete browser workflow against live API data where runtime dependencies are available, freeze the four routes/three permissions/three stable errors, run cumulative reconciliation and security checks, and close Module 19 before the cross-module completion stage.
