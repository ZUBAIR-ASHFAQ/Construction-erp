# Final-21 Pass B12 — Inventory / Material Management

## Purpose

Pass B12 aligns Module 11 with the Final 21-module Construction ERP contract. Inventory now focuses on Material master data, Warehouse stock, an append-only stock ledger, Project/Stage material issues, transfers, controlled adjustments, and Procurement Goods Receipt integration.

## Implemented

- Replaced the active `InventoryItem` model with the final `Material` master mapped to `materials`.
- Replaced editable `InventoryBalance` ownership with stock derived from the append-only `StockLedger` mapped to `stock_ledger`.
- Added final `MaterialIssue` and `MaterialIssueItem` persistence.
- Added optional real `ProjectStage` attribution to stock ledger and material issues.
- Kept Project/Company/Warehouse scope enforced in service and database relations/triggers.
- Material issues create one source-keyed `CostActual` row per issue line with category `material`.
- Goods Receipts from Procurement create accepted stock atomically and preserve Purchase Order open-quantity control.
- Added stable stock-key locking before quantity-sensitive writes.
- Retired active Inventory UOM-conversion, physical-count, inventory-balance and stock-period tables from the current Prisma model through a forward migration.
- Preserved legacy balance quantity by inserting reconciliation movements before dropping the old balance table.
- Renamed active permission `inventory.item.manage` to `materials.manage` while preserving role grants.
- Replaced the old broad Inventory UI with the Final-21 Material, stock, Project/Stage issue, transfer, adjustment and ledger workspace.
- Kept the backend as the required five files only.
- Added short purpose comments to changed named functions and methods.

## Exact public API

- `GET /api/v1/inventory/materials`
- `POST /api/v1/inventory/materials`
- `GET /api/v1/inventory/stock`
- `GET /api/v1/inventory/ledger`
- `POST /api/v1/inventory/issues`
- `POST /api/v1/inventory/transfers`
- `POST /api/v1/inventory/adjustments`

The Procurement-to-Inventory Goods Receipt adapter remains internal because the Goods Receipt public command belongs to Module 10 Procurement.

## Removed from active Module 11 ownership

- WBS / Cost Code / Cost Type issue dimensions.
- `InventoryBalance` editable stock totals.
- Inventory-specific unit-conversion submodule.
- Physical-count submodule.
- Stock-period submodule.
- Minimum-stock / low-stock CRUD workflow.
- Generic Item, Warehouse, balance and return route expansion that is not part of the Final-21 Module 11 route catalog.

Historical migrations are not edited. Later passes may still contain legacy cost-structure fields until their own controlled replacement pass.

## Safety and accounting rules

- Stock ledger rows are append-only.
- Current stock is calculated from posted ledger movements.
- Material issues cannot exceed available quantity.
- Material issue cost uses the current ledger-derived average cost.
- Project/Stage actual cost is source-derived and source-key idempotent.
- Goods Receipt stock changes and Purchase Order received quantity occur in one transaction.
- Posted stock corrections use compensating adjustment movements rather than deleting history.
- Client-supplied Company ownership, actor identity, costs and posting metadata are not trusted.

## Verification target

Pass B12 must pass:

- Final-21 B12 Inventory regression tests.
- Existing Final-21 regression suite.
- Workspace validation.
- Legacy cleanup manifest check.
- Migration checksum/gate policy.
- TypeScript syntax transpilation for changed production files.
- ZIP integrity verification.

Live clean/previous-schema migration execution still requires a disposable PostgreSQL `MIGRATION_TEST_DATABASE_URL` and explicit destructive-test confirmation.
